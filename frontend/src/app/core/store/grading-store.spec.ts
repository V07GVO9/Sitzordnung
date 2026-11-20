/** Noten im Datenspeicher: Schema, Notenstand, Mitarbeit, Quartalsnoten. */

import { AppError } from '../app-error';
import { LocalStore } from './local-store';

/** Montag, 05.10.2026, mitten in der Doppelstunde. */
const MONDAY = new Date('2026-10-05T11:30:00');

function setup() {
  const store = new LocalStore();
  store.createNew();
  store.clock.setFixed(MONDAY);

  const schoolClass = store.masterData.createClass('KDM261');
  const subject = store.masterData.createSubject('LF3 Werte- und Leistungsprozesse', 'LF3');
  const course = store.masterData.createCourse(schoolClass.id, subject.id);
  const anna = store.masterData.createStudent(schoolClass.id, 'Anna', 'Adler');
  const ben = store.masterData.createStudent(schoolClass.id, 'Ben', 'Berg');

  store.timetable.createTimetableEntry({
    courseId: course.id,
    dayOfWeek: 1,
    startTime: '11:10',
    endTime: '12:40',
    room: 'B 104',
  });

  return { store, schoolClass, course, anna, ben };
}

/**
 * Legt einen Leistungsnachweis samt Noten direkt im Bestand an - so wie ihn
 * eine ältere Datei mitbringt.
 */
function seedAssessment(
  store: LocalStore,
  courseId: number,
  typeKey: string,
  results: { studentId: number; grade: number }[] = [],
): void {
  const db = store.snapshot();
  const id = db.nextIds.assessment++;
  db.assessments.push({
    id,
    courseId,
    typeKey,
    title: 'Test',
    date: '2026-10-05',
    maxPoints: null,
    releasedAt: MONDAY.toISOString(),
    comment: null,
  });
  for (const { studentId, grade } of results) {
    db.assessmentResults.push({
      assessmentId: id,
      studentId,
      points: null,
      grade,
      status: 'graded',
      comment: null,
    });
  }
  store.load(db);
}

/** Setzt die Note einer Doppelstunde von Hand - wie in einer älteren Datei. */
function seedOverride(
  store: LocalStore,
  courseId: number,
  studentId: number,
  lessonDate: string,
  grade: number,
): void {
  const db = store.snapshot();
  db.participationOverrides.push({ courseId, studentId, lessonDate, grade, reason: null });
  store.load(db);
}

describe('LocalStore - Bewertungsschema', () => {
  it('liefert einen Vorschlag, solange keines gespeichert ist', () => {
    const { store, course } = setup();
    const scheme = store.schemes.getScheme(course.id);

    expect(scheme.isDefault).toBeTrue();
    expect(scheme.writtenPercent).toBe(50);
    expect(scheme.participationGrades.neutral).toBe(3);
  });

  it('speichert ein eigenes Schema je Lernfeld', () => {
    const { store, course } = setup();
    const scheme = store.schemes.getScheme(course.id);
    store.schemes.saveScheme(course.id, { ...scheme, writtenPercent: 40 });

    expect(store.schemes.getScheme(course.id).writtenPercent).toBe(40);
    expect(store.schemes.getScheme(course.id).isDefault).toBeFalse();
  });

  it('lehnt einen Schlüssel ohne Stufe ab 0 % ab', () => {
    const { store, course } = setup();
    const scheme = store.schemes.getScheme(course.id);

    expect(() =>
      store.schemes.saveScheme(course.id, {
        ...scheme,
        percentScale: [{ minPercent: 50, grade: 4 }],
      }),
    ).toThrowError(AppError);
  });

  it('lässt eine verwendete Art nicht entfernen', () => {
    const { store, course } = setup();
    seedAssessment(store, course.id, 'test');
    const scheme = store.schemes.getScheme(course.id);

    expect(() =>
      store.schemes.saveScheme(course.id, {
        ...scheme,
        types: scheme.types.filter((t) => t.key !== 'test'),
      }),
    ).toThrowError(AppError);
  });

  it('überträgt ein Schema auf andere Lernfelder', () => {
    const { store, course, schoolClass } = setup();
    const lf6 = store.masterData.createSubject('LF6', 'LF6');
    const other = store.masterData.createCourse(schoolClass.id, lf6.id);
    store.schemes.saveScheme(course.id, {
      ...store.schemes.getScheme(course.id),
      writtenPercent: 30,
    });

    store.schemes.copyScheme(course.id, [other.id]);

    expect(store.schemes.getScheme(other.id).writtenPercent).toBe(30);
  });
});

describe('LocalStore - Mitarbeit und Gesamtnote', () => {
  it('gibt in jeder gehaltenen Doppelstunde eine Note, unbewertet 3,0', () => {
    const { store, course, anna, ben } = setup();
    store.ratings.rate(course.id, anna.id, 2);

    const book = store.gradeBook.getGradeBook(course.id);
    const annaRow = book.students.find((s) => s.studentId === anna.id)!;
    const benRow = book.students.find((s) => s.studentId === ben.id)!;

    expect(book.lessonDates).toEqual(['2026-10-05']);
    expect(annaRow.participation).toBe(1);
    expect(benRow.participation).toBe(3);
  });

  it('ersetzt in der Listenansicht die Bewertung desselben Tages', () => {
    const { store, course, anna } = setup();
    store.ratings.rate(course.id, anna.id, 2, undefined, '2026-10-05', true);
    store.ratings.rate(course.id, anna.id, -1, undefined, '2026-10-05', true);

    const ratings = store.ratings.getRatings(course.id, { from: '2026-10-05', to: '2026-10-05' });
    expect(ratings.length).toBe(1);
    expect(ratings[0].value).toBe(-1);
  });

  it('nimmt eine als "fehlte" markierte Stunde aus dem Durchschnitt', () => {
    const { store, course, anna, ben } = setup();
    store.ratings.rate(course.id, anna.id, 2);
    store.clock.setFixed(new Date('2026-10-12T11:30:00'));
    store.ratings.rate(course.id, anna.id, -2);

    store.participation.setAbsent(course.id, ben.id, '2026-10-05', true);
    const book = store.gradeBook.getGradeBook(course.id);

    expect(book.students.find((s) => s.studentId === anna.id)!.participation).toBe(3);
    expect(book.students.find((s) => s.studentId === ben.id)!.participation).toBe(3);
    expect(book.students.find((s) => s.studentId === ben.id)!.lessons[0].grade).toBeNull();
    expect(store.snapshot().gradeChanges[0].newValue).toBe('fehlte');
  });

  it('verrechnet schriftlich und mündlich nach dem Schema', () => {
    const { store, course, anna } = setup();
    store.ratings.rate(course.id, anna.id, 2);
    seedAssessment(store, course.id, 'test', [{ studentId: anna.id, grade: 3 }]);

    const row = store.gradeBook
      .getGradeBook(course.id)
      .students.find((s) => s.studentId === anna.id)!;

    expect(row.written).toBe(3);
    expect(row.oral).toBe(1);
    expect(row.overall).toBe(2);
    expect(row.partial).toBeFalse();
  });
});

describe('LocalStore - Leistungsdaten im Bestand', () => {
  it('räumt beim Löschen eines Schülers seine Noten mit weg', () => {
    const { store, course, anna } = setup();
    seedAssessment(store, course.id, 'test', [{ studentId: anna.id, grade: 2 }]);

    store.masterData.deleteStudent(anna.id);

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
  it('meldet fehlende Noten nur für abgelaufene Quartale mit Unterricht', () => {
    const { store, course, anna, ben } = setup();
    // Im 1. Quartal bewertet ...
    store.ratings.rate(course.id, anna.id, 1);
    // ... solange es läuft, ist noch nichts fällig.
    expect(store.quarterGrades.getMissingQuarterGrades()).toEqual([]);

    // Im 2. Quartal: Q1 ist vorbei, Noten fehlen - der Vorschlag zählt nicht.
    store.clock.setFixed(new Date('2026-11-17T10:00:00'));
    expect(store.quarterGrades.getMissingQuarterGrades()).toEqual([
      jasmine.objectContaining({ quarter: 1, missingStudents: 2 }),
    ]);

    for (const id of [anna.id, ben.id]) {
      store.quarterGrades.setQuarterGrade(course.id, id, 1, 'written', 80);
    }
    store.quarterGrades.setQuarterGrade(course.id, anna.id, 1, 'oral', 2);
    expect(store.quarterGrades.getMissingQuarterGrades()).toEqual([
      jasmine.objectContaining({ quarter: 1, missingStudents: 1 }),
    ]);

    store.quarterGrades.setQuarterGrade(course.id, ben.id, 1, 'oral', 3);
    expect(store.quarterGrades.getMissingQuarterGrades()).toEqual([]);
  });

  it('rechnet schriftlich Prozent in die Note um (IHK-Schlüssel)', () => {
    const { store, course, anna } = setup();

    const saved = store.quarterGrades.setQuarterGrade(course.id, anna.id, 1, 'written', 85);
    expect(saved.percent).toBe(85);
    expect(saved.grade).toBe(2);
  });

  it('nimmt mündlich eine Note und schlägt sonst den Ø der Mitarbeit vor', () => {
    const { store, course, anna, ben } = setup();
    // Montag, 05.10.2026 liegt im 1. Quartal.
    store.ratings.rate(course.id, anna.id, 2);

    const oralQ1 = (id: number) =>
      store.quarterGrades
        .getQuarterGrades(course.id)
        .find((g) => g.studentId === id && g.quarter === 1 && g.area === 'oral');

    expect(oralQ1(anna.id)).toEqual(
      jasmine.objectContaining({ grade: 1, suggested: true, percent: null }),
    );
    // Ben wurde in der Stunde nicht bewertet - zählt wie 0 (Note 3).
    expect(oralQ1(ben.id)?.grade).toBe(3);

    store.quarterGrades.setQuarterGrade(course.id, anna.id, 1, 'oral', 2.5);
    expect(oralQ1(anna.id)).toEqual(jasmine.objectContaining({ grade: 2.5, suggested: false }));

    // Löschen führt zurück auf den Vorschlag.
    store.quarterGrades.setQuarterGrade(course.id, anna.id, 1, 'oral', null);
    expect(oralQ1(anna.id)?.suggested).toBeTrue();
  });

  it('löscht den schriftlichen Eintrag, wenn das Feld geleert wird', () => {
    const { store, course, anna } = setup();

    store.quarterGrades.setQuarterGrade(course.id, anna.id, 2, 'written', 50);
    store.quarterGrades.setQuarterGrade(course.id, anna.id, 2, 'written', null);

    expect(
      store.quarterGrades.getQuarterGrades(course.id).filter((g) => g.area === 'written'),
    ).toEqual([]);
  });

  it('weist ungültige Werte ab', () => {
    const { store, course, anna } = setup();

    expect(() =>
      store.quarterGrades.setQuarterGrade(course.id, anna.id, 1, 'written', 120),
    ).toThrowError(AppError);
    expect(() =>
      store.quarterGrades.setQuarterGrade(course.id, anna.id, 1, 'oral', 7),
    ).toThrowError(AppError);
  });
});

describe('LocalStore - Noten je Stunde', () => {
  it('zeigt jeden Unterrichtstag - Tage ganz ohne Bewertung zählen nicht', () => {
    const { store, course, anna, ben } = setup();
    store.ratings.rate(course.id, anna.id, 2, undefined, '2026-09-28', true);
    store.participation.setAbsent(course.id, ben.id, '2026-09-28', true);

    // 21.09. bis 05.10.: drei Montage, keine Ferien.
    const [sheet] = store.exports.getLessonSheets(course.id, {
      from: '2026-09-21',
      to: '2026-10-05',
    });

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
    store.ratings.rate(course.id, anna.id, 2, undefined, '2026-09-28', true);

    const [sheet] = store.exports.getLessonSheets(course.id, {
      from: '2026-09-28',
      to: '2026-09-28',
    });
    const benRow = sheet.students.find((s) => s.studentId === ben.id)!;
    expect(benRow.cells[0].rated).toBeFalse();
    expect(benRow.cells[0].grade).toBe(3);
  });

  it('lässt Ferien aus und liefert je Kurs eine Seite', () => {
    const { store, course } = setup();
    // Herbstferien 12.10.-24.10.2026: der Montag 19.10. fällt weg.
    store.clock.setFixed(new Date('2026-10-26T12:00:00'));
    const [sheet] = store.exports.getLessonSheets(null, { from: '2026-10-05', to: '2026-10-26' });

    expect(sheet.courseId).toBe(course.id);
    expect(sheet.dates.map((d) => d.date)).toEqual(['2026-10-05', '2026-10-26']);

    expect(store.exports.exportLessonSheets(null).fileName).toContain('noten-je-stunde');
  });

  it('exportiert auf Wunsch nur einen Schüler', async () => {
    const { store, course, anna, ben } = setup();
    const result = store.exports.exportLessonSheets(course.id, undefined, anna.id);

    const html = await result.blob.text();
    expect(html).toContain(anna.lastName);
    expect(html).not.toContain(ben.lastName);
    expect(result.fileName).toContain(anna.lastName);
  });
});

describe('LocalStore - Abwesende im Unterricht', () => {
  it('markiert schon vor der ersten Bewertung - die Stunde zählt für ihn nicht', () => {
    const { store, course, anna, ben } = setup();
    store.participation.setAbsent(course.id, ben.id, '2026-10-05', true);

    expect(store.participation.getAbsentStudentIds(course.id, '2026-10-05')).toEqual([ben.id]);

    store.clock.setFixed(new Date('2026-10-05T11:30:00'));
    store.ratings.rate(course.id, anna.id, 2);
    const book = store.gradeBook.getGradeBook(course.id);

    expect(book.students.find((s) => s.studentId === ben.id)!.lessons[0].grade).toBeNull();
    expect(book.students.find((s) => s.studentId === ben.id)!.participation).toBeNull();
    expect(store.snapshot().gradeChanges[0].newValue).toBe('fehlte');
  });

  it('nimmt nur das „fehlt“ zurück, eine von Hand gesetzte Note bleibt', () => {
    const { store, course, anna, ben } = setup();
    store.clock.setFixed(new Date('2026-10-05T11:30:00'));
    store.ratings.rate(course.id, anna.id, 2);
    seedOverride(store, course.id, ben.id, '2026-10-05', 2);

    store.participation.setAbsent(course.id, ben.id, '2026-10-05', false);
    expect(
      store.gradeBook.getGradeBook(course.id).students.find((s) => s.studentId === ben.id)!
        .lessons[0].grade,
    ).toBe(2);

    store.participation.setAbsent(course.id, ben.id, '2026-10-05', true);
    store.participation.setAbsent(course.id, ben.id, '2026-10-05', false);
    expect(store.participation.getAbsentStudentIds(course.id, '2026-10-05')).toEqual([]);
  });
});

describe('LocalStore - Sicherungskopie und Schuljahreswechsel', () => {
  it('merkt sich die letzte Sicherungskopie in der Datei - Einstellungen bleiben unberührt', () => {
    const { store } = setup();
    expect(store.settings.getLastBackupAt()).toBeNull();

    store.settings.markBackup();
    expect(store.settings.getLastBackupAt()).toBe(MONDAY.toISOString());

    store.settings.saveSettings({ toleranceMinutes: 10, allowRatingOutsideLesson: false });
    expect(store.settings.getLastBackupAt()).toBe(MONDAY.toISOString());
    expect(store.settings.getSettings()).toEqual({
      toleranceMinutes: 10,
      allowRatingOutsideLesson: false,
    });
  });

  it('setzt Klassen hoch, löscht Leistungsdaten und Stundenplan - Schüler und Kurse bleiben', () => {
    const { store, schoolClass, course, anna } = setup();
    store.ratings.rate(course.id, anna.id, 2);
    const abgang = store.masterData.createClass('KDM13');

    const result = store.schoolYear.startNewSchoolYear({
      renames: [{ classId: schoolClass.id, name: 'KDM271' }],
      deleteClassIds: [abgang.id],
      deleteRecords: true,
      clearTimetable: true,
    });

    expect(result.ratings).toBe(1);
    expect(result.timetableEntries).toBe(1);
    expect(store.masterData.getClasses().map((c) => c.name)).toEqual(['KDM271']);
    expect(store.masterData.getStudents(schoolClass.id).length).toBe(2);
    expect(store.masterData.getCourses().length).toBe(1);
    expect(store.schoolYear.getSchoolYearCounts().ratings).toBe(0);
    expect(store.schoolYear.getSchoolYearCounts().timetableEntries).toBe(0);
  });

  it('erlaubt Tauschen von Namen, lehnt doppelte Namen ab und ändert dann nichts', () => {
    const { store, schoolClass, course, anna } = setup();
    const other = store.masterData.createClass('KDM271');
    store.ratings.rate(course.id, anna.id, 2);

    expect(() =>
      store.schoolYear.startNewSchoolYear({
        renames: [{ classId: schoolClass.id, name: 'KDM271' }],
        deleteClassIds: [],
        deleteRecords: true,
        clearTimetable: false,
      }),
    ).toThrowError(/zweimal/);
    expect(store.schoolYear.getSchoolYearCounts().ratings).toBe(1);

    store.schoolYear.startNewSchoolYear({
      renames: [
        { classId: schoolClass.id, name: 'KDM271' },
        { classId: other.id, name: 'KDM261' },
      ],
      deleteClassIds: [],
      deleteRecords: false,
      clearTimetable: false,
    });
    expect(store.masterData.getClasses().find((c) => c.id === schoolClass.id)!.name).toBe('KDM271');
    expect(store.schoolYear.getSchoolYearCounts().ratings).toBe(1);
  });
});
