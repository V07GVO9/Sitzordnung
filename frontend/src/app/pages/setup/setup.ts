import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin, of, switchMap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { ModeService } from '../../core/mode.service';
import { Course, SchoolClass, Student, TimetableEntry } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../core/ui/icon';
import { IconName } from '../../core/ui/icons';

/** Was in der Datei schon steht - daraus folgt, welcher Schritt erledigt ist. */
export interface SetupState {
  classes: SchoolClass[];
  courses: Course[];
  timetable: TimetableEntry[];
  /** Schüler je Klasse. */
  students: Map<number, Student[]>;
}

export interface SetupStep {
  key: 'basis' | 'schueler' | 'stundenplan' | 'sitzplan' | 'fotos';
  title: string;
  icon: IconName;
  done: boolean;
  optional: boolean;
  /** Was schon da ist - oder was fehlt. */
  status: string;
}

/**
 * Die Schritte der Einrichtung mit ihrem Stand. Reine Funktion, damit sie
 * sich ohne Oberfläche prüfen lässt.
 */
export function setupSteps(state: SetupState): SetupStep[] {
  const { classes, courses, timetable, students } = state;
  const allStudents = [...students.values()].flat();
  const emptyClasses = classes.filter((c) => !(students.get(c.id)?.length ?? 0));
  const withoutPlan = courses.filter((c) => c.seatingPlanCount === 0);
  const withPhoto = allStudents.filter((s) => s.hasPhoto).length;

  return [
    {
      key: 'basis',
      title: 'Klassen und Fächer',
      icon: 'school',
      done: classes.length > 0 && courses.length > 0,
      optional: false,
      status:
        classes.length === 0
          ? 'Noch keine Klasse angelegt.'
          : courses.length === 0
            ? `${classes.length} Klasse(n), aber noch kein Fach zugeordnet.`
            : `${classes.length} Klasse(n), ${courses.length} Kurs(e).`,
    },
    {
      key: 'schueler',
      title: 'Schüler',
      icon: 'users',
      done: classes.length > 0 && emptyClasses.length === 0,
      optional: false,
      status:
        classes.length === 0
          ? 'Zuerst eine Klasse anlegen.'
          : emptyClasses.length
            ? `Ohne Schüler: ${emptyClasses.map((c) => c.name).join(', ')}.`
            : `${allStudents.length} Schüler in ${classes.length} Klasse(n).`,
    },
    {
      key: 'stundenplan',
      title: 'Stundenplan',
      icon: 'calendar-days',
      done: timetable.length > 0,
      optional: false,
      status: timetable.length
        ? `${timetable.length} Stunde(n) pro Woche eingetragen.`
        : 'Noch keine Stunde eingetragen.',
    },
    {
      key: 'sitzplan',
      title: 'Sitzordnungen',
      icon: 'layout-grid',
      done: courses.length > 0 && withoutPlan.length === 0,
      optional: false,
      status:
        courses.length === 0
          ? 'Zuerst Kurse anlegen.'
          : withoutPlan.length
            ? `Noch ohne Sitzordnung: ${withoutPlan.map((c) => `${c.subjectShortName || c.subjectName} ${c.schoolClassName}`).join(', ')}.`
            : 'Jeder Kurs hat eine Sitzordnung.',
    },
    {
      key: 'fotos',
      title: 'Fotos',
      icon: 'camera',
      done: allStudents.length > 0 && withPhoto === allStudents.length,
      optional: true,
      status: allStudents.length
        ? `${withPhoto} von ${allStudents.length} Schülern mit Foto.`
        : 'Zuerst Schüler anlegen.',
    },
  ];
}

/**
 * Einrichtungs-Assistent: eine geführte Checkliste vom leeren Bestand bis
 * zum ersten Unterricht. Jeder Schritt zeigt seinen Stand und führt mit
 * einem Knopf auf die Seite, auf der er erledigt wird.
 */
@Component({
  selector: 'app-setup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div class="stack setup">
      <div class="page-head">
        <div>
          <h1>Einrichtung</h1>
          <p class="muted small">
            Schritt für Schritt zum ersten Unterricht. Erledigte Schritte sind abgehakt – du kannst
            jederzeit hierher zurückkommen (im Bearbeitungsmodus: Menü ☰ → Einrichtung).
          </p>
        </div>
      </div>

      @if (loading()) {
        <p class="muted">Wird geladen …</p>
      } @else {
        <div
          class="progress"
          role="progressbar"
          [attr.aria-valuenow]="doneCount()"
          aria-valuemin="0"
          [attr.aria-valuemax]="requiredCount()"
        >
          <span [style.width.%]="(doneCount() / requiredCount()) * 100"></span>
        </div>
        <p class="small muted">
          {{ doneCount() }} von {{ requiredCount() }} Schritten erledigt
          @if (doneCount() === requiredCount()) {
            – fertig! Im Wochenplan eine Stunde antippen und loslegen.
          }
        </p>

        <ol class="steps">
          @for (step of steps(); track step.key; let i = $index) {
            <li class="step card" [class.done]="step.done" [class.next]="step.key === nextKey()">
              <span class="mark" aria-hidden="true">
                @if (step.done) {
                  <app-icon name="circle-check" />
                } @else {
                  {{ i + 1 }}
                }
              </span>
              <div class="body">
                <h2>
                  {{ step.title }}
                  @if (step.optional) {
                    <span class="muted small">(optional)</span>
                  }
                </h2>
                <p class="small muted">{{ step.status }}</p>

                @switch (step.key) {
                  @case ('basis') {
                    <p class="small">
                      Am schnellsten: den Stundenplan aus <strong>WebUntis</strong> importieren –
                      dabei entstehen Klassen, Fächer und Kurse automatisch.
                    </p>
                    <div class="row">
                      <button
                        class="btn"
                        [class.primary]="!step.done"
                        type="button"
                        (click)="go('/stundenplan/import')"
                      >
                        <app-icon name="calendar-days" /> Aus WebUntis importieren
                      </button>
                      <button
                        class="btn"
                        type="button"
                        (click)="go('/verwaltung', { tab: 'klassen' })"
                      >
                        <app-icon name="plus" /> Von Hand anlegen
                      </button>
                    </div>
                  }
                  @case ('schueler') {
                    <p class="small">
                      Namensliste einfügen (z. B. aus der Schulverwaltung) oder einzeln anlegen.
                    </p>
                    <div class="row">
                      @for (c of emptyClasses(); track c.id) {
                        <button
                          class="btn"
                          [class.primary]="!step.done"
                          type="button"
                          (click)="go('/verwaltung', { tab: 'schueler', klasse: c.id })"
                        >
                          <app-icon name="users" /> {{ c.name }}
                        </button>
                      } @empty {
                        <button
                          class="btn"
                          type="button"
                          [disabled]="!classes().length"
                          (click)="go('/verwaltung', { tab: 'schueler' })"
                        >
                          <app-icon name="users" /> Schüler verwalten
                        </button>
                      }
                    </div>
                  }
                  @case ('stundenplan') {
                    <div class="row">
                      <button
                        class="btn"
                        [class.primary]="!step.done"
                        type="button"
                        [disabled]="!courses().length"
                        (click)="go('/stundenplan')"
                      >
                        <app-icon name="calendar-days" /> Stundenplan öffnen
                      </button>
                    </div>
                  }
                  @case ('sitzplan') {
                    <p class="small">
                      Im Kurs mit „Auffüllen“, „Alphabetisch“ oder „Zufällig“ alle auf einmal
                      setzen.
                    </p>
                    <div class="row">
                      @for (c of coursesWithoutPlan(); track c.id) {
                        <button
                          class="btn"
                          [class.primary]="!step.done"
                          type="button"
                          (click)="go('/kurs/' + c.id)"
                        >
                          <app-icon name="layout-grid" />
                          {{ c.subjectShortName || c.subjectName }} · {{ c.schoolClassName }}
                        </button>
                      }
                    </div>
                  }
                  @case ('fotos') {
                    <p class="small">
                      Unter Schüler aufs Bild tippen (Galerie) oder auf das Kamera-Symbol (Foto
                      direkt aufnehmen). Für Fotos braucht es in der Regel eine Einwilligung.
                    </p>
                    <div class="row">
                      <button
                        class="btn"
                        type="button"
                        [disabled]="!classes().length"
                        (click)="go('/verwaltung', { tab: 'schueler' })"
                      >
                        <app-icon name="camera" /> Fotos hinzufügen
                      </button>
                    </div>
                  }
                }
              </div>
            </li>
          }
        </ol>
      }
    </div>
  `,
  styles: `
    .progress {
      height: 0.5rem;
      border-radius: 999px;
      background: var(--surface-muted);
      overflow: hidden;

      span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: var(--positive);
        transition: width 0.3s ease;
      }
    }

    .steps {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .step {
      display: flex;
      gap: 0.8rem;
      align-items: flex-start;
      margin: 0 !important;

      &.next {
        box-shadow:
          0 0 0 2px var(--accent),
          var(--shadow);
      }

      &.done .body h2 {
        color: var(--text-muted);
      }
    }

    .mark {
      display: grid;
      place-items: center;
      flex: none;
      width: 2rem;
      height: 2rem;
      border-radius: 50%;
      background: var(--accent-soft);
      color: var(--accent-text);
      font-weight: 700;

      .done & {
        background: var(--positive-soft);
        color: var(--positive);
        font-size: 1.2rem;
      }
    }

    .body {
      flex: 1;
      min-width: 0;

      h2 {
        margin: 0.2rem 0 0.1rem;
        font-size: 1.05rem;
      }

      p {
        margin: 0.25rem 0;
      }
    }

    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-top: 0.5rem;
    }
  `,
})
export class SetupPage {
  private readonly api = inject(ApiService);
  private readonly mode = inject(ModeService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  readonly loading = signal(true);
  readonly classes = signal<SchoolClass[]>([]);
  readonly courses = signal<Course[]>([]);
  private readonly timetable = signal<TimetableEntry[]>([]);
  private readonly students = signal<Map<number, Student[]>>(new Map());

  readonly steps = computed(() =>
    setupSteps({
      classes: this.classes(),
      courses: this.courses(),
      timetable: this.timetable(),
      students: this.students(),
    }),
  );
  readonly requiredCount = computed(() => this.steps().filter((s) => !s.optional).length);
  readonly doneCount = computed(() => this.steps().filter((s) => !s.optional && s.done).length);
  /** Der erste offene Schritt ist hervorgehoben. */
  readonly nextKey = computed(() => this.steps().find((s) => !s.done)?.key ?? null);

  readonly emptyClasses = computed(() =>
    this.classes().filter((c) => !(this.students().get(c.id)?.length ?? 0)),
  );
  readonly coursesWithoutPlan = computed(() =>
    this.courses().filter((c) => c.seatingPlanCount === 0),
  );

  constructor() {
    forkJoin({
      classes: this.api.getClasses(),
      courses: this.api.getCourses(),
      timetable: this.api.getTimetable(),
    })
      .pipe(
        switchMap(({ classes, courses, timetable }) => {
          this.classes.set(classes);
          this.courses.set(courses);
          this.timetable.set(timetable);
          return classes.length ? forkJoin(classes.map((c) => this.api.getStudents(c.id))) : of([]);
        }),
      )
      .subscribe({
        next: (lists) => {
          this.students.set(new Map(this.classes().map((c, i) => [c.id, lists[i] ?? []])));
          this.loading.set(false);
        },
        error: (err) => {
          this.toasts.error(err, 'Der Stand der Einrichtung konnte nicht geladen werden.');
          this.loading.set(false);
        },
      });
  }

  /** Einrichten heißt bearbeiten: vorher in den Bearbeitungsmodus (mit Rückfrage). */
  async go(path: string, queryParams?: Record<string, string | number>): Promise<void> {
    if (!(await this.mode.requestEdit())) {
      return;
    }
    await this.router.navigate([path], { queryParams });
  }
}
