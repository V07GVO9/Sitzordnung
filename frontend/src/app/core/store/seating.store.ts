/** Die Sitzordnungen eines Kurses: Raster und Belegung. */

import { AppError } from '../app-error';
import { SeatLayoutInput, SeatingPlan } from '../models';
import { SeatingPlanRecord } from './database';
import { requireCourse } from './lookups';
import { StorePart } from './store-part';

function toPlan(record: SeatingPlanRecord): SeatingPlan {
  return {
    id: record.id,
    courseId: record.courseId,
    name: record.name,
    rows: record.rows,
    columns: record.columns,
    seats: [...record.seats].sort((a, b) => a.row - b.row || a.column - b.column),
  };
}

export class SeatingStore extends StorePart {
  getSeatingPlans(courseId: number): SeatingPlan[] {
    requireCourse(this.db, courseId);
    return this.db.seatingPlans
      .filter((p) => p.courseId === courseId)
      .sort((a, b) => a.id - b.id)
      .map(toPlan);
  }

  createSeatingPlan(courseId: number, name: string, rows: number, columns: number): SeatingPlan {
    requireCourse(this.db, courseId);

    const existing = this.db.seatingPlans.filter((p) => p.courseId === courseId).length;
    const record: SeatingPlanRecord = {
      id: this.db.nextIds.seatingPlan++,
      courseId,
      name: name.trim() === '' ? `Sitzordnung ${existing + 1}` : name.trim(),
      rows,
      columns,
      seats: [],
    };

    this.db.seatingPlans.push(record);
    this.changed();

    return toPlan(record);
  }

  updateSeatingPlan(id: number, name: string, rows: number, columns: number): SeatingPlan {
    const plan = this.requirePlan(id);

    plan.name = name.trim();
    plan.rows = rows;
    plan.columns = columns;

    // Plätze, die durch ein kleineres Raster herausfallen, werden freigeräumt.
    plan.seats = plan.seats.filter((s) => s.row < plan.rows && s.column < plan.columns);
    this.changed();

    return toPlan(plan);
  }

  /**
   * Speichert die komplette Belegung nach dem Verschieben per Drag and Drop.
   * Die bisherige Belegung wird dabei ersetzt.
   */
  saveLayout(planId: number, input: SeatLayoutInput): SeatingPlan {
    const plan = this.requirePlan(planId);
    const course = requireCourse(this.db, plan.courseId);

    if (input.seats.some((s) => s.row >= input.rows || s.column >= input.columns)) {
      throw new AppError('Mindestens ein Platz liegt außerhalb des Rasters.');
    }

    const positions = new Set(input.seats.map((s) => `${s.row}:${s.column}`));
    if (positions.size !== input.seats.length) {
      throw new AppError('Auf einem Platz darf nur ein Schüler sitzen.');
    }

    const studentIds = new Set(input.seats.map((s) => s.studentId));
    if (studentIds.size !== input.seats.length) {
      throw new AppError('Ein Schüler kann nur an einem Platz sitzen.');
    }

    // Es dürfen nur Schüler der Klasse gesetzt werden, zu der der Kurs gehört.
    const belongs = [...studentIds].every((id) =>
      this.db.students.some((s) => s.id === id && s.schoolClassId === course.schoolClassId),
    );
    if (!belongs) {
      throw new AppError('Mindestens ein Schüler gehört nicht zur Klasse dieses Kurses.');
    }

    plan.rows = input.rows;
    plan.columns = input.columns;
    plan.seats = input.seats.map((s) => ({
      studentId: s.studentId,
      row: s.row,
      column: s.column,
    }));
    this.changed();

    return toPlan(plan);
  }

  deleteSeatingPlan(id: number): void {
    this.requirePlan(id);
    this.db.seatingPlans = this.db.seatingPlans.filter((p) => p.id !== id);
    this.changed();
  }

  private requirePlan(id: number): SeatingPlanRecord {
    const plan = this.db.seatingPlans.find((p) => p.id === id);
    if (!plan) {
      throw new AppError('Die Sitzordnung existiert nicht.');
    }
    return plan;
  }
}
