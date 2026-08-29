import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api.service';
import {
  Course,
  DayOfWeek,
  SCHOOL_DAYS,
  TimetableEntry,
  WEEKDAY_NAMES,
} from '../../core/models';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-timetable',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  templateUrl: './timetable.html',
  styleUrl: './timetable.scss',
})
export class TimetablePage {
  private readonly api = inject(ApiService);
  private readonly toasts = inject(ToastService);

  readonly entries = signal<TimetableEntry[]>([]);
  readonly courses = signal<Course[]>([]);
  readonly loading = signal(true);

  readonly days = SCHOOL_DAYS;
  readonly weekdayNames = WEEKDAY_NAMES;

  readonly formCourseId = signal<number | null>(null);
  readonly formDay = signal<DayOfWeek>(1);
  readonly formStart = signal('08:00');
  readonly formEnd = signal('08:45');
  readonly formRoom = signal('');

  /**
   * Alle vorkommenden Zeitschienen, nach Beginn sortiert. Sie bilden die Zeilen
   * der Tabelle; die Uhrzeit steht dann einmal links statt in jeder Stunde.
   */
  readonly zeitschienen = computed(() => {
    const gesehen = new Map<string, { startTime: string; endTime: string }>();

    for (const eintrag of this.entries()) {
      const schluessel = `${eintrag.startTime}-${eintrag.endTime}`;
      if (!gesehen.has(schluessel)) {
        gesehen.set(schluessel, { startTime: eintrag.startTime, endTime: eintrag.endTime });
      }
    }

    return [...gesehen.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
  });

  /** Die Einträge nach Zeitschiene und Wochentag, für den Zugriff aus der Tabelle. */
  private readonly raster = computed(() => {
    const map = new Map<string, TimetableEntry[]>();

    for (const eintrag of this.entries()) {
      const schluessel = `${eintrag.startTime}-${eintrag.endTime}|${eintrag.dayOfWeek}`;
      map.set(schluessel, [...(map.get(schluessel) ?? []), eintrag]);
    }

    return map;
  });

  /**
   * Für die schmale Ansicht: je Wochentag die Stunden nach Uhrzeit sortiert.
   * So passt der Plan auch aufs Handy, ohne seitlich zu scrollen.
   */
  readonly wochentage = computed(() => {
    const eintraege = this.entries();

    return this.days
      .map((day) => ({
        day,
        name: WEEKDAY_NAMES[day],
        stunden: eintraege
          .filter((eintrag) => eintrag.dayOfWeek === day)
          .sort((a, b) => a.startTime.localeCompare(b.startTime)),
      }))
      .filter((tag) => tag.stunden.length > 0);
  });

  readonly today = new Date().getDay();

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    forkJoin({
      entries: this.api.getTimetable(),
      courses: this.api.getCourses(),
    }).subscribe({
      next: ({ entries, courses }) => {
        this.entries.set(entries);
        this.courses.set(courses);
        this.formCourseId.set(this.formCourseId() ?? courses[0]?.id ?? null);
        this.loading.set(false);
      },
      error: (err) => {
        this.toasts.error(err, 'Der Stundenplan konnte nicht geladen werden.');
        this.loading.set(false);
      },
    });
  }

  /** Was steht in dieser Zelle? Meist eine Stunde, in Ausnahmen mehrere. */
  stundenIn(schiene: { startTime: string; endTime: string }, day: DayOfWeek): TimetableEntry[] {
    return this.raster().get(`${schiene.startTime}-${schiene.endTime}|${day}`) ?? [];
  }

  /** Läuft diese Stunde gerade? Dann wird sie in der Tabelle hervorgehoben. */
  laeuftGerade(entry: TimetableEntry): boolean {
    const jetzt = new Date();
    if (entry.dayOfWeek !== jetzt.getDay()) {
      return false;
    }

    const uhr = `${String(jetzt.getHours()).padStart(2, '0')}:${String(jetzt.getMinutes()).padStart(2, '0')}`;
    return entry.startTime <= uhr && uhr <= entry.endTime;
  }

  add(): void {
    const courseId = this.formCourseId();
    if (!courseId) {
      this.toasts.show('Bitte zuerst einen Kurs auswählen.', 'error');
      return;
    }

    this.api
      .createTimetableEntry({
        courseId,
        dayOfWeek: this.formDay(),
        startTime: this.formStart(),
        endTime: this.formEnd(),
        room: this.formRoom().trim() || null,
      })
      .subscribe({
        next: (created) => {
          this.entries.update((list) => [...list, created]);
          this.formRoom.set('');
          this.toasts.success('Die Stunde wurde eingetragen.');
        },
        error: (err) => this.toasts.error(err, 'Die Stunde konnte nicht eingetragen werden.'),
      });
  }

  remove(entry: TimetableEntry): void {
    this.api.deleteTimetableEntry(entry.id).subscribe({
      next: () => this.entries.update((list) => list.filter((e) => e.id !== entry.id)),
      error: (err) => this.toasts.error(err, 'Die Stunde konnte nicht gelöscht werden.'),
    });
  }

  /** Setzt die Endzeit nach, damit eine Stunde standardmäßig 45 Minuten dauert. */
  onStartChange(value: string): void {
    this.formStart.set(value);

    const [hours, minutes] = value.split(':').map(Number);
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      const end = new Date(2000, 0, 1, hours, minutes + 45);
      this.formEnd.set(
        `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`,
      );
    }
  }
}
