/**
 * Der Datenspeicher - hier stecken die Regeln, die früher in den Controllern
 * des Backends standen. Entspricht den ApiEndpointTests.
 */

import { TimetableImportRow } from '../models';
import { AppError } from './app-error';
import { LocalStore } from './local-store';

/** Ein Montag, mitten in der ersten Stunde. */
const DURING_LESSON = new Date('2026-08-31T08:20:00');

function setup(): LocalStore {
  const store = new LocalStore();
  store.createNew();
  store.clock.setFixed(DURING_LESSON);
  return store;
}

/** Legt Klasse, Fach, Kurs, einen Schüler und eine passende Stunde an. */
function withCourse(store: LocalStore) {
  const schoolClass = store.createClass('10a');
  const subject = store.createSubject('Mathematik', 'MA');
  const course = store.createCourse(schoolClass.id, subject.id);
  const student = store.createStudent(schoolClass.id, 'Anna', 'Musterfrau');

  store.createTimetableEntry({
    courseId: course.id,
    dayOfWeek: 1,
    startTime: '08:00',
    endTime: '08:45',
    room: null,
  });

  return { schoolClass, subject, course, student };
}

describe('LocalStore - Stammdaten', () => {
  it('legt eine Klasse an und zählt ihre Schüler', () => {
    const store = setup();
    const created = store.createClass('10a');
    store.createStudent(created.id, 'Anna', 'Musterfrau');

    expect(store.getClasses()[0].studentCount).toBe(1);
  });

  it('lehnt eine doppelte Klasse ab', () => {
    const store = setup();
    store.createClass('10a');

    expect(() => store.createClass('10a')).toThrowError(AppError);
  });

  it('schneidet Leerzeichen an den Rändern ab', () => {
    const store = setup();
    expect(store.createClass('  10a  ').name).toBe('10a');
  });

  it('lehnt ein doppeltes Fach ab', () => {
    const store = setup();
    store.createSubject('Mathematik', 'MA');

    expect(() => store.createSubject('Mathematik', 'M')).toThrowError(AppError);
  });

  it('lehnt denselben Kurs zweimal ab', () => {
    const store = setup();
    const { schoolClass, subject } = withCourse(store);

    expect(() => store.createCourse(schoolClass.id, subject.id)).toThrowError(AppError);
  });

  it('löscht mit der Klasse auch Kurse, Bewertungen und Schüler', () => {
    const store = setup();
    const { schoolClass, course, student } = withCourse(store);
    store.rate(course.id, student.id, 1);

    store.deleteClass(schoolClass.id);

    expect(store.getClasses()).toEqual([]);
    expect(store.getCourses()).toEqual([]);
  });

  it('sortiert Schüler nach Nachname und Vorname', () => {
    const store = setup();
    const schoolClass = store.createClass('10a');
    store.createStudent(schoolClass.id, 'Bert', 'Zander');
    store.createStudent(schoolClass.id, 'Anna', 'Adler');
    store.createStudent(schoolClass.id, 'Carla', 'Adler');

    expect(store.getStudents(schoolClass.id).map((s) => s.firstName)).toEqual([
      'Anna',
      'Carla',
      'Bert',
    ]);
  });

  it('übernimmt beim Sammelimport nur brauchbare Zeilen', () => {
    const store = setup();
    const schoolClass = store.createClass('10a');

    const imported = store.importStudents(schoolClass.id, [
      { firstName: 'Anna', lastName: 'Adler' },
      { firstName: '  ', lastName: '  ' },
      { firstName: 'Bert', lastName: 'Zander' },
    ]);

    expect(imported.length).toBe(2);
  });

  it('lehnt einen Import ohne verwertbare Namen ab', () => {
    const store = setup();
    const schoolClass = store.createClass('10a');

    expect(() => store.importStudents(schoolClass.id, [])).toThrowError(AppError);
  });
});

describe('LocalStore - Sitzordnung', () => {
  it('vergibt einen Namen, wenn keiner angegeben ist', () => {
    const store = setup();
    const { course } = withCourse(store);

    expect(store.createSeatingPlan(course.id, '', 5, 8).name).toBe('Sitzordnung 1');
  });

  it('lässt höchstens zwei Sitzordnungen je Kurs zu', () => {
    const store = setup();
    const { course } = withCourse(store);
    store.createSeatingPlan(course.id, 'A', 5, 8);
    store.createSeatingPlan(course.id, 'B', 5, 8);

    expect(() => store.createSeatingPlan(course.id, 'C', 5, 8)).toThrowError(AppError);
  });

  it('speichert die Belegung', () => {
    const store = setup();
    const { course, student } = withCourse(store);
    const plan = store.createSeatingPlan(course.id, 'A', 5, 8);

    const saved = store.saveLayout(plan.id, {
      rows: 5,
      columns: 8,
      seats: [{ studentId: student.id, row: 1, column: 2 }],
    });

    expect(saved.seats).toEqual([{ studentId: student.id, row: 1, column: 2 }]);
  });

  it('lehnt zwei Schüler auf einem Platz ab', () => {
    const store = setup();
    const { schoolClass, course, student } = withCourse(store);
    const other = store.createStudent(schoolClass.id, 'Bert', 'Zander');
    const plan = store.createSeatingPlan(course.id, 'A', 5, 8);

    expect(() =>
      store.saveLayout(plan.id, {
        rows: 5,
        columns: 8,
        seats: [
          { studentId: student.id, row: 0, column: 0 },
          { studentId: other.id, row: 0, column: 0 },
        ],
      }),
    ).toThrowError(AppError);
  });

  it('lehnt einen Platz außerhalb des Rasters ab', () => {
    const store = setup();
    const { course, student } = withCourse(store);
    const plan = store.createSeatingPlan(course.id, 'A', 2, 2);

    expect(() =>
      store.saveLayout(plan.id, {
        rows: 2,
        columns: 2,
        seats: [{ studentId: student.id, row: 5, column: 0 }],
      }),
    ).toThrowError(AppError);
  });

  it('lehnt einen Schüler aus einer anderen Klasse ab', () => {
    const store = setup();
    const { course } = withCourse(store);
    const other = store.createClass('10b');
    const stranger = store.createStudent(other.id, 'Fremd', 'Person');
    const plan = store.createSeatingPlan(course.id, 'A', 5, 8);

    expect(() =>
      store.saveLayout(plan.id, {
        rows: 5,
        columns: 8,
        seats: [{ studentId: stranger.id, row: 0, column: 0 }],
      }),
    ).toThrowError(AppError);
  });

  it('räumt Plätze weg, die aus einem kleineren Raster fallen', () => {
    const store = setup();
    const { course, student } = withCourse(store);
    const plan = store.createSeatingPlan(course.id, 'A', 5, 8);
    store.saveLayout(plan.id, {
      rows: 5,
      columns: 8,
      seats: [{ studentId: student.id, row: 4, column: 7 }],
    });

    expect(store.updateSeatingPlan(plan.id, 'A', 2, 2).seats).toEqual([]);
  });
});

describe('LocalStore - Stundenplan', () => {
  it('lehnt ein Ende vor dem Beginn ab', () => {
    const store = setup();
    const { course } = withCourse(store);

    expect(() =>
      store.createTimetableEntry({
        courseId: course.id,
        dayOfWeek: 2,
        startTime: '10:00',
        endTime: '09:00',
        room: null,
      }),
    ).toThrowError(AppError);
  });

  it('lehnt eine Überschneidung ab', () => {
    const store = setup();
    const { course } = withCourse(store);

    expect(() =>
      store.createTimetableEntry({
        courseId: course.id,
        dayOfWeek: 1,
        startTime: '08:30',
        endTime: '09:15',
        room: null,
      }),
    ).toThrowError(AppError);
  });

  it('lässt eine unmittelbar anschließende Stunde zu', () => {
    const store = setup();
    const { course } = withCourse(store);

    const created = store.createTimetableEntry({
      courseId: course.id,
      dayOfWeek: 1,
      startTime: '08:45',
      endTime: '09:30',
      room: 'A101',
    });

    expect(created.startTime).toBe('08:45');
    expect(created.room).toBe('A101');
  });

  it('lehnt eine unsinnige Uhrzeit ab', () => {
    const store = setup();
    const { course } = withCourse(store);

    expect(() =>
      store.createTimetableEntry({
        courseId: course.id,
        dayOfWeek: 2,
        startTime: '25:00',
        endTime: '26:00',
        room: null,
      }),
    ).toThrowError(AppError);
  });
});

describe('LocalStore - Bewertungen', () => {
  it('nimmt eine Bewertung während der Stunde an', () => {
    const store = setup();
    const { course, student } = withCourse(store);

    expect(store.rate(course.id, student.id, 2).value).toBe(2);
  });

  it('sperrt außerhalb der Unterrichtszeit', () => {
    const store = setup();
    const { course, student } = withCourse(store);
    store.clock.setFixed(new Date('2026-08-31T14:00:00'));

    expect(() => store.rate(course.id, student.id, 1)).toThrowError(AppError);
  });

  it('gibt bei aktiver Notfall-Freigabe auch außerhalb frei', () => {
    const store = setup();
    const { course, student } = withCourse(store);
    store.clock.setFixed(new Date('2026-08-31T14:00:00'));
    store.saveSettings({ toleranceMinutes: 15, allowRatingOutsideLesson: true });

    expect(store.rate(course.id, student.id, 1).value).toBe(1);
  });

  it('lehnt einen unzulässigen Wert ab', () => {
    const store = setup();
    const { course, student } = withCourse(store);

    expect(() => store.rate(course.id, student.id, 3 as 2)).toThrowError(AppError);
  });

  it('lehnt einen Schüler aus einer anderen Klasse ab', () => {
    const store = setup();
    const { course } = withCourse(store);
    const other = store.createClass('10b');
    const stranger = store.createStudent(other.id, 'Fremd', 'Person');

    expect(() => store.rate(course.id, stranger.id, 1)).toThrowError(AppError);
  });

  it('nimmt die letzte Bewertung zurück', () => {
    const store = setup();
    const { course, student } = withCourse(store);
    store.rate(course.id, student.id, 2);
    store.rate(course.id, student.id, -1);

    store.undoLastRating(course.id, student.id);

    expect(store.getScoreboard(course.id).students[0].points).toBe(2);
  });

  it('meldet, wenn es nichts zurückzunehmen gibt', () => {
    const store = setup();
    const { course, student } = withCourse(store);

    expect(() => store.undoLastRating(course.id, student.id)).toThrowError(AppError);
  });

  it('rechnet Punkte, Anzahl und Note zusammen', () => {
    const store = setup();
    const { course, student } = withCourse(store);
    store.rate(course.id, student.id, 2);
    store.rate(course.id, student.id, 2);

    const row = store.getScoreboard(course.id).students[0];

    expect(row.points).toBe(4);
    expect(row.ratingCount).toBe(2);
    expect(row.pointsToday).toBe(4);
    // Der mitgelieferte Standardschlüssel vergibt ab 4 Punkten die Note 3.
    expect(row.grade).toBe('3');
  });

  it('führt einen Schüler ohne Bewertung mit null Punkten', () => {
    const store = setup();
    const { schoolClass, course } = withCourse(store);
    store.createStudent(schoolClass.id, 'Bert', 'Zander');

    const rows = store.getScoreboard(course.id).students;

    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.ratingCount === 0 || r.points === 0)).toBe(true);
  });

  it('grenzt den Punktestand auf einen Zeitraum ein', () => {
    const store = setup();
    const { course, student } = withCourse(store);
    store.rate(course.id, student.id, 2);

    const outside = store.getScoreboard(course.id, { from: '2026-09-01' });

    expect(outside.students[0].points).toBe(0);
  });
});

describe('LocalStore - Notenschlüssel', () => {
  it('bringt einen Standardschlüssel mit', () => {
    expect(setup().getGlobalGradeScale().entries.length).toBeGreaterThan(0);
  });

  it('lehnt einen Schlüssel ohne Stufen ab', () => {
    const store = setup();

    expect(() => store.saveGradeScale(null, { name: 'X', entries: [] })).toThrowError(AppError);
  });

  it('lehnt zwei Stufen mit derselben Punktgrenze ab', () => {
    const store = setup();

    expect(() =>
      store.saveGradeScale(null, {
        name: 'X',
        entries: [
          { minPoints: 5, grade: '1' },
          { minPoints: 5, grade: '2' },
        ],
      }),
    ).toThrowError(AppError);
  });

  it('bevorzugt den Schlüssel des Kurses', () => {
    const store = setup();
    const { course } = withCourse(store);
    store.saveGradeScale(course.id, { name: 'Kurs', entries: [{ minPoints: 0, grade: 'top' }] });

    expect(store.getCourseGradeScale(course.id).name).toBe('Kurs');

    store.deleteCourseGradeScale(course.id);

    expect(store.getCourseGradeScale(course.id).isGlobalDefault).toBe(true);
  });
});

describe('LocalStore - Export', () => {
  it('schreibt eine Zeile je Schüler in die Zusammenfassung', async () => {
    const store = setup();
    const { course, student } = withCourse(store);
    store.rate(course.id, student.id, 2);

    const result = store.exportSummary(course.id);
    const content = await result.blob.text();

    expect(result.fileName).toContain('10a-Mathematik');
    expect(content).toContain('Musterfrau;Anna;2;1;');
  });

  it('schreibt jede Bewertung einzeln', async () => {
    const store = setup();
    const { course, student } = withCourse(store);
    store.rate(course.id, student.id, -2, 'stört');

    const content = await store.exportRatings(course.id).blob.text();

    expect(content).toContain('31.08.2026');
    expect(content).toContain('--');
    expect(content).toContain('stört');
  });

  it('meldet, wenn es nichts zu exportieren gibt', () => {
    const store = setup();

    expect(() => store.exportSummary(null)).toThrowError(AppError);
  });
});

describe('LocalStore - Ablage', () => {
  it('meldet jede Änderung als ungesichert', () => {
    const store = setup();

    expect(store.hasUnsavedChanges()).toBe(false);

    store.createClass('10a');
    expect(store.hasUnsavedChanges()).toBe(true);

    store.markSaved();
    expect(store.hasUnsavedChanges()).toBe(false);
  });

  it('gibt eine Kopie heraus, in die niemand hineinschreiben kann', () => {
    const store = setup();
    store.createClass('10a');

    const snapshot = store.snapshot();
    snapshot.schoolClasses[0].name = 'verändert';

    expect(store.getClasses()[0].name).toBe('10a');
  });

  it('übernimmt einen geladenen Bestand', () => {
    const store = setup();
    store.createClass('10a');
    const snapshot = store.snapshot();

    const second = new LocalStore();
    second.load(snapshot);

    expect(second.getClasses()[0].name).toBe('10a');
    expect(second.isOpen()).toBe(true);
  });
});

describe('Stundenplan-Import', () => {
  /** Eine Zeile, wie die Vorschau sie liefert. */
  function row(overrides: Partial<TimetableImportRow> = {}): TimetableImportRow {
    return {
      dayOfWeek: 1,
      startTime: '08:00',
      endTime: '08:45',
      schoolClassName: '10a',
      subjectName: 'Mathematik',
      room: 'A101',
      occurrences: 18,
      looksRegular: true,
      sourceTitle: 'Mathematik 10a',
      ...overrides,
    };
  }

  it('legt Klasse, Fach, Kurs und Stunde in einem Zug an', () => {
    const store = setup();

    const ergebnis = store.applyTimetableImport([row()]);

    expect(ergebnis.createdClasses).toBe(1);
    expect(ergebnis.createdSubjects).toBe(1);
    expect(ergebnis.createdCourses).toBe(1);
    expect(ergebnis.createdLessons).toBe(1);
    expect(ergebnis.skipped).toEqual([]);

    const stunde = store.getTimetable()[0];
    expect(stunde.schoolClassName).toBe('10a');
    expect(stunde.subjectName).toBe('Mathematik');
    expect(stunde.room).toBe('A101');
  });

  it('benutzt vorhandene Klassen und Faecher weiter', () => {
    const store = setup();
    store.createClass('10a');
    store.createSubject('Mathematik', 'MA');

    const ergebnis = store.applyTimetableImport([row()]);

    expect(ergebnis.createdClasses).toBe(0);
    expect(ergebnis.createdSubjects).toBe(0);
    expect(ergebnis.createdCourses).toBe(1);
  });

  it('erkennt ein Fach auch an seinem Kuerzel', () => {
    const store = setup();
    store.createSubject('Mathematik', 'MA');

    const ergebnis = store.applyTimetableImport([row({ subjectName: 'MA' })]);

    expect(ergebnis.createdSubjects).toBe(0);
    expect(store.getSubjects().length).toBe(1);
  });

  it('legt fuer zwei Stunden desselben Kurses nur einen Kurs an', () => {
    const store = setup();

    const ergebnis = store.applyTimetableImport([
      row(),
      row({ dayOfWeek: 3, startTime: '10:00', endTime: '10:45' }),
    ]);

    expect(ergebnis.createdCourses).toBe(1);
    expect(ergebnis.createdLessons).toBe(2);
  });

  it('ueberspringt eine Stunde, die schon im Stundenplan steht', () => {
    const store = setup();
    store.applyTimetableImport([row()]);

    const ergebnis = store.applyTimetableImport([row()]);

    expect(ergebnis.createdLessons).toBe(0);
    expect(ergebnis.skipped[0]).toContain('steht schon im Stundenplan');
  });

  it('ueberspringt eine Stunde, die sich mit einer anderen ueberschneidet', () => {
    const store = setup();
    store.applyTimetableImport([row()]);

    const ergebnis = store.applyTimetableImport([
      row({ startTime: '08:30', endTime: '09:15', subjectName: 'Deutsch' }),
    ]);

    expect(ergebnis.createdLessons).toBe(0);
    expect(ergebnis.skipped[0]).toContain('überschneidet sich');
  });

  it('ueberspringt Zeilen ohne Klasse oder Fach', () => {
    const store = setup();

    const ergebnis = store.applyTimetableImport([row({ schoolClassName: '  ' })]);

    expect(ergebnis.createdLessons).toBe(0);
    expect(ergebnis.skipped[0]).toContain('Klasse oder Fach fehlt');
  });

  it('ueberspringt Zeilen mit unlesbarer Uhrzeit', () => {
    const store = setup();

    const ergebnis = store.applyTimetableImport([row({ startTime: '25:99' })]);

    expect(ergebnis.skipped[0]).toContain('unlesbare Uhrzeit');
  });

  it('ueberspringt Zeilen, deren Ende nicht nach dem Beginn liegt', () => {
    const store = setup();

    const ergebnis = store.applyTimetableImport([row({ startTime: '09:00', endTime: '08:00' })]);

    expect(ergebnis.skipped[0]).toContain('nicht nach dem Beginn');
  });

  it('verlangt mindestens eine Zeile', () => {
    const store = setup();

    expect(() => store.applyTimetableImport([])).toThrowError(AppError);
  });

  it('nimmt die Vorschau als Grundlage fuer die Uebernahme', () => {
    const store = setup();
    const datei = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'DTSTART;TZID=Europe/Berlin:20240115T080000',
      'DTEND;TZID=Europe/Berlin:20240115T084500',
      'SUMMARY:Mathematik 10a',
      'RRULE:FREQ=WEEKLY;COUNT=18',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const vorschau = store.previewTimetableImport(datei);
    expect(vorschau.rows.length).toBe(1);

    const ergebnis = store.applyTimetableImport(vorschau.rows);
    expect(ergebnis.createdLessons).toBe(1);
    expect(store.getTimetable()[0].startTime).toBe('08:00');
  });

  it('zieht bereits angelegte Klassen fuer die Erkennung heran', () => {
    const store = setup();
    store.createClass('KDM23');

    const datei = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'DTSTART;TZID=Europe/Berlin:20240115T080000',
      'DTEND;TZID=Europe/Berlin:20240115T084500',
      'SUMMARY:Deutsch KDM23',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const vorschau = store.previewTimetableImport(datei);

    expect(vorschau.rows[0].schoolClassName).toBe('KDM23');
    expect(vorschau.rows[0].subjectName).toBe('Deutsch');
  });
});
