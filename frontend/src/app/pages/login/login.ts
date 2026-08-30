import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  readonly loading = signal(true);
  readonly isSetUp = signal(false);
  readonly submitting = signal(false);

  password = '';
  passwordRepeat = '';

  constructor() {
    this.auth.status().subscribe({
      next: (status) => {
        if (status.isAuthenticated) {
          this.router.navigateByUrl('/');
          return;
        }
        this.isSetUp.set(status.isSetUp);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  submit(): void {
    if (this.isSetUp()) {
      this.login();
    } else {
      this.setup();
    }
  }

  private login(): void {
    if (!this.password) {
      return;
    }

    this.submitting.set(true);
    this.auth.login(this.password).subscribe({
      next: () => this.router.navigateByUrl('/'),
      error: () => {
        this.submitting.set(false);
        this.toasts.show('Kennwort ist falsch.', 'error');
      },
    });
  }

  private setup(): void {
    if (this.password.length < 8) {
      this.toasts.show('Das Kennwort muss mindestens 8 Zeichen lang sein.', 'error');
      return;
    }
    if (this.password !== this.passwordRepeat) {
      this.toasts.show('Die beiden Kennwörter stimmen nicht überein.', 'error');
      return;
    }

    this.submitting.set(true);
    this.auth.setup(this.password).subscribe({
      next: () => this.router.navigateByUrl('/'),
      error: () => {
        this.submitting.set(false);
        this.toasts.show('Die Ersteinrichtung ist fehlgeschlagen.', 'error');
      },
    });
  }
}
