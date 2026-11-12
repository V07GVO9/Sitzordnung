/**
 * Die Quartalsnoten: schriftlich in Prozent (die Note folgt aus dem
 * Punkteschlüssel), mündlich als Note - ohne Eintrag als Vorschlag aus der
 * Mitarbeit im Quartal.
 */

import { AppError } from '../app-error';
import {
  average,
  formatGrade,
  gradeFromPercent,
  isValidGrade,
  roundGrade,
} from '../logic/assessment.logic';
import { quarterRange } from '../logic/quarter.logic';
import { germanNumber } from '../logic/text';
import { AREA_LABELS, GradeArea, QUARTERS, Quarter, QuarterGrade } from '../models';
import { QuarterGradeRecord } from './database';
import { logGradeChange } from './grade-log';
import {
  lessonDates,
  participationOf,
  requireCourse,
  requireStudentOfCourse,
  schemeOf,
  studentsOfCourse,
} from './lookups';
import { StorePart } from './store-part';

/** Beschreibt eine Quartalsnote für das Änderungsprotokoll. */
function describe(percent: number | null, grade: number | null): string {
  if (percent === null && grade === null) {
    return '–';
  }
  return percent === null
    ? formatGrade(grade, 1)
    : `${germanNumber(percent)} % / ${formatGrade(grade, 1)}`;
}

export class QuarterGradeStore extends StorePart {
  /**
   * Alle Quartalsnoten eines Kurses. Ist für mündlich nichts eingetragen,
   * steht dort als Vorschlag der Durchschnitt der Mitarbeitsnoten im Quartal.
   */
  getQuarterGrades(courseId: number): QuarterGrade[] {
    requireCourse(this.db, courseId);
    const stored: QuarterGrade[] = this.db.quarterGrades
      .filter((q) => q.courseId === courseId)
      .map(({ studentId, quarter, area, percent, grade }) => ({
        studentId,
        quarter,
        area,
        percent,
        grade,
        suggested: false,
      }));

    const hasOral = new Set(
      stored.filter((q) => q.area === 'oral').map((q) => `${q.studentId}:${q.quarter}`),
    );
    const scheme = schemeOf(this.db, courseId);
    const today = this.now();
    const suggestions: QuarterGrade[] = [];

    for (const quarter of QUARTERS) {
      const dates = lessonDates(this.db, courseId, quarterRange(quarter, today));
      if (dates.length === 0) {
        continue;
      }
      for (const student of studentsOfCourse(this.db, courseId)) {
        if (hasOral.has(`${student.id}:${quarter}`)) {
          continue;
        }
        const avg = average(
          participationOf(this.db, courseId, student.id, dates, scheme).map((l) => l.grade),
        );
        if (avg !== null) {
          suggestions.push({
            studentId: student.id,
            quarter,
            area: 'oral',
            percent: null,
            grade: roundGrade(avg, 1),
            suggested: true,
          });
        }
      }
    }

    return [...stored, ...suggestions];
  }

  /**
   * Trägt eine Quartalsnote ein: schriftlich in Prozent (die Note folgt aus
   * dem Prozentschlüssel), mündlich direkt als Note. null löscht den Eintrag -
   * mündlich gilt dann wieder der Durchschnitt der Mitarbeit.
   */
  setQuarterGrade(
    courseId: number,
    studentId: number,
    quarter: Quarter,
    area: GradeArea,
    value: number | null,
  ): QuarterGrade {
    requireStudentOfCourse(this.db, courseId, studentId);
    if (!QUARTERS.includes(quarter)) {
      throw new AppError('Es gibt nur die Quartale 1 bis 4.');
    }

    let percent: number | null = null;
    let grade: number | null = null;
    if (area === 'written') {
      if (value !== null && !(Number.isFinite(value) && value >= 0 && value <= 100)) {
        throw new AppError('Die Prozentzahl muss zwischen 0 und 100 liegen.');
      }
      percent = value;
      grade =
        value === null ? null : gradeFromPercent(schemeOf(this.db, courseId).percentScale, value);
    } else {
      if (value !== null && !isValidGrade(value)) {
        throw new AppError('Die Note muss zwischen 1,0 und 6,0 liegen.');
      }
      grade = value === null ? null : roundGrade(value, 1);
    }

    const matches = (q: QuarterGradeRecord) =>
      q.courseId === courseId &&
      q.studentId === studentId &&
      q.quarter === quarter &&
      q.area === area;
    const before = this.db.quarterGrades.find(matches);
    this.db.quarterGrades = this.db.quarterGrades.filter((q) => !matches(q));

    if (grade !== null || percent !== null) {
      this.db.quarterGrades.push({ courseId, studentId, quarter, area, percent, grade });
    }

    const oldText = describe(before?.percent ?? null, before?.grade ?? null);
    const newText = describe(percent, grade);
    if (oldText !== newText) {
      logGradeChange(this.db, {
        courseId,
        studentId,
        what: `${quarter}. Quartal ${AREA_LABELS[area]}`,
        oldValue: oldText,
        newValue: newText,
        reason: null,
        changedAt: this.now().toISOString(),
      });
    }
    this.changed();

    return { studentId, quarter, area, percent, grade, suggested: false };
  }
}
