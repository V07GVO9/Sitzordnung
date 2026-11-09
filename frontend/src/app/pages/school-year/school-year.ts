import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService, SchoolYearCounts } from '../../core/api.service';
import { SchoolClass } from '../../core/models';
import { VaultService } from '../../core/store/vault.service';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../core/ui/confirm.service';
import { Icon } from '../../core/ui/icon';

/** Vorschlag fürs neue Schuljahr: die erste Zahl im Namen um eins höher (KDM11 → KDM12). */
export function nextClassName(name: string): string {
  return name.replace(/\d+/, (n) => String(Number(n) + 1).padStart(n.length, '0'));
}

interface ClassRow {
  id: number;
  name: string;
  studentCount: number;
  newName: string;
  leaves: boolean;
}

/**
 * Schuljahreswechsel: erst eine Sicherungskopie, dann Klassen hochsetzen
 * oder entfernen, Leistungsdaten des alten Jahres löschen (Löschfrist) und
 * den Stundenplan leeren - mit Zusammenfassung und Rückfrage.
 */
@Component({
  selector: 'app-school-year',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Icon],
  template: `
    <div class="stack">
      <div class="page-head">
        <div>
          <h1>Schuljahreswechsel</h1>
          <p class="muted small">
            Räumt das alte Schuljahr auf. Schüler, Fächer, Kurse, Sitzordnungen, Notenschlüssel und
            Bewertungsschemata bleiben erhalten.
          </p>
        </div>
      </div>

      <section class="card step" [class.done]="backedUp()">
        <h2><span class="nr">1</span> Sicherungskopie</h2>
        <p class="small">
          Pflicht vor dem Wechsel: Die Kopie enthält das komplette alte Schuljahr (verschlüsselt,
          gleiches Passwort). Bitte an einem zweiten Ort ablegen.
        </p>
        <button class="btn" [class.primary]="!backedUp()" type="button" (click)="backup()">
          <app-icon [name]="backedUp() ? 'circle-check' : 'download'" />
          {{ backedUp() ? 'Sicherungskopie erstellt' : 'Sicherungskopie herunterladen' }}
        </button>
      </section>

      <section class="card step">
        <h2><span class="nr">2</span> Klassen</h2>
        <p class="small">
          Neue Namen eintragen oder Klassen markieren, die die Schule verlassen – sie werden samt
          Schülern gelöscht.
        </p>
        <button class="btn small" type="button" (click)="suggestAll()">
          <app-icon name="wand-sparkles" /> Alle Klassennummern +1
        </button>
        <div class="class-list">
          @for (row of rows(); track row.id) {
            <div class="class-row" [class.leaves]="row.leaves">
              <span class="old">
                <strong>{{ row.name }}</strong>
                <span class="muted small">{{ row.studentCount }} Schüler</span>
              </span>
              <app-icon name="arrow-right" class="muted" />
              <input
                type="text"
                [ngModel]="row.newName"
                (ngModelChange)="update(row.id, { newName: $event })"
                [disabled]="row.leaves"
                [attr.aria-label]="'Neuer Name für ' + row.name"
              />
              <label class="leave">
                <input
                  type="checkbox"
                  [ngModel]="row.leaves"
                  (ngModelChange)="update(row.id, { leaves: $event })"
                />
                verlässt die Schule
              </label>
            </div>
          } @empty {
            <p class="muted small">Keine Klassen angelegt.</p>
          }
        </div>
      </section>

      <section class="card step">
        <h2><span class="nr">3</span> Daten des alten Schuljahres</h2>
        @if (counts(); as c) {
          <label class="option">
            <input
              type="checkbox"
              [ngModel]="deleteRecords()"
              (ngModelChange)="deleteRecords.set($event)"
            />
            <span>
              <strong>Leistungsdaten löschen</strong> (Löschfrist): {{ c.ratings }} Bewertungen,
              {{ c.participationOverrides }} von Hand gesetzte Stundennoten,
              {{ c.assessments }} Leistungsnachweise, {{ c.quarterGrades }} Quartalsnoten,
              {{ c.gradeChanges }} Protokolleinträge, {{ c.gradeReports }} vermerkte Notenbögen,
              {{ c.pastPeriods }} abgelaufene Zeiträume.
            </span>
          </label>
          <label class="option">
            <input
              type="checkbox"
              [ngModel]="clearTimetable()"
              (ngModelChange)="clearTimetable.set($event)"
            />
            <span>
              <strong>Stundenplan leeren</strong>: {{ c.timetableEntries }} Stunden – der neue kommt
              z. B. per WebUntis-Import.
            </span>
          </label>
        }
      </section>

      <section class="card step">
        <h2><span class="nr">4</span> Wechsel durchführen</h2>
        <ul class="small summary">
          @for (line of summary(); track line) {
            <li>{{ line }}</li>
          } @empty {
            <li class="muted">Nichts ausgewählt.</li>
          }
        </ul>
        @if (!backedUp()) {
          <p class="small warn-text">Zuerst die Sicherungskopie herunterladen (Schritt 1).</p>
        }
        <button
          class="btn danger"
          type="button"
          [disabled]="!backedUp() || summary().length === 0 || busy()"
          (click)="run()"
        >
          <app-icon name="refresh-cw" /> Schuljahreswechsel durchführen
        </button>
      </section>
    </div>
  `,
  styles: `
    .step h2 {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0;
      font-size: 1.05rem;
    }

    .nr {
      display: grid;
      place-items: center;
      width: 1.8rem;
      height: 1.8rem;
      border-radius: 50%;
      background: var(--accent-soft);
      color: var(--accent-text);
      font-size: 0.9rem;
    }

    .step.done .nr {
      background: var(--positive-soft);
      color: var(--positive);
    }

    .class-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-top: 0.6rem;
    }

    .class-row {
      display: grid;
      grid-template-columns: minmax(6rem, 1fr) auto minmax(7rem, 1fr);
      align-items: center;
      gap: 0.5rem;

      .old {
        display: flex;
        flex-direction: column;
      }

      .leave {
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.85rem;
      }

      &.leaves .old strong {
        text-decoration: line-through;
        color: var(--negative);
      }
    }

    .option {
      display: flex;
      gap: 0.6rem;
      align-items: flex-start;
      margin: 0.5rem 0;
      font-size: 0.9rem;

      input {
        margin-top: 0.25rem;
      }
    }

    .summary {
      margin: 0 0 0.75rem;
      padding-left: 1.2rem;
    }

    .warn-text {
      color: var(--warning-text);
    }
  `,
})
export class SchoolYearPage {
  private readonly api = inject(ApiService);
  private readonly vault = inject(VaultService);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);

  readonly rows = signal<ClassRow[]>([]);
  readonly counts = signal<SchoolYearCounts | null>(null);
  readonly backedUp = signal(false);
  readonly busy = signal(false);
  readonly deleteRecords = signal(true);
  readonly clearTimetable = signal(true);

  readonly summary = computed(() => {
    const lines: string[] = [];
    for (const row of this.rows()) {
      if (row.leaves) {
        lines.push(`${row.name} wird mit ${row.studentCount} Schülern gelöscht.`);
      } else if (row.newName.trim() && row.newName.trim() !== row.name) {
        lines.push(`${row.name} heißt künftig ${row.newName.trim()}.`);
      }
    }
    if (this.deleteRecords()) {
      lines.push('Alle Bewertungen, Leistungsnachweise, Noten und das Protokoll werden gelöscht.');
    }
    if (this.clearTimetable()) {
      lines.push('Der Stundenplan wird geleert.');
    }
    return lines;
  });

  constructor() {
    forkJoin({ classes: this.api.getClasses(), counts: this.api.getSchoolYearCounts() }).subscribe({
      next: ({ classes, counts }) => {
        this.rows.set(classes.map((c: SchoolClass) => this.toRow(c)));
        this.counts.set(counts);
      },
      error: (err) => this.toasts.error(err, 'Die Daten konnten nicht geladen werden.'),
    });
  }

  private toRow(c: SchoolClass): ClassRow {
    return { id: c.id, name: c.name, studentCount: c.studentCount, newName: c.name, leaves: false };
  }

  update(id: number, patch: Partial<ClassRow>): void {
    this.rows.update((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  suggestAll(): void {
    this.rows.update((rows) => rows.map((r) => ({ ...r, newName: nextClassName(r.name) })));
  }

  async backup(): Promise<void> {
    try {
      await this.vault.saveBackupCopy();
      this.backedUp.set(true);
      this.toasts.success('Sicherungskopie heruntergeladen.');
    } catch (error) {
      this.toasts.error(error, 'Die Sicherungskopie konnte nicht erstellt werden.');
    }
  }

  async run(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Schuljahreswechsel durchführen?',
      message:
        this.summary().join(' ') +
        ' Das lässt sich nur über die Sicherungskopie rückgängig machen.',
      confirmLabel: 'Durchführen',
      danger: true,
    });
    if (!ok) {
      return;
    }
    this.busy.set(true);
    const rows = this.rows();
    this.api
      .startNewSchoolYear({
        renames: rows.filter((r) => !r.leaves).map((r) => ({ classId: r.id, name: r.newName })),
        deleteClassIds: rows.filter((r) => r.leaves).map((r) => r.id),
        deleteRecords: this.deleteRecords(),
        clearTimetable: this.clearTimetable(),
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.toasts.success('Das neue Schuljahr ist eingerichtet.');
          void this.router.navigateByUrl('/einrichtung');
        },
        error: (err) => {
          this.busy.set(false);
          this.toasts.error(err, 'Der Schuljahreswechsel ist fehlgeschlagen.');
        },
      });
  }
}
