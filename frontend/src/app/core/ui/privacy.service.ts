import { Injectable, effect, signal } from '@angular/core';

const STORAGE_KEY = 'sitzordnung.datenschutz';

/**
 * Datenschutz-Modus, etwa wenn der Bildschirm am Beamer hängt: Namen und
 * Fotos werden unkenntlich. Die Wahl gilt je Gerät.
 */
@Injectable({ providedIn: 'root' })
export class PrivacyService {
  readonly on = signal(PrivacyService.read());

  constructor() {
    effect(() => {
      const on = this.on();
      document.documentElement.classList.toggle('privacy', on);
      try {
        localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
      } catch {
        // Ohne Speicher gilt die Wahl nur bis zum Neuladen.
      }
    });
  }

  toggle(): void {
    this.on.update((on) => !on);
  }

  private static read(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }
}
