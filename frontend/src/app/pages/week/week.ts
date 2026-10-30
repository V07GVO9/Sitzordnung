import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Course, CurrentLesson, TimetableEntry, WEEKDAY_NAMES } from '../../core/models';
import { toDateKey } from '../../core/store/time';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../core/ui/icon';
import { subjectHue } from '../../core/ui/subject-hue';

/** Eine Zeile des Wochenplans: ein Zeitblock wie 07:45–09:15. */
interface Slot {
  startTime: string;
  endTime: string;
}

/** Ein Eintrag in einer Zelle - eine Stunde an einem bestimmten Datum. */
interface Cell {
  entry: TimetableEntry;
  date: string;
  short: string;
  ratingCount: number;
  running: boolean;
}

const DAY_SHORT: Record<number, string> = { 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa' };

/**
 * Der Wochenplan für den Unterricht: Tage nebeneinander, Zeitblöcke
 * untereinander, jede Stunde knapp beschriftet. Ein Tipp auf eine Stunde
 * öffnet sie zum Bewerten - für genau dieses Datum, auch rückwirkend.
 */
@Component({
  selector: 'app-week',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  templateUrl: './week.html',
  styleUrl: './week.scss',
  host: {
    '(touchstart)': 'onTouchStart($event)',
    '(touchend)': 'onTouchEnd($event)',
  },
})
export class WeekPage {
  private readonly api = inject(ApiService);
  private readonly toasts = inject(ToastService);

  readonly loading = signal(true);
  readonly entries = signal<TimetableEntry[]>([]);
  readonly courses = signal<Course[]>([]);
  readonly lesson = signal<CurrentLesson | null>(null);
  /** Bewertungen je "Kurs|Datum" in der gezeigten Woche. */
  readonly ratingCounts = signal<Map<string, number>>(new Map());

  /** 0 = diese Woche, -1 = letzte, 1 = nächste. */
  readonly weekOffset = signal(0);

  readonly todayKey = toDateKey(new Date());

  /** Der Montag der gezeigten Woche. */
  readonly monday = computed(() => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    const day = date.getDay() === 0 ? 7 : date.getDay();
    date.setDate(date.getDate() - (day - 1) + this.weekOffset() * 7);
    return date;
  });

  /** Mo–Fr, Samstag nur, wenn dort auch Unterricht steht. */
  readonly days = computed(() => {
    const withSaturday = this.entries().some((e) => e.dayOfWeek === 6);
    return (withSaturday ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]).map((dayOfWeek) => {
      const date = new Date(this.monday());
      date.setDate(date.getDate() + dayOfWeek - 1);
      const key = toDateKey(date);
      return {
        dayOfWeek,
        key,
        short: DAY_SHORT[dayOfWeek],
        long: WEEKDAY_NAMES[dayOfWeek],
        label: date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
        isToday: key === this.todayKey,
      };
    });
  });

  readonly weekLabel = computed(() => {
    const days = this.days();
    const first = days[0];
    const last = days[days.length - 1];
    return `KW ${isoWeek(this.monday())} · ${first.label}–${last.label}`;
  });

  /** Die Zeitblöcke, wie sie im Stundenplan vorkommen. */
  readonly slots = computed<Slot[]>(() => {
    const seen = new Map<string, Slot>();
    for (const e of this.entries()) {
      seen.set(`${e.startTime}|${e.endTime}`, { startTime: e.startTime, endTime: e.endTime });
    }
    return [...seen.values()].sort(
      (a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime),
    );
  });

  private readonly shortBySubject = computed(() => {
    const map = new Map<number, string>();
    for (const course of this.courses()) {
      map.set(course.id, abbreviate(course.subjectShortName, course.subjectName));
    }
    return map;
  });

  /** Zelle je "Wochentag|Beginn|Ende". */
  readonly cells = computed(() => {
    const map = new Map<string, Cell[]>();
    const dates = new Map(this.days().map((d) => [d.dayOfWeek, d.key] as const));
    const counts = this.ratingCounts();
    const lesson = this.lesson();

    for (const entry of this.entries()) {
      const date = dates.get(entry.dayOfWeek);
      if (!date) {
        continue;
      }
      const key = `${entry.dayOfWeek}|${entry.startTime}|${entry.endTime}`;
      const cell: Cell = {
        entry,
        date,
        short:
          this.shortBySubject().get(entry.courseId) ?? abbreviate('', entry.subjectName),
        ratingCount: counts.get(`${entry.courseId}|${date}`) ?? 0,
        running:
          date === this.todayKey &&
          !!lesson?.hasLesson &&
          lesson.courseId === entry.courseId &&
          lesson.startTime === entry.startTime,
      };
      map.set(key, [...(map.get(key) ?? []), cell]);
    }
    return map;
  });

  readonly hue = subjectHue;

  private touchX: number | null = null;

  constructor() {
    forkJoin({
      entries: this.api.getTimetable(),
      courses: this.api.getCourses(),
    }).subscribe({
      next: ({ entries, courses }) => {
        this.entries.set(entries);
        this.courses.set(courses);
        this.loading.set(false);
        this.loadRatings();
      },
      error: (err) => {
        this.toasts.error(err, 'Der Stundenplan konnte nicht geladen werden.');
        this.loading.set(false);
      },
    });

    this.api.getCurrentLesson().subscribe({
      next: (lesson) => this.lesson.set(lesson),
      error: () => this.lesson.set(null),
    });
  }

  cellsAt(dayOfWeek: number, slot: Slot): Cell[] {
    return this.cells().get(`${dayOfWeek}|${slot.startTime}|${slot.endTime}`) ?? [];
  }

  shiftWeek(step: number): void {
    this.weekOffset.update((offset) => offset + step);
    this.loadRatings();
  }

  thisWeek(): void {
    this.weekOffset.set(0);
    this.loadRatings();
  }

  onTouchStart(event: TouchEvent): void {
    this.touchX = event.touches[0]?.clientX ?? null;
  }

  /** Wischen nach links oder rechts blättert die Woche. */
  onTouchEnd(event: TouchEvent): void {
    const start = this.touchX;
    this.touchX = null;
    const end = event.changedTouches[0]?.clientX;
    if (start === null || end === undefined) {
      return;
    }
    const distance = end - start;
    if (Math.abs(distance) > 70) {
      this.shiftWeek(distance < 0 ? 1 : -1);
    }
  }

  /** Wie viele Bewertungen in welcher Stunde der Woche schon stehen. */
  private loadRatings(): void {
    const days = this.days();
    const range = { from: days[0].key, to: days[days.length - 1].key };
    const courseIds = [...new Set(this.entries().map((e) => e.courseId))];

    const requests = courseIds.map((id) => this.api.getRatings(id, range));
    (requests.length ? forkJoin(requests) : of([])).subscribe({
      next: (lists) => {
        const counts = new Map<string, number>();
        for (const rating of lists.flat()) {
          const key = `${rating.courseId}|${rating.lessonDate}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        this.ratingCounts.set(counts);
      },
    });
  }
}

/** Das Kürzel eines Fachs: das hinterlegte, sonst die ersten Buchstaben ("Informatik" → "INF"). */
export function abbreviate(shortName: string, name: string): string {
  if (shortName.trim()) {
    return shortName.trim();
  }
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return words
      .map((w) => w[0])
      .join('')
      .slice(0, 4)
      .toUpperCase();
  }
  return name.trim().slice(0, 3).toUpperCase();
}

/** Die Kalenderwoche nach ISO 8601. */
function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}
