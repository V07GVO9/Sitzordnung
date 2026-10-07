/**
 * Rechnet Leistungsnachweise und Mitarbeit in Noten um. Alles hier sind reine
 * Funktionen ohne Zugriff auf den Datenbestand - so lassen sie sich einzeln
 * prüfen.
 *
 * Der Weg zur Note eines Kurses (Lernfeld oder Fach):
 * - Jede Doppelstunde bringt eine Mitarbeitsnote: die Summe der Bewertungen
 *   dieser Stunde, begrenzt auf -2 bis +2, übersetzt über das Schema. Wer in
 *   einer gehaltenen Stunde keine Bewertung bekommt, erhält die Note für
 *   "unbewertet" (Standard 3,0). Eine Stunde gilt als gehalten, sobald
 *   irgendein Schüler des Kurses an dem Tag bewertet wurde.
 * - Die Mitarbeit ist der Durchschnitt dieser Stundennoten und zählt im
 *   mündlichen Bereich mit ihrem Gewicht als eine Einzelnote.
 * - Ein Bereich ist der gewichtete Durchschnitt seiner Einzelnoten.
 * - Die Gesamtnote verrechnet beide Bereiche nach dem Anteil im Schema. Fehlt
 *   ein Bereich noch ganz, zählt nur der vorhandene.
 */

import { GradeArea, LessonGrade } from '../models';
import {
  AssessmentRecord,
  AssessmentResultRecord,
  GradingSchemeRecord,
  ParticipationGradesRecord,
  ParticipationOverrideRecord,
  PercentScaleEntryRecord,
} from './database';

/** Die beste und die schlechteste Note. */
export const BEST_GRADE = 1;
export const WORST_GRADE = 6;

/** Begrenzt die Summe der Bewertungen einer Stunde auf -2 bis +2. */
export function clampLessonValue(sum: number): number {
  return Math.max(-2, Math.min(2, sum));
}

/** Die Note einer Doppelstunde. value null = in dieser Stunde nicht bewertet. */
export function lessonGradeFor(grades: ParticipationGradesRecord, value: number | null): number {
  if (value === null) {
    return grades.unrated;
  }

  switch (clampLessonValue(value)) {
    case 2:
      return grades.plusPlus;
    case 1:
      return grades.plus;
    case -1:
      return grades.minus;
    case -2:
      return grades.minusMinus;
    default:
      return grades.neutral;
  }
}

/** Sucht die Stufe mit der höchsten Prozentgrenze, die noch erreicht ist. */
export function gradeFromPercent(scale: PercentScaleEntryRecord[], percent: number): number | null {
  const matching = scale
    .filter((e) => percent >= e.minPercent)
    .sort((a, b) => b.minPercent - a.minPercent);

  return matching[0]?.grade ?? null;
}

/**
 * Die Note, mit der ein Ergebnis zählt - null, wenn es nicht zählt
 * (entschuldigt oder noch nichts eingetragen).
 */
export function resultGrade(
  result: AssessmentResultRecord | undefined,
  assessment: AssessmentRecord,
  scheme: GradingSchemeRecord,
): number | null {
  if (!result || result.status === 'excused') {
    return null;
  }

  if (result.status === 'refused') {
    return WORST_GRADE;
  }

  if (result.grade !== null) {
    return result.grade;
  }

  if (result.points !== null && assessment.maxPoints) {
    return gradeFromPercent(scheme.percentScale, (result.points / assessment.maxPoints) * 100);
  }

  return null;
}

/**
 * Die Mitarbeitsnoten eines Schülers für jede gehaltene Doppelstunde.
 *
 * @param lessonDates die Tage, an denen der Kurs Unterricht hatte
 * @param ratings die Bewertungen dieses Schülers in diesem Kurs
 * @param overrides die von Hand gesetzten Noten dieses Schülers in diesem Kurs
 */
export function participationLessons(
  lessonDates: string[],
  ratings: { lessonDate: string; value: number }[],
  overrides: ParticipationOverrideRecord[],
  grades: ParticipationGradesRecord,
): LessonGrade[] {
  return lessonDates.map((date) => {
    const own = ratings.filter((r) => r.lessonDate === date);
    const value = own.length ? clampLessonValue(own.reduce((sum, r) => sum + r.value, 0)) : null;
    const autoGrade = lessonGradeFor(grades, value);
    const override = overrides.find((o) => o.lessonDate === date) ?? null;

    return {
      date,
      value,
      autoGrade,
      override: override ? { grade: override.grade, reason: override.reason } : null,
      grade: override ? override.grade : autoGrade,
    };
  });
}

/** Der Durchschnitt - null, wenn es nichts zu mitteln gibt. */
export function average(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? present.reduce((sum, v) => sum + v, 0) / present.length : null;
}

/** Eine Einzelnote, wie sie in einen Bereich eingeht. */
export interface WeightedGrade {
  area: GradeArea;
  weight: number;
  grade: number | null;
}

/** Der gewichtete Durchschnitt. Noten ohne Wert oder mit Gewicht 0 fallen heraus. */
export function weightedAverage(items: { grade: number | null; weight: number }[]): number | null {
  const present = items.filter((i) => i.grade !== null && i.weight > 0);
  const totalWeight = present.reduce((sum, i) => sum + i.weight, 0);

  if (totalWeight === 0) {
    return null;
  }

  return present.reduce((sum, i) => sum + i.grade! * i.weight, 0) / totalWeight;
}

export interface CombinedGrades {
  written: number | null;
  oral: number | null;
  overall: number | null;
  /** True, wenn ein Bereich mit Anteil noch ganz fehlt - die Gesamtnote ist dann vorläufig. */
  partial: boolean;
}

/** Bildet aus den Einzelnoten die Bereichsnoten und die Gesamtnote. */
export function combineGrades(items: WeightedGrade[], writtenPercent: number): CombinedGrades {
  const written = weightedAverage(items.filter((i) => i.area === 'written'));
  const oral = weightedAverage(items.filter((i) => i.area === 'oral'));

  const areas = [
    { grade: written, weight: writtenPercent },
    { grade: oral, weight: 100 - writtenPercent },
  ];

  return {
    written,
    oral,
    overall: weightedAverage(areas),
    partial: areas.some((a) => a.weight > 0 && a.grade === null),
  };
}

/** Rundet auf die gewünschte Zahl an Nachkommastellen. */
export function roundGrade(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor + Number.EPSILON) / factor;
}

/** `2.345` wird zu `2,35` - null wird zum Gedankenstrich. */
export function formatGrade(value: number | null, digits = 2): string {
  if (value === null) {
    return '–';
  }

  return roundGrade(value, digits).toFixed(digits).replace('.', ',');
}

/**
 * Liest eine Note mit Komma oder Punkt ein. Leer ergibt null, alles
 * außerhalb von 1,0 bis 6,0 ergibt NaN.
 */
export function parseGrade(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') {
    return null;
  }

  if (!/^\d+([.,]\d+)?$/.test(trimmed)) {
    return NaN;
  }

  const value = Number(trimmed.replace(',', '.'));
  return value >= BEST_GRADE && value <= WORST_GRADE ? roundGrade(value, 1) : NaN;
}

/** Prüft, ob eine Zahl als Note taugt. */
export function isValidGrade(value: number): boolean {
  return Number.isFinite(value) && value >= BEST_GRADE && value <= WORST_GRADE;
}
