/** Notenverwaltung im Datenspeicher: Schema, Leistungsnachweise, Mitarbeit, Notenbogen. */

import { AppError } from '../app-error';
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
    expect(scheme.participationGrades.neutral).toBe(3);
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

  it('ersetzt in der Listenansicht die Bewertung desselben Tages', () => {
    const { store, course, anna } = setup();
    store.rate(course.id, anna.id, 2, undefined, '2026-10-05', true);
    store.rate(course.id, anna.id, -1, undefined, '2026-10-05', true);

    const ratings = store.getRatings(course.id, { from: '2026-10-05', to: '2026-10-05' });
    expect(ratings.length).toBe(1);
    expect(ratings[0].value).toBe(-1);
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

describe('Quartalsnoten', () => {
  it('rechnet schriftlich Prozent in die Note um (IHK-Schlüssel)', () => {
    const { store, course, anna } = setup();

    const saved = store.setQuarterGrade(course.id, anna.id, 1, 'written', 85);
    expect(saved.percent).toBe(85);
    expect(saved.grade).toBe(2);
  });

  it('nimmt mündlich eine Note und schlägt sonst den Ø der Mitarbeit vor', () => {
    const { store, course, anna, ben } = setup();
    // Montag, 05.10.2026 liegt im 1. Quartal.
    store.rate(course.id, anna.id, 2);

    const oralQ1 = (id: number) =>
      store
        .getQuarterGrades(course.id)
        .find((g) => g.studentId === id && g.quarter === 1 && g.area === 'oral');

    expect(oralQ1(anna.id)).toEqual(
      jasmine.objectContaining({ grade: 1, suggested: true, percent: null }),
    );
    // Ben wurde in der Stunde nicht bewertet - zählt wie 0 (Note 3).
    expect(oralQ1(ben.id)?.grade).toBe(3);

    store.setQuarterGrade(course.id, anna.id, 1, 'oral', 2.5);
    expect(oralQ1(anna.id)).toEqual(jasmine.objectContaining({ grade: 2.5, suggested: false }));

    // Löschen führt zurück auf den Vorschlag.
    store.setQuarterGrade(course.id, anna.id, 1, 'oral', null);
    expect(oralQ1(anna.id)?.suggested).toBeTrue();
  });

  it('löscht den schriftlichen Eintrag, wenn das Feld geleert wird', () => {
    const { store, course, anna } = setup();

    store.setQuarterGrade(course.id, anna.id, 2, 'written', 50);
    store.setQuarterGrade(course.id, anna.id, 2, 'written', null);

    expect(store.getQuarterGrades(course.id).filter((g) => g.area === 'written')).toEqual([]);
  });

  it('weist ungültige Werte ab', () => {
    const { store, course, anna } = setup();

    expect(() => store.setQuarterGrade(course.id, anna.id, 1, 'written', 120)).toThrowError(
      AppError,
    );
    expect(() => store.setQuarterGrade(course.id, anna.id, 1, 'oral', 7)).toThrowError(AppError);
  });
});

describe('LocalStore - Übernahme aus anderem Werkzeug', () => {
  function oralKey(store: LocalStore, courseId: number): string {
    return store.getScheme(courseId).types.find((t) => t.area === 'oral')!.key;
  }

  it('legt einen freigegebenen Nachweis mit den Noten an', () => {
    const { store, course, anna, ben } = setup();

    const assessment = store.importAssessment(course.id, {
      typeKey: oralKey(store, course.id),
      title: 'Mitarbeit (übernommen) LF3',
      date: '2026-11-05',
      comment: 'Übernommen aus KDM261.pdf',
      results: [
        { studentId: anna.id, grade: 2.6, comment: '1× ++, 2× +, 3× o, 1× -' },
        { studentId: ben.id, grade: 2, comment: '6× +' },
      ],
    });

    expect(assessment.released).toBeTrue();
    expect(assessment.area).toBe('oral');
    const detail = store.getAssessmentDetail(assessment.id);
    const annaResult = detail.results.find((r) => r.studentId === anna.id)!;
    expect(annaResult.grade).toBe(2.6);
    expect(annaResult.comment).toBe('1× ++, 2× +, 3× o, 1× -');
    expect(store.getGradeChanges(course.id)).toEqual([]);
  });

  it('legt bei Fehlern nichts an', () => {
    const { store, course, anna } = setup();
    const other = store.createClass('BFI10A');
    const stranger = store.createStudent(other.id, 'Fremd', 'Person');

    const attempt = (results: { studentId: number; grade: number; comment: null }[]) => () =>
      store.importAssessment(course.id, {
        typeKey: oralKey(store, course.id),
        title: 'Mitarbeit',
        date: '2026-11-05',
        comment: null,
        results,
      });

    expect(attempt([{ studentId: anna.id, grade: 7, comment: null }])).toThrowError(AppError);
    expect(attempt([{ studentId: stranger.id, grade: 2, comment: null }])).toThrowError(AppError);
    expect(
      attempt([
        { studentId: anna.id, grade: 2, comment: null },
        { studentId: anna.id, grade: 3, comment: null },
      ]),
    ).toThrowError(AppError);
    expect(attempt([])).toThrowError(AppError);
    expect(store.getAssessments(course.id)).toEqual([]);
  });
});

describe('LocalStore - Noten je Stunde', () => {
  it('zeigt jeden Unterrichtstag - Tage ganz ohne Bewertung zählen nicht', () => {
    const { store, course, anna, ben } = setup();
    store.rate(course.id, anna.id, 2, undefined, '2026-09-28', true);
    store.setParticipationOverride(course.id, ben.id, '2026-09-28', null, 'krank');

    // 21.09. bis 05.10.: drei Montage, keine Ferien.
    const [sheet] = store.getLessonSheets(course.id, { from: '2026-09-21', to: '2026-10-05' });

    expect(sheet.dates).toEqual([
      { date: '2026-09-21', rated: false },
      { date: '2026-09-28', rated: true },
      { date: '2026-10-05', rated: false },
    ]);

    const annaRow = sheet.students.find((s) => s.studentId === anna.id)!;
    expect(annaRow.cells.map((c) => c.rated)).toEqual([false, true, false]);
    expect(annaRow.cells.map((c) => c.grade)).toEqual([null, 1, null]);
    expect(annaRow.average).toBe(1);

    const benRow = sheet.students.find((s) => s.studentId === ben.id)!;
    expect(benRow.cells[1].grade).toBeNull();
    expect(benRow.average).toBeNull();
  });

  it('zählt einen nicht bewerteten Schüler an einem bewerteten Tag automatisch', () => {
    const { store, course, anna, ben } = setup();
    store.rate(course.id, anna.id, 2, undefined, '2026-09-28', true);

    const [sheet] = store.getLessonSheets(course.id, { from: '2026-09-28', to: '2026-09-28' });
    const benRow = sheet.students.find((s) => s.studentId === ben.id)!;
    expect(benRow.cells[0].rated).toBeFalse();
    expect(benRow.cells[0].grade).toBe(3);
  });

  it('lässt Ferien aus und liefert je Kurs eine Seite', () => {
    const { store, course } = setup();
    // Herbstferien 12.10.-24.10.2026: der Montag 19.10. fällt weg.
    store.clock.setFixed(new Date('2026-10-26T12:00:00'));
    const [sheet] = store.getLessonSheets(null, { from: '2026-10-05', to: '2026-10-26' });

    expect(sheet.courseId).toBe(course.id);
    expect(sheet.dates.map((d) => d.date)).toEqual(['2026-10-05', '2026-10-26']);

    expect(store.exportLessonSheets(null).fileName).toContain('noten-je-stunde');
  });

  it('exportiert auf Wunsch nur einen Schüler', async () => {
    const { store, course, anna, ben } = setup();
    const result = store.exportLessonSheets(course.id, undefined, anna.id);

    const html = await result.blob.text();
    expect(html).toContain(anna.lastName);
    expect(html).not.toContain(ben.lastName);
    expect(result.fileName).toContain(anna.lastName);
  });
});

describe('LocalStore - Abwesende im Unterricht', () => {
  it('markiert schon vor der ersten Bewertung - die Stunde zählt für ihn nicht', () => {
    const { store, course, anna, ben } = setup();
    store.setAbsent(course.id, ben.id, '2026-10-05', true);

    expect(store.getAbsentStudentIds(course.id, '2026-10-05')).toEqual([ben.id]);

    store.clock.setFixed(new Date('2026-10-05T11:30:00'));
    store.rate(course.id, anna.id, 2);
    const book = store.getGradeBook(course.id);

    expect(book.students.find((s) => s.studentId === ben.id)!.lessons[0].grade).toBeNull();
    expect(book.students.find((s) => s.studentId === ben.id)!.participation).toBeNull();
    expect(store.getGradeChanges(course.id)[0].newValue).toBe('fehlte');
  });

  it('nimmt nur das „fehlt“ zurück, eine von Hand gesetzte Note bleibt', () => {
    const { store, course, anna, ben } = setup();
    store.clock.setFixed(new Date('2026-10-05T11:30:00'));
    store.rate(course.id, anna.id, 2);
    store.setParticipationOverride(course.id, ben.id, '2026-10-05', 2);

    store.setAbsent(course.id, ben.id, '2026-10-05', false);
    expect(
      store.getGradeBook(course.id).students.find((s) => s.studentId === ben.id)!.lessons[0].grade,
    ).toBe(2);

    store.setAbsent(course.id, ben.id, '2026-10-05', true);
    store.setAbsent(course.id, ben.id, '2026-10-05', false);
    expect(store.getAbsentStudentIds(course.id, '2026-10-05')).toEqual([]);
  });
});

describe('LocalStore - Sicherungskopie und Schuljahreswechsel', () => {
  it('merkt sich die letzte Sicherungskopie in der Datei - Einstellungen bleiben unberührt', () => {
    const { store } = setup();
    expect(store.getLastBackupAt()).toBeNull();

    store.markBackup();
    expect(store.getLastBackupAt()).toBe(MONDAY.toISOString());

    store.saveSettings({ toleranceMinutes: 10, allowRatingOutsideLesson: false });
    expect(store.getLastBackupAt()).toBe(MONDAY.toISOString());
    expect(store.getSettings()).toEqual({ toleranceMinutes: 10, allowRatingOutsideLesson: false });
  });

  it('setzt Klassen hoch, löscht Leistungsdaten und Stundenplan - Schüler und Kurse bleiben', () => {
    const { store, schoolClass, course, anna } = setup();
    store.rate(course.id, anna.id, 2);
    const abgang = store.createClass('KDM13');

    const result = store.startNewSchoolYear({
      renames: [{ classId: schoolClass.id, name: 'KDM271' }],
      deleteClassIds: [abgang.id],
      deleteRecords: true,
      clearTimetable: true,
    });

    expect(result.ratings).toBe(1);
    expect(result.timetableEntries).toBe(1);
    expect(store.getClasses().map((c) => c.name)).toEqual(['KDM271']);
    expect(store.getStudents(schoolClass.id).length).toBe(2);
    expect(store.getCourses().length).toBe(1);
    expect(store.getSchoolYearCounts().ratings).toBe(0);
    expect(store.getSchoolYearCounts().timetableEntries).toBe(0);
  });

  it('erlaubt Tauschen von Namen, lehnt doppelte Namen ab und ändert dann nichts', () => {
    const { store, schoolClass, course, anna } = setup();
    const other = store.createClass('KDM271');
    store.rate(course.id, anna.id, 2);

    expect(() =>
      store.startNewSchoolYear({
        renames: [{ classId: schoolClass.id, name: 'KDM271' }],
        deleteClassIds: [],
        deleteRecords: true,
        clearTimetable: false,
      }),
    ).toThrowError(/zweimal/);
    expect(store.getSchoolYearCounts().ratings).toBe(1);

    store.startNewSchoolYear({
      renames: [
        { classId: schoolClass.id, name: 'KDM271' },
        { classId: other.id, name: 'KDM261' },
      ],
      deleteClassIds: [],
      deleteRecords: false,
      clearTimetable: false,
    });
    expect(store.getClasses().find((c) => c.id === schoolClass.id)!.name).toBe('KDM271');
    expect(store.getSchoolYearCounts().ratings).toBe(1);
  });
});
