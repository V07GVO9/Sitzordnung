import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ConfirmService } from './ui/confirm.service';

/**
 * Die App kennt zwei Arbeitsweisen:
 * - Unterricht: bewerten, Stundenplan ansehen, auswerten. Nichts lässt sich
 *   versehentlich umbauen.
 * - Bearbeiten: Klassen, Schüler, Stundenplan, Sitzpläne und Einstellungen
 *   einrichten. Das passiert selten und wird bewusst eingeschaltet.
 */
export type AppMode = 'unterricht' | 'bearbeiten';

const STORAGE_KEY = 'sitzordnung.mode';

/** Seiten, die es nur im Bearbeitungsmodus gibt. */
const EDIT_ONLY_PATHS = ['/verwaltung', '/stundenplan'];

@Injectable({ providedIn: 'root' })
export class ModeService {
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);

  readonly mode = signal<AppMode>(this.readStored());
  readonly isEdit = computed(() => this.mode() === 'bearbeiten');

  /** Wechsel in den Bearbeitungsmodus - nur nach Rückfrage. */
  async requestEdit(): Promise<boolean> {
    if (this.isEdit()) {
      return true;
    }
    const ok = await this.confirm.ask({
      title: 'Bearbeitungsmodus starten?',
      message:
        'Darin werden Klassen, Schüler, Stundenplan, Sitzpläne und Einstellungen geändert. ' +
        'Bewerten ist in dieser Zeit aus.',
      confirmLabel: 'Bearbeiten',
    });
    if (ok) {
      this.set('bearbeiten');
    }
    return ok;
  }

  /** Zurück in den Unterricht - jederzeit ohne Rückfrage. */
  finishEdit(): void {
    this.set('unterricht');
    const path = this.router.url.split('?')[0];
    if (EDIT_ONLY_PATHS.some((p) => path.startsWith(p))) {
      void this.router.navigateByUrl('/');
    }
  }

  private set(mode: AppMode): void {
    this.mode.set(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Ohne Speicher gilt der Modus eben nur bis zum Neuladen.
    }
  }

  private readStored(): AppMode {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'bearbeiten' ? 'bearbeiten' : 'unterricht';
    } catch {
      return 'unterricht';
    }
  }
}

/**
 * Einrichtungsseiten gibt es nur im Bearbeitungsmodus. Führt ein Link im
 * Unterricht dorthin, fragt die App, ob in den Bearbeitungsmodus gewechselt
 * werden soll.
 */
export const editModeGuard: CanActivateFn = async () => {
  const mode = inject(ModeService);
  const router = inject(Router);
  return (await mode.requestEdit()) || (router.navigated ? false : router.createUrlTree(['/']));
};
