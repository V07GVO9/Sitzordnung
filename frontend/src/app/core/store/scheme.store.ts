/**
 * Das Bewertungsschema eines Kurses: Anteil schriftlich/mündlich, die Arten
 * von Leistungsnachweisen mit ihrem Gewicht, der Punkteschlüssel und die
 * Noten für die Mitarbeit.
 */

import { AppError } from '../app-error';
import { isValidGrade } from '../logic/assessment.logic';
import { GradingScheme, GradingSchemeInput } from '../models';
import { GradingSchemeRecord } from './database';
import { requireCourse, schemeOf } from './lookups';
import { StorePart } from './store-part';

export class SchemeStore extends StorePart {
  /** Das Schema des Kurses - solange keines gespeichert ist, der Vorschlag. */
  getScheme(courseId: number): GradingScheme {
    requireCourse(this.db, courseId);
    const record = structuredClone(schemeOf(this.db, courseId));

    return {
      ...record,
      percentScale: record.percentScale.sort((a, b) => b.minPercent - a.minPercent),
      isDefault: !this.db.gradingSchemes.some((g) => g.courseId === courseId),
    };
  }

  saveScheme(courseId: number, input: GradingSchemeInput): GradingScheme {
    requireCourse(this.db, courseId);
    this.validate(courseId, input);

    const record: GradingSchemeRecord = {
      courseId,
      writtenPercent: input.writtenPercent,
      types: input.types.map((t) => ({
        key: t.key.trim(),
        label: t.label.trim(),
        area: t.area,
        weight: t.weight,
      })),
      percentScale: input.percentScale.map((e) => ({ minPercent: e.minPercent, grade: e.grade })),
      participationWeight: input.participationWeight,
      participationGrades: { ...input.participationGrades },
    };

    this.db.gradingSchemes = [
      ...this.db.gradingSchemes.filter((g) => g.courseId !== courseId),
      record,
    ];
    this.changed();

    return this.getScheme(courseId);
  }

  /** Überträgt das Schema eines Kurses auf andere - etwa auf alle Lernfelder einer Klasse. */
  copyScheme(fromCourseId: number, toCourseIds: number[]): void {
    const source = schemeOf(this.db, fromCourseId);
    requireCourse(this.db, fromCourseId);

    // Erst alles prüfen, dann schreiben - sonst bliebe ein halber Stand zurück.
    const targets = toCourseIds.filter((id) => id !== fromCourseId);
    for (const target of targets) {
      requireCourse(this.db, target);
      this.validate(target, source);
    }

    for (const target of targets) {
      this.db.gradingSchemes = [
        ...this.db.gradingSchemes.filter((g) => g.courseId !== target),
        { ...structuredClone(source), courseId: target },
      ];
    }
    this.changed();
  }

  private validate(courseId: number, input: GradingSchemeInput): void {
    if (
      !Number.isFinite(input.writtenPercent) ||
      input.writtenPercent < 0 ||
      input.writtenPercent > 100
    ) {
      throw new AppError('Der schriftliche Anteil muss zwischen 0 und 100 % liegen.');
    }

    if (input.types.some((t) => t.key.trim() === '' || t.label.trim() === '')) {
      throw new AppError('Jede Art von Leistungsnachweis braucht einen Namen.');
    }

    if (new Set(input.types.map((t) => t.key)).size !== input.types.length) {
      throw new AppError('Zwei Arten von Leistungsnachweisen haben denselben Namen.');
    }

    if (input.types.some((t) => !(t.weight >= 0) || !['written', 'oral'].includes(t.area))) {
      throw new AppError('Jede Art braucht einen Bereich und ein Gewicht ab 0.');
    }

    const used = this.db.assessments.find(
      (a) => a.courseId === courseId && !input.types.some((t) => t.key === a.typeKey),
    );
    if (used) {
      throw new AppError(
        `Die Art von „${used.title}" wird noch verwendet und kann nicht entfernt werden.`,
      );
    }

    if (input.percentScale.length === 0) {
      throw new AppError('Der Punkteschlüssel braucht mindestens eine Stufe.');
    }

    if (input.percentScale.some((e) => !isValidGrade(e.grade) || !Number.isFinite(e.minPercent))) {
      throw new AppError('Im Punkteschlüssel sind nur Noten von 1 bis 6 möglich.');
    }

    if (new Set(input.percentScale.map((e) => e.minPercent)).size !== input.percentScale.length) {
      throw new AppError('Zwei Stufen des Punkteschlüssels haben dieselbe Prozentgrenze.');
    }

    if (!input.percentScale.some((e) => e.minPercent <= 0)) {
      throw new AppError('Der Punkteschlüssel braucht eine Stufe ab 0 %.');
    }

    if (!(input.participationWeight >= 0)) {
      throw new AppError('Das Gewicht der Mitarbeit darf nicht negativ sein.');
    }

    if (!Object.values(input.participationGrades).every((g) => isValidGrade(g))) {
      throw new AppError('Für die Mitarbeit sind nur Noten von 1,0 bis 6,0 möglich.');
    }
  }
}
