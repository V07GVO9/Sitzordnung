import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActiveCourseService } from '../../core/active-course.service';
import { ApiService } from '../../core/api.service';
import { GradeArea, QUARTERS, Quarter, QuarterGrade, Student, fullName } from '../../core/models';
import { formatGrade, parseGrade } from '../../core/logic/assessment.logic';
import { quarterOf, quarterRange } from '../../core/logic/quarter.logic';
import { ToastService } from '../../core/ui/toast.service';
import { Icon } from '../../core/ui/icon';

interface Row {
  student: Student;
  written: QuarterGrade | null;
  oral: QuarterGrade | null;
}

/**
 * Quartalsnoten eintragen: je Kurs und Quartal schriftlich in Prozent
 * (die Note folgt aus dem Prozentschlüssel) und mündlich als Note -
 * vorausgefüllt mit dem Durchschnitt der Mitarbeit im Quartal.
 */
@Component({
  selector: 'app-quarter-grades',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div class="stack">
      <div class="page-head">
        <div>
          @if (course(); as c) {
            <p class="eyebrow">{{ c.subjectName }} · {{ c.schoolClassName }}</p>
          }
          <h1>Noten</h1>
          <p class="muted small">
            Schriftlich in Prozent eintragen, die Note wird berechnet. Mündlich ist mit dem
            Durchschnitt der Mitarbeit im Quartal vorausgefüllt und kann überschrieben werden.
          </p>
        </div>
      </div>

      @if (courseId() === null) {
        <div class="banner">Bitte zuerst im Wochenplan eine Stunde wählen.</div>
      } @else {
        <div class="chips" role="group" aria-label="Quartal wählen">
          @for (q of quarters; track q) {
            <button
              type="button"
              class="chip q-chip"
              [class.active]="q === quarter()"
              [attr.aria-pressed]="q === quarter()"
              [title]="q === currentQuarter ? 'Das laufende Quartal' : ''"
              (click)="quarter.set(q)"
            >
              Q{{ q }}
              @if (q === currentQuarter) {
                <span class="now-dot" aria-label="laufendes Quartal"></span>
              }
            </button>
          }
        </div>

        <!-- Welches Quartal gerade offen ist - groß, damit niemand ins falsche einträgt. -->
        <div class="q-open">
          <strong>{{ quarter() }}. Quartal</strong>
          <span>{{ quarterLabel() }}</span>
          @if (quarter() === currentQuarter) {
            <span class="q-now">läuft gerade</span>
          }
        </div>

        <div class="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Schüler</th>
                <th class="num">Schriftlich %</th>
                <th class="num">Note</th>
                <th class="num">Mündlich (Note)</th>
                <th class="num">Export</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.student.id) {
                <tr>
                  <td>{{ fullName(row.student) }}</td>
                  <td class="num">
                    <input
                      class="g-input"
                      inputmode="decimal"
                      placeholder="%"
                      [value]="percentText(row.written)"
                      (change)="onWritten(row.student, $any($event.target))"
                      [attr.aria-label]="fullName(row.student) + ': schriftlich in Prozent'"
                    />
                  </td>
                  <td class="num grade">{{ gradeText(row.written) }}</td>
                  <td class="num">
                    <input
                      class="g-input"
                      [class.suggested]="row.oral?.suggested"
                      inputmode="decimal"
                      placeholder="Note"
                      [value]="gradeText(row.oral, '')"
                      (change)="onOral(row.student, $any($event.target))"
                      [title]="
                        row.oral?.suggested
                          ? 'Durchschnitt der Mitarbeit im Quartal - Eintippen überschreibt ihn'
                          : ''
                      "
                      [attr.aria-label]="fullName(row.student) + ': mündliche Note'"
                    />
                    @if (row.oral && !row.oral.suggested) {
                      <button
                        type="button"
                        class="remove"
                        title="Zurück auf den Durchschnitt der Mitarbeit"
                        (click)="resetOral(row.student)"
                      >
                        ↺
                      </button>
                    }
                  </td>
                  <td class="num">
                    <button
                      type="button"
                      class="btn small"
                      title="Noten je Stunde dieses Schülers im gewählten Quartal"
                      (click)="exportLessonSheet(row.student)"
                    >
                      <app-icon name="file-down" /> Noten je Stunde
                    </button>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="5" class="muted">Keine Schüler in diesem Kurs.</td>
                </tr>
              }
            </tbody>
          </table>
          <p class="muted small legend">
            <span class="suggested-sample">kursiv</span> = Vorschlag aus der Mitarbeit (noch nicht
            eingetragen).
          </p>
        </div>
      }
    </div>
  `,
  styles: `
    /* Das geöffnete Quartal: kräftig gefüllt statt nur hellblau. */
    .q-chip.active {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
      font-weight: 750;
      box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 40%, transparent);
    }

    .now-dot {
      width: 0.45rem;
      height: 0.45rem;
      border-radius: 50%;
      background: var(--positive);
    }

    .q-open {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.3rem 0.6rem;
      padding: 0.6rem 0.9rem;
      border-left: 4px solid var(--accent);
      border-radius: var(--radius-sm, 0.5rem);
      background: var(--accent-soft);
      color: var(--accent-text);

      strong {
        font-size: 1.15rem;
      }
    }

    .q-now {
      padding: 0.05rem 0.5rem;
      border-radius: 999px;
      background: var(--positive-soft);
      color: var(--positive-text);
      font-size: 0.78rem;
      font-weight: 600;
    }

    /* Dezente dunkelgraue Spaltentrenner, damit die Spalten gut unterscheidbar sind. */
    th + th,
    td + td {
      border-left: 1px solid color-mix(in srgb, var(--text) 22%, transparent);
    }

    thead th {
      border-bottom: 1px solid color-mix(in srgb, var(--text) 35%, transparent);
    }

    .num {
      text-align: center;
    }

    .grade {
      font-weight: 700;
    }

    .g-input {
      width: 4.5rem;
      min-height: 2.2rem;
      padding: 0.2rem 0.4rem;
      border: 1px solid var(--border-strong);
      border-radius: 0.4rem;
      background: var(--surface);
      color: var(--text);
      text-align: center;
      font-size: 0.95rem;
    }

    .suggested,
    .suggested-sample {
      font-style: italic;
      color: var(--text-muted);
    }

    td .remove {
      vertical-align: middle;
      margin-left: 0.2rem;
    }

    .legend {
      margin: 0.6rem 0 0;
    }
  `,
})
export class QuarterGradesPage {
  private readonly api = inject(ApiService);
  private readonly toasts = inject(ToastService);

  readonly fullName = fullName;
  readonly quarters = QUARTERS;

  private readonly active = inject(ActiveCourseService);
  readonly course = this.active.course;
  readonly courseId = this.active.courseId;
  readonly quarter = signal<Quarter>(quarterOf(new Date()));
  /** Das Quartal, in dem heute liegt - mit Punkt markiert. */
  readonly currentQuarter = quarterOf(new Date());
  /** „01.11.2026 – 31.01.2027“ für das geöffnete Quartal. */
  readonly quarterLabel = computed(() => {
    const { from, to } = quarterRange(this.quarter(), new Date());
    const de = (key: string) => key.split('-').reverse().join('.');
    return `${de(from)} – ${de(to)}`;
  });
  readonly students = signal<Student[]>([]);
  readonly grades = signal<QuarterGrade[]>([]);

  readonly rows = computed<Row[]>(() => {
    const byKey = new Map<string, QuarterGrade>();
    for (const g of this.grades()) {
      if (g.quarter === this.quarter()) {
        byKey.set(`${g.studentId}:${g.area}`, g);
      }
    }
    return [...this.students()]
      .sort(
        (a, b) =>
          a.lastName.localeCompare(b.lastName, 'de') ||
          a.firstName.localeCompare(b.firstName, 'de'),
      )
      .map((student) => ({
        student,
        written: byKey.get(`${student.id}:written`) ?? null,
        oral: byKey.get(`${student.id}:oral`) ?? null,
      }));
  });

  constructor() {
    // Die Noten gehören immer zum Fach, das im Wochenplan gewählt ist.
    effect(() => {
      const id = this.courseId();
      if (id !== null) {
        untracked(() => this.load(id));
      }
    });
  }

  private load(id: number): void {
    this.api.getCourseStudents(id).subscribe({
      next: (students) => this.students.set(students),
      error: (err) => this.toasts.error(err, 'Die Schüler konnten nicht geladen werden.'),
    });
    this.reload();
  }

  percentText(g: QuarterGrade | null): string {
    return g?.percent == null ? '' : String(g.percent).replace('.', ',');
  }

  gradeText(g: QuarterGrade | null, empty = '–'): string {
    return g?.grade == null ? empty : formatGrade(g.grade, 1);
  }

  onWritten(student: Student, field: HTMLInputElement): void {
    const text = field.value.replace('%', '').trim().replace(',', '.');
    if (text === '') {
      this.save(student, 'written', null);
      return;
    }
    const percent = Number(text);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      this.toasts.show('Bitte eine Prozentzahl von 0 bis 100 eingeben.', 'error');
      field.value = this.percentText(this.find(student, 'written'));
      return;
    }
    this.save(student, 'written', Math.round(percent * 10) / 10);
  }

  onOral(student: Student, field: HTMLInputElement): void {
    const grade = parseGrade(field.value);
    if (Number.isNaN(grade)) {
      this.toasts.show('Bitte eine Note von 1,0 bis 6,0 eingeben.', 'error');
      field.value = this.gradeText(this.find(student, 'oral'), '');
      return;
    }
    this.save(student, 'oral', grade);
  }

  /** Noten je Stunde eines Schülers im gewählten Quartal. */
  exportLessonSheet(student: Student): void {
    const courseId = this.courseId();
    if (courseId === null) {
      return;
    }
    const range = quarterRange(this.quarter(), new Date());
    this.api.exportLessonSheets(courseId, range, student.id).subscribe({
      next: () => this.toasts.success('Die Übersicht wurde erzeugt.'),
      error: (err) => this.toasts.error(err, 'Der Export ist fehlgeschlagen.'),
    });
  }

  resetOral(student: Student): void {
    this.save(student, 'oral', null);
  }

  private find(student: Student, area: GradeArea): QuarterGrade | null {
    return (
      this.grades().find(
        (g) => g.studentId === student.id && g.area === area && g.quarter === this.quarter(),
      ) ?? null
    );
  }

  private save(student: Student, area: GradeArea, value: number | null): void {
    const courseId = this.courseId();
    if (courseId === null) {
      return;
    }
    this.api.setQuarterGrade(courseId, student.id, this.quarter(), area, value).subscribe({
      next: () => this.reload(),
      error: (err) => this.toasts.error(err, 'Die Note konnte nicht gespeichert werden.'),
    });
  }

  private reload(): void {
    const courseId = this.courseId();
    if (courseId === null) {
      return;
    }
    this.api.getQuarterGrades(courseId).subscribe({
      next: (grades) => this.grades.set(grades),
      error: (err) => this.toasts.error(err, 'Die Noten konnten nicht geladen werden.'),
    });
  }
}
