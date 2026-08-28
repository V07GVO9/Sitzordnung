import {
  CdkDrag,
  CdkDragDrop,
  CdkDragPreview,
  CdkDropList,
  CdkDropListGroup,
} from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService } from '../../core/api.service';
import {
  Course,
  RatingValue,
  LessonSlot,
  SeatingPlan,
  Student,
  StudentScore,
  fullName,
  initials,
} from '../../core/models';
import { ToastService } from '../../core/toast.service';

/** Woher ein gezogener Schüler kommt bzw. wohin er fällt. */
type DropTarget = { kind: 'pool' } | { kind: 'seat'; row: number; column: number };

/** Ein Platz im Raster, angereichert mit allem, was die Anzeige braucht. */
export interface SeatCell {
  row: number;
  column: number;
  student: Student | null;
  score: StudentScore | null;
  target: DropTarget;
}

@Component({
  selector: 'app-course',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, CdkDrag, CdkDragPreview, CdkDropList, CdkDropListGroup],
  templateUrl: './course.html',
  styleUrl: './course.scss',
})
export class CoursePage {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly toasts = inject(ToastService);

  readonly courseId = signal(0);
  readonly loading = signal(true);
  readonly course = signal<Course | null>(null);
  readonly students = signal<Student[]>([]);
  readonly plans = signal<SeatingPlan[]>([]);
  readonly activePlanId = signal<number | null>(null);
  readonly scores = signal<StudentScore[]>([]);
  readonly lessonSlot = signal<LessonSlot | null>(null);
  readonly saving = signal(false);

  /** false = Unterricht (bewerten), true = Einstellungen (Sitzordnung ändern). */
  readonly editMode = signal(false);

  /** Die Belegung des Rasters als "Zeile:Spalte" -> Schüler-Id. */
  private readonly placement = signal<Map<string, number>>(new Map());

  readonly rows = signal(5);
  readonly columns = signal(8);

  readonly maxPlans = 2;
  readonly fullName = fullName;
  readonly initials = initials;

  readonly activePlan = computed(
    () => this.plans().find((p) => p.id === this.activePlanId()) ?? null,
  );

  private readonly studentsById = computed(
    () => new Map(this.students().map((s) => [s.id, s] as const)),
  );

  private readonly scoresById = computed(
    () => new Map(this.scores().map((s) => [s.studentId, s] as const)),
  );

  /** Das Raster, Zeile für Zeile - die Vorlage rendert direkt daraus. */
  readonly grid = computed<SeatCell[][]>(() => {
    const placement = this.placement();
    const students = this.studentsById();
    const scores = this.scoresById();
    const result: SeatCell[][] = [];

    for (let row = 0; row < this.rows(); row++) {
      const cells: SeatCell[] = [];
      for (let column = 0; column < this.columns(); column++) {
        const studentId = placement.get(`${row}:${column}`);
        cells.push({
          row,
          column,
          student: studentId ? (students.get(studentId) ?? null) : null,
          score: studentId ? (scores.get(studentId) ?? null) : null,
          target: { kind: 'seat', row, column },
        });
      }
      result.push(cells);
    }

    return result;
  });

  /** Schüler, die noch auf keinem Platz sitzen. */
  readonly unseated = computed(() => {
    const seated = new Set(this.placement().values());
    return this.students().filter((s) => !seated.has(s.id));
  });

  readonly poolTarget: DropTarget = { kind: 'pool' };

  /** Bewertet werden darf immer - begrenzt ist nur eine Bewertung je Stunde. */
  readonly canRate = computed(() => this.students().length > 0);

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('courseId'));
      if (Number.isFinite(id) && id > 0) {
        this.courseId.set(id);
        this.load(id);
      }
    });
  }

  private load(courseId: number): void {
    this.loading.set(true);

    forkJoin({
      course: this.api.getCourse(courseId),
      students: this.api.getCourseStudents(courseId),
      plans: this.api.getSeatingPlans(courseId),
      scoreboard: this.api.getScoreboard(courseId),
      slot: this.api.getCurrentLessonSlot(courseId),
    }).subscribe({
      next: ({ course, students, plans, scoreboard, slot }) => {
        this.course.set(course);
        this.students.set(students);
        this.plans.set(plans);
        this.scores.set(scoreboard.students);
        this.lessonSlot.set(slot);
        this.selectPlan(plans[0]?.id ?? null);
        this.loading.set(false);
      },
      error: (err) => {
        this.toasts.error(err, 'Der Kurs konnte nicht geladen werden.');
        this.loading.set(false);
      },
    });
  }

  selectPlan(planId: number | null): void {
    this.activePlanId.set(planId);
    const plan = this.plans().find((p) => p.id === planId);

    if (!plan) {
      this.placement.set(new Map());
      return;
    }

    this.rows.set(plan.rows);
    this.columns.set(plan.columns);
    this.placement.set(new Map(plan.seats.map((s) => [`${s.row}:${s.column}`, s.studentId])));
  }

  // --- Sitzordnung bearbeiten ---

  drop(event: CdkDragDrop<DropTarget>): void {
    const from = event.previousContainer.data;
    const to = event.container.data;
    const studentId = event.item.data as number;

    if (from.kind === 'seat' && to.kind === 'seat' && from.row === to.row && from.column === to.column) {
      return;
    }

    const next = new Map(this.placement());
    const fromKey = from.kind === 'seat' ? `${from.row}:${from.column}` : null;

    if (to.kind === 'pool') {
      if (fromKey) {
        next.delete(fromKey);
      }
    } else {
      const toKey = `${to.row}:${to.column}`;
      const occupant = next.get(toKey);

      next.set(toKey, studentId);

      if (fromKey) {
        // Sitzt schon jemand auf dem Zielplatz, tauschen die beiden die Plätze.
        if (occupant !== undefined && occupant !== studentId) {
          next.set(fromKey, occupant);
        } else {
          next.delete(fromKey);
        }
      }
    }

    this.placement.set(next);
    this.persistLayout();
  }

  /** Verteilt alle noch nicht gesetzten Schüler der Reihe nach auf freie Plätze. */
  autoFill(): void {
    const next = new Map(this.placement());
    const taken = new Set(next.values());
    const queue = this.students().filter((s) => !taken.has(s.id));

    for (let row = 0; row < this.rows() && queue.length; row++) {
      for (let column = 0; column < this.columns() && queue.length; column++) {
        const key = `${row}:${column}`;
        if (!next.has(key)) {
          next.set(key, queue.shift()!.id);
        }
      }
    }

    if (queue.length) {
      this.toasts.show(
        `${queue.length} Schüler passen nicht ins Raster. Bitte mehr Reihen oder Spalten anlegen.`,
        'error',
      );
    }

    this.placement.set(next);
    this.persistLayout();
  }

  clearSeats(): void {
    this.placement.set(new Map());
    this.persistLayout();
  }

  changeGrid(rows: number, columns: number): void {
    const safeRows = Math.min(20, Math.max(1, Math.round(rows) || 1));
    const safeColumns = Math.min(20, Math.max(1, Math.round(columns) || 1));

    this.rows.set(safeRows);
    this.columns.set(safeColumns);

    // Plätze außerhalb des neuen Rasters werden frei und wandern zurück in die Liste.
    const next = new Map(this.placement());
    let dropped = 0;
    for (const key of [...next.keys()]) {
      const [row, column] = key.split(':').map(Number);
      if (row >= safeRows || column >= safeColumns) {
        next.delete(key);
        dropped++;
      }
    }

    if (dropped) {
      this.toasts.show(
        `${dropped} ${dropped === 1 ? 'Schüler wurde' : 'Schüler wurden'} zurück in die Liste gelegt.`,
      );
    }

    this.placement.set(next);
    this.persistLayout();
  }

  private persistLayout(): void {
    const planId = this.activePlanId();
    if (!planId) {
      return;
    }

    const seats = [...this.placement().entries()].map(([key, studentId]) => {
      const [row, column] = key.split(':').map(Number);
      return { studentId, row, column };
    });

    this.saving.set(true);
    this.api.saveLayout(planId, { rows: this.rows(), columns: this.columns(), seats }).subscribe({
      next: (plan) => {
        this.plans.update((list) => list.map((p) => (p.id === plan.id ? plan : p)));
        this.saving.set(false);
      },
      error: (err) => {
        this.saving.set(false);
        this.toasts.error(err, 'Die Sitzordnung konnte nicht gespeichert werden.');
        // Nach einem Fehler gilt wieder der zuletzt gespeicherte Stand.
        this.selectPlan(planId);
      },
    });
  }

  // --- Sitzordnungen verwalten ---

  addPlan(): void {
    const courseId = this.courseId();
    const name = this.plans().length === 0 ? 'Sitzordnung 1' : 'Sitzordnung 2';

    this.api.createSeatingPlan(courseId, name, this.rows(), this.columns()).subscribe({
      next: (plan) => {
        this.plans.update((list) => [...list, plan]);
        this.selectPlan(plan.id);
        this.editMode.set(true);
        this.toasts.success(`„${plan.name}" wurde angelegt.`);
      },
      error: (err) => this.toasts.error(err, 'Die Sitzordnung konnte nicht angelegt werden.'),
    });
  }

  renamePlan(name: string): void {
    const plan = this.activePlan();
    if (!plan || !name.trim() || name.trim() === plan.name) {
      return;
    }

    this.api.updateSeatingPlan(plan.id, name.trim(), plan.rows, plan.columns).subscribe({
      next: (updated) => {
        this.plans.update((list) => list.map((p) => (p.id === updated.id ? updated : p)));
      },
      error: (err) => this.toasts.error(err, 'Der Name konnte nicht geändert werden.'),
    });
  }

  deletePlan(): void {
    const plan = this.activePlan();
    if (!plan || !confirm(`Sitzordnung „${plan.name}" wirklich löschen?`)) {
      return;
    }

    this.api.deleteSeatingPlan(plan.id).subscribe({
      next: () => {
        const remaining = this.plans().filter((p) => p.id !== plan.id);
        this.plans.set(remaining);
        this.selectPlan(remaining[0]?.id ?? null);
        this.toasts.success('Die Sitzordnung wurde gelöscht.');
      },
      error: (err) => this.toasts.error(err, 'Die Sitzordnung konnte nicht gelöscht werden.'),
    });
  }

  // --- Bewerten ---

  rate(studentId: number, value: RatingValue): void {
    const courseId = this.courseId();

    this.api.rate(courseId, studentId, value).subscribe({
      next: () => this.refreshScores(),
      error: (err) => this.toasts.error(err, 'Die Bewertung konnte nicht gespeichert werden.'),
    });
  }

  undo(studentId: number): void {
    this.api.undoLastRating(this.courseId(), studentId).subscribe({
      next: () => {
        this.toasts.show('Die letzte Bewertung wurde zurückgenommen.');
        this.refreshScores();
      },
      error: (err) => this.toasts.error(err, 'Es gab nichts zurückzunehmen.'),
    });
  }

  private refreshScores(): void {
    this.api.getScoreboard(this.courseId()).subscribe({
      next: (board) => {
        this.scores.set(board.students);
        this.lessonSlot.set(board.currentLesson);
      },
      error: (err) => this.toasts.error(err, 'Der Punktestand konnte nicht geladen werden.'),
    });
  }

  /** Holt die aktuelle Unterrichtsstunde neu - sie wechselt mit der Zeit. */
  refreshSlot(): void {
    this.api
      .getCurrentLessonSlot(this.courseId())
      .pipe(catchError(() => of(null)))
      .subscribe((slot) => {
        if (slot) {
          this.lessonSlot.set(slot);
        }
      });
  }

  scoreFor(studentId: number): StudentScore | null {
    return this.scoresById().get(studentId) ?? null;
  }

  toggleMode(edit: boolean): void {
    this.editMode.set(edit);
    if (!edit) {
      // Beim Zurückwechseln kann inzwischen eine neue Stunde begonnen haben.
      this.refreshSlot();
      this.refreshScores();
    }
  }
}
