/**
 * Beantwortet anhand des Stundenplans, ob gerade Unterricht stattfindet.
 * Bewertungen sind nur innerhalb einer Unterrichtsstunde (plus Toleranz) möglich.
 *
 * Portiert aus dem früheren LessonService des Backends. Wichtig: da die Prüfung
 * jetzt im Browser läuft, ist sie eine Hilfe für die Lehrkraft, keine
 * Zugriffskontrolle mehr.
 */

import { CurrentLesson, RatingWindow } from '../models';
import {
  AppSettingsRecord,
  CourseRecord,
  SchoolClassRecord,
  SubjectRecord,
  TimetableEntryRecord,
} from './database';
import { toMinutes } from './time';

/** Alles, was für die Beschreibung einer laufenden Stunde gebraucht wird. */
export interface LessonContext {
  entries: TimetableEntryRecord[];
  courses: CourseRecord[];
  schoolClasses: SchoolClassRecord[];
  subjects: SubjectRecord[];
  settings: AppSettingsRecord;
}

/**
 * Prüft, ob der Zeitpunkt in den Eintrag fällt. Die Toleranz wird in Minuten
 * seit Mitternacht gerechnet, damit sie an den Tagesrändern nicht über den
 * Tageswechsel hinaus "umschlägt".
 */
export function covers(
  entry: TimetableEntryRecord,
  now: Date,
  toleranceMinutes: number,
): boolean {
  if (entry.dayOfWeek !== now.getDay()) {
    return false;
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const start = Math.max(0, toMinutes(entry.startTime) - toleranceMinutes);
  const end = Math.min(24 * 60, toMinutes(entry.endTime) + toleranceMinutes);

  return nowMinutes >= start && nowMinutes <= end;
}

function byStartTime(a: TimetableEntryRecord, b: TimetableEntryRecord): number {
  return toMinutes(a.startTime) - toMinutes(b.startTime);
}

/** Der Stundenplaneintrag, der gerade läuft - über alle Kurse hinweg. */
export function currentLesson(context: LessonContext, now: Date): CurrentLesson {
  const current = context.entries
    .filter((e) => covers(e, now, context.settings.toleranceMinutes))
    .sort(byStartTime)[0];

  if (!current) {
    const message = context.settings.allowRatingOutsideLesson
      ? 'Aktuell steht kein Unterricht im Stundenplan. Die Notfall-Freigabe ist aktiv, Bewertungen sind trotzdem möglich.'
      : 'Aktuell steht kein Unterricht im Stundenplan. Bewertungen sind deshalb gesperrt.';

    return {
      hasLesson: false,
      courseId: null,
      schoolClassName: null,
      subjectName: null,
      startTime: null,
      endTime: null,
      room: null,
      message,
    };
  }

  const course = context.courses.find((c) => c.id === current.courseId);
  const schoolClassName =
    context.schoolClasses.find((c) => c.id === course?.schoolClassId)?.name ?? '';
  const subjectName = context.subjects.find((s) => s.id === course?.subjectId)?.name ?? '';

  return {
    hasLesson: true,
    courseId: current.courseId,
    schoolClassName,
    subjectName,
    startTime: current.startTime,
    endTime: current.endTime,
    room: current.room,
    message:
      `Laufender Unterricht: ${subjectName} in ${schoolClassName} ` +
      `(${current.startTime}-${current.endTime} Uhr).`,
  };
}

/** Sagt für einen konkreten Kurs, ob gerade bewertet werden darf. */
export function ratingWindow(
  context: LessonContext,
  courseId: number,
  now: Date,
): RatingWindow {
  const todaysLessons = context.entries
    .filter((e) => e.courseId === courseId && e.dayOfWeek === now.getDay())
    .sort(byStartTime);

  const match = todaysLessons.find((e) => covers(e, now, context.settings.toleranceMinutes));

  if (match) {
    return {
      canRate: true,
      reason: `Unterricht läuft (${match.startTime}-${match.endTime} Uhr).`,
      startTime: match.startTime,
      endTime: match.endTime,
    };
  }

  if (context.settings.allowRatingOutsideLesson) {
    return {
      canRate: true,
      reason:
        'Kein Unterricht laut Stundenplan - Bewertung nur wegen aktiver Notfall-Freigabe möglich.',
      startTime: null,
      endTime: null,
    };
  }

  const reason =
    todaysLessons.length === 0
      ? 'In diesem Kurs findet heute laut Stundenplan kein Unterricht statt.'
      : 'Der Unterricht in diesem Kurs läuft gerade nicht. Heute: ' +
        todaysLessons.map((e) => `${e.startTime}-${e.endTime}`).join(', ') +
        ' Uhr.';

  return { canRate: false, reason, startTime: null, endTime: null };
}
