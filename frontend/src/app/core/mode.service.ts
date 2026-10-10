import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

/**
 * Die App kennt zwei Arbeitsweisen:
 * - Unterricht: bewerten, Stundenplan ansehen, auswerten. Nichts lässt sich
 *   versehentlich umbauen.
 * - Bearbeiten: Klassen, Schüler, Stundenplan, Sitzpläne und Einstellungen
 *   einrichten. Das passiert selten und wird bewusst eingeschaltet.
 */
export type AppMode = 'unterricht' | 'bearbeiten';

const STORAGE_KEY = 'sitzordnung.mode';

@Injectable({ providedIn: 'root' })
export class ModeService {
  readonly mode = signal<AppMode>(this.readStored());
  readonly isEdit = computed(() => this.mode() === 'bearbeiten');

  /** Wechsel in den Bearbeitungsmodus - nur nach Rückfrage. */
  requestEdit(): boolean {
    if (this.isEdit()) {
      return true;
    }
    const ok = confirm(
      'Bearbeitungsmodus starten?\n\n' +
        'Darin werden Klassen, Schüler, Stundenplan, Sitzpläne und Einstellungen geändert. ' +
        'Bewerten ist in dieser Zeit nicht möglich.',
    );
    if (ok) {
      this.set('bearbeiten');
    }
    return ok;
  }

  /** Zurück in den Unterricht - jederzeit ohne Rückfrage. */
  finishEdit(): void {
    this.set('unterricht');
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

/** Einrichtungsseiten gibt es nur im Bearbeitungsmodus. */
export const editModeGuard: CanActivateFn = () =>
  inject(ModeService).isEdit() || inject(Router).createUrlTree(['/']);
