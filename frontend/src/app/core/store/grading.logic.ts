/**
 * Rechnet Mitarbeitspunkte in Noten um. Ein Kurs benutzt seinen eigenen
 * Notenschlüssel, sonst den globalen Standardschlüssel. Ist keiner hinterlegt,
 * bleibt die Note leer - die Punkte werden trotzdem gezählt.
 *
 * Portiert aus dem früheren GradingService des Backends.
 */

import { GradeScaleRecord } from './database';

/** Der Schlüssel, der für diesen Kurs tatsächlich gilt. */
export function effectiveScale(
  scales: GradeScaleRecord[],
  courseId: number,
): GradeScaleRecord | null {
  return (
    scales.find((s) => s.courseId === courseId) ?? scales.find((s) => s.courseId === null) ?? null
  );
}

/** Sucht die Stufe mit der höchsten Punktgrenze, die der Punktestand noch erreicht. */
export function resolveGrade(scale: GradeScaleRecord | null, points: number): string | null {
  if (!scale || scale.entries.length === 0) {
    return null;
  }

  const matching = scale.entries
    .filter((e) => points >= e.minPoints)
    .sort((a, b) => b.minPoints - a.minPoints);

  return matching[0]?.grade ?? null;
}
