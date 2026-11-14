import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  DayOfWeek,
  SCHOOL_DAYS,
  TimetableImportResult,
  TimetableImportRow,
  WEEKDAY_NAMES,
} from '../../core/models';
import { LocalStore } from '../../core/store/local-store';
import { ToastService } from '../../core/ui/toast.service';

/** Größer als jeder realistische Jahresexport. */
const MAX_BYTES = 5 * 1024 * 1024;

/** Eine Vorschauzeile mit dem, was der Benutzer daran noch ändern kann. */
interface PreviewRow extends TimetableImportRow {
  selected: boolean;
}

@Component({
  selector: 'app-timetable-import',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  templateUrl: './timetable-import.html',
  styleUrl: './timetable-import.scss',
})
export class TimetableImportPage {
  private readonly store = inject(LocalStore);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  readonly days = SCHOOL_DAYS;
  readonly weekdayNames = WEEKDAY_NAMES;

  readonly fileName = signal<string | null>(null);
  /** True, solange die gewählte Datei gelesen wird. */
  readonly busy = signal(false);
  readonly rows = signal<PreviewRow[]>([]);
  readonly warnings = signal<string[]>([]);
  readonly result = signal<TimetableImportResult | null>(null);

  readonly hasPreview = computed(() => this.rows().length > 0);
  readonly selectedCount = computed(() => this.rows().filter((r) => r.selected).length);

  /** Ohne Klasse und Fach lässt sich eine Zeile nicht übernehmen. */
  readonly incompleteCount = computed(
    () =>
      this.rows().filter(
        (r) => r.selected && (r.schoolClassName.trim() === '' || r.subjectName.trim() === ''),
      ).length,
  );

  async fileChosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > MAX_BYTES) {
      this.toasts.show('Die Datei ist größer als 5 MB.', 'error');
      input.value = '';
      return;
    }

    this.fileName.set(file.name);
    this.result.set(null);
    this.busy.set(true);

    try {
      this.loadPreview(await file.text());
    } catch {
      this.toasts.show('Die Datei konnte nicht gelesen werden.', 'error');
    } finally {
      this.busy.set(false);
      // Damit dieselbe Datei erneut gewählt werden kann.
      input.value = '';
    }
  }

  private loadPreview(ics: string): void {
    try {
      const preview = this.store.timetable.previewTimetableImport(ics);
      this.rows.set(preview.rows.map((r) => ({ ...r, selected: r.looksRegular })));
      this.warnings.set(preview.warnings);

      if (preview.rows.length === 0) {
        this.toasts.show('In der Datei wurde kein Unterricht gefunden.', 'error');
      }
    } catch (err) {
      this.toasts.error(err, 'Die Datei konnte nicht gelesen werden.');
    }
  }

  toggle(index: number, selected: boolean): void {
    this.patchRow(index, { selected });
  }

  toggleAll(selected: boolean): void {
    this.rows.update((list) => list.map((r) => ({ ...r, selected })));
  }

  setClassName(index: number, schoolClassName: string): void {
    this.patchRow(index, { schoolClassName });
  }

  setSubjectName(index: number, subjectName: string): void {
    this.patchRow(index, { subjectName });
  }

  dayName(day: DayOfWeek): string {
    return this.weekdayNames[day] ?? '';
  }

  apply(): void {
    const selected = this.rows().filter((r) => r.selected);
    if (selected.length === 0) {
      this.toasts.show('Es ist keine Zeile ausgewählt.', 'error');
      return;
    }

    try {
      const result = this.store.timetable.applyTimetableImport(
        selected.map(({ selected: _selected, ...row }) => row),
      );
      this.result.set(result);
      this.rows.set([]);
      this.warnings.set([]);

      if (result.createdLessons > 0) {
        this.toasts.success(
          `${result.createdLessons} Stunden wurden in den Stundenplan übernommen.`,
        );
      } else {
        this.toasts.show('Es wurde keine neue Stunde angelegt.', 'error');
      }
    } catch (err) {
      this.toasts.error(err, 'Der Stundenplan konnte nicht übernommen werden.');
    }
  }

  toTimetable(): void {
    void this.router.navigate(['/stundenplan']);
  }

  private patchRow(index: number, patch: Partial<PreviewRow>): void {
    this.rows.update((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
}
