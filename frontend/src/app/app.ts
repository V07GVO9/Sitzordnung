import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ApiService } from './core/api.service';
import { CurrentLesson } from './core/models';
import { FilePickerCancelled } from './core/store/file-system';
import { LocalStore } from './core/store/local-store';
import { VaultService } from './core/store/vault.service';
import { ToastHost } from './core/toast-host';
import { ToastService } from './core/toast.service';
import { VaultGate } from './vault/vault-gate';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastHost, VaultGate],
  template: `
    @if (!isOpen()) {
      <app-vault-gate />
      <app-toast-host />
    } @else {
    <header class="topbar">
      <a class="brand" routerLink="/">
        <span class="brand-mark">SO</span>
        <span>
          <strong>Sitzordnung</strong>
          <span class="brand-sub">Mitarbeitsnoten im Unterricht</span>
        </span>
      </a>

      <nav>
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
          Unterricht
        </a>
        <a routerLink="/verwaltung" routerLinkActive="active">Klassen &amp; Schüler</a>
        <a routerLink="/stundenplan" routerLinkActive="active">Stundenplan</a>
        <a routerLink="/auswertung" routerLinkActive="active">Auswertung</a>
      </nav>

      <div class="vault" [class.dirty]="hasUnsavedChanges()">
        <span class="file" [title]="fileName() ?? 'Noch keine Datei gewählt'">
          {{ fileName() ?? 'Ohne Datei' }}
        </span>
        <span class="muted small">
          @if (isSaving()) {
            speichert …
          } @else if (hasUnsavedChanges()) {
            nicht gespeichert
          } @else {
            gespeichert
          }
        </span>
        <button class="btn small primary" type="button" [disabled]="isSaving()" (click)="save()">
          Speichern
        </button>
        <button class="btn small" type="button" (click)="closeVault()">Schließen</button>
      </div>

      <div class="now" [class.live]="lesson()?.hasLesson">
        @if (lesson(); as l) {
          @if (l.hasLesson) {
            <span class="dot"></span>
            {{ l.subjectName }} · {{ l.schoolClassName }}
            <span class="muted small">bis {{ l.endTime }}</span>
          } @else {
            <span class="muted small">Gerade kein Unterricht</span>
          }
        }
      </div>
    </header>

    <main>
      <router-outlet />
    </main>

    <app-toast-host />
    }
  `,
  styles: [
    `
      .topbar {
        display: flex;
        align-items: center;
        gap: 1.5rem;
        flex-wrap: wrap;
        padding: 0.75rem 1.5rem;
        background: var(--surface);
        border-bottom: 1px solid var(--border);
        box-shadow: var(--shadow);
        position: sticky;
        top: 0;
        z-index: 20;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        text-decoration: none;
        color: var(--text);
      }

      .brand-mark {
        display: grid;
        place-items: center;
        width: 2.2rem;
        height: 2.2rem;
        border-radius: 0.55rem;
        background: var(--accent);
        color: #fff;
        font-weight: 700;
        font-size: 0.85rem;
      }

      .brand span {
        display: block;
      }

      .brand-sub {
        font-size: 0.75rem;
        color: var(--text-muted);
      }

      nav {
        display: flex;
        gap: 0.25rem;
        flex-wrap: wrap;
      }

      nav a {
        padding: 0.4rem 0.75rem;
        border-radius: 0.45rem;
        text-decoration: none;
        color: var(--text-muted);
        font-weight: 500;
      }

      nav a:hover {
        background: var(--surface-muted);
        color: var(--text);
      }

      nav a.active {
        background: var(--accent-soft);
        color: var(--accent-dark);
      }

      .vault {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.3rem 0.3rem 0.3rem 0.7rem;
        border-radius: 999px;
        border: 1px solid var(--border);
        font-size: 0.85rem;
      }

      .vault.dirty {
        background: var(--warning-soft);
        border-color: #e8cf9d;
      }

      .vault .file {
        max-width: 12rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 500;
      }

      .now {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.9rem;
        padding: 0.35rem 0.7rem;
        border-radius: 999px;
        border: 1px solid var(--border);
      }

      .now.live {
        background: var(--positive-soft);
        border-color: #b6e0c6;
        color: #14512e;
      }

      .dot {
        width: 0.55rem;
        height: 0.55rem;
        border-radius: 50%;
        background: var(--positive);
      }

      main {
        max-width: 1400px;
        margin: 0 auto;
        padding: 1.5rem;
      }
    `,
  ],
})
export class App implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly store = inject(LocalStore);
  private readonly vault = inject(VaultService);
  private readonly toasts = inject(ToastService);

  readonly lesson = signal<CurrentLesson | null>(null);

  readonly isOpen = this.store.isOpen;
  readonly hasUnsavedChanges = this.store.hasUnsavedChanges;
  readonly fileName = this.vault.fileName;
  readonly isSaving = this.vault.isSaving;

  /** Die Anzeige der laufenden Stunde aktualisiert sich selbst. */
  private readonly timer = setInterval(() => this.refresh(), 60_000);

  constructor() {
    this.refresh();

    // Nach dem Bearbeiten des Stundenplans soll die Anzeige sofort stimmen,
    // nicht erst beim nächsten Takt.
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.refresh());
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  /** Schreibt den Datenbestand in die Datei. */
  async save(): Promise<void> {
    try {
      await this.vault.save();
      this.toasts.success('Gespeichert.');
    } catch (error) {
      if (!(error instanceof FilePickerCancelled)) {
        this.toasts.error(error, 'Der Datenbestand konnte nicht gespeichert werden.');
      }
    }
  }

  /** Schließt den Bestand - danach fragt die App wieder nach der Datei. */
  async closeVault(): Promise<void> {
    if (this.hasUnsavedChanges()) {
      const confirmed = confirm(
        'Es gibt ungespeicherte Änderungen. Wirklich schließen? Sie gehen dabei verloren.',
      );
      if (!confirmed) {
        return;
      }
    }

    await this.vault.closeVault();
    await this.router.navigateByUrl('/');
  }

  private refresh(): void {
    if (!this.store.isOpen()) {
      this.lesson.set(null);
      return;
    }

    this.api.getCurrentLesson().subscribe({
      next: (lesson) => this.lesson.set(lesson),
      error: () => this.lesson.set(null),
    });
  }
}
