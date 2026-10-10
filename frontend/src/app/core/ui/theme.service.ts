import { Injectable, effect, signal } from '@angular/core';

/** Hell, dunkel oder wie im Betriebssystem eingestellt. */
export type ThemeChoice = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'sitzordnung.theme';

/**
 * Merkt sich die gewählte Darstellung je Gerät. Das ist eine Vorliebe des
 * Geräts, kein Teil des Datenbestands - sie liegt deshalb im Browser und
 * nicht in der verschlüsselten Datei.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly choice = signal<ThemeChoice>(readChoice());

  constructor() {
    effect(() => {
      const choice = this.choice();
      const root = document.documentElement;

      if (choice === 'system') {
        root.removeAttribute('data-theme');
      } else {
        root.setAttribute('data-theme', choice);
      }

      try {
        localStorage.setItem(STORAGE_KEY, choice);
      } catch {
        // Ohne Speicher (privates Fenster) gilt die Wahl nur bis zum Neuladen.
      }
    });
  }

  /** Reihum: System → Hell → Dunkel → System. */
  cycle(): void {
    const order: ThemeChoice[] = ['system', 'light', 'dark'];
    this.choice.update((current) => order[(order.indexOf(current) + 1) % order.length]);
  }
}

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // Kein Zugriff auf den Speicher - dann gilt die Systemeinstellung.
  }

  return 'system';
}
