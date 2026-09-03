import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import {
  DayOfWeek,
  SCHOOL_DAYS,
  TimetableImportResult,
  TimetableImportRow,
  WEEKDAY_NAMES,
} from '../../core/models';
import { ToastService } from '../../core/toast.service';

/** Größer als jeder realistische Jahresexport. */
const MAX_BYTES = 5 * 1024 * 1024;

/** Eine Vorschauzeile mit dem, was der Benutzer daran noch ändern kann. */
interface Zeile extends TimetableImportRow {
  ausgewaehlt: boolean;
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

  readonly days = SCHOOL_DAYS;
  readonly weekdayNames = WEEKDAY_NAMES;

  readonly dateiName = signal<string | null>(null);
  readonly laeuft = signal(false);
  readonly zeilen = signal<Zeile[]>([]);
  readonly warnungen = signal<string[]>([]);
  readonly ergebnis = signal<TimetableImportResult | null>(null);

  readonly hatVorschau = computed(() => this.zeilen().length > 0);
  readonly anzahlAusgewaehlt = computed(() => this.zeilen().filter((z) => z.ausgewaehlt).length);

  /** Ohne Klasse und Fach lässt sich eine Zeile nicht übernehmen. */
  readonly unvollstaendig = computed(
    () =>
      this.zeilen().filter(
        (z) => z.ausgewaehlt && (z.schoolClassName.trim() === '' || z.subjectName.trim() === ''),
      ).length,
  );

  async dateiGewaehlt(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const datei = input.files?.[0];
    if (!datei) {
      return;
    }

    if (datei.size > MAX_BYTES) {
      this.toasts.show('Die Datei ist größer als 5 MB.', 'error');
      input.value = '';
      return;
    }

    this.dateiName.set(datei.name);
    this.ergebnis.set(null);
    this.laeuft.set(true);

    try {
      const inhalt = await datei.text();
      this.vorschauLaden(inhalt);
    } catch {
      this.laeuft.set(false);
      this.toasts.show('Die Datei konnte nicht gelesen werden.', 'error');
    } finally {
      // Damit dieselbe Datei erneut gewählt werden kann.
      input.value = '';
    }
  }

  private vorschauLaden(ics: string): void {
    this.api.previewTimetableImport(ics).subscribe({
      next: (vorschau) => {
        this.zeilen.set(
          vorschau.rows.map((r) => ({ ...r, ausgewaehlt: r.looksRegular })),
        );
        this.warnungen.set(vorschau.warnings);
        this.laeuft.set(false);

        if (vorschau.rows.length === 0) {
          this.toasts.show('In der Datei wurde kein Unterricht gefunden.', 'error');
        }
      },
      error: (err) => {
        this.laeuft.set(false);
        this.toasts.error(err, 'Die Datei konnte nicht gelesen werden.');
      },
    });
  }

  umschalten(index: number, wert: boolean): void {
    this.zeilen.update((liste) =>
      liste.map((z, i) => (i === index ? { ...z, ausgewaehlt: wert } : z)),
    );
  }

  alleUmschalten(wert: boolean): void {
    this.zeilen.update((liste) => liste.map((z) => ({ ...z, ausgewaehlt: wert })));
  }

  klasseSetzen(index: number, wert: string): void {
    this.zeilen.update((liste) =>
      liste.map((z, i) => (i === index ? { ...z, schoolClassName: wert } : z)),
    );
  }

  fachSetzen(index: number, wert: string): void {
    this.zeilen.update((liste) =>
      liste.map((z, i) => (i === index ? { ...z, subjectName: wert } : z)),
    );
  }

  tagName(day: DayOfWeek): string {
    return this.weekdayNames[day] ?? '';
  }

  uebernehmen(): void {
    const ausgewaehlt = this.zeilen().filter((z) => z.ausgewaehlt);
    if (ausgewaehlt.length === 0) {
      this.toasts.show('Es ist keine Zeile ausgewählt.', 'error');
      return;
    }

    this.laeuft.set(true);

    this.api
      .applyTimetableImport(
        ausgewaehlt.map(({ ausgewaehlt: _ausgewaehlt, ...rest }) => rest),
      )
      .subscribe({
        next: (ergebnis) => {
          this.laeuft.set(false);
          this.ergebnis.set(ergebnis);
          this.zeilen.set([]);
          this.warnungen.set([]);

          if (ergebnis.createdLessons > 0) {
            this.toasts.success(
              `${ergebnis.createdLessons} Stunden wurden in den Stundenplan übernommen.`,
            );
          } else {
            this.toasts.show('Es wurde keine neue Stunde angelegt.', 'error');
          }
        },
        error: (err) => {
          this.laeuft.set(false);
          this.toasts.error(err, 'Der Stundenplan konnte nicht übernommen werden.');
        },
      });
  }

  zumStundenplan(): void {
    void this.router.navigate(['/']);
  }
}
