import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ApiService } from './core/api.service';
import { AuthService } from './core/auth.service';
import { CurrentLesson } from './core/models';
import { ToastHost } from './core/toast-host';
import { ToastService } from './core/toast.service';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastHost],
  template: `
    @if (auth.isSignedIn()) {
      <header class="topbar">
        <a class="brand" routerLink="/">
          <span class="brand-mark">SO</span>
          <span>
            <strong>Sitzordnung</strong>
            <span class="brand-sub">Mitarbeitsnoten im Unterricht</span>
          </span>
        </a>

        <nav>
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
            Stundenplan
          </a>
        </nav>

        <div class="now" [class.live]="lesson()?.hasLesson">
          @if (lesson(); as l) {
            @if (l.hasLesson) {
              <span class="dot"></span>
              {{ l.subjectName }} · {{ l.schoolClassName }}
              <span class="muted small">bis {{ l.endTime }}</span>
            } @else {
              <span class="muted small">Gerade kein Unterricht</span>
            }
          }
        </div>

        <!-- Was selten gebraucht wird, liegt hinter diesem Menü. -->
        <div class="menue">
          <button
            class="btn"
            type="button"
            [attr.aria-expanded]="menueOffen()"
            (click)="menueOffen.set(!menueOffen())"
          >
            Einstellungen ▾
          </button>

          @if (menueOffen()) {
            <div class="menue-liste" role="menu">
              <a routerLink="/unterricht" (click)="menueOffen.set(false)">Unterricht</a>
              <a routerLink="/verwaltung" (click)="menueOffen.set(false)">Klassen &amp; Schüler</a>
              <a routerLink="/auswertung" (click)="menueOffen.set(false)">Auswertung</a>
              <hr />
              <a routerLink="/konto" (click)="menueOffen.set(false)">
                Konto ({{ auth.user()?.username }})
              </a>
              <button type="button" (click)="logout()">Abmelden</button>
            </div>
          }
        </div>
      </header>
    }

    <main [class.weit]="auth.isSignedIn()">
      <router-outlet />
    </main>

    <app-toast-host />
  `,
  styles: [
    `
      .topbar {
        display: flex;
        align-items: center;
        gap: 1.25rem;
        flex-wrap: wrap;
        padding: 0.75rem 1.5rem;
        background: var(--surface);
        border-bottom: 1px solid var(--border);
        box-shadow: var(--shadow);
        position: sticky;
        top: 0;
        z-index: 20;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        text-decoration: none;
        color: var(--text);
      }

      .brand-mark {
        display: grid;
        place-items: center;
        width: 2.2rem;
        height: 2.2rem;
        border-radius: 0.55rem;
        background: var(--accent);
        color: #fff;
        font-weight: 700;
        font-size: 0.85rem;
      }

      .brand span {
        display: block;
      }

      .brand-sub {
        font-size: 0.75rem;
        color: var(--text-muted);
      }

      nav {
        display: flex;
        gap: 0.25rem;
        flex-wrap: wrap;
      }

      nav a {
        padding: 0.4rem 0.75rem;
        border-radius: 0.45rem;
        text-decoration: none;
        color: var(--text-muted);
        font-weight: 500;
      }

      nav a:hover {
        background: var(--surface-muted);
        color: var(--text);
      }

      nav a.active {
        background: var(--accent-soft);
        color: var(--accent-dark);
      }

      .now {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.9rem;
        padding: 0.35rem 0.7rem;
        border-radius: 999px;
        border: 1px solid var(--border);
      }

      .now.live {
        background: var(--positive-soft);
        border-color: #b6e0c6;
        color: #14512e;
      }

      .dot {
        width: 0.55rem;
        height: 0.55rem;
        border-radius: 50%;
        background: var(--positive);
      }

      .menue {
        position: relative;
      }

      .menue-liste {
        position: absolute;
        right: 0;
        top: calc(100% + 0.4rem);
        min-width: 13rem;
        display: flex;
        flex-direction: column;
        padding: 0.3rem;
        border-radius: 0.55rem;
        border: 1px solid var(--border);
        background: var(--surface);
        box-shadow: var(--shadow-lg);
        z-index: 30;
      }

      .menue-liste a,
      .menue-liste button {
        text-align: left;
        padding: 0.5rem 0.7rem;
        border: 0;
        border-radius: 0.4rem;
        background: transparent;
        text-decoration: none;
        color: var(--text);
        font: inherit;
      }

      .menue-liste a:hover,
      .menue-liste button:hover {
        background: var(--surface-muted);
      }

      .menue-liste hr {
        border: 0;
        border-top: 1px solid var(--border);
        margin: 0.3rem 0;
      }

      main {
        max-width: 1400px;
        margin: 0 auto;
        padding: 1.5rem;
      }
    `,
  ],
})
export class App implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  readonly auth = inject(AuthService);
  readonly lesson = signal<CurrentLesson | null>(null);
  readonly menueOffen = signal(false);

  /** Die Anzeige der laufenden Stunde aktualisiert sich selbst. */
  private readonly timer = setInterval(() => this.refresh(), 60_000);

  constructor() {
    this.refresh();

    // Nach dem Bearbeiten des Stundenplans soll die Anzeige sofort stimmen,
    // nicht erst beim nächsten Takt.
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
      this.menueOffen.set(false);
      this.refresh();
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  private refresh(): void {
    // Ohne Anmeldung liefert die API ohnehin nur 401.
    if (!this.auth.isSignedIn()) {
      this.lesson.set(null);
      return;
    }

    this.api.getCurrentLesson().subscribe({
      next: (lesson) => this.lesson.set(lesson),
      error: () => this.lesson.set(null),
    });
  }

  logout(): void {
    this.menueOffen.set(false);
    this.auth.logout().subscribe({
      next: () => {
        this.lesson.set(null);
        this.router.navigate(['/anmelden']);
      },
      error: (err) => this.toasts.error(err, 'Das Abmelden hat nicht geklappt.'),
    });
  }
}
