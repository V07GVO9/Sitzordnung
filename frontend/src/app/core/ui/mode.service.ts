import { Injectable, computed, signal } from '@angular/core';

/** Unterricht: Wochenplan und Bewerten. Einrichten: Klassen, Schüler, Stundenplan & Co. */
export type AppMode = 'unterricht' | 'einrichten';

const STORAGE_KEY = 'sitzordnung.mode';

/**
 * Der Modus der Oberfläche. Eingerichtet wird selten - einmal zum Schuljahr -,
 * bewertet jeden Tag. Deshalb startet die App im Unterricht, und das Einrichten
 * liegt bewusst etwas versteckt im Menü. Die Wahl gilt je Gerät.
 */
@Injectable({ providedIn: 'root' })
export class ModeService {
  readonly mode = signal<AppMode>(readMode());

  readonly isSetup = computed(() => this.mode() === 'einrichten');

  set(mode: AppMode): void {
    this.mode.set(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Ohne Speicher gilt die Wahl nur bis zum Neuladen.
    }
  }
}

function readMode(): AppMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'einrichten' ? 'einrichten' : 'unterricht';
  } catch {
    return 'unterricht';
  }
}
