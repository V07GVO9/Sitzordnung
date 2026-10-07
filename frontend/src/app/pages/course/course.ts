import {
  CdkDrag,
  CdkDragDrop,
  CdkDragPreview,
  CdkDropList,
  CdkDropListGroup,
} from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService } from '../../core/api.service';
import {
  Course,
  RatingValue,
  LessonRef,
  LessonSlot,
  SeatingPlan,
  Student,
  StudentScore,
  fullName,
  initials,
  ratingSymbol,
} from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../core/ui/icon';

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
  imports: [
    FormsModule,
    NgTemplateOutlet,
    RouterLink,
    CdkDrag,
    CdkDragPreview,
    CdkDropList,
    CdkDropListGroup,
    Icon,
  ],
  templateUrl: './course.html',
  styleUrl: './course.scss',
})
export class CoursePage implements OnDestroy {
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

  /** Solange geblättert wird, bleiben die Pfeile gesperrt. */
  readonly switchingLesson = signal(false);

  /**
   * Die angezeigte Stunde als Angabe für die API - null, solange die aktuelle
   * Stunde zu sehen ist. Dann entscheidet der Server, welche das gerade ist.
   */
  private readonly lessonRef = computed<LessonRef | null>(() => {
    const slot = this.lessonSlot();
    return !slot || slot.isCurrent ? null : { date: slot.date, startTime: slot.startTime };
  });

  /** false = Unterricht (bewerten), true = Einstellungen (Sitzordnung ändern). */
  readonly editMode = signal(false);

  /** Die Belegung des Rasters als "Zeile:Spalte" -> Schüler-Id. */
  private readonly placement = signal<Map<string, number>>(new Map());

  readonly rows = signal(5);
  readonly columns = signal(8);

  readonly maxPlans = 2;
  readonly fullName = fullName;
  readonly initials = initials;

  readonly ratingOptions: { value: RatingValue; symbol: string; title: string }[] = [
    { value: 2, symbol: '++', title: 'Sehr gute Mitarbeit (++)' },
    { value: 1, symbol: '+', title: 'Gute Mitarbeit (+)' },
    { value: -1, symbol: '−', title: 'Schwache Mitarbeit (−)' },
    { value: -2, symbol: '−−', title: 'Keine Mitarbeit / Störung (−−)' },
  ];

  /** Die zuletzt bewertete Kachel leuchtet kurz auf. */
  readonly flash = signal<{ studentId: number; value: number } | null>(null);
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  /** Die Meldung mit „Rückgängig“ zur letzten Bewertung. */
  private undoToastId: number | null = null;

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

  /** Die Liste „Ohne Platz“ wird beim Bewerten nur gebraucht, wenn jemand darin steht. */
  readonly showPool = computed(
    () => this.editMode() || this.unseated().length > 0 || this.students().length === 0,
  );

  /** Bewertet werden darf immer - begrenzt ist nur eine Bewertung je Stunde. */
  readonly canRate = computed(() => this.students().length > 0);

  /**
   * Die angezeigte Stunde wechselt mit der Zeit. Statt eines Knopfes zum
   * Nachprüfen holt die Seite sie selbst nach - aber nur, solange die aktuelle
   * Stunde zu sehen ist und nicht am Sitzplan gearbeitet wird.
   */
  private readonly timer = setInterval(() => {
    if (!this.editMode() && this.lessonSlot()?.isCurrent && !this.switchingLesson()) {
      this.refreshSlot();
    }
  }, 60_000);

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('courseId'));
      if (Number.isFinite(id) && id > 0) {
        this.courseId.set(id);
        this.load(id);
      }
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
    if (this.flashTimer) {
      clearTimeout(this.flashTimer);
    }
  }

  private load(courseId: number): void {
    this.loading.set(true);

    forkJoin({
      course: this.api.getCourse(courseId),
      students: this.api.getCourseStudents(courseId),
      plans: this.api.getSeatingPlans(courseId),
      // Der Punktestand bringt die aktuelle Unterrichtsstunde gleich mit.
      scoreboard: this.api.getScoreboard(courseId),
    }).subscribe({
      next: ({ course, students, plans, scoreboard }) => {
        this.course.set(course);
        this.students.set(students);
        this.plans.set(plans);
        this.scores.set(scoreboard.students);
        this.lessonSlot.set(scoreboard.currentLesson ?? null);
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

    if (
      from.kind === 'seat' &&
      to.kind === 'seat' &&
      from.row === to.row &&
      from.column === to.column
    ) {
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

  rate(student: Student, value: RatingValue): void {
    const courseId = this.courseId();

    // Wird gerade eine frühere Stunde angesehen, zählt die Bewertung auf sie.
    this.api.rate(courseId, student.id, value).subscribe({
      next: (rating) => {
        this.refreshScores();
        this.flashTile(student.id, value);

        // Je Bewertung eine Meldung - die vorige verschwindet, damit sich
        // im Unterricht nichts stapelt.
        if (this.undoToastId !== null) {
          this.toasts.dismiss(this.undoToastId);
        }
        this.undoToastId = this.toasts.show(
          `${fullName(student)}: ${ratingSymbol(value)}`,
          'success',
          6000,
          { label: 'Rückgängig', run: () => this.undoRating(rating.id) },
        );
      },
      error: (err) => this.toasts.error(err, 'Die Bewertung konnte nicht gespeichert werden.'),
    });
  }

  /** Nimmt genau die Bewertung zurück, zu der die Meldung gehörte. */
  private undoRating(ratingId: number): void {
    this.undoToastId = null;
    this.api.deleteRating(ratingId).subscribe({
      next: () => {
        this.toasts.show('Die Bewertung wurde zurückgenommen.');
        this.refreshScores();
      },
      error: (err) => this.toasts.error(err, 'Es gab nichts zurückzunehmen.'),
    });
  }

  private flashTile(studentId: number, value: number): void {
    if (this.flashTimer) {
      clearTimeout(this.flashTimer);
    }

    // Erst abschalten, dann im nächsten Bild wieder an - so startet die
    // Animation auch beim zweiten Tippen auf dieselbe Kachel neu.
    this.flash.set(null);
    requestAnimationFrame(() => {
      this.flash.set({ studentId, value });
      this.flashTimer = setTimeout(() => this.flash.set(null), 700);
    });
  }

  /** Punkte mit Vorzeichen: +3, 0, −2. */
  signed(points: number): string {
    return points > 0 ? `+${points}` : points < 0 ? `−${Math.abs(points)}` : '0';
  }

  /**
   * Blättert zur vorherigen oder nächsten Unterrichtsstunde dieses Kurses und
   * lädt den Punktestand dieser Stunde nach.
   */
  gotoLesson(direction: 'prev' | 'next'): void {
    const slot = this.lessonSlot();
    if (!slot || this.switchingLesson()) {
      return;
    }

    this.switchingLesson.set(true);

    // Blätter-Funktionalität: Vorübergehend deaktiviert
    // this.api
    //   .getNeighbourLessonSlot(
    //     this.courseId(),
    //     { date: slot.date, startTime: slot.startTime },
    //     direction,
    //   )
    //   .subscribe({
    //     next: (naechste) => {
    //       this.lessonSlot.set(naechste);
    //       this.refreshScores(naechste.isCurrent ? null : naechste);
    //       this.switchingLesson.set(false);
    //     },
    //     error: (err) => {
    //       this.switchingLesson.set(false);
    //       this.toasts.error(
    //         err,
    //         direction === 'prev'
    //           ? 'Davor gibt es keine Unterrichtsstunde dieses Kurses.'
    //           : 'Danach gibt es keine weitere Unterrichtsstunde dieses Kurses.',
    //       );
    //     },
    //   });

    this.switchingLesson.set(false);
    this.toasts.show('Navigation zwischen Stunden ist momentan nicht verfügbar.', 'info');
  }

  /** Zurück zu der Stunde, der eine Bewertung ohne Blättern zugerechnet wird. */
  gotoCurrentLesson(): void {
    this.refreshSlot();
    this.refreshScores(null);
  }

  private refreshScores(lesson: LessonRef | null = this.lessonRef()): void {
    this.api.getScoreboard(this.courseId()).subscribe({
      next: (board) => {
        this.scores.set(board.students);
        this.lessonSlot.set(board.currentLesson ?? null);
      },
      error: (err) => this.toasts.error(err, 'Der Punktestand konnte nicht geladen werden.'),
    });
  }

  /** Holt die aktuelle Unterrichtsstunde neu - sie wechselt mit der Zeit. */
  private refreshSlot(): void {
    // getCurrentLessonSlot ist momentan nicht implementiert
    // this.api
    //   .getCurrentLessonSlot(this.courseId())
    //   .pipe(catchError(() => of(null)))
    //   .subscribe((slot) => {
    //     if (slot) {
    //       this.lessonSlot.set(slot);
    //     }
    //   });
  }

  scoreFor(studentId: number): StudentScore | null {
    return this.scoresById().get(studentId) ?? null;
  }

  toggleMode(edit: boolean): void {
    this.editMode.set(edit);
    if (!edit) {
      // Beim Zurückwechseln kann inzwischen eine neue Stunde begonnen haben.
      this.refreshScores();
    }
  }
}
