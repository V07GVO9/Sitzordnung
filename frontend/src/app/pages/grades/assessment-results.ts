import { AppError } from '../../core/app-error';
import { parseGrade } from '../../core/logic/assessment.logic';
import { AssessmentResultInput, ResultStatus } from '../../core/models';

/** Eine Zeile der Eingabetabelle - Punkte und Note als Text, wie getippt. */
export interface ResultRow {
  studentId: number;
  name: string;
  status: ResultStatus;
  points: string;
  grade: string;
  comment: string;
}

/**
 * Wandelt die Eingabetabelle in Ergebnisse um - oder meldet die erste
 * unbrauchbare Zeile als {@link AppError}, damit der Text mit dem Namen
 * des Schülers in der Meldung erscheint.
 */
export function collectResults(rows: ResultRow[]): AssessmentResultInput[] {
  const results: AssessmentResultInput[] = [];

  for (const row of rows) {
    const grade = parseGrade(row.grade);
    if (Number.isNaN(grade)) {
      throw new AppError(`Die Note für ${row.name} ist keine Note zwischen 1,0 und 6,0.`);
    }

    const pointsText = row.points.trim().replace(',', '.');
    const points = pointsText === '' ? null : Number(pointsText);
    if (points !== null && !Number.isFinite(points)) {
      throw new AppError(`Die Punkte für ${row.name} sind keine Zahl.`);
    }

    results.push({
      studentId: row.studentId,
      points,
      grade,
      status: row.status,
      comment: row.comment.trim() || null,
    });
  }

  return results;
}
