import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';

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
   * Zeigt die Meldung der API an. Das Backend antwortet bei Regelverstößen mit
   * einem verständlichen Text, der hier direkt angezeigt wird.
   */
  error(error: unknown, fallback = 'Es ist ein Fehler aufgetreten.'): void {
    this.show(this.describe(error, fallback), 'error', 6000);
  }

  private describe(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }

    if (error.status === 0) {
      return 'Der Server ist nicht erreichbar. Läuft das Backend?';
    }

    const body = error.error;

    if (typeof body === 'string' && body.trim()) {
      return body;
    }

    // Antwortet ASP.NET Core mit einem Validierungsfehler, steckt der Text in "errors".
    if (body?.errors && typeof body.errors === 'object') {
      const messages = Object.values(body.errors as Record<string, string[]>).flat();
      if (messages.length) {
        return messages.join(' ');
      }
    }

    if (typeof body?.title === 'string') {
      return body.title;
    }

    return fallback;
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
