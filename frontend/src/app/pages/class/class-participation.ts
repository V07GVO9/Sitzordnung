import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Icon } from '../../core/ui/icon';

/**
 * Der Reiter „Mitarbeit“ einer Klasse führt auf die Kursseite ihres ersten
 * Fachs. Gibt es noch keins, erklärt die Seite, was fehlt.
 */
@Component({
  selector: 'app-class-participation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  template: `
    @if (noCourse()) {
      <div class="empty">
        <p>Dieser Klasse ist noch kein Fach zugeordnet.</p>
        <p class="small">
          Mitarbeit wird je Fach eingetragen – zum Beispiel „Mathematik in der 7b“.
        </p>
        <a class="btn primary" routerLink="/verwaltung" [queryParams]="{ tab: 'klassen' }">
          <app-icon name="plus" /> Fach zuordnen
        </a>
      </div>
    }
  `,
})
export class ClassParticipationPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly classId = input.required<string>();
  readonly noCourse = signal(false);

  constructor() {
    effect(() => {
      const classId = Number(this.classId());
      untracked(() =>
        this.api.getCourses().subscribe((courses) => {
          const first = courses.find((c) => c.schoolClassId === classId);
          if (first) {
            void this.router.navigate(['/kurs', first.id], { replaceUrl: true });
          } else {
            this.noCourse.set(true);
          }
        }),
      );
    });
  }
}
