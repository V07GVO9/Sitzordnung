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
            class="btn menue-knopf"
            type="button"
            aria-label="Einstellungen"
            [attr.aria-expanded]="menueOffen()"
            (click)="menueOffen.set(!menueOffen())"
          >
            <span class="menue-zeichen" aria-hidden="true">⚙</span>
            <span class="menue-text">Einstellungen ▾</span>
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
      /* Mobile first: kompakte Kopfzeile, ab Tablet mehr Luft. */
      .topbar {
        display: flex;
        align-items: center;
        gap: 0.4rem 0.6rem;
        flex-wrap: wrap;
        padding: 0.5rem 0.75rem;
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
        gap: 0.5rem;
        text-decoration: none;
        color: var(--text);
        min-width: 0;
      }

      .brand-mark {
        display: grid;
        place-items: center;
        width: 2.2rem;
        height: 2.2rem;
        flex: none;
        border-radius: 0.55rem;
        background: var(--accent);
        color: #fff;
        font-weight: 700;
        font-size: 0.85rem;
      }

      .brand span {
        display: block;
      }

      /* Der Untertitel ist auf dem Handy nur Ballast. */
      .brand .brand-sub {
        display: none;
        font-size: 0.75rem;
        color: var(--text-muted);
      }

      nav {
        display: flex;
        gap: 0.25rem;
        flex-wrap: wrap;
      }

      nav a {
        display: inline-flex;
        align-items: center;
        min-height: 2.25rem;
        padding: 0.35rem 0.6rem;
        border-radius: 0.45rem;
        text-decoration: none;
        color: var(--text-muted);
        font-weight: 500;
        font-size: 0.9rem;
      }

      nav a:hover {
        background: var(--surface-muted);
        color: var(--text);
      }

      nav a.active {
        background: var(--accent-soft);
        color: var(--accent-dark);
      }

      /* Bis zum breiten Bildschirm steht die laufende Stunde in einer eigenen
         Zeile – und nur dann, wenn gerade wirklich Unterricht ist. */
      .now {
        order: 9;
        flex: 1 1 100%;
        display: none;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        font-size: 0.8rem;
        padding: 0.25rem 0.6rem;
        border-radius: 999px;
        border: 1px solid var(--border);
      }

      .now:empty {
        display: none;
      }

      .now.live {
        display: flex;
        background: var(--positive-soft);
        border-color: #b6e0c6;
        color: #14512e;
      }

      .dot {
        width: 0.55rem;
        height: 0.55rem;
        flex: none;
        border-radius: 50%;
        background: var(--positive);
      }

      .menue {
        position: relative;
        margin-left: auto;
      }

      .menue-knopf {
        white-space: nowrap;
        padding: 0.5rem 0.7rem;
      }

      .menue-zeichen {
        font-size: 1.15rem;
        line-height: 1;
      }

      .menue-text {
        display: none;
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
        padding: 0.6rem 0.7rem;
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
        margin: 0 auto;
        padding: var(--pad-seite);
      }

      main.weit {
        max-width: 1400px;
      }

      @media (min-width: 48rem) {
        .topbar {
          gap: 1.25rem;
          padding: 0.75rem 1.5rem;
        }

        .brand .brand-sub {
          display: block;
        }

        nav a {
          padding: 0.4rem 0.75rem;
          font-size: 1rem;
        }

        .menue-knopf {
          padding: 0.5rem 0.9rem;
        }

        .menue-zeichen {
          display: none;
        }

        .menue-text {
          display: inline;
        }
      }

      /* Erst wenn wirklich Platz ist, wandert die Statuszeile in die Kopfzeile. */
      @media (min-width: 62rem) {
        .now {
          order: 0;
          display: flex;
          flex: 0 1 auto;
          margin-left: auto;
          font-size: 0.9rem;
          padding: 0.35rem 0.7rem;
        }

        .menue {
          margin-left: 0;
        }
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
