/**
 * Stundenplanprüfung - dieselben Fälle, die früher die LessonServiceTests
 * im Backend abgedeckt haben.
 */

import { AppSettingsRecord, TimetableEntryRecord } from './database';
import { LessonContext, covers, currentLesson, ratingWindow } from './lesson.logic';

function entry(partial: Partial<TimetableEntryRecord> = {}): TimetableEntryRecord {
  return {
    id: 1,
    courseId: 1,
    dayOfWeek: 1,
    startTime: '08:00',
    endTime: '08:45',
    room: null,
    ...partial,
  };
}

function context(
  entries: TimetableEntryRecord[],
  settings: Partial<AppSettingsRecord> = {},
): LessonContext {
  return {
    entries,
    courses: [{ id: 1, schoolClassId: 1, subjectId: 1 }],
    schoolClasses: [{ id: 1, name: '10a' }],
    subjects: [{ id: 1, name: 'Mathematik', shortName: 'MA' }],
    settings: { toleranceMinutes: 15, allowRatingOutsideLesson: false, ...settings },
  };
}

/** Ein Montag. */
function monday(time: string): Date {
  return new Date(`2026-08-31T${time}:00`);
}

describe('covers', () => {
  it('erkennt einen Zeitpunkt mitten in der Stunde', () => {
    expect(covers(entry(), monday('08:20'), 0)).toBe(true);
  });

  it('lehnt einen Zeitpunkt vor der Stunde ohne Kulanzzeit ab', () => {
    expect(covers(entry(), monday('07:50'), 0)).toBe(false);
  });

  it('lässt die Kulanzzeit vor dem Beginn gelten', () => {
    expect(covers(entry(), monday('07:50'), 15)).toBe(true);
  });

  it('lässt die Kulanzzeit nach dem Ende gelten', () => {
    expect(covers(entry(), monday('08:55'), 15)).toBe(true);
  });

  it('lehnt einen anderen Wochentag ab', () => {
    // Der 1.9.2026 ist ein Dienstag.
    expect(covers(entry(), new Date('2026-09-01T08:20:00'), 15)).toBe(false);
  });

  it('schlägt durch die Kulanzzeit nicht über den Tageswechsel hinaus um', () => {
    const late = entry({ startTime: '23:30', endTime: '23:55' });
    // 00:10 am Folgetag liegt zwar innerhalb von 20 Minuten nach dem Ende,
    // gehört aber zum nächsten Tag - hier wird nur die Uhrzeit geprüft.
    expect(covers(late, monday('00:10'), 20)).toBe(false);
  });
});

describe('currentLesson', () => {
  it('beschreibt die laufende Stunde', () => {
    const result = currentLesson(context([entry()]), monday('08:20'));

    expect(result.hasLesson).toBe(true);
    expect(result.courseId).toBe(1);
    expect(result.subjectName).toBe('Mathematik');
    expect(result.schoolClassName).toBe('10a');
    expect(result.message).toContain('08:00-08:45');
  });

  it('meldet außerhalb des Unterrichts eine Sperre', () => {
    const result = currentLesson(context([entry()]), monday('12:00'));

    expect(result.hasLesson).toBe(false);
    expect(result.message).toContain('gesperrt');
  });

  it('weist bei aktiver Notfall-Freigabe darauf hin', () => {
    const result = currentLesson(
      context([entry()], { allowRatingOutsideLesson: true }),
      monday('12:00'),
    );

    expect(result.hasLesson).toBe(false);
    expect(result.message).toContain('Notfall-Freigabe');
  });

  it('nimmt bei mehreren passenden Stunden die früheste', () => {
    const entries = [
      entry({ id: 2, startTime: '09:00', endTime: '09:45' }),
      entry({ id: 1, startTime: '08:00', endTime: '08:45' }),
    ];

    // 08:50 liegt mit 15 Minuten Kulanz in beiden Stunden.
    expect(currentLesson(context(entries), monday('08:50')).startTime).toBe('08:00');
  });
});

describe('ratingWindow', () => {
  it('gibt während der Stunde frei', () => {
    const result = ratingWindow(context([entry()]), 1, monday('08:20'));

    expect(result.canRate).toBe(true);
    expect(result.startTime).toBe('08:00');
  });

  it('sperrt außerhalb der Stunde und nennt die Zeiten des Tages', () => {
    const result = ratingWindow(context([entry()]), 1, monday('12:00'));

    expect(result.canRate).toBe(false);
    expect(result.reason).toContain('08:00-08:45');
  });

  it('sagt, wenn heute gar kein Unterricht ansteht', () => {
    const result = ratingWindow(context([entry({ dayOfWeek: 3 })]), 1, monday('12:00'));

    expect(result.canRate).toBe(false);
    expect(result.reason).toContain('kein Unterricht statt');
  });

  it('gibt bei Notfall-Freigabe auch außerhalb frei', () => {
    const result = ratingWindow(
      context([entry()], { allowRatingOutsideLesson: true }),
      1,
      monday('12:00'),
    );

    expect(result.canRate).toBe(true);
    expect(result.reason).toContain('Notfall-Freigabe');
  });

  it('beachtet nur die Stunden des angefragten Kurses', () => {
    const result = ratingWindow(context([entry({ courseId: 99 })]), 1, monday('08:20'));

    expect(result.canRate).toBe(false);
  });
});
