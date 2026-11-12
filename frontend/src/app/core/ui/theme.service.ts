import { Injectable, effect, signal } from '@angular/core';
import { readPreference, writePreference } from './preference';

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

      writePreference(STORAGE_KEY, choice);
    });
  }

  /** Reihum: System → Hell → Dunkel → System. */
  cycle(): void {
    const order: ThemeChoice[] = ['system', 'light', 'dark'];
    this.choice.update((current) => order[(order.indexOf(current) + 1) % order.length]);
  }
}

function readChoice(): ThemeChoice {
  const stored = readPreference(STORAGE_KEY);
  // Ohne gespeicherte Wahl gilt die Systemeinstellung.
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}
