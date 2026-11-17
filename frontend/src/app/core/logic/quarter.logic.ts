/**
 * Die vier Quartale des Schuljahres - grob nach dem Kalender:
 * Q1 Aug–Okt, Q2 Nov–Jan, Q3 Feb–Apr, Q4 Mai–Jul.
 */

import { Quarter } from '../models';
import { roundGrade } from './assessment.logic';
import { toDateKey } from './time';

/** Das Quartal, in dem ein Datum liegt. */
export function quarterOf(date: Date): Quarter {
  const month = date.getMonth() + 1;
  if (month >= 8 && month <= 10) return 1;
  if (month >= 11 || month === 1) return 2;
  if (month <= 4) return 3;
  return 4;
}

/** Das Kalenderjahr, in dem das Schuljahr des Datums begonnen hat - es beginnt am 1. August. */
export function schoolYearOf(date: Date): number {
  return date.getMonth() + 1 >= 8 ? date.getFullYear() : date.getFullYear() - 1;
}

/** Erster und letzter Tag eines Quartals im Schuljahr, in dem `today` liegt. */
export function quarterRange(quarter: Quarter, today: Date): { from: string; to: string } {
  const startYear = schoolYearOf(today);
  const ranges: Record<Quarter, [Date, Date]> = {
    1: [new Date(startYear, 7, 1), new Date(startYear, 9, 31)],
    2: [new Date(startYear, 10, 1), new Date(startYear + 1, 0, 31)],
    3: [new Date(startYear + 1, 1, 1), new Date(startYear + 1, 3, 30)],
    4: [new Date(startYear + 1, 4, 1), new Date(startYear + 1, 6, 31)],
  };
  const [from, to] = ranges[quarter];
  return { from: toDateKey(from), to: toDateKey(to) };
}

/**
 * Die Endnote eines Quartals aus der schriftlichen und der mündlichen Note,
 * gewichtet mit dem Anteil schriftlich (0–100 %). Fehlt ein Bereich, zählt
 * der andere allein (partial = vorläufig); fehlen beide, gibt es keine Note.
 */
export function quarterFinalGrade(
  written: number | null,
  oral: number | null,
  writtenPercent: number,
): { grade: number | null; partial: boolean } {
  if (written === null && oral === null) {
    return { grade: null, partial: false };
  }
  if (written === null || oral === null) {
    return { grade: roundGrade((written ?? oral)!, 1), partial: true };
  }
  const w = writtenPercent / 100;
  return { grade: roundGrade(written * w + oral * (1 - w), 1), partial: false };
}
