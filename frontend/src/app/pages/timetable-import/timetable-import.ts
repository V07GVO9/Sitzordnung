import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import {
  SCHOOL_DAYS,
  TimetableImportResult,
  TimetableImportRow,
  WEEKDAY_NAMES,
} from '../../core/models';
import { ToastService } from '../../core/toast.service';

/** Eine Zeile der Vorschau mit dem Häkchen, ob sie übernommen wird. */
interface Auswahl {
  row: TimetableImportRow;
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
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  readonly zeilen = signal<Auswahl[]>([]);
  readonly warnungen = signal<string[]>([]);
  readonly busy = signal(false);
  readonly dateiName = signal<string | null>(null);
  readonly ergebnis = signal<TimetableImportResult | null>(null);

  readonly days = SCHOOL_DAYS;
  readonly weekdayNames = WEEKDAY_NAMES;

  readonly anzahlGewaehlt = computed(() => this.zeilen().filter((z) => z.selected).length);

  /** Zeilen, denen noch Klasse oder Fach fehlt - die kann der Import nicht übernehmen. */
  readonly unvollstaendig = computed(
    () =>
      this.zeilen().filter(
        (z) => z.selected && (!z.row.schoolClassName.trim() || !z.row.subjectName.trim()),
      ).length,
  );

  waehleDatei(event: Event): void {
    const input = event.target as HTMLInputElement;
    const datei = input.files?.[0];
    if (!datei) {
      return;
    }

    this.busy.set(true);
    this.ergebnis.set(null);
    this.dateiName.set(datei.name);

    this.api.previewTimetableImport(datei).subscribe({
      next: (vorschau) => {
        this.busy.set(false);
        this.warnungen.set(vorschau.warnings);
        this.zeilen.set(
          vorschau.rows.map((row) => ({
            row: { ...row },
            // Einzeltermine und unklare Zeilen sind zunächst abgewählt.
            selected: row.looksRegular && !!row.schoolClassName && !!row.subjectName,
          })),
        );

        if (vorschau.rows.length === 0) {
          this.toasts.show('In der Datei wurde kein Unterricht gefunden.', 'error');
        }
        input.value = '';
      },
      error: (err) => {
        this.busy.set(false);
        this.zeilen.set([]);
        this.toasts.error(err, 'Die Datei konnte nicht gelesen werden.');
        input.value = '';
      },
    });
  }

  aendere(index: number, patch: Partial<TimetableImportRow>): void {
    this.zeilen.update((liste) =>
      liste.map((z, i) => (i === index ? { ...z, row: { ...z.row, ...patch } } : z)),
    );
  }

  schalte(index: number, selected: boolean): void {
    this.zeilen.update((liste) => liste.map((z, i) => (i === index ? { ...z, selected } : z)));
  }

  alleSchalten(selected: boolean): void {
    this.zeilen.update((liste) => liste.map((z) => ({ ...z, selected })));
  }

  uebernehmen(): void {
    const gewaehlt = this.zeilen().filter((z) => z.selected).map((z) => z.row);

    if (gewaehlt.length === 0) {
      this.toasts.show('Bitte mindestens eine Zeile auswählen.', 'error');
      return;
    }

    this.busy.set(true);

    this.api.applyTimetableImport(gewaehlt).subscribe({
      next: (ergebnis) => {
        this.busy.set(false);
        this.ergebnis.set(ergebnis);
        this.zeilen.set([]);
        this.toasts.success(`${ergebnis.createdLessons} Stunden übernommen.`);
      },
      error: (err) => {
        this.busy.set(false);
        this.toasts.error(err, 'Der Import ist fehlgeschlagen.');
      },
    });
  }

  zumStundenplan(): void {
    this.router.navigate(['/stundenplan']);
  }
}
