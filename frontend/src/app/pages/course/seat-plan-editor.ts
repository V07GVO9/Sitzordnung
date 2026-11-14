import { Injectable, computed, inject, signal } from '@angular/core';
import { Course, SeatingPlan, Student, byLastName } from '../../core/models';
import { LocalStore } from '../../core/store/local-store';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';
import {
  DropTarget,
  Placement,
  clampGridSize,
  cropToGrid,
  fillFreeSeats,
  moveStudent,
  nextPlanName,
  placementOf,
  seatInOrder,
  seatsOf,
  shuffled,
} from './seat-layout';

/** Die Sitzordnungen eines anderen Fachs derselben Klasse - zum Übernehmen. */
export interface ClassPlans {
  course: Course;
  plans: SeatingPlan[];
}

/**
 * Die Sitzordnungen eines Kurses und die Belegung der gerade gewählten:
 * auswählen, anlegen, übernehmen, umbenennen, löschen - und Schüler setzen.
 * Jede Änderung der Belegung wird sofort gespeichert.
 *
 * Gehört zur Kursseite und lebt so lange wie sie.
 */
@Injectable()
export class SeatPlanEditor {
  private readonly store = inject(LocalStore);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  private courseId = 0;
  /** Die Schüler des Kurses, nach Namen sortiert. */
  private students: Student[] = [];

  readonly plans = signal<SeatingPlan[]>([]);
  /** Sitzordnungen derselben Klasse aus anderen Fächern - zum Übernehmen. */
  readonly classPlans = signal<ClassPlans[]>([]);
  readonly activePlanId = signal<number | null>(null);
  readonly activePlan = computed(
    () => this.plans().find((p) => p.id === this.activePlanId()) ?? null,
  );

  readonly rows = signal(5);
  readonly columns = signal(8);

  private readonly currentPlacement = signal<Placement>(new Map());
  /** Wer in der gewählten Sitzordnung auf welchem Platz sitzt. */
  readonly placement = this.currentPlacement.asReadonly();

  /** Lädt die Sitzordnungen des Kurses und wählt die erste. */
  load(course: Course, students: Student[]): void {
    this.courseId = course.id;
    this.students = students;

    const plans = this.store.seating.getSeatingPlans(course.id);
    this.plans.set(plans);
    this.selectPlan(plans[0]?.id ?? null);
    this.loadClassPlans(course);
  }

  private loadClassPlans(course: Course): void {
    this.classPlans.set(
      this.store.masterData
        .getCourses()
        .filter(
          (c) =>
            c.schoolClassId === course.schoolClassId &&
            c.id !== course.id &&
            c.seatingPlanCount > 0,
        )
        .map((c) => ({ course: c, plans: this.store.seating.getSeatingPlans(c.id) }))
        .filter((g) => g.plans.length > 0)
        .sort((a, b) => a.course.subjectName.localeCompare(b.course.subjectName, 'de')),
    );
  }

  selectPlan(planId: number | null): void {
    this.activePlanId.set(planId);
    const plan = this.plans().find((p) => p.id === planId);

    if (!plan) {
      this.currentPlacement.set(new Map());
      return;
    }

    this.rows.set(plan.rows);
    this.columns.set(plan.columns);
    this.currentPlacement.set(placementOf(plan.seats));
  }

  // --- Schüler setzen -----------------------------------------------------

  /** Ein Schüler wurde per Drag and Drop bewegt. */
  move(studentId: number, from: DropTarget, to: DropTarget): void {
    const next = moveStudent(this.placement(), studentId, from, to);
    if (next) {
      this.apply(next);
    }
  }

  /** Verteilt alle noch nicht gesetzten Schüler der Reihe nach auf freie Plätze. */
  autoFill(): void {
    const ids = this.students.map((s) => s.id);
    const { placement, left } = fillFreeSeats(this.placement(), ids, this.rows(), this.columns());

    this.warnIfLeft(left);
    this.apply(placement);
  }

  async clearSeats(): Promise<void> {
    if (this.placement().size === 0) {
      return;
    }

    const confirmed = await this.confirm.ask({
      title: 'Alle Plätze leeren?',
      message: 'Alle Schüler wandern zurück in die Liste „Ohne Platz“.',
      confirmLabel: 'Plätze leeren',
      danger: true,
    });
    if (!confirmed) {
      return;
    }

    this.apply(new Map());
  }

  /**
   * Setzt alle Schüler neu - alphabetisch nach Nachnamen oder zufällig - und
   * füllt das Raster Reihe für Reihe von vorn.
   */
  async arrange(order: 'alpha' | 'random'): Promise<void> {
    if (this.placement().size > 0) {
      const confirmed = await this.confirm.ask({
        title: order === 'alpha' ? 'Alphabetisch neu setzen?' : 'Zufällig neu mischen?',
        message: 'Die bisherige Sitzordnung wird dabei ersetzt.',
        confirmLabel: order === 'alpha' ? 'Alphabetisch setzen' : 'Mischen',
      });
      if (!confirmed) {
        return;
      }
    }

    const students =
      order === 'alpha' ? [...this.students].sort(byLastName) : shuffled(this.students);
    const { placement, left } = seatInOrder(
      students.map((s) => s.id),
      this.rows(),
      this.columns(),
    );

    this.warnIfLeft(left);
    this.apply(placement);
  }

  /** Ändert die Größe des Rasters; wer dabei herausfällt, wandert zurück in die Liste. */
  changeGrid(rows: number, columns: number): void {
    this.rows.set(clampGridSize(rows));
    this.columns.set(clampGridSize(columns));

    const { placement, dropped } = cropToGrid(this.placement(), this.rows(), this.columns());
    if (dropped) {
      this.toasts.show(
        `${dropped} ${dropped === 1 ? 'Schüler wurde' : 'Schüler wurden'} zurück in die Liste gelegt.`,
      );
    }

    this.apply(placement);
  }

  private warnIfLeft(left: number): void {
    if (left > 0) {
      this.toasts.show(
        `${left} Schüler passen nicht ins Raster. Bitte mehr Reihen oder Spalten anlegen.`,
        'error',
      );
    }
  }

  /** Übernimmt die neue Belegung und speichert sie in der gewählten Sitzordnung. */
  private apply(placement: Placement): void {
    this.currentPlacement.set(placement);

    const planId = this.activePlanId();
    if (!planId) {
      return;
    }

    try {
      const layout = { rows: this.rows(), columns: this.columns(), seats: seatsOf(placement) };
      this.replacePlan(this.store.seating.saveLayout(planId, layout));
    } catch (err) {
      this.toasts.error(err, 'Die Sitzordnung konnte nicht gespeichert werden.');
      // Nach einem Fehler gilt wieder der zuletzt gespeicherte Stand.
      this.selectPlan(planId);
    }
  }

  private replacePlan(plan: SeatingPlan): void {
    this.plans.update((list) => list.map((p) => (p.id === plan.id ? plan : p)));
  }

  // --- Sitzordnungen verwalten --------------------------------------------

  /** Legt eine leere Sitzordnung an und wählt sie. Sagt, ob das geklappt hat. */
  addPlan(): boolean {
    const name = nextPlanName(this.plans().map((p) => p.name));

    try {
      const plan = this.store.seating.createSeatingPlan(
        this.courseId,
        name,
        this.rows(),
        this.columns(),
      );
      this.plans.update((list) => [...list, plan]);
      this.selectPlan(plan.id);
      this.toasts.success(`„${plan.name}" wurde angelegt.`);
      return true;
    } catch (err) {
      this.toasts.error(err, 'Die Sitzordnung konnte nicht angelegt werden.');
      return false;
    }
  }

  /** Übernimmt eine Sitzordnung aus einem anderen Fach derselben Klasse als Kopie. */
  copyPlan(sourceId: number): void {
    const group = this.classPlans().find((g) => g.plans.some((p) => p.id === sourceId));
    const source = group?.plans.find((p) => p.id === sourceId);
    if (!group || !source) {
      return;
    }

    const name = `${source.name} (${group.course.subjectShortName || group.course.subjectName})`;
    // Nur Schüler übernehmen, die es in diesem Kurs gibt.
    const known = new Set(this.students.map((s) => s.id));
    const seats = source.seats.filter((s) => known.has(s.studentId));

    try {
      const created = this.store.seating.createSeatingPlan(
        this.courseId,
        name,
        source.rows,
        source.columns,
      );
      const plan = this.store.seating.saveLayout(created.id, {
        rows: source.rows,
        columns: source.columns,
        seats,
      });
      this.plans.update((list) => [...list, plan]);
      this.selectPlan(plan.id);
      this.toasts.success(`„${source.name}" aus ${group.course.subjectName} übernommen.`);
    } catch (err) {
      this.toasts.error(err, 'Die Sitzordnung konnte nicht übernommen werden.');
    }
  }

  renamePlan(name: string): void {
    const plan = this.activePlan();
    if (!plan || !name.trim() || name.trim() === plan.name) {
      return;
    }

    try {
      this.replacePlan(
        this.store.seating.updateSeatingPlan(plan.id, name.trim(), plan.rows, plan.columns),
      );
    } catch (err) {
      this.toasts.error(err, 'Der Name konnte nicht geändert werden.');
    }
  }

  async deletePlan(): Promise<void> {
    const plan = this.activePlan();
    if (
      !plan ||
      !(await this.confirm.ask({
        title: `Sitzordnung „${plan.name}" löschen?`,
        message: 'Die Plätze dieser Sitzordnung gehen verloren. Bewertungen bleiben erhalten.',
        confirmLabel: 'Löschen',
        danger: true,
      }))
    ) {
      return;
    }

    try {
      this.store.seating.deleteSeatingPlan(plan.id);
      const remaining = this.plans().filter((p) => p.id !== plan.id);
      this.plans.set(remaining);
      this.selectPlan(remaining[0]?.id ?? null);
      this.toasts.success('Die Sitzordnung wurde gelöscht.');
    } catch (err) {
      this.toasts.error(err, 'Die Sitzordnung konnte nicht gelöscht werden.');
    }
  }
}
