import {
  CdkDrag,
  CdkDragDrop,
  CdkDragPreview,
  CdkDropList,
  CdkDropListGroup,
} from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  ElementRef,
  Component,
  HostListener,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ModeService } from '../../core/mode.service';
import {
  Course,
  CurrentLesson,
  QuarterGrade,
  Rating,
  RatingValue,
  SeatingPlan,
  Student,
  StudentScore,
  WEEKDAY_NAMES,
  byFirstName,
  byLastName,
  fullName,
  initials,
  ratingClass,
  ratingSymbol,
} from '../../core/models';
import { isValidDateKey, toDateKey } from '../../core/logic/time';
import { LocalStore } from '../../core/store/local-store';
import { ToastService } from '../../core/ui/toast.service';
import { Icon } from '../../core/ui/icon';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ParticipationList, RATING_OPTIONS, RateRequest } from './participation-list';
import { ParticipationSheet } from './participation-sheet';
import { SwipeRate } from './swipe-rate';

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

/** Breite des Bewertungs-Overlays in px - muss zu .rate-pop in course.scss passen. */
const POPOVER_WIDTH = 240;
/** Ungefähre Höhe: eine Knopfreihe plus „Verlauf“. */
const POPOVER_HEIGHT = 110;
const POPOVER_GAP = 6;

/**
 * Legt das Overlay unter die Kachel, mittig und im Fenster gehalten.
 * Reicht der Platz darunter nicht, öffnet es nach oben.
 */
function placePopover(rect: DOMRect): {
  left: number;
  top: number | null;
  bottom: number | null;
} {
  const width = Math.min(POPOVER_WIDTH, window.innerWidth - 2 * POPOVER_GAP);
  const left = Math.min(
    Math.max(rect.left + rect.width / 2 - width / 2, POPOVER_GAP),
    window.innerWidth - width - POPOVER_GAP,
  );
  const below = window.innerHeight - rect.bottom;
  if (below < POPOVER_HEIGHT + POPOVER_GAP && rect.top > below) {
    return { left, top: null, bottom: window.innerHeight - rect.top + POPOVER_GAP };
  }
  return { left, top: rect.bottom + POPOVER_GAP, bottom: null };
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
    SwipeRate,
  ],
  templateUrl: './course.html',
  styleUrl: './course.scss',
})
export class CoursePage implements OnDestroy {
  private readonly store = inject(LocalStore);
  private readonly route = inject(ActivatedRoute);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  /** Der Tag, für den bewertet wird - aus dem Wochenplan gewählt, sonst heute. */
  readonly lessonDate = signal(toDateKey(new Date()));
  /** Die Uhrzeit der gewählten Stunde, falls aus dem Wochenplan geöffnet. */
  readonly lessonTime = signal<{ from: string; to: string } | null>(null);
  readonly isToday = computed(() => this.lessonDate() === toDateKey(new Date()));
  readonly courseId = signal(0);
  readonly loading = signal(true);
  readonly course = signal<Course | null>(null);
  readonly students = signal<Student[]>([]);
  readonly plans = signal<SeatingPlan[]>([]);
  /** Sitzordnungen derselben Klasse aus anderen Fächern - zum Übernehmen. */
  readonly classPlans = signal<{ course: Course; plans: SeatingPlan[] }[]>([]);
  readonly activePlanId = signal<number | null>(null);
  readonly scores = signal<StudentScore[]>([]);
  /** Quartalsnoten für die Listenansicht. */
  readonly quarterGrades = signal<QuarterGrade[]>([]);

  /** Was laut Stundenplan gerade läuft. */
  readonly lesson = signal<CurrentLesson | null>(null);
  /** Die heutigen Bewertungen je Schüler, älteste zuerst. */
  readonly todayRatings = signal<Map<number, Rating[]>>(new Map());

  /** Wer an diesem Tag als „fehlt“ markiert ist - zählt nicht, wird nicht ausgelost. */
  readonly absentIds = signal<Set<number>>(new Set());
  readonly absentCount = computed(() => this.absentIds().size);

  /** Der zuletzt ausgeloste Schüler - leuchtet kurz auf. */
  readonly pickedId = signal<number | null>(null);
  private pickTimer: ReturnType<typeof setTimeout> | null = null;

  /** Liste oder Sitzplan - die Wahl bleibt im Browser gespeichert. */
  readonly view = signal<ParticipationView>(readView());

  /**
   * Die angetippte Kachel im Sitzplan. Nur sie zeigt die Bewertungsknöpfe -
   * so bleiben alle anderen Kacheln klein und Fotos und Namen bekommen Platz.
   */
  readonly selectedId = signal<number | null>(null);
  /** Wo die Bewertungsknöpfe der angetippten Kachel schweben (Bildschirmkoordinaten). */
  readonly popover = signal<{ left: number; top: number | null; bottom: number | null } | null>(
    null,
  );
  readonly selectedStudent = computed(() => {
    const id = this.selectedId();
    return id === null || !this.popover()
      ? null
      : (this.students().find((s) => s.id === id) ?? null);
  });

  /** Der Schüler, dessen Verlauf als Blatt offen ist. */
  readonly sheetStudentId = signal<number | null>(null);
  /** Alle Bewertungen dieses Kurses - nur geladen, solange das Blatt offen ist. */
  readonly courseRatings = signal<Rating[]>([]);

  private readonly mode = inject(ModeService);
  /** Der App-Modus: Bearbeiten statt Unterricht. */
  readonly appEdit = this.mode.isEdit;
  /** Das Schloss am Sitzplan: im Unterricht kurz entsperrt, um Plätze zu tauschen. */
  readonly seatUnlocked = signal(false);
  /** Sitzordnung ändern statt bewerten - im Bearbeitungsmodus oder bei offenem Schloss. */
  readonly editMode = computed(() => this.appEdit() || this.seatUnlocked());

  /** Die Belegung des Rasters als "Zeile:Spalte" -> Schüler-Id. */
  private readonly placement = signal<Map<string, number>>(new Map());

  readonly rows = signal(5);
  readonly columns = signal(8);

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
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
    return this.isToday() && !!lesson?.hasLesson && lesson.courseId === this.courseId();
  });

  /** „Mittwoch, 08.10.2025“ für die Datumszeile. */
  readonly todayLabel = computed(() => {
    const date = new Date(`${this.lessonDate()}T12:00:00`);
    return `${WEEKDAY_NAMES[date.getDay()]}, ${date.toLocaleDateString('de-DE')}`;
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
  private readonly sheetOrder = computed(() => [...this.students()].sort(byFirstName));

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
    this.route.queryParamMap.subscribe((query) => {
      const datum = query.get('datum');
      this.lessonDate.set(datum && isValidDateKey(datum) ? datum : toDateKey(new Date()));
      const from = query.get('von');
      const to = query.get('bis');
      this.lessonTime.set(from && to ? { from, to } : null);
      if (this.courseId() > 0 && !this.loading()) {
        this.refreshToday();
      }
    });

    // Im Bearbeitungsmodus zeigt der Kurs den Sitzplan; zurück im Unterricht
    // kann inzwischen eine neue Stunde begonnen haben.
    let wasEdit = this.editMode();
    effect(() => {
      const edit = this.editMode();
      untracked(() => {
        if (edit) {
          this.selectedId.set(null);
        }
        if (edit && this.view() !== 'sitzplan') {
          this.view.set('sitzplan');
        }
        if (wasEdit && !edit && this.courseId() > 0) {
          this.refreshScores();
        }
      });
      wasEdit = edit;
    });

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
    if (this.pickTimer) {
      clearTimeout(this.pickTimer);
    }
  }

  private load(courseId: number): void {
    this.loading.set(true);
    this.sheetStudentId.set(null);
    this.selectedId.set(null);

    try {
      const course = this.store.masterData.getCourse(courseId);
      const students = this.store.masterData.getCourseStudents(courseId);
      const plans = this.store.seating.getSeatingPlans(courseId);

      this.course.set(course);
      this.quarterGrades.set(this.store.quarterGrades.getQuarterGrades(courseId));
      this.students.set(students);
      this.plans.set(plans);
      this.scores.set(this.store.ratings.getScoreboard(courseId).students);
      this.selectPlan(plans[0]?.id ?? null);
      this.loadClassPlans(course);
      this.refreshToday();
      this.refreshLesson();
    } catch (err) {
      this.toasts.error(err, 'Der Kurs konnte nicht geladen werden.');
    }
    this.loading.set(false);
  }

  /** Lädt die Sitzordnungen der anderen Fächer derselben Klasse. */
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
      students.sort(byLastName);
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

    try {
      const layout = { rows: this.rows(), columns: this.columns(), seats };
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

  // --- Sitzordnungen verwalten ---

  /** Auswahl im Dropdown: vorhandene Sitzordnung öffnen oder eine neue anlegen. */
  onPlanSelect(select: HTMLSelectElement): void {
    const value = select.value;
    if (value === 'new' || value.startsWith('copy:')) {
      // Bis die neue da ist, bleibt die bisherige gewählt.
      select.value = String(this.activePlanId() ?? '');
      if (value === 'new') {
        this.addPlan();
      } else {
        this.copyPlan(Number(value.slice('copy:'.length)));
      }
      return;
    }
    this.selectPlan(Number(select.value));
  }

  addPlan(): void {
    const courseId = this.courseId();
    // Der erste freie Name „Sitzordnung n“.
    const names = new Set(this.plans().map((p) => p.name));
    let n = 1;
    while (names.has(`Sitzordnung ${n}`)) {
      n++;
    }
    const name = `Sitzordnung ${n}`;

    try {
      const plan = this.store.seating.createSeatingPlan(
        courseId,
        name,
        this.rows(),
        this.columns(),
      );
      this.plans.update((list) => [...list, plan]);
      this.selectPlan(plan.id);
      this.toasts.success(`„${plan.name}" wurde angelegt.`);
      // Gleich benennen: Namensfeld markieren.
      setTimeout(() => {
        const input = this.nameInput()?.nativeElement;
        input?.focus();
        input?.select();
      });
    } catch (err) {
      this.toasts.error(err, 'Die Sitzordnung konnte nicht angelegt werden.');
    }
  }

  /** Übernimmt eine Sitzordnung aus einem anderen Fach derselben Klasse als Kopie. */
  copyPlan(sourceId: number): void {
    const group = this.classPlans().find((g) => g.plans.some((p) => p.id === sourceId));
    const source = group?.plans.find((p) => p.id === sourceId);
    if (!group || !source) {
      return;
    }

    const courseId = this.courseId();
    const name = `${source.name} (${group.course.subjectShortName || group.course.subjectName})`;
    // Nur Schüler übernehmen, die es in diesem Kurs gibt.
    const known = new Set(this.students().map((s) => s.id));
    const seats = source.seats.filter((s) => known.has(s.studentId));

    try {
      const created = this.store.seating.createSeatingPlan(
        courseId,
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

  // --- Ansicht ---

  /** Öffnet oder schließt das Schloss; den Rest erledigt der Effekt im Konstruktor. */
  toggleMode(unlocked: boolean): void {
    this.seatUnlocked.set(unlocked);
  }

  setView(view: ParticipationView): void {
    this.view.set(view);
    writeView(view);
  }

  // --- Bewerten ---

  onRate(request: RateRequest): void {
    this.rate(request.student, request.value);
  }

  /** Je Schüler und Tag eine Bewertung - der letzte Klick ersetzt die vorige. */
  rate(student: Student, value: RatingValue): void {
    if (this.editMode()) {
      return;
    }
    // Nach dem Bewerten klappt die Kachel wieder zusammen.
    this.selectedId.set(null);
    const courseId = this.courseId();
    // Merken, was vorher galt - „Rückgängig“ stellt es wieder her.
    const previous = (this.todayRatings().get(student.id)?.at(-1)?.value ??
      null) as RatingValue | null;

    try {
      const rating = this.rateOn(courseId, student.id, value, this.lessonDate());
      this.refreshScores();
      this.flashTile(student.id, value);
      this.showUndoToast(`${fullName(student)}: ${ratingSymbol(value)}`, () =>
        this.undoRating(rating, previous),
      );
    } catch (err) {
      this.toasts.error(err, 'Die Bewertung konnte nicht gespeichert werden.');
    }
  }

  /** Je Schüler und Tag gilt eine Bewertung - eine neue ersetzt die vorige. */
  private rateOn(courseId: number, studentId: number, value: RatingValue, day: string): Rating {
    return this.store.ratings.rate(courseId, studentId, value, undefined, day, true);
  }

  /**
   * Je Bewertung eine Meldung - die vorige verschwindet, damit sich im
   * Unterricht nichts stapelt.
   */
  private showUndoToast(text: string, undo?: () => void): void {
    if (this.undoToastId !== null) {
      this.toasts.dismiss(this.undoToastId);
    }
    this.undoToastId = this.toasts.show(
      text,
      'success',
      6000,
      undo ? { label: 'Rückgängig', run: undo } : undefined,
    );
  }

  /** Schnellbewertung per Wischen über Kachel oder Zeile. */
  onSwipe(student: Student, value: RatingValue): void {
    if (this.absentIds().has(student.id)) {
      return;
    }
    this.rate(student, value);
  }

  // --- Abwesende ---

  /** Markiert einen Schüler für diesen Tag als fehlend - oder wieder als anwesend. */
  toggleAbsent(student: Student, undo = true): void {
    if (this.editMode()) {
      return;
    }
    this.selectedId.set(null);
    const absent = !this.absentIds().has(student.id);
    try {
      this.store.participation.setAbsent(this.courseId(), student.id, this.lessonDate(), absent);
      this.refreshScores();
      this.showUndoToast(
        `${fullName(student)}: ${absent ? 'fehlt' : 'wieder anwesend'}`,
        undo ? () => this.toggleAbsent(student, false) : undefined,
      );
    } catch (err) {
      this.toasts.error(err, 'Die Anwesenheit konnte nicht gespeichert werden.');
    }
  }

  // --- Auslosen ---

  /**
   * Lost einen anwesenden Schüler aus - bevorzugt jemanden, der an diesem Tag
   * noch keine Bewertung hat. Im Sitzplan öffnen sich gleich seine Knöpfe.
   */
  pickRandom(): void {
    const present = this.students().filter((s) => !this.absentIds().has(s.id));
    if (!present.length) {
      this.toasts.show('Es ist niemand anwesend, der ausgelost werden kann.', 'info');
      return;
    }
    const open = present.filter((s) => !this.lastToday().has(s.id));
    const pool = open.length ? open : present;
    const student = pool[Math.floor(Math.random() * pool.length)];

    if (this.pickTimer) {
      clearTimeout(this.pickTimer);
    }
    this.pickedId.set(null);
    requestAnimationFrame(() => {
      this.pickedId.set(student.id);
      this.pickTimer = setTimeout(() => this.pickedId.set(null), 3600);
      const el = document.querySelector<HTMLElement>(`[data-student="${student.id}"]`);
      el?.scrollIntoView({ block: 'center' });
      // Im Sitzplan gleich die Bewertungsknöpfe öffnen, sobald die Kachel steht.
      if (el?.classList.contains('student')) {
        setTimeout(() => {
          this.popover.set(placePopover(el.getBoundingClientRect()));
          this.selectedId.set(student.id);
        }, 200);
      }
    });
    this.toasts.show(
      `Ausgelost: ${fullName(student)}${open.length ? '' : ' (alle schon bewertet)'}`,
      'info',
      4000,
    );
  }

  /**
   * Nimmt genau die Bewertung zurück, zu der die Meldung gehörte. Hat sie
   * eine frühere ersetzt, gilt danach wieder diese.
   */
  private undoRating(rating: Rating, previous: RatingValue | null): void {
    this.undoToastId = null;
    try {
      if (previous === null) {
        this.store.ratings.deleteRating(rating.id);
      } else {
        this.rateOn(rating.courseId, rating.studentId, previous, rating.lessonDate);
      }
      this.toasts.show('Die Bewertung wurde zurückgenommen.');
      this.refreshScores();
    } catch (err) {
      this.toasts.error(err, 'Es gab nichts zurückzunehmen.');
    }
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

    try {
      this.store.ratings.deleteRating(rating.id);
      this.refreshScores();
    } catch (err) {
      this.toasts.error(err, 'Die Bewertung konnte nicht gelöscht werden.');
    }
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

  // --- Kachel auswählen ---

  /** Erster Tipp öffnet die Knöpfe als Overlay an der Kachel, zweiter Tipp schließt sie. */
  toggleSelect(student: Student, event: Event): void {
    if (this.editMode()) {
      return;
    }
    if (this.selectedId() === student.id) {
      this.selectedId.set(null);
      return;
    }
    const tile = (event.currentTarget as HTMLElement).closest('.student') ?? event.currentTarget;
    this.popover.set(placePopover((tile as HTMLElement).getBoundingClientRect()));
    this.selectedId.set(student.id);
  }

  @HostListener('document:keydown.escape')
  @HostListener('window:resize')
  @HostListener('window:scroll')
  clearSelection(): void {
    this.selectedId.set(null);
  }

  /** Tippen neben das Overlay schließt es - die eigene Kachel schaltet selbst um. */
  @HostListener('document:pointerdown', ['$event'])
  onPointerDown(event: PointerEvent): void {
    if (this.selectedId() === null) {
      return;
    }
    const target = event.target as Element | null;
    if (!target?.closest('.rate-pop, .student.selected')) {
      this.selectedId.set(null);
    }
  }

  // --- Verlauf als Blatt ---

  openSheet(student: Student): void {
    if (this.editMode()) {
      return;
    }
    this.selectedId.set(null);
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
    try {
      this.courseRatings.set(this.store.ratings.getRatings(this.courseId()));
    } catch (err) {
      this.toasts.error(err, 'Der Verlauf konnte nicht geladen werden.');
    }
  }

  // --- Nachladen ---

  /** Punktestand, heutige Bewertungen und - falls offen - der Verlauf. */
  private refreshScores(): void {
    const courseId = this.courseId();
    try {
      this.scores.set(this.store.ratings.getScoreboard(courseId).students);
      // Der mündliche Vorschlag (Ø Mitarbeit) ändert sich mit jeder Bewertung.
      this.quarterGrades.set(this.store.quarterGrades.getQuarterGrades(courseId));
      this.refreshToday();
    } catch (err) {
      this.toasts.error(err, 'Der Punktestand konnte nicht geladen werden.');
      return;
    }
    if (this.sheetStudentId() !== null) {
      this.loadCourseRatings();
    }
  }

  /** Die Bewertungen und Fehlenden des gewählten Tages. */
  private refreshToday(): void {
    const courseId = this.courseId();
    const day = this.lessonDate();

    const map = new Map<number, Rating[]>();
    const ratings = this.store.ratings.getRatings(courseId, { from: day, to: day });
    for (const rating of ratings.sort((a, b) => a.id - b.id)) {
      map.set(rating.studentId, [...(map.get(rating.studentId) ?? []), rating]);
    }
    this.todayRatings.set(map);
    this.absentIds.set(new Set(this.store.participation.getAbsentStudentIds(courseId, day)));
  }

  private refreshLesson(): void {
    this.lesson.set(this.store.timetable.getCurrentLesson());
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
}
