/**
 * Das Änderungsprotokoll der Noten. Jede Änderung an freigegebenen Noten,
 * jede von Hand gesetzte Mitarbeitsnote und jede Quartalsnote wird hier
 * vermerkt - geändert wird nie stillschweigend.
 */

import { trimToNull } from '../logic/text';
import { Database } from './database';

export interface GradeChangeEntry {
  courseId: number;
  studentId: number;
  /** Worum es geht, etwa „Klassenarbeit 1 (15.09.2026)“. */
  what: string;
  oldValue: string;
  newValue: string;
  reason: string | null;
  /** Zeitpunkt als ISO-8601-Zeichenkette. */
  changedAt: string;
}

/** Hängt einen Eintrag an das Protokoll an. */
export function logGradeChange(db: Database, entry: GradeChangeEntry): void {
  db.gradeChanges.push({
    id: db.nextIds.gradeChange++,
    courseId: entry.courseId,
    studentId: entry.studentId,
    what: entry.what,
    oldValue: entry.oldValue,
    newValue: entry.newValue,
    reason: trimToNull(entry.reason),
    changedAt: entry.changedAt,
  });
}
