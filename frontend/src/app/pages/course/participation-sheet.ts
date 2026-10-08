import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  Rating,
  RatingValue,
  Student,
  StudentScore,
  WEEKDAY_NAMES,
  fullName,
  initials,
  ratingClass,
  ratingSymbol,
} from '../../core/models';
import { toDateKey } from '../../core/store/time';
import { Icon } from '../../core/ui/icon';
import { RATING_OPTIONS } from './participation-list';

type Period = 'alles' | 'monat' | 'woche';

/**
 * Die Mitarbeit eines Schülers als Blatt über der Seite - wie die
 * Detailansicht der Klassenmappe: ‹ Name ›, ein Balken von Grün bis Rot mit
 * der Anzahl je Stufe und darunter der Verlauf Tag für Tag.
 */
@Component({
  selector: 'app-participation-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div class="sheet-backdrop" (click)="closed.emit()">
      <div
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Mitarbeit"
        (click)="$event.stopPropagation()"
      >
        <div class="sheet-head">
          <button class="round-btn" type="button" (click)="closed.emit()" aria-label="Schließen">
            <app-icon name="chevron-left" />
          </button>
          <h2>Mitarbeit</h2>
          <span></span>
        </div>

        <div class="sheet-body">
          <div class="person">
            <button
              class="btn ghost icon"
              type="button"
              [disabled]="!hasPrev()"
              (click)="step.emit(-1)"
              aria-label="Vorheriger Schüler"
            >
              <app-icon name="chevron-left" />
            </button>
            <span class="avatar big">
              @if (student().photoUrl) {
                <img [src]="student().photoUrl" alt="" />
              } @else {
                <span>{{ initials(student()) }}</span>
              }
            </span>
            <span class="who">
              <strong>{{ student().firstName }}</strong>
              <span class="muted">{{ student().lastName }}</span>
            </span>
            <span class="total">
              <span class="muted small">{{ subjectName() }}</span>
              <strong
                class="points"
                [class.pos]="(score()?.points ?? 0) > 0"
                [class.neg]="(score()?.points ?? 0) < 0"
                >{{ signed(score()?.points ?? 0) }}</strong
              >
              @if (score()?.grade) {
                <span class="small">Note {{ score()!.grade }}</span>
              }
            </span>
            <button
              class="btn ghost icon"
              type="button"
              [disabled]="!hasNext()"
              (click)="step.emit(1)"
              aria-label="Nächster Schüler"
            >
              <app-icon name="chevron-right" />
            </button>
          </div>

          <div class="block">
            <div class="tabs period" role="tablist" aria-label="Zeitraum">
              <button
                type="button"
                role="tab"
                [attr.aria-selected]="period() === 'woche'"
                (click)="period.set('woche')"
              >
                7 Tage
              </button>
              <button
                type="button"
                role="tab"
                [attr.aria-selected]="period() === 'monat'"
                (click)="period.set('monat')"
              >
                30 Tage
              </button>
              <button
                type="button"
                role="tab"
                [attr.aria-selected]="period() === 'alles'"
                (click)="period.set('alles')"
              >
                Gesamt
              </button>
            </div>

            <div class="bar" aria-label="Verteilung der Bewertungen">
              @for (part of distribution(); track part.value) {
                <span
                  class="seg"
                  [class]="ratingClass(part.value)"
                  [title]="part.symbol + ': ' + part.count + '×'"
                >
                  <span class="seg-sym">{{ part.symbol }}</span>
                  <span>{{ part.count }}</span>
                </span>
              }
            </div>
          </div>

          <div>
            <p class="section-label">Jetzt bewerten</p>
            <div class="quick">
              @for (option of options; track option.value) {
                <button
                  type="button"
                  [class]="ratingClass(option.value)"
                  (click)="rate.emit(option.value)"
                  [title]="option.title"
                >
                  {{ option.symbol }}
                </button>
              }
            </div>
          </div>

          <div>
            <p class="section-label">Verlauf</p>
            <div class="list-group">
              @for (day of days(); track day.key) {
                <div class="list-row day">
                  <span class="row-text">
                    <strong>{{ day.label }}</strong>
                    <span class="sub muted"
                      >{{ day.ratings.length }}
                      {{ day.ratings.length === 1 ? 'Eintrag' : 'Einträge' }}</span
                    >
                  </span>
                  <span class="entries">
                    @for (rating of day.ratings; track rating.id) {
                      <button
                        type="button"
                        class="entry"
                        [class]="ratingClass(rating.value)"
                        (click)="remove.emit(rating)"
                        [title]="'Bewertung ' + ratingSymbol(rating.value) + ' löschen'"
                      >
                        {{ ratingSymbol(rating.value) }}
                        <app-icon name="x" />
                      </button>
                    }
                  </span>
                </div>
              } @empty {
                <div class="list-row">
                  <span class="row-text"
                    ><span class="sub muted">Noch keine Bewertung in diesem Fach.</span></span
                  >
                </div>
              }
            </div>
            <p class="muted small hint">
              Antippen einer Bewertung im Verlauf löscht sie (mit Rückfrage).
            </p>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: `
    .person {
      display: flex;
      align-items: center;
      gap: 0.7rem;
      padding: 0.6rem;
      background: var(--surface);
      border-radius: var(--radius);
    }

    .avatar.big {
      width: 3.6rem;
      height: 3.6rem;
      font-size: 1.1rem;
    }

    .who {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-width: 0;
      line-height: 1.25;

      strong {
        font-size: 1.1rem;
      }
    }

    .total {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      line-height: 1.2;

      .points {
        font-size: 1.3rem;
      }
    }

    .block {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 0.6rem;
      background: var(--surface);
      border-radius: var(--radius);
    }

    .period {
      display: flex;

      button {
        flex: 1 1 0;
      }
    }

    .bar {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      overflow: hidden;
      border-radius: 0.4rem;
    }

    .seg {
      display: flex;
      justify-content: center;
      gap: 0.4rem;
      padding: 0.35rem 0;
      font-variant-numeric: tabular-nums;
      font-size: 0.9rem;
    }

    .seg-sym {
      font-weight: 750;
    }

    .quick {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.4rem;

      button {
        min-height: 3rem;
        border: 0;
        border-radius: 0.55rem;
        font-size: 1.1rem;
        font-weight: 750;

        &:active {
          transform: scale(0.95);
        }
      }
    }

    .day {
      flex-wrap: wrap;
    }

    .entries {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
      justify-content: flex-end;
    }

    .entry {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      min-width: 2.6rem;
      padding: 0.25rem 0.45rem;
      border: 0;
      border-radius: 0.35rem;
      font-weight: 750;

      app-icon {
        font-size: 0.7rem;
        opacity: 0.55;
      }
    }

    .hint {
      margin: 0.4rem 0.25rem 0;
    }
  `,
})
export class ParticipationSheet {
  readonly student = input.required<Student>();
  readonly subjectName = input('');
  readonly score = input<StudentScore | null>(null);
  readonly ratings = input.required<Rating[]>();
  readonly hasPrev = input(false);
  readonly hasNext = input(false);

  readonly closed = output<void>();
  readonly step = output<-1 | 1>();
  readonly rate = output<RatingValue>();
  readonly remove = output<Rating>();

  readonly period = signal<Period>('alles');

  readonly options = RATING_OPTIONS;
  readonly initials = initials;
  readonly fullName = fullName;
  readonly ratingClass = ratingClass;
  readonly ratingSymbol = ratingSymbol;

  private readonly inPeriod = computed(() => {
    const period = this.period();
    if (period === 'alles') {
      return this.ratings();
    }
    const from = new Date();
    from.setDate(from.getDate() - (period === 'woche' ? 7 : 30));
    const fromKey = toDateKey(from);
    return this.ratings().filter((r) => r.lessonDate >= fromKey);
  });

  readonly distribution = computed(() =>
    RATING_OPTIONS.map((option) => ({
      value: option.value,
      symbol: option.symbol,
      count: this.inPeriod().filter((r) => r.value === option.value).length,
    })),
  );

  /** Der Verlauf nach Tagen, der neueste oben. */
  readonly days = computed(() => {
    const byDay = new Map<string, Rating[]>();
    for (const rating of this.inPeriod()) {
      byDay.set(rating.lessonDate, [...(byDay.get(rating.lessonDate) ?? []), rating]);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, ratings]) => {
        const date = new Date(`${key}T12:00:00`);
        return {
          key,
          label: `${WEEKDAY_NAMES[date.getDay()].slice(0, 2)}., ${date.toLocaleDateString('de-DE')}`,
          ratings: ratings.sort((a, b) => a.id - b.id),
        };
      });
  });

  signed(points: number): string {
    return points > 0 ? `+${points}` : points < 0 ? `−${Math.abs(points)}` : '0';
  }
}
