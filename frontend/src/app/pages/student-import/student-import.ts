import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { SchoolClass, StudentImportResult, StudentImportRow } from '../../core/models';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-student-import',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  templateUrl: './student-import.html',
  styleUrl: './student-import.scss',
})
export class StudentImportPage {
  private readonly api = inject(ApiService);
  private readonly toasts = inject(ToastService);

  readonly klassen = signal<SchoolClass[]>([]);
  readonly zeilen = signal<StudentImportRow[]>([]);
  readonly warnungen = signal<string[]>([]);
  readonly busy = signal(false);
  readonly dateiName = signal<string | null>(null);
  readonly eingefuegt = signal('');
  readonly ergebnis = signal<StudentImportResult | null>(null);

  /** Klasse für Zeilen, die keine eigene Klassenangabe mitbringen. */
  readonly klasseFallback = signal('');

  /** Ohne Klasse in der Datei und ohne Auswahl kann nichts angelegt werden. */
  readonly ohneKlasse = computed(
    () => this.zeilen().filter((z) => !z.className.trim()).length,
  );

  readonly fehltKlasse = computed(() => this.ohneKlasse() > 0 && !this.klasseFallback().trim());

  constructor() {
    this.api.getClasses().subscribe({
      next: (klassen) => this.klassen.set(klassen),
      error: () => this.klassen.set([]),
    });
  }

  waehleDatei(event: Event): void {
    const input = event.target as HTMLInputElement;
    const datei = input.files?.[0];
    if (!datei) {
      return;
    }

    this.dateiName.set(datei.name);
    this.lade(datei, null);
    input.value = '';
  }

  listeEinfuegen(): void {
    const text = this.eingefuegt().trim();
    if (!text) {
      this.toasts.show('Bitte zuerst eine Liste einfügen.', 'error');
      return;
    }

    this.dateiName.set(null);
    this.lade(null, text);
  }

  private lade(datei: File | null, text: string | null): void {
    this.busy.set(true);
    this.ergebnis.set(null);

    this.api.previewStudentImport(datei, text).subscribe({
      next: (vorschau) => {
        this.busy.set(false);
        this.zeilen.set(vorschau.rows.map((r) => ({ ...r })));
        this.warnungen.set(vorschau.warnings);

        if (vorschau.rows.length === 0) {
          this.toasts.show('Es wurden keine Namen gefunden.', 'error');
        }
      },
      error: (err) => {
        this.busy.set(false);
        this.zeilen.set([]);
        this.toasts.error(err, 'Die Liste konnte nicht gelesen werden.');
      },
    });
  }

  aendere(index: number, patch: Partial<StudentImportRow>): void {
    this.zeilen.update((liste) => liste.map((z, i) => (i === index ? { ...z, ...patch } : z)));
  }

  entferne(index: number): void {
    this.zeilen.update((liste) => liste.filter((_, i) => i !== index));
  }

  uebernehmen(): void {
    if (this.zeilen().length === 0 || this.fehltKlasse()) {
      return;
    }

    this.busy.set(true);

    this.api.applyStudentImport(this.zeilen(), this.klasseFallback().trim() || null).subscribe({
      next: (ergebnis) => {
        this.busy.set(false);
        this.ergebnis.set(ergebnis);
        this.zeilen.set([]);
        this.eingefuegt.set('');
        this.toasts.success(`${ergebnis.createdStudents} Schüler übernommen.`);
      },
      error: (err) => {
        this.busy.set(false);
        this.toasts.error(err, 'Der Import ist fehlgeschlagen.');
      },
    });
  }
}
