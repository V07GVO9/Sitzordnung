import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  Rating,
  RatingValue,
  Student,
  StudentScore,
  fullName,
  initials,
  ratingClass,
  ratingSymbol,
} from '../../core/models';

export interface RateRequest {
  student: Student;
  value: RatingValue;
}

/** Die vier Stufen der Skala - in den Farben der Klassenmappe. */
export const RATING_OPTIONS: { value: RatingValue; symbol: string; title: string }[] = [
  { value: 2, symbol: '++', title: 'Sehr gute Mitarbeit (++)' },
  { value: 1, symbol: '+', title: 'Gute Mitarbeit (+)' },
  { value: -1, symbol: '−', title: 'Schwache Mitarbeit (−)' },
  { value: -2, symbol: '−−', title: 'Keine Mitarbeit / Störung (−−)' },
];

/**
 * Mitarbeit als Liste - wie der Reiter „Mitarbeit“ im Kursbuch der
 * Klassenmappe: Foto, Name, was heute schon eingetragen ist, der
 * Punktestand und rechts die kleine Skala zum Antippen.
 */
@Component({
  selector: 'app-participation-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="list-group">
      @for (row of rows(); track row.student.id) {
        <div class="list-row p-row" [class.flash]="flashId() === row.student.id">
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
              @if (row.today.length) {
                <span class="today">
                  {{ dayLabel() }}
                  @for (rating of row.today; track rating.id) {
                    <span class="chip" [class]="ratingClass(rating.value)">{{
                      ratingSymbol(rating.value)
                    }}</span>
                  }
                </span>
              } @else {
                <span class="sub muted">keine Bewertung {{ dayLabel() }}</span>
              }
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

          <span
            class="scale"
            role="group"
            [attr.aria-label]="'Mitarbeit von ' + fullName(row.student)"
          >
            @for (option of options; track option.value) {
              <button
                type="button"
                [class]="ratingClass(option.value)"
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
        <div class="list-row">
          <span class="row-text"
            ><span class="sub muted">Keine Schüler in dieser Klasse.</span></span
          >
        </div>
      }
    </div>
  `,
  styles: `
    .p-row {
      gap: 0.6rem;
      padding-block: 0.4rem;
      flex-wrap: wrap;
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

    .today {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.78rem;
      color: var(--text-muted);
    }

    .chip {
      min-width: 1.6rem;
      padding: 0 0.3rem;
      border-radius: 0.3rem;
      font-weight: 700;
      font-size: 0.75rem;
      text-align: center;
    }

    .points {
      flex: none;
      min-width: 2.6rem;
      text-align: right;
      font-size: 0.95rem;
    }

    .scale {
      display: grid;
      grid-template-columns: repeat(4, 3rem);
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
      }
    }

    @media (max-width: 34rem) {
      .scale {
        grid-template-columns: repeat(4, 1fr);
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
  /** „heute“ oder - beim Nachtragen aus dem Wochenplan - „am 05.10.“. */
  readonly dayLabel = input('heute');

  readonly rate = output<RateRequest>();
  readonly openStudent = output<Student>();

  readonly options = RATING_OPTIONS;
  readonly fullName = fullName;
  readonly initials = initials;
  readonly ratingClass = ratingClass;
  readonly ratingSymbol = ratingSymbol;

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
        today: this.today().get(student.id) ?? [],
      })),
  );

  signed(points: number): string {
    return points > 0 ? `+${points}` : points < 0 ? `−${Math.abs(points)}` : '0';
  }
}
