import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-host" role="status" aria-live="polite">
      @for (toast of toasts.toasts(); track toast.id) {
        <div class="toast" [class]="toast.kind" (click)="toasts.dismiss(toast.id)">
          {{ toast.text }}
        </div>
      }
    </div>
  `,
  styles: [
    `
      .toast-host {
        position: fixed;
        right: 1rem;
        bottom: 1rem;
        z-index: 100;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        max-width: min(30rem, calc(100vw - 2rem));
      }

      .toast {
        padding: 0.75rem 1rem;
        border-radius: 0.6rem;
        background: var(--surface);
        border: 1px solid var(--border);
        border-left: 4px solid var(--accent);
        box-shadow: var(--shadow-lg);
        cursor: pointer;
        font-size: 0.9rem;
        animation: slide-in 0.15s ease-out;
      }

      .toast.success {
        border-left-color: var(--positive);
      }

      .toast.error {
        border-left-color: var(--negative);
      }

      @keyframes slide-in {
        from {
          opacity: 0;
          transform: translateY(0.5rem);
        }
      }
    `,
  ],
})
export class ToastHost {
  readonly toasts = inject(ToastService);
}
