import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { CurrentLesson, SchoolClass } from '../../core/models';
import { Icon } from '../../core/ui/icon';

/**
 * Die Startseite, solange keine Klasse gewählt ist - wie in der Klassenmappe:
 * „Bitte wählen Sie eine Klasse aus.“ Läuft gerade Unterricht, führt ein
 * Knopf direkt zum Bewerten.
 */
@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  template: `
    <div class="home">
      @if (lesson()?.hasLesson) {
        <a class="live" [routerLink]="['/kurs', lesson()!.courseId]">
          <span class="live-head">Läuft gerade</span>
          <strong>{{ lesson()!.subjectName }} · {{ lesson()!.schoolClassName }}</strong>
          <span class="muted small">{{ lesson()!.startTime }}–{{ lesson()!.endTime }} Uhr</span>
          <span class="btn primary"><app-icon name="notebook-pen" /> Mitarbeit eintragen</span>
        </a>
      }

      <p class="hint">
        {{ classes().length ? 'Bitte wählen Sie eine Klasse aus.' : 'Noch keine Klasse angelegt.' }}
      </p>
      <span class="app-icon" aria-hidden="true"><app-icon name="book-open" /></span>

      @if (classes().length === 0) {
        <a class="btn primary" routerLink="/verwaltung" [queryParams]="{ tab: 'klassen' }">
          <app-icon name="plus" /> Erste Klasse anlegen
        </a>
      } @else {
        <div class="quick">
          @for (schoolClass of classes(); track schoolClass.id) {
            <a class="btn" [routerLink]="['/klasse', schoolClass.id, 'uebersicht']">
              <app-icon name="folder" /> {{ schoolClass.name }}
            </a>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .home {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      padding: 2rem 1rem;
      text-align: center;
    }

    .hint {
      margin: 0;
      font-size: 1.05rem;
    }

    .app-icon {
      display: grid;
      place-items: center;
      width: 5.5rem;
      height: 5.5rem;
      border-radius: 1.3rem;
      background: linear-gradient(160deg, #5b8fd0, #2f5f9f);
      color: #fff;
      font-size: 3rem;
      box-shadow: 0 6px 18px rgb(47 79 159 / 30%);
    }

    .quick {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }

    .live {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.3rem;
      width: min(26rem, 100%);
      margin-bottom: 1rem;
      padding: 1rem;
      border-radius: var(--radius);
      background: var(--surface);
      box-shadow: var(--shadow);
      color: var(--text);
      text-decoration: none;

      .btn {
        margin-top: 0.4rem;
      }
    }

    .live-head {
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--positive);
    }
  `,
})
export class HomePage {
  private readonly api = inject(ApiService);

  readonly classes = signal<SchoolClass[]>([]);
  readonly lesson = signal<CurrentLesson | null>(null);

  constructor() {
    this.api.getClasses().subscribe({ next: (classes) => this.classes.set(classes) });
    this.api.getCurrentLesson().subscribe({ next: (lesson) => this.lesson.set(lesson) });
  }
}
