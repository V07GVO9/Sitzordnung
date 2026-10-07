/** Notenverwaltung im Datenspeicher: Schema, Leistungsnachweise, Mitarbeit, Notenbogen. */

import { AppError } from './app-error';
import { LocalStore } from './local-store';

/** Montag, 05.10.2026, mitten in der Doppelstunde. */
const MONDAY = new Date('2026-10-05T11:30:00');

function setup() {
  const store = new LocalStore();
  store.createNew();
  store.clock.setFixed(MONDAY);

  const schoolClass = store.createClass('KDM261');
  const subject = store.createSubject('LF3 Werte- und Leistungsprozesse', 'LF3');
  const course = store.createCourse(schoolClass.id, subject.id);
  const anna = store.createStudent(schoolClass.id, 'Anna', 'Adler');
  const ben = store.createStudent(schoolClass.id, 'Ben', 'Berg');

  store.createTimetableEntry({
    courseId: course.id,
    dayOfWeek: 1,
    startTime: '11:10',
    endTime: '12:40',
    room: 'B 104',
  });

  return { store, schoolClass, course, anna, ben };
}

describe('LocalStore - Bewertungsschema', () => {
  it('liefert einen Vorschlag, solange keines gespeichert ist', () => {
    const { store, course } = setup();
    const scheme = store.getScheme(course.id);

    expect(scheme.isDefault).toBeTrue();
    expect(scheme.writtenPercent).toBe(50);
    expect(scheme.participationGrades.unrated).toBe(3);
  });

  it('speichert ein eigenes Schema je Lernfeld', () => {
    const { store, course } = setup();
    const scheme = store.getScheme(course.id);
    store.saveScheme(course.id, { ...scheme, writtenPercent: 40 });

    expect(store.getScheme(course.id).writtenPercent).toBe(40);
    expect(store.getScheme(course.id).isDefault).toBeFalse();
  });

  it('lehnt einen Schlüssel ohne Stufe ab 0 % ab', () => {
    const { store, course } = setup();
    const scheme = store.getScheme(course.id);

    expect(() =>
      store.saveScheme(course.id, { ...scheme, percentScale: [{ minPercent: 50, grade: 4 }] }),
    ).toThrowError(AppError);
  });

  it('lässt eine verwendete Art nicht entfernen', () => {
    const { store, course } = setup();
    store.createAssessment(course.id, {
      typeKey: 'test',
      title: 'Test 1',
      date: '2026-10-05',
      maxPoints: null,
      comment: null,
    });
    const scheme = store.getScheme(course.id);

    expect(() =>
      store.saveScheme(course.id, {
        ...scheme,
        types: scheme.types.filter((t) => t.key !== 'test'),
      }),
    ).toThrowError(AppError);
  });

  it('überträgt ein Schema auf andere Lernfelder', () => {
    const { store, course, schoolClass } = setup();
    const lf6 = store.createSubject('LF6', 'LF6');
    const other = store.createCourse(schoolClass.id, lf6.id);
    store.saveScheme(course.id, { ...store.getScheme(course.id), writtenPercent: 30 });

    store.copyScheme(course.id, [other.id]);

    expect(store.getScheme(other.id).writtenPercent).toBe(30);
  });
});

describe('LocalStore - Leistungsnachweise', () => {
  function withTest() {
    const ctx = setup();
    const assessment = ctx.store.createAssessment(ctx.course.id, {
      typeKey: 'klassenarbeit',
      title: 'Klassenarbeit 1',
      date: '2026-10-05',
      maxPoints: 100,
      comment: null,
    });
    return { ...ctx, assessment };
  }

  it('rechnet Punkte in Noten um und zählt erst nach der Freigabe', () => {
    const { store, course, assessment, anna } = withTest();
    store.saveResults(assessment.id, [
      { studentId: anna.id, points: 85, grade: null, status: 'graded', comment: null },
    ]);

    expect(store.getAssessmentDetail(assessment.id).results[0].effectiveGrade).toBe(2);
    expect(store.getGradeBook(course.id).students[0].written).toBeNull();

    store.setAssessmentReleased(assessment.id, true);
    expect(store.getGradeBook(course.id).students[0].written).toBe(2);
  });

  it('lehnt Punkte über dem Maximum ab', () => {
    const { store, assessment, anna } = withTest();

    expect(() =>
      store.saveResults(assessment.id, [
        { studentId: anna.id, points: 101, grade: null, status: 'graded', comment: null },
      ]),
    ).toThrowError(AppError);
  });

  it('verlangt nach der Freigabe eine Begründung und protokolliert die Änderung', () => {
    const { store, course, assessment, anna } = withTest();
    store.saveResults(assessment.id, [
      { studentId: anna.id, points: null, grade: 3.3, status: 'graded', comment: null },
    ]);
    store.setAssessmentReleased(assessment.id, true);

    const change = [
      { studentId: anna.id, points: null, grade: 3, status: 'graded' as const, comment: null },
    ];
    expect(() => store.saveResults(assessment.id, change)).toThrowError(AppError);
    expect(store.getAssessmentDetail(assessment.id).results[0].grade).toBe(3.3);

    store.saveResults(assessment.id, change, 'Korrekturfehler Aufgabe 3');
    const log = store.getGradeChanges(course.id);

    expect(log.length).toBe(1);
    expect(log[0].oldValue).toBe('3,3');
    expect(log[0].newValue).toBe('3,0');
    expect(log[0].reason).toBe('Korrekturfehler Aufgabe 3');
  });

  it('sperrt Art und Punktzahl eines freigegebenen Nachweises', () => {
    const { store, assessment } = withTest();
    store.setAssessmentReleased(assessment.id, true);

    expect(() =>
      store.updateAssessment(assessment.id, {
        typeKey: 'klassenarbeit',
        title: 'Klassenarbeit 1',
        date: '2026-10-05',
        maxPoints: 80,
        comment: null,
      }),
    ).toThrowError(AppError);
  });
});

describe('LocalStore - Mitarbeit und Gesamtnote', () => {
  it('gibt in jeder gehaltenen Doppelstunde eine Note, unbewertet 3,0', () => {
    const { store, course, anna, ben } = setup();
    store.rate(course.id, anna.id, 2);

    const book = store.getGradeBook(course.id);
    const annaRow = book.students.find((s) => s.studentId === anna.id)!;
    const benRow = book.students.find((s) => s.studentId === ben.id)!;

    expect(book.lessonDates).toEqual(['2026-10-05']);
    expect(annaRow.participation).toBe(1);
    expect(benRow.participation).toBe(3);
  });

  it('nimmt eine als "fehlte" markierte Stunde aus dem Durchschnitt', () => {
    const { store, course, anna, ben } = setup();
    store.rate(course.id, anna.id, 2);
    store.clock.setFixed(new Date('2026-10-12T11:30:00'));
    store.rate(course.id, anna.id, -2);

    store.setParticipationOverride(course.id, ben.id, '2026-10-05', null, 'krank');
    const book = store.getGradeBook(course.id);

    expect(book.students.find((s) => s.studentId === anna.id)!.participation).toBe(3);
    expect(book.students.find((s) => s.studentId === ben.id)!.participation).toBe(3);
    expect(book.students.find((s) => s.studentId === ben.id)!.lessons[0].grade).toBeNull();
    expect(store.getGradeChanges(course.id)[0].newValue).toBe('fehlte');
  });

  it('verrechnet schriftlich und mündlich nach dem Schema', () => {
    const { store, course, anna } = setup();
    store.rate(course.id, anna.id, 2);
    const test = store.createAssessment(course.id, {
      typeKey: 'test',
      title: 'Test',
      date: '2026-10-05',
      maxPoints: null,
      comment: null,
    });
    store.saveResults(test.id, [
      { studentId: anna.id, points: null, grade: 3, status: 'graded', comment: null },
    ]);
    store.setAssessmentReleased(test.id, true);

    const row = store.getGradeBook(course.id).students.find((s) => s.studentId === anna.id)!;

    expect(row.written).toBe(3);
    expect(row.oral).toBe(1);
    expect(row.overall).toBe(2);
    expect(row.partial).toBeFalse();
  });

  it('grenzt auf einen Zeitraum ein', () => {
    const { store, course, anna } = setup();
    store.rate(course.id, anna.id, 2);
    const period = store.savePeriod(null, {
      name: '2. Halbjahr',
      start: '2027-02-01',
      end: '2027-07-31',
    });

    const reports = store.getStudentReports(course.id, [anna.id], period.id);

    expect(reports[0].participation.lessonCount).toBe(0);
    expect(reports[0].periodName).toBe('2. Halbjahr');
  });
});

describe('LocalStore - Notenbogen', () => {
  it('zeigt nur freigegebene Nachweise und vermerkt die Ausgabe', () => {
    const { store, course, anna } = setup();
    const draft = store.createAssessment(course.id, {
      typeKey: 'test',
      title: 'Entwurf',
      date: '2026-10-05',
      maxPoints: null,
      comment: null,
    });
    store.saveResults(draft.id, [
      { studentId: anna.id, points: null, grade: 2, status: 'graded', comment: null },
    ]);

    const reports = store.getStudentReports(course.id, [anna.id], null);
    expect(reports[0].items.length).toBe(0);

    store.recordReports(course.id, reports, null);
    expect(store.getGradeReports(course.id).length).toBe(1);
  });

  it('räumt beim Löschen eines Schülers seine Noten mit weg', () => {
    const { store, course, anna } = setup();
    const test = store.createAssessment(course.id, {
      typeKey: 'test',
      title: 'Test',
      date: '2026-10-05',
      maxPoints: null,
      comment: null,
    });
    store.saveResults(test.id, [
      { studentId: anna.id, points: null, grade: 2, status: 'graded', comment: null },
    ]);

    store.deleteStudent(anna.id);

    expect(store.snapshot().assessmentResults.length).toBe(0);
  });

  it('öffnet eine ältere Datei ohne Notenlisten', () => {
    const store = new LocalStore();
    const old = new LocalStore();
    old.createNew();
    const legacy = old.snapshot() as unknown as Record<string, unknown>;
    delete legacy['assessments'];
    delete legacy['gradingSchemes'];

    store.load(legacy as never);

    expect(store.snapshot().assessments).toEqual([]);
    expect(store.snapshot().nextIds.assessment).toBe(1);
  });
});
