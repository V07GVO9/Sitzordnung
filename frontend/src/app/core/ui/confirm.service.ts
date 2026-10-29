import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Rot hervorgehoben - für Löschen und alles, was sich nicht zurücknehmen lässt. */
  danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

/**
 * Rückfragen im Stil der App statt des grauen Browserfensters.
 * Aufruf: `if (await confirm.ask({ title: '…', danger: true })) { … }`
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly pending = signal<PendingConfirm | null>(null);

  ask(options: ConfirmOptions): Promise<boolean> {
    // Eine offene Rückfrage gilt als abgelehnt, wenn eine neue kommt.
    this.pending()?.resolve(false);

    return new Promise((resolve) => this.pending.set({ ...options, resolve }));
  }

  answer(confirmed: boolean): void {
    const pending = this.pending();
    if (pending) {
      this.pending.set(null);
      pending.resolve(confirmed);
    }
  }
}
