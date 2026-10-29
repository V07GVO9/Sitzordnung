import { Injectable, signal } from '@angular/core';
import { AppError } from './store/app-error';
import { VaultFormatError, VaultPasswordError } from './store/vault-crypto';

/** Ein Knopf in der Meldung, etwa „Rückgängig“. */
export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'error';
  action?: ToastAction;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;

  readonly toasts = signal<Toast[]>([]);

  /** Zeigt eine Meldung und gibt ihre Id zurück, damit sie sich vorzeitig schließen lässt. */
  show(
    text: string,
    kind: Toast['kind'] = 'info',
    durationMs = 3500,
    action?: ToastAction,
  ): number {
    const toast: Toast = { id: this.nextId++, text, kind, action };
    // Mehr als drei Meldungen auf einmal liest niemand - die ältesten weichen.
    this.toasts.update((list) => [...list.slice(-2), toast]);
    setTimeout(() => this.dismiss(toast.id), durationMs);
    return toast.id;
  }

  /** Führt die Aktion einer Meldung aus und schließt sie. */
  runAction(toast: Toast): void {
    this.dismiss(toast.id);
    toast.action?.run();
  }

  success(text: string): void {
    this.show(text, 'success');
  }

  /**
   * Zeigt die Meldung an, die zum Fehler gehört. Fachliche Fehler bringen
   * einen verständlichen Text mit, der direkt angezeigt wird.
   */
  error(error: unknown, fallback = 'Es ist ein Fehler aufgetreten.'): void {
    this.show(this.describe(error, fallback), 'error', 6000);
  }

  private describe(error: unknown, fallback: string): string {
    if (error instanceof AppError) {
      return error.message;
    }

    if (error instanceof VaultPasswordError || error instanceof VaultFormatError) {
      return error.message;
    }

    return fallback;
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
