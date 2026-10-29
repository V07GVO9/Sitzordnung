import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FilePickerCancelled } from '../core/store/file-system';
import { isStrongPassword } from '../core/store/password-policy';
import { VaultService } from '../core/store/vault.service';
import { ToastService } from '../core/toast.service';
import { Icon } from '../core/ui/icon';
import { PasswordRules } from './password-rules';

/** Fenster zum Ändern des Passworts - aus dem Menü erreichbar. */
@Component({
  selector: 'app-change-password-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Icon, PasswordRules],
  template: `
    <dialog
      #dialog
      aria-labelledby="change-password-title"
      (cancel)="$event.preventDefault(); close()"
      (click)="onBackdropClick($event)"
    >
      @if (open()) {
        <form (ngSubmit)="submit()">
          <h2 id="change-password-title"><app-icon name="key-round" /> Passwort ändern</h2>

          <label>
            Bisheriges Passwort
            <input
              type="password"
              autocomplete="current-password"
              [ngModel]="current()"
              (ngModelChange)="current.set($event)"
              name="current"
              autofocus
            />
          </label>

          <label>
            Neues Passwort
            <input
              type="password"
              autocomplete="new-password"
              [ngModel]="next()"
              (ngModelChange)="next.set($event)"
              name="next"
            />
          </label>
          <app-password-rules [password]="next()" />

          <label>
            Neues Passwort wiederholen
            <input
              type="password"
              autocomplete="new-password"
              [ngModel]="repeat()"
              (ngModelChange)="repeat.set($event)"
              name="repeat"
            />
          </label>
          @if (repeat() !== '' && !matches()) {
            <p class="error">Die beiden Passwörter stimmen nicht überein.</p>
          }

          <p class="hint">
            Die Datei wird sofort mit dem neuen Passwort gespeichert. Ältere Sicherungskopien
            behalten ihr altes Passwort.
          </p>

          <div class="actions">
            <button class="btn" type="button" (click)="close()">Abbrechen</button>
            <button class="btn primary" type="submit" [disabled]="!canSubmit()">
              Ändern und speichern
            </button>
          </div>
        </form>
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

      dialog::backdrop {
        background: var(--backdrop);
        backdrop-filter: blur(2px);
      }

      form {
        display: grid;
        gap: 0.8rem;
        padding: 1.35rem;
      }

      h2 {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0;
        font-size: 1.05rem;
      }

      label {
        display: flex;
      }

      p {
        margin: 0;
        font-size: 0.85rem;
      }

      .hint {
        color: var(--text-muted);
      }

      .error {
        color: var(--negative);
      }

      .actions {
        display: flex;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
    `,
  ],
})
export class ChangePasswordDialog {
  private readonly vault = inject(VaultService);
  private readonly toasts = inject(ToastService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  readonly current = signal('');
  readonly next = signal('');
  readonly repeat = signal('');
  readonly busy = signal(false);

  readonly matches = computed(() => this.next() === this.repeat());
  readonly canSubmit = computed(
    () => !this.busy() && this.current() !== '' && isStrongPassword(this.next()) && this.matches(),
  );

  constructor() {
    effect(() => {
      const dialog = this.dialog().nativeElement;
      if (this.open()) {
        if (!dialog.open) {
          dialog.showModal();
        }
      } else if (dialog.open) {
        dialog.close();
      }
    });
  }

  async submit(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }

    this.busy.set(true);
    try {
      await this.vault.changePassword(this.current(), this.next());
      this.toasts.success('Das Passwort wurde geändert und der Bestand gespeichert.');
      this.close();
    } catch (error) {
      if (!(error instanceof FilePickerCancelled)) {
        this.toasts.error(error, 'Das Passwort konnte nicht geändert werden.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  /** Schließt das Fenster und vergisst alle Eingaben. */
  close(): void {
    this.current.set('');
    this.next.set('');
    this.repeat.set('');
    this.closed.emit();
  }

  /** Ein Klick auf die abgedunkelte Fläche neben dem Fenster bricht ab. */
  onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement && !this.busy()) {
      this.close();
    }
  }
}
