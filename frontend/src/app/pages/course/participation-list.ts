import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  GradeArea,
  QUARTERS,
  Quarter,
  QuarterGrade,
  Rating,
  RatingValue,
  Student,
  StudentScore,
  fullName,
  initials,
  ratingClass,
} from '../../core/models';
import { formatGrade } from '../../core/store/assessment.logic';

export interface QuarterGradeRequest {
  student: Student;
  quarter: Quarter;
  area: GradeArea;
  percent: number | null;
}

/** Grob nach dem Schuljahr: Aug–Okt, Nov–Jan, Feb–Apr, Mai–Jul. */
export function currentQuarter(date = new Date()): Quarter {
  const month = date.getMonth() + 1;
  if (month >= 8 && month <= 10) return 1;
  if (month >= 11 || month === 1) return 2;
  if (month <= 4) return 3;
  return 4;
}

export interface RateRequest {
  student: Student;
  value: RatingValue;
}

/** Die fünf Stufen der Skala - in den Farben der Klassenmappe; 0 ist die Mitte. */
export const RATING_OPTIONS: { value: RatingValue; symbol: string; title: string }[] = [
  { value: 2, symbol: '++', title: 'Sehr gute Mitarbeit (++)' },
  { value: 1, symbol: '+', title: 'Gute Mitarbeit (+)' },
  { value: 0, symbol: '0', title: 'Durchschnittliche Mitarbeit (0)' },
  { value: -1, symbol: '−', title: 'Schwache Mitarbeit (−)' },
  { value: -2, symbol: '−−', title: 'Keine Mitarbeit / Störung (−−)' },
];

/**
 * Mitarbeit als Liste - wie der Reiter „Mitarbeit“ im Kursbuch der
 * Klassenmappe: Foto, Name, der Punktestand und rechts die kleine Skala
 * zum Antippen. Die heute geltende Bewertung ist auf der Skala markiert.
 */
@Component({
  selector: 'app-participation-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="q-bar" role="group" aria-label="Quartal für die Noten">
      <span class="muted">Noten im</span>
      @for (q of quarters; track q) {
        <button
          type="button"
          class="q-chip"
          [class.on]="quarter() === q"
          [attr.aria-pressed]="quarter() === q"
          (click)="quarter.set(q)"
        >
          {{ q }}. Quartal
        </button>
      }
    </div>

    <div class="p-list">
      @for (row of rows(); track row.student.id) {
        <div
          class="list-row p-row"
          [class.flash]="flashId() === row.student.id"
          [class.rated]="row.current !== null"
          [style.--rated]="ratedColor(row.current)"
        >
          <button
            class="who"
            type="button"
            (click)="openStudent.emit(row.student)"
            [title]="'Verlauf von ' + fullName(row.student)"
          >
            <span class="avatar">
              @if (row.student.photoUrl) {
                <img [src]="row.student.photoUrl" alt="" />
              } @else {
                <span>{{ initials(row.student) }}</span>
              }
            </span>
            <span class="row-text">
              <strong>{{ fullName(row.student) }}</strong>
            </span>
          </button>

          <span
            class="points"
            [class.pos]="(row.score?.points ?? 0) > 0"
            [class.neg]="(row.score?.points ?? 0) < 0"
            title="Punktestand"
          >
            {{ signed(row.score?.points ?? 0) }}
          </span>

          <span class="q-grades">
            @for (area of areas; track area.key) {
              <span class="q-cell" [title]="area.title + ' im ' + quarter() + '. Quartal'">
                <span class="q-label">{{ area.short }}</span>
                <input
                  class="q-pct"
                  inputmode="decimal"
                  placeholder="%"
                  [value]="percentText(row.grades[area.key])"
                  (change)="onPercent(row.student, area.key, $any($event.target))"
                  [attr.aria-label]="fullName(row.student) + ': ' + area.title + ' in Prozent'"
                />
                <output
                  class="q-grade"
                  [attr.aria-label]="fullName(row.student) + ': ' + area.title + ' als Note'"
                  >{{ gradeText(row.grades[area.key]) }}</output
                >
              </span>
            }
          </span>

          <span
            class="scale"
            role="group"
            [attr.aria-label]="'Mitarbeit von ' + fullName(row.student)"
          >
            @for (option of options; track option.value) {
              <button
                type="button"
                [class]="ratingClass(option.value)"
                [class.active]="row.current === option.value"
                [attr.aria-pressed]="row.current === option.value"
                (click)="rate.emit({ student: row.student, value: option.value })"
                [title]="option.title"
                [attr.aria-label]="fullName(row.student) + ': ' + option.title"
              >
                {{ option.symbol }}
              </button>
            }
          </span>
        </div>
      } @empty {
        <div class="list-row p-row">
          <span class="row-text"
            ><span class="sub muted">Keine Schüler in dieser Klasse.</span></span
          >
        </div>
      }
    </div>
  `,
  styles: `
    /* Jeder Schüler eine eigene weiße Karte - Name und Skala gehören sichtbar zusammen. */
    .p-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .p-row {
      gap: 0.6rem;
      padding-block: 0.5rem;
      flex-wrap: wrap;
      background: var(--surface);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }

    /* Wer heute bewertet wurde, bekommt die Farbe der Bewertung - wie die Kachel im Sitzplan. */
    .p-row.rated {
      background: color-mix(in srgb, var(--rated) 55%, var(--surface));
      box-shadow:
        inset 0 0 0 1px var(--rated),
        var(--shadow);
    }

    .flash {
      animation: row-flash 0.7s ease-out;
    }

    @keyframes row-flash {
      from {
        background: var(--accent-soft);
      }
    }

    .who {
      display: flex;
      align-items: center;
      gap: 0.7rem;
      flex: 1 1 12rem;
      min-width: 0;
      padding: 0;
      border: 0;
      background: transparent;
      text-align: left;
    }

    .points {
      flex: none;
      min-width: 2.6rem;
      text-align: right;
      font-size: 0.95rem;
    }

    .scale {
      display: grid;
      grid-template-columns: repeat(5, 3rem);
      gap: 0.25rem;
      flex: none;

      button {
        min-height: 2.5rem;
        border: 0;
        border-radius: 0.45rem;
        font-weight: 750;
        font-size: 0.95rem;
        opacity: 0.88;
        transition:
          transform 0.08s ease,
          opacity 0.12s ease;

        &:hover {
          opacity: 1;
        }

        &:active {
          transform: scale(0.93);
        }

        /* Die heute geltende Bewertung - ohne Auswahl bleibt alles neutral. */
        &.active {
          opacity: 1;
          outline: 3px solid var(--text);
          outline-offset: 1px;
        }
      }
    }

    .q-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.35rem;
      margin-bottom: 0.6rem;
    }

    .q-chip {
      padding: 0.3rem 0.7rem;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--surface);
      color: var(--text);
      font-size: 0.85rem;

      &.on {
        border-color: var(--accent);
        background: var(--accent);
        color: #fff;
      }
    }

    .q-grades {
      display: flex;
      gap: 0.5rem;
      flex: none;
    }

    .q-cell {
      display: grid;
      grid-template-columns: auto 3.4rem 3.2rem;
      align-items: center;
      gap: 0.2rem;

      input {
        width: 100%;
        min-height: 2.2rem;
        padding: 0.2rem 0.3rem;
        border: 1px solid var(--border);
        border-radius: 0.4rem;
        background: var(--surface);
        color: var(--text);
        text-align: center;
        font-size: 0.9rem;
      }

      /* Die Note wird nur angezeigt - sie folgt aus dem Prozentschlüssel. */
      .q-grade {
        text-align: center;
        font-weight: 700;
      }
    }

    .q-label {
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--text-muted);
    }

    @media (max-width: 34rem) {
      .q-grades {
        flex: 1 1 100%;
        justify-content: space-between;
      }

      .scale {
        grid-template-columns: repeat(5, 1fr);
        flex: 1 1 100%;
      }
    }
  `,
})
export class ParticipationList {
  readonly students = input.required<Student[]>();
  readonly scores = input.required<Map<number, StudentScore>>();
  readonly today = input.required<Map<number, Rating[]>>();
  readonly flashId = input<number | null>(null);
  /** Alle Quartalsnoten des Kurses. */
  readonly quarterGrades = input<QuarterGrade[]>([]);

  readonly rate = output<RateRequest>();
  readonly gradeChange = output<QuarterGradeRequest>();

  readonly quarters = QUARTERS;
  readonly quarter = signal<Quarter>(currentQuarter());
  readonly areas: { key: GradeArea; short: string; title: string }[] = [
    { key: 'written', short: 'S', title: 'Schriftlich' },
    { key: 'oral', short: 'M', title: 'Mündlich' },
  ];

  /** Die Noten des gewählten Quartals, je Schüler und Bereich. */
  private readonly gradesOfQuarter = computed(() => {
    const map = new Map<string, QuarterGrade>();
    for (const g of this.quarterGrades()) {
      if (g.quarter === this.quarter()) {
        map.set(`${g.studentId}:${g.area}`, g);
      }
    }
    return map;
  });
  readonly openStudent = output<Student>();

  readonly options = RATING_OPTIONS;
  readonly fullName = fullName;
  readonly initials = initials;
  readonly ratingClass = ratingClass;

  readonly rows = computed(() =>
    [...this.students()]
      .sort(
        (a, b) =>
          a.firstName.localeCompare(b.firstName, 'de') ||
          a.lastName.localeCompare(b.lastName, 'de'),
      )
      .map((student) => ({
        student,
        score: this.scores().get(student.id) ?? null,
        current: this.today().get(student.id)?.at(-1)?.value ?? null,
        grades: {
          written: this.gradesOfQuarter().get(`${student.id}:written`) ?? null,
          oral: this.gradesOfQuarter().get(`${student.id}:oral`) ?? null,
        } as Record<GradeArea, QuarterGrade | null>,
      })),
  );

  percentText(g: QuarterGrade | null): string {
    return g?.percent == null ? '' : String(g.percent).replace('.', ',');
  }

  gradeText(g: QuarterGrade | null): string {
    return g?.grade == null ? '–' : formatGrade(g.grade, 1);
  }

  /** Prozent eingetippt - die Note folgt aus dem Prozentschlüssel. */
  onPercent(student: Student, area: GradeArea, field: HTMLInputElement): void {
    const text = field.value.trim().replace('%', '').replace(',', '.').trim();
    if (text === '') {
      this.emitPercent(student, area, null);
      return;
    }
    const percent = Number(text);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      field.value = this.percentText(this.gradeOf(student, area));
      return;
    }
    this.emitPercent(student, area, Math.round(percent * 10) / 10);
  }

  private gradeOf(student: Student, area: GradeArea): QuarterGrade | null {
    return this.gradesOfQuarter().get(`${student.id}:${area}`) ?? null;
  }

  private emitPercent(student: Student, area: GradeArea, percent: number | null): void {
    this.gradeChange.emit({ student, quarter: this.quarter(), area, percent });
  }

  /** Die Farbe der heutigen Bewertung als CSS-Variable für die Zeile. */
  ratedColor(value: number | null): string | null {
    const css = ratingClass(value);
    return css ? `var(--${css})` : null;
  }

  signed(points: number): string {
    return points > 0 ? `+${points}` : points < 0 ? `−${Math.abs(points)}` : '0';
  }
}
