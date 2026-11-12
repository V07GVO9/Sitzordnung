import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TimetableEntry, WEEKDAY_NAMES } from '../../core/models';
import { freeDayReason } from '../../core/logic/school-calendar';
import { toDateKey } from '../../core/logic/time';
import { backupDue } from '../../core/logic/backup.logic';
import { FilePickerCancelled } from '../../core/persistence/file-system';
import { VaultService } from '../../core/persistence/vault.service';
import { LocalStore } from '../../core/store/local-store';
import { ToastService } from '../../core/ui/toast.service';
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
  running: boolean;
}

/** Tag, an dem „Später“ gewählt wurde - dann erst morgen wieder erinnern. */
const SNOOZE_KEY = 'sitzordnung.sicherung-spaeter';

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
  private readonly store = inject(LocalStore);
  private readonly toasts = inject(ToastService);
  private readonly vault = inject(VaultService);

  /** Erinnerung an die Sicherungskopie - null, wenn keine fällig ist. */
  readonly backupReminder = signal<{ days: number | null } | null>(null);

  readonly entries = signal(this.store.timetable.getTimetable());
  readonly courses = signal(this.store.masterData.getCourses());
  readonly lesson = signal(this.store.timetable.getCurrentLesson());

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

  /** Mo–Fr, Samstag nur, wenn dort auch Unterricht steht - inkl. unterrichtsfreier Tage. */
  readonly allDays = computed(() => {
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
        freeReason: freeDayReason(key),
      };
    });
  });

  /** Die Unterrichtstage: ohne Feiertage und Ferientage in Niedersachsen. */
  readonly days = computed(() => this.allDays().filter((d) => !d.freeReason));

  /** Die ausgeblendeten Tage der Woche, gleiche Gründe zusammengefasst. */
  readonly freeDays = computed(() => {
    const groups = new Map<string, string[]>();
    for (const day of this.allDays()) {
      if (day.freeReason) {
        groups.set(day.freeReason, [...(groups.get(day.freeReason) ?? []), day.short]);
      }
    }
    return [...groups].map(([reason, days]) => ({ reason, days: days.join(', ') }));
  });

  readonly weekLabel = computed(() => {
    const days = this.allDays();
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
        short: this.shortBySubject().get(entry.courseId) ?? abbreviate('', entry.subjectName),
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

  /** Aus welcher Richtung die neue Woche hereingleitet; null beim ersten Anzeigen. */
  private readonly slideDirection = signal<'next' | 'prev' | null>(null);

  constructor() {
    this.checkBackup();
  }

  cellsAt(dayOfWeek: number, slot: Slot): Cell[] {
    return this.cells().get(`${dayOfWeek}|${slot.startTime}|${slot.endTime}`) ?? [];
  }

  /** Fällige Sicherung? „Später“ schiebt die Erinnerung um einen Tag. */
  private checkBackup(): void {
    let snoozed = false;
    try {
      snoozed = localStorage.getItem(SNOOZE_KEY) === toDateKey(new Date());
    } catch {
      // Ohne Speicher erinnert die App eben bei jedem Öffnen.
    }
    const last = this.store.settings.getLastBackupAt();
    this.backupReminder.set(
      snoozed ? null : backupDue(last, new Date(), this.entries().length > 0),
    );
  }

  async backupNow(): Promise<void> {
    try {
      await this.vault.saveBackupCopy();
      this.backupReminder.set(null);
      this.toasts.success('Sicherungskopie gespeichert – bitte an einem zweiten Ort ablegen.');
    } catch (error) {
      if (error instanceof FilePickerCancelled) {
        return;
      }
      this.toasts.error(error, 'Die Sicherungskopie konnte nicht erstellt werden.');
    }
  }

  snoozeBackup(): void {
    this.backupReminder.set(null);
    try {
      localStorage.setItem(SNOOZE_KEY, toDateKey(new Date()));
    } catch {
      // Dann eben bis zum nächsten Öffnen.
    }
  }

  shiftWeek(step: number): void {
    this.slideDirection.set(step > 0 ? 'next' : 'prev');
    this.weekOffset.update((offset) => offset + step);
  }

  thisWeek(): void {
    const offset = this.weekOffset();
    if (offset === 0) {
      return;
    }
    this.slideDirection.set(offset > 0 ? 'prev' : 'next');
    this.weekOffset.set(0);
  }

  /** CSS-Klasse für die Einblende-Animation beim Wochenwechsel. */
  slideClass(): string {
    const direction = this.slideDirection();
    return direction ? `slide-${direction}` : '';
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
