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
import { formatGrade } from '../../core/logic/assessment.logic';
import { quarterOf } from '../../core/logic/quarter.logic';
import { RouterLink } from '@angular/router';
import { SwipeRate } from './swipe-rate';

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
  imports: [SwipeRate, RouterLink],
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
          [attr.data-student]="row.student.id"
          appSwipeRate
          [swipeDisabled]="row.absent"
          (swipeRate)="rate.emit({ student: row.student, value: $event })"
          [class.flash]="flashId() === row.student.id"
          [class.rated]="row.current !== null && !row.absent"
          [class.is-absent]="row.absent"
          [class.picked]="pickedId() === row.student.id"
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

          <button
            type="button"
            class="absent-toggle"
            [class.on]="row.absent"
            [attr.aria-pressed]="row.absent"
            (click)="absent.emit(row.student)"
            [title]="row.absent ? 'Wieder anwesend' : 'Fehlt heute'"
          >
            {{ row.absent ? 'anwesend' : 'fehlt' }}
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
              <span
                class="q-cell"
                [title]="
                  area.title +
                  ' im ' +
                  quarter() +
                  '. Quartal' +
                  (row.grades[area.key]?.suggested ? ' (Ø Mitarbeit, Vorschlag)' : '')
                "
              >
                <span class="q-label">{{ area.short }}</span>
                @if (row.grades[area.key]?.percent != null) {
                  <span class="q-pct">{{ percentText(row.grades[area.key]) }}</span>
                }
                <span class="q-grade" [class.suggested]="row.grades[area.key]?.suggested">{{
                  gradeText(row.grades[area.key])
                }}</span>
              </span>
            }
          </span>

          @if (!row.absent) {
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
          }
        </div>
      } @empty {
        <div class="list-row p-row">
          <span class="row-text"
            ><span class="sub muted"
              >Keine Schüler in dieser Klasse.
              <a routerLink="/verwaltung" [queryParams]="{ tab: 'schueler', klasse: classId() }"
                >Schüler anlegen</a
              ></span
            ></span
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

    /* Fehlt/Anwesend - klein neben dem Namen, aktiv dunkel. */
    .absent-toggle {
      flex: none;
      min-height: 2rem;
      padding: 0.2rem 0.6rem;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--surface-muted);
      color: var(--text);
      font-size: 0.75rem;
      font-weight: 600;

      &.on {
        background: var(--text-muted);
        border-color: var(--text-muted);
        color: var(--bg);
      }
    }

    /* Abwesende bleiben bedienbar: der Knopf „anwesend“ darf nicht verblassen. */
    .p-row.is-absent {
      filter: none;
      opacity: 1;

      .who,
      .points,
      .q-grades {
        opacity: 0.5;
        filter: grayscale(1);
      }
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

    /* Nur Anzeige - eingetragen wird im Menü „Noten“. */
    .q-cell {
      display: inline-flex;
      align-items: baseline;
      gap: 0.3rem;
      min-width: 4.5rem;
      padding: 0.25rem 0.5rem;
      border-radius: 0.4rem;
      background: color-mix(in srgb, var(--surface) 70%, transparent);
      font-size: 0.9rem;

      .q-pct {
        color: var(--text-muted);
        font-size: 0.8rem;
      }

      .q-grade {
        font-weight: 700;
      }

      .q-grade.suggested {
        font-style: italic;
        font-weight: 600;
        color: var(--text-muted);
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

  /** Für den Link „Schüler anlegen“, wenn die Klasse leer ist. */
  readonly classId = input<number | null>(null);
  /** Wer an diesem Tag fehlt. */
  readonly absentIds = input<Set<number>>(new Set());
  /** Der gerade ausgeloste Schüler. */
  readonly pickedId = input<number | null>(null);

  readonly rate = output<RateRequest>();
  /** „fehlt“/„anwesend“ angetippt. */
  readonly absent = output<Student>();

  readonly quarters = QUARTERS;
  readonly quarter = signal<Quarter>(quarterOf(new Date()));
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
        absent: this.absentIds().has(student.id),
        grades: {
          written: this.gradesOfQuarter().get(`${student.id}:written`) ?? null,
          oral: this.gradesOfQuarter().get(`${student.id}:oral`) ?? null,
        } as Record<GradeArea, QuarterGrade | null>,
      })),
  );

  percentText(g: QuarterGrade | null): string {
    return g?.percent == null ? '' : `${String(g.percent).replace('.', ',')} %`;
  }

  gradeText(g: QuarterGrade | null): string {
    return g?.grade == null ? '–' : formatGrade(g.grade, 1);
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
