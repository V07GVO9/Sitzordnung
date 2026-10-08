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
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api.service';
import {
  Course,
  CurrentLesson,
  Rating,
  RatingValue,
  SeatingPlan,
  Student,
  StudentScore,
  WEEKDAY_NAMES,
  fullName,
  initials,
  ratingClass,
  ratingSymbol,
} from '../../core/models';
import { toDateKey } from '../../core/store/time';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../core/ui/icon';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ParticipationList, RATING_OPTIONS, RateRequest } from './participation-list';
import { ParticipationSheet } from './participation-sheet';

/** Mitarbeit als Liste oder auf dem Sitzplan - wie Liste/Sitzplan in der Klassenmappe. */
export type ParticipationView = 'liste' | 'sitzplan';

const VIEW_KEY = 'sitzordnung.mitarbeit-ansicht';

/** Die gewählte Ansicht merken - ohne dass ein gesperrter Speicher stört. */
function readView(): ParticipationView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'liste' ? 'liste' : 'sitzplan';
  } catch {
    return 'sitzplan';
  }
}

function writeView(view: ParticipationView): void {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Dann gilt die Wahl eben nur bis zum Neuladen.
  }
}

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
    ParticipationList,
    ParticipationSheet,
  ],
  templateUrl: './course.html',
  styleUrl: './course.scss',
})
export class CoursePage implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly courseId = signal(0);
  readonly loading = signal(true);
  readonly course = signal<Course | null>(null);
  readonly students = signal<Student[]>([]);
  readonly plans = signal<SeatingPlan[]>([]);
  readonly activePlanId = signal<number | null>(null);
  readonly scores = signal<StudentScore[]>([]);
  readonly saving = signal(false);

  /** Die anderen Fächer derselben Klasse - als Reiter oben. */
  readonly siblings = signal<Course[]>([]);
  /** Was laut Stundenplan gerade läuft. */
  readonly lesson = signal<CurrentLesson | null>(null);
  /** Die heutigen Bewertungen je Schüler, älteste zuerst. */
  readonly todayRatings = signal<Map<number, Rating[]>>(new Map());

  /** Liste oder Sitzplan - die Wahl bleibt im Browser gespeichert. */
  readonly view = signal<ParticipationView>(readView());

  /** Der Schüler, dessen Verlauf als Blatt offen ist. */
  readonly sheetStudentId = signal<number | null>(null);
  /** Alle Bewertungen dieses Kurses - nur geladen, solange das Blatt offen ist. */
  readonly courseRatings = signal<Rating[]>([]);

  /** false = Unterricht (bewerten), true = Einstellungen (Sitzordnung ändern). */
  readonly editMode = signal(false);

  /** Die Belegung des Rasters als "Zeile:Spalte" -> Schüler-Id. */
  private readonly placement = signal<Map<string, number>>(new Map());

  readonly rows = signal(5);
  readonly columns = signal(8);

  readonly maxPlans = 2;
  readonly fullName = fullName;
  readonly initials = initials;

  readonly ratingOptions = RATING_OPTIONS;
  readonly ratingClass = ratingClass;

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

  readonly scoresById = computed(
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

  /** Läuft dieser Kurs gerade laut Stundenplan? */
  readonly isRunning = computed(() => {
    const lesson = this.lesson();
    return !!lesson?.hasLesson && lesson.courseId === this.courseId();
  });

  /** „Mittwoch, 08.10.2025“ für die Datumszeile. */
  readonly todayLabel = computed(() => {
    const now = new Date();
    return `${WEEKDAY_NAMES[now.getDay()]}, ${now.toLocaleDateString('de-DE')}`;
  });

  /** Die zuletzt heute vergebene Bewertung je Schüler - färbt die Kachel. */
  readonly lastToday = computed(() => {
    const map = new Map<number, number>();
    for (const [studentId, ratings] of this.todayRatings()) {
      if (ratings.length) {
        map.set(studentId, ratings[ratings.length - 1].value);
      }
    }
    return map;
  });

  readonly sheetStudent = computed(
    () => this.students().find((s) => s.id === this.sheetStudentId()) ?? null,
  );

  readonly sheetRatings = computed(() =>
    this.courseRatings().filter((r) => r.studentId === this.sheetStudentId()),
  );

  /** Reihenfolge zum Blättern im Blatt - wie die Liste, nach Vorname. */
  private readonly sheetOrder = computed(() =>
    [...this.students()].sort(
      (a, b) =>
        a.firstName.localeCompare(b.firstName, 'de') || a.lastName.localeCompare(b.lastName, 'de'),
    ),
  );

  readonly sheetIndex = computed(() =>
    this.sheetOrder().findIndex((s) => s.id === this.sheetStudentId()),
  );

  readonly sheetHasNext = computed(() => {
    const index = this.sheetIndex();
    return index >= 0 && index < this.sheetOrder().length - 1;
  });

  /** Die laufende Stunde wechselt mit der Zeit - die Anzeige zieht nach. */
  private readonly timer = setInterval(() => this.refreshLesson(), 60_000);

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
    this.sheetStudentId.set(null);

    forkJoin({
      course: this.api.getCourse(courseId),
      courses: this.api.getCourses(),
      students: this.api.getCourseStudents(courseId),
      plans: this.api.getSeatingPlans(courseId),
      scoreboard: this.api.getScoreboard(courseId),
    }).subscribe({
      next: ({ course, courses, students, plans, scoreboard }) => {
        this.course.set(course);
        this.siblings.set(courses.filter((c) => c.schoolClassId === course.schoolClassId));
        this.students.set(students);
        this.plans.set(plans);
        this.scores.set(scoreboard.students);
        this.selectPlan(plans[0]?.id ?? null);
        this.refreshToday();
        this.refreshLesson();
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

    this.placement.set(new Map());
    this.persistLayout();
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

    const students = [...this.students()];
    if (order === 'alpha') {
      students.sort(
        (a, b) =>
          a.lastName.localeCompare(b.lastName, 'de') ||
          a.firstName.localeCompare(b.firstName, 'de'),
      );
    } else {
      // Fisher-Yates: jede Reihenfolge ist gleich wahrscheinlich.
      for (let i = students.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [students[i], students[j]] = [students[j], students[i]];
      }
    }

    const next = new Map<string, number>();
    let index = 0;
    for (let row = 0; row < this.rows() && index < students.length; row++) {
      for (let column = 0; column < this.columns() && index < students.length; column++) {
        next.set(`${row}:${column}`, students[index++].id);
      }
    }

    const left = students.length - index;
    if (left > 0) {
      this.toasts.show(
        `${left} Schüler passen nicht ins Raster. Bitte mehr Reihen oder Spalten anlegen.`,
        'error',
      );
    }

    this.placement.set(next);
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

  // --- Ansicht ---

  setView(view: ParticipationView): void {
    this.view.set(view);
    writeView(view);
    if (view === 'liste') {
      this.editMode.set(false);
    }
  }

  // --- Bewerten ---

  onRate(request: RateRequest): void {
    this.rate(request.student, request.value);
  }

  rate(student: Student, value: RatingValue): void {
    const courseId = this.courseId();

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

  /** Löscht eine Bewertung aus dem Verlauf im Blatt - nach Rückfrage. */
  async removeRating(rating: Rating): Promise<void> {
    const date = new Date(`${rating.lessonDate}T12:00:00`).toLocaleDateString('de-DE');
    const confirmed = await this.confirm.ask({
      title: `Bewertung ${ratingSymbol(rating.value)} vom ${date} löschen?`,
      message: 'Der Punktestand wird sofort neu berechnet.',
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!confirmed) {
      return;
    }

    this.api.deleteRating(rating.id).subscribe({
      next: () => this.refreshScores(),
      error: (err) => this.toasts.error(err, 'Die Bewertung konnte nicht gelöscht werden.'),
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

  // --- Verlauf als Blatt ---

  openSheet(student: Student): void {
    if (this.editMode()) {
      return;
    }
    this.sheetStudentId.set(student.id);
    this.loadCourseRatings();
  }

  closeSheet(): void {
    this.sheetStudentId.set(null);
    this.courseRatings.set([]);
  }

  stepSheet(direction: -1 | 1): void {
    const next = this.sheetOrder()[this.sheetIndex() + direction];
    if (next) {
      this.sheetStudentId.set(next.id);
    }
  }

  private loadCourseRatings(): void {
    this.api.getRatings(this.courseId()).subscribe({
      next: (ratings) => this.courseRatings.set(ratings),
      error: (err) => this.toasts.error(err, 'Der Verlauf konnte nicht geladen werden.'),
    });
  }

  // --- Nachladen ---

  /** Punktestand, heutige Bewertungen und - falls offen - der Verlauf. */
  private refreshScores(): void {
    this.api.getScoreboard(this.courseId()).subscribe({
      next: (board) => this.scores.set(board.students),
      error: (err) => this.toasts.error(err, 'Der Punktestand konnte nicht geladen werden.'),
    });
    this.refreshToday();
    if (this.sheetStudentId() !== null) {
      this.loadCourseRatings();
    }
  }

  private refreshToday(): void {
    const today = toDateKey(new Date());
    this.api.getRatings(this.courseId(), { from: today, to: today }).subscribe({
      next: (ratings) => {
        const map = new Map<number, Rating[]>();
        for (const rating of [...ratings].sort((a, b) => a.id - b.id)) {
          map.set(rating.studentId, [...(map.get(rating.studentId) ?? []), rating]);
        }
        this.todayRatings.set(map);
      },
    });
  }

  private refreshLesson(): void {
    this.api.getCurrentLesson().subscribe({
      next: (lesson) => this.lesson.set(lesson),
      error: () => this.lesson.set(null),
    });
  }

  /** Die Farbe der heutigen Bewertung als CSS-Variable für die Kachel. */
  ratedColor(value: number | undefined): string | null {
    const css = ratingClass(value);
    return css ? `var(--${css})` : null;
  }

  ratingSymbolOf(value: number): string {
    return ratingSymbol(value);
  }

  scoreFor(studentId: number): StudentScore | null {
    return this.scoresById().get(studentId) ?? null;
  }

  toggleMode(edit: boolean): void {
    this.editMode.set(edit);
    if (edit) {
      this.setView('sitzplan');
      this.editMode.set(true);
    } else {
      this.refreshScores();
    }
  }
}
