import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { ConfirmService } from './confirm.service';
import { Icon } from './icon';

/**
 * Zeigt die Rückfragen des ConfirmService als modales Fenster. Das native
 * <dialog> sorgt für Fokusfalle, Escape und die Abdunklung dahinter.
 */
@Component({
  selector: 'app-confirm-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <dialog
      #dialog
      aria-labelledby="confirm-title"
      (cancel)="$event.preventDefault(); confirm.answer(false)"
      (click)="onBackdropClick($event)"
    >
      @if (confirm.pending(); as p) {
        <div class="body">
          <span class="icon" [class.danger]="p.danger">
            <app-icon [name]="p.danger ? 'triangle-alert' : 'info'" />
          </span>
          <div>
            <h2 id="confirm-title">{{ p.title }}</h2>
            @if (p.message) {
              <p>{{ p.message }}</p>
            }
          </div>
        </div>
        <div class="actions">
          <button class="btn" type="button" (click)="confirm.answer(false)">
            {{ p.cancelLabel ?? 'Abbrechen' }}
          </button>
          <button
            class="btn"
            [class.primary]="!p.danger"
            [class.danger]="p.danger"
            [class.solid]="p.danger"
            type="button"
            autofocus
            (click)="confirm.answer(true)"
          >
            {{ p.confirmLabel ?? 'OK' }}
          </button>
        </div>
      }
    </dialog>
  `,
  styles: [
    `
      dialog {
        width: min(27rem, calc(100vw - 2rem));
        padding: 0;
        border: 1px solid var(--border);
        border-radius: calc(var(--radius) + 0.25rem);
        background: var(--surface);
        color: var(--text);
        box-shadow: var(--shadow-lg);
      }

      dialog[open] {
        animation: pop 0.16s ease-out;
      }

      dialog::backdrop {
        background: var(--backdrop);
        backdrop-filter: blur(2px);
      }

      .body {
        display: flex;
        gap: 0.9rem;
        padding: 1.35rem 1.35rem 1rem;
      }

      .icon {
        display: grid;
        place-items: center;
        flex: none;
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 50%;
        background: var(--accent-soft);
        color: var(--accent-text);
        font-size: 1.15rem;

        &.danger {
          background: var(--negative-soft);
          color: var(--negative);
        }
      }

      h2 {
        margin: 0.35rem 0 0.4rem;
        font-size: 1.05rem;
      }

      p {
        margin: 0;
        color: var(--text-muted);
        font-size: 0.92rem;
      }

      .actions {
        display: flex;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: 0.5rem;
        padding: 0.85rem 1.35rem 1.2rem;
      }

      @keyframes pop {
        from {
          opacity: 0;
          transform: translateY(0.5rem) scale(0.97);
        }
      }
    `,
  ],
})
export class ConfirmHost {
  readonly confirm = inject(ConfirmService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const dialog = this.dialog().nativeElement;
      if (this.confirm.pending()) {
        if (!dialog.open) {
          dialog.showModal();
        }
      } else if (dialog.open) {
        dialog.close();
      }
    });
  }

  /** Ein Klick auf die abgedunkelte Fläche neben dem Fenster bricht ab. */
  onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) {
      this.confirm.answer(false);
    }
  }
}
