import { Injectable, computed, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';
import { LocalStore } from '../store/local-store';
import { ToastService } from '../toast.service';
import { ConfirmService } from './confirm.service';

/** Das Ereignis, mit dem Chrome und Edge die Installation anbieten. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Alles rund um die installierte App: der Knopf „Als App installieren“ und
 * der Hinweis, wenn eine neue Version bereitliegt.
 *
 * Der Service Worker legt nur die Programmdateien ab, nie Daten - die stehen
 * weiterhin ausschließlich in der verschlüsselten Datei.
 */
@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly updates = inject(SwUpdate);
  private readonly store = inject(LocalStore);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  private readonly installPrompt = signal<InstallPromptEvent | null>(null);

  /** Bietet der Browser die Installation gerade an? */
  readonly canInstall = computed(() => this.installPrompt() !== null);

  constructor() {
    window.addEventListener('beforeinstallprompt', (event) => {
      // Statt der Leiste des Browsers bietet die App den Knopf selbst an.
      event.preventDefault();
      this.installPrompt.set(event as InstallPromptEvent);
    });

    window.addEventListener('appinstalled', () => {
      this.installPrompt.set(null);
      this.toasts.success('Die App ist installiert.');
    });

    if (this.updates.isEnabled) {
      this.updates.versionUpdates
        .pipe(filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'))
        .subscribe(() =>
          this.toasts.show('Eine neue Version der App ist bereit.', 'info', 15_000, {
            label: 'Neu laden',
            run: () => void this.reload(),
          }),
        );
    }
  }

  async install(): Promise<void> {
    const prompt = this.installPrompt();
    if (!prompt) {
      return;
    }

    await prompt.prompt();
    await prompt.userChoice;
    // Das Ereignis lässt sich nur einmal verwenden.
    this.installPrompt.set(null);
  }

  /** Nach dem Neuladen muss die Datei wieder geöffnet werden - darauf wird hingewiesen. */
  private async reload(): Promise<void> {
    if (this.store.isOpen()) {
      const confirmed = await this.confirm.ask({
        title: 'Jetzt neu laden?',
        message: this.store.hasUnsavedChanges()
          ? 'Es gibt ungespeicherte Änderungen – bitte vorher speichern. Nach dem Neuladen muss die Datei erneut geöffnet werden.'
          : 'Nach dem Neuladen muss die Datei erneut mit dem Passwort geöffnet werden.',
        confirmLabel: 'Neu laden',
        danger: this.store.hasUnsavedChanges(),
      });
      if (!confirmed) {
        return;
      }
    }

    await this.updates.activateUpdate();
    document.location.reload();
  }
}
