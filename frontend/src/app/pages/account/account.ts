import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-account',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './account.html',
  styleUrl: './account.scss',
})
export class AccountPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  readonly user = this.auth.user;

  readonly currentPassword = signal('');
  readonly newPassword = signal('');
  readonly repeatPassword = signal('');
  readonly busy = signal(false);

  /** Muss zur Prüfung im Backend passen. */
  readonly minLength = 10;

  get problem(): string | null {
    if (this.newPassword().length < this.minLength) {
      return `Das neue Passwort muss mindestens ${this.minLength} Zeichen lang sein.`;
    }
    if (this.newPassword() !== this.repeatPassword()) {
      return 'Die beiden neuen Passwörter stimmen nicht überein.';
    }
    return null;
  }

  submit(): void {
    if (this.busy() || this.problem) {
      return;
    }

    this.busy.set(true);

    this.auth.changePassword(this.currentPassword(), this.newPassword()).subscribe({
      next: () => {
        this.busy.set(false);
        this.currentPassword.set('');
        this.newPassword.set('');
        this.repeatPassword.set('');
        this.toasts.success('Das Passwort wurde geändert.');
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.busy.set(false);
        this.toasts.error(err, 'Das Passwort konnte nicht geändert werden.');
      },
    });
  }
}
