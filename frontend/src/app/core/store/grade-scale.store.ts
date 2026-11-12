/**
 * Die Notenschlüssel für Mitarbeitspunkte: ein allgemeiner für alle Kurse
 * und - wo gewünscht - ein eigener je Kurs.
 */

import { AppError } from '../app-error';
import { effectiveScale } from '../logic/grading.logic';
import { GradeScale, GradeScaleInput } from '../models';
import { GradeScaleRecord } from './database';
import { requireCourse } from './lookups';
import { StorePart } from './store-part';

function toGradeScale(record: GradeScaleRecord): GradeScale {
  return {
    id: record.id,
    courseId: record.courseId,
    name: record.name,
    isGlobalDefault: record.courseId === null,
    entries: [...record.entries].sort((a, b) => b.minPoints - a.minPoints),
  };
}

export class GradeScaleStore extends StorePart {
  getGlobalGradeScale(): GradeScale {
    const scale = this.db.gradeScales.find((g) => g.courseId === null);
    if (!scale) {
      throw new AppError('Es ist kein globaler Notenschlüssel hinterlegt.');
    }

    return toGradeScale(scale);
  }

  /** Der Schlüssel, der für diesen Kurs tatsächlich angewendet wird. */
  getCourseGradeScale(courseId: number): GradeScale {
    requireCourse(this.db, courseId);

    const scale = effectiveScale(this.db.gradeScales, courseId);
    if (!scale) {
      throw new AppError('Für diesen Kurs ist kein Notenschlüssel hinterlegt.');
    }

    return toGradeScale(scale);
  }

  /** Speichert den Schlüssel eines Kurses - oder mit `null` den allgemeinen. */
  saveGradeScale(courseId: number | null, input: GradeScaleInput): GradeScale {
    if (courseId !== null) {
      requireCourse(this.db, courseId);
    }

    if (input.entries.length === 0) {
      throw new AppError('Ein Notenschlüssel braucht mindestens eine Stufe.');
    }

    if (input.entries.some((e) => e.grade.trim() === '')) {
      throw new AppError('Jede Stufe braucht eine Note.');
    }

    if (new Set(input.entries.map((e) => e.minPoints)).size !== input.entries.length) {
      throw new AppError('Zwei Stufen dürfen nicht dieselbe Punktgrenze haben.');
    }

    let scale = this.db.gradeScales.find((g) => g.courseId === courseId);
    if (!scale) {
      scale = {
        id: this.db.nextIds.gradeScale++,
        courseId,
        name: '',
        entries: [],
      };
      this.db.gradeScales.push(scale);
    }

    scale.name =
      input.name.trim() === ''
        ? courseId === null
          ? 'Standard-Notenschlüssel'
          : 'Notenschlüssel'
        : input.name.trim();

    scale.entries = input.entries.map((e) => ({
      minPoints: e.minPoints,
      grade: e.grade.trim(),
    }));
    this.changed();

    return toGradeScale(scale);
  }

  /** Entfernt den kursspezifischen Schlüssel, danach gilt wieder der globale. */
  deleteCourseGradeScale(courseId: number): void {
    if (!this.db.gradeScales.some((g) => g.courseId === courseId)) {
      throw new AppError('Für diesen Kurs ist kein eigener Notenschlüssel hinterlegt.');
    }

    this.db.gradeScales = this.db.gradeScales.filter((g) => g.courseId !== courseId);
    this.changed();
  }
}
