import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from './toast.service';
import { Icon } from './ui/icon';

@Component({
  selector: 'app-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div class="toast-host" role="status" aria-live="polite">
      @for (toast of toasts.toasts(); track toast.id) {
        <div class="toast" [class]="toast.kind">
          <app-icon
            class="kind"
            [name]="
              toast.kind === 'error'
                ? 'triangle-alert'
                : toast.kind === 'success'
                  ? 'circle-check'
                  : 'info'
            "
          />
          <span class="text">{{ toast.text }}</span>
          @if (toast.action; as action) {
            <button class="action" type="button" (click)="toasts.runAction(toast)">
              <app-icon name="undo-2" /> {{ action.label }}
            </button>
          }
          <button
            class="close"
            type="button"
            aria-label="Meldung schließen"
            (click)="toasts.dismiss(toast.id)"
          >
            <app-icon name="x" />
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* Unten über der Reiterleiste, ab Desktop rechts. */
      .toast-host {
        position: fixed;
        left: 50%;
        bottom: calc(var(--bottom-nav) + 0.75rem + env(safe-area-inset-bottom));
        transform: translateX(-50%);
        z-index: 100;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 0.5rem;
        width: min(30rem, calc(100vw - 1.5rem));
        pointer-events: none;
      }

      @media (min-width: 64rem) {
        .toast-host {
          left: auto;
          right: 1.25rem;
          transform: none;
        }
      }

      .toast {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        padding: 0.65rem 0.5rem 0.65rem 0.9rem;
        border-radius: var(--radius);
        /* Bewusst in beiden Darstellungen dunkel - hebt sich immer ab. */
        background: #1e2230;
        color: #f3f4f6;
        border: 1px solid rgb(255 255 255 / 8%);
        box-shadow: var(--shadow-lg);
        font-size: 0.92rem;
        pointer-events: auto;
        animation: slide-in 0.18s ease-out;
      }

      .kind {
        font-size: 1.05rem;
        color: #a5b4fc;
      }

      .toast.success .kind {
        color: #4ade80;
      }

      .toast.error .kind {
        color: #f87171;
      }

      .text {
        flex: 1;
        min-width: 0;
      }

      button {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        flex: none;
        border: 0;
        background: transparent;
        color: inherit;
        border-radius: 0.45rem;
      }

      .action {
        padding: 0.4rem 0.7rem;
        font-weight: 650;
        color: #a5b4fc;

        &:hover {
          background: rgb(255 255 255 / 10%);
        }
      }

      .close {
        padding: 0.35rem;
        opacity: 0.6;

        &:hover {
          opacity: 1;
        }
      }

      @keyframes slide-in {
        from {
          opacity: 0;
          transform: translateY(0.6rem) scale(0.98);
        }
      }
    `,
  ],
})
export class ToastHost {
  readonly toasts = inject(ToastService);
}
