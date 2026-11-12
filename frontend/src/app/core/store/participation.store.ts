/**
 * Mitarbeit je Doppelstunde, soweit sie von Hand festgelegt wird: wer fehlte
 * und wo die Note aus den Bewertungen durch eine eigene ersetzt wurde.
 */

import { AppError } from '../app-error';
import { formatGrade, isValidGrade } from '../logic/assessment.logic';
import { trimToNull } from '../logic/text';
import { formatDateGerman, isValidDateKey } from '../logic/time';
import { ParticipationOverrideRecord } from './database';
import { logGradeChange } from './grade-log';
import {
  lessonDates,
  participationOf,
  requireCourse,
  requireStudentOfCourse,
  schemeOf,
} from './lookups';
import { StorePart } from './store-part';

export class ParticipationStore extends StorePart {
  /**
   * Setzt die Note einer Doppelstunde von Hand. grade null = fehlte (zählt
   * nicht), 'auto' = wieder die Note aus den Bewertungen.
   */
  setParticipationOverride(
    courseId: number,
    studentId: number,
    lessonDate: string,
    grade: number | null | 'auto',
    reason?: string | null,
  ): void {
    requireStudentOfCourse(this.db, courseId, studentId);

    if (!lessonDates(this.db, courseId).includes(lessonDate)) {
      throw new AppError('An diesem Tag gab es in diesem Kurs keine bewertete Stunde.');
    }

    if (typeof grade === 'number' && !isValidGrade(grade)) {
      throw new AppError('Die Note muss zwischen 1,0 und 6,0 liegen.');
    }

    const scheme = schemeOf(this.db, courseId);
    const gradeOfLesson = () =>
      participationOf(this.db, courseId, studentId, [lessonDate], scheme)[0].grade;
    const before = gradeOfLesson();

    this.removeOverride(courseId, studentId, lessonDate);
    if (grade !== 'auto') {
      this.db.participationOverrides.push({
        courseId,
        studentId,
        lessonDate,
        grade,
        reason: trimToNull(reason),
      });
    }

    const after = gradeOfLesson();
    const describe = (g: number | null) => (g === null ? 'fehlte' : formatGrade(g, 1));

    if (describe(before) !== describe(after)) {
      logGradeChange(this.db, {
        courseId,
        studentId,
        what: `Mitarbeit ${formatDateGerman(lessonDate)}`,
        oldValue: describe(before),
        newValue: describe(after) + (grade === 'auto' ? ' (aus Bewertungen)' : ''),
        reason: reason ?? null,
        changedAt: this.now().toISOString(),
      });
    }
    this.changed();
  }

  /** Die an einem Tag als „fehlt“ markierten Schüler eines Kurses. */
  getAbsentStudentIds(courseId: number, lessonDate: string): number[] {
    requireCourse(this.db, courseId);
    return this.db.participationOverrides
      .filter((o) => o.courseId === courseId && o.lessonDate === lessonDate && o.grade === null)
      .map((o) => o.studentId);
  }

  /**
   * Markiert einen Schüler für den Tag als fehlend - schon zu Stundenbeginn,
   * bevor jemand bewertet wurde. Die Doppelstunde zählt für ihn dann nicht.
   * Zurücknehmen entfernt nur das „fehlt“, keine von Hand gesetzte Note.
   */
  setAbsent(courseId: number, studentId: number, lessonDate: string, absent: boolean): void {
    requireStudentOfCourse(this.db, courseId, studentId);
    if (!isValidDateKey(lessonDate)) {
      throw new AppError('Das Datum der Stunde ist ungültig.');
    }

    const existing = this.db.participationOverrides.find(
      isOverrideOf(courseId, studentId, lessonDate),
    );
    if (absent ? existing?.grade === null : existing?.grade !== null) {
      return;
    }

    this.removeOverride(courseId, studentId, lessonDate);
    if (absent) {
      this.db.participationOverrides.push({
        courseId,
        studentId,
        lessonDate,
        grade: null,
        reason: 'fehlt (im Unterricht markiert)',
      });
    }

    logGradeChange(this.db, {
      courseId,
      studentId,
      what: `Mitarbeit ${formatDateGerman(lessonDate)}`,
      oldValue: absent
        ? existing
          ? formatGrade(existing.grade!, 1)
          : 'aus Bewertungen'
        : 'fehlte',
      newValue: absent ? 'fehlte' : 'aus Bewertungen',
      reason: 'im Unterricht markiert',
      changedAt: this.now().toISOString(),
    });
    this.changed();
  }

  private removeOverride(courseId: number, studentId: number, lessonDate: string): void {
    const same = isOverrideOf(courseId, studentId, lessonDate);
    this.db.participationOverrides = this.db.participationOverrides.filter((o) => !same(o));
  }
}

/** Trifft genau die von Hand gesetzte Note dieses Schülers an diesem Tag. */
function isOverrideOf(courseId: number, studentId: number, lessonDate: string) {
  return (o: ParticipationOverrideRecord) =>
    o.courseId === courseId && o.studentId === studentId && o.lessonDate === lessonDate;
}
