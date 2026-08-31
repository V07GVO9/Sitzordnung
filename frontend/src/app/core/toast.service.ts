import { Injectable, signal } from '@angular/core';
import { AppError } from './store/app-error';
import { VaultFormatError, VaultPasswordError } from './store/vault-crypto';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'error';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;

  readonly toasts = signal<Toast[]>([]);

  show(text: string, kind: Toast['kind'] = 'info', durationMs = 3500): void {
    const toast: Toast = { id: this.nextId++, text, kind };
    this.toasts.update((list) => [...list, toast]);
    setTimeout(() => this.dismiss(toast.id), durationMs);
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
