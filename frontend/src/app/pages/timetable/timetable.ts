import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toTimeKey } from '../../core/logic/time';
import { DayOfWeek, SCHOOL_DAYS, TimetableEntry, WEEKDAY_NAMES } from '../../core/models';
import { LocalStore } from '../../core/store/local-store';
import { ToastService } from '../../core/ui/toast.service';
import { Icon } from '../../core/ui/icon';
import { ConfirmService } from '../../core/ui/confirm.service';

/** Eine Zeile der Wochenübersicht: ein Zeitblock wie 08:00–09:30. */
interface TimeSlot {
  startTime: string;
  endTime: string;
}

@Component({
  selector: 'app-timetable',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, NgTemplateOutlet, RouterLink, Icon],
  templateUrl: './timetable.html',
  styleUrl: './timetable.scss',
})
export class TimetablePage {
  private readonly store = inject(LocalStore);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly entries = signal(this.store.timetable.getTimetable());
  readonly courses = signal(this.store.masterData.getCourses());

  readonly days = SCHOOL_DAYS;
  readonly weekdayNames = WEEKDAY_NAMES;

  readonly formCourseId = signal<number | null>(this.courses()[0]?.id ?? null);
  readonly formDay = signal<DayOfWeek>(1);
  readonly formStart = signal('08:00');
  readonly formEnd = signal('08:45');
  readonly formRoom = signal('');

  /**
   * Alle vorkommenden Zeitblöcke, nach Beginn sortiert. Sie bilden die Zeilen
   * der Tabelle; die Uhrzeit steht dann einmal links statt in jeder Stunde.
   */
  readonly timeSlots = computed(() => {
    const seen = new Map<string, TimeSlot>();

    for (const entry of this.entries()) {
      const key = `${entry.startTime}-${entry.endTime}`;
      if (!seen.has(key)) {
        seen.set(key, { startTime: entry.startTime, endTime: entry.endTime });
      }
    }

    return [...seen.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
  });

  /** Die Einträge nach Zeitblock und Wochentag, für den Zugriff aus der Tabelle. */
  private readonly grid = computed(() => {
    const map = new Map<string, TimetableEntry[]>();

    for (const entry of this.entries()) {
      const key = `${entry.startTime}-${entry.endTime}|${entry.dayOfWeek}`;
      map.set(key, [...(map.get(key) ?? []), entry]);
    }

    return map;
  });

  /**
   * Für die schmale Ansicht: je Wochentag die Stunden nach Uhrzeit sortiert.
   * So passt der Plan auch aufs Handy, ohne seitlich zu scrollen.
   */
  readonly weekdays = computed(() => {
    const entries = this.entries();

    return this.days
      .map((day) => ({
        day,
        name: WEEKDAY_NAMES[day],
        lessons: entries
          .filter((entry) => entry.dayOfWeek === day)
          .sort((a, b) => a.startTime.localeCompare(b.startTime)),
      }))
      .filter((weekday) => weekday.lessons.length > 0);
  });

  readonly today = new Date().getDay();

  /** Was steht in dieser Zelle? Meist eine Stunde, in Ausnahmen mehrere. */
  lessonsAt(slot: TimeSlot, day: DayOfWeek): TimetableEntry[] {
    return this.grid().get(`${slot.startTime}-${slot.endTime}|${day}`) ?? [];
  }

  /** Läuft diese Stunde gerade? Dann wird sie in der Tabelle hervorgehoben. */
  isRunning(entry: TimetableEntry): boolean {
    const now = new Date();
    if (entry.dayOfWeek !== now.getDay()) {
      return false;
    }

    const time = toTimeKey(now);
    return entry.startTime <= time && time <= entry.endTime;
  }

  add(): void {
    const courseId = this.formCourseId();
    if (!courseId) {
      this.toasts.show('Bitte zuerst einen Kurs auswählen.', 'error');
      return;
    }

    try {
      const created = this.store.timetable.createTimetableEntry({
        courseId,
        dayOfWeek: this.formDay(),
        startTime: this.formStart(),
        endTime: this.formEnd(),
        room: this.formRoom().trim() || null,
      });
      this.entries.update((list) => [...list, created]);
      this.formRoom.set('');
      this.toasts.success('Die Stunde wurde eingetragen.');
    } catch (err) {
      this.toasts.error(err, 'Die Stunde konnte nicht eingetragen werden.');
    }
  }

  async remove(entry: TimetableEntry): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Stunde aus dem Plan nehmen?',
      message: `${entry.subjectName} (${entry.schoolClassName}) am ${WEEKDAY_NAMES[entry.dayOfWeek]} um ${entry.startTime} Uhr. Bereits vergebene Bewertungen bleiben erhalten.`,
      confirmLabel: 'Entfernen',
      danger: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      this.store.timetable.deleteTimetableEntry(entry.id);
      this.entries.update((list) => list.filter((e) => e.id !== entry.id));
      this.toasts.show('Die Stunde wurde aus dem Plan genommen.');
    } catch (err) {
      this.toasts.error(err, 'Die Stunde konnte nicht gelöscht werden.');
    }
  }

  /** Setzt die Endzeit nach, damit eine Stunde standardmäßig 45 Minuten dauert. */
  onStartChange(value: string): void {
    this.formStart.set(value);

    const [hours, minutes] = value.split(':').map(Number);
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      this.formEnd.set(toTimeKey(new Date(2000, 0, 1, hours, minutes + 45)));
    }
  }
}
