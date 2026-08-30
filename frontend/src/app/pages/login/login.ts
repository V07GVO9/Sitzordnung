import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
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
  private readonly route = inject(ActivatedRoute);
  private readonly toasts = inject(ToastService);

  readonly username = signal('');
  readonly password = signal('');
  readonly stayLoggedIn = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  submit(): void {
    if (this.busy()) {
      return;
    }

    this.busy.set(true);
    this.error.set(null);

    this.auth.login(this.username().trim(), this.password(), this.stayLoggedIn()).subscribe({
      next: (user) => {
        this.busy.set(false);

        // Nach dem Anmelden dorthin, wo die Lehrkraft eigentlich hinwollte.
        const weiter = this.route.snapshot.queryParamMap.get('weiter');
        const ziel = weiter && !weiter.startsWith('/anmelden') ? weiter : '/';

        if (user.mustChangePassword) {
          this.toasts.show('Bitte vergeben Sie jetzt ein eigenes Passwort.', 'error', 8000);
          this.router.navigate(['/konto']);
          return;
        }

        this.router.navigateByUrl(ziel);
      },
      error: (err) => {
        this.busy.set(false);

        if (err?.status === 429) {
          this.error.set('Zu viele Versuche. Bitte warten Sie ein paar Minuten.');
        } else if (err?.status === 0) {
          this.error.set('Der Server ist nicht erreichbar.');
        } else {
          this.error.set('Benutzername oder Passwort stimmt nicht.');
        }
      },
    });
  }
}
