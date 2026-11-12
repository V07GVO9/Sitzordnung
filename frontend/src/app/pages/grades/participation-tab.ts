import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { formatGrade } from '../../core/logic/assessment.logic';
import { formatDateGerman } from '../../core/logic/time';
import { GradeBook, LessonGrade, StudentGrades, ratingSymbol } from '../../core/models';
import { LocalStore } from '../../core/store/local-store';
import { ToastService } from '../../core/ui/toast.service';

/** Die Auswahl in einer Zelle der Mitarbeitstabelle. */
const OVERRIDE_GRADES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6];

/**
 * Reiter „Mitarbeit“: je Doppelstunde die Note jedes Schülers - aus den
 * Bewertungen, von Hand gesetzt oder „fehlte“.
 */
@Component({
  selector: 'app-grades-participation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './participation-tab.html',
  styleUrl: './grades-tab.scss',
  styles: `
    table.lessons {
      td.cell select {
        padding: 0.2rem;
        min-width: 4.5rem;
        font-variant-numeric: tabular-nums;
      }

      td.override select {
        background: var(--warning-soft);
      }

      td.absent select {
        color: var(--text-muted);
        text-decoration: line-through;
      }
    }
  `,
})
export class GradesParticipationTab {
  private readonly store = inject(LocalStore);
  private readonly toasts = inject(ToastService);

  readonly active = input.required<boolean>();
  readonly book = input.required<GradeBook>();
  readonly courseId = input.required<number>();
  /** Eine Note wurde gesetzt - das Notenbuch muss neu geladen werden. */
  readonly changed = output<void>();

  readonly overrideGrades = OVERRIDE_GRADES;
  readonly formatGrade = formatGrade;
  readonly formatDate = formatDateGerman;
  readonly ratingSymbol = ratingSymbol;

  /** Der Wert der Auswahlliste einer Zelle. */
  lessonChoice(lesson: LessonGrade): string {
    if (!lesson.override) {
      return 'auto';
    }
    return lesson.override.grade === null ? 'absent' : String(lesson.override.grade);
  }

  setLesson(student: StudentGrades, lesson: LessonGrade, select: HTMLSelectElement): void {
    const choice = select.value;
    const grade = choice === 'auto' ? 'auto' : choice === 'absent' ? null : Number(choice);
    const reason =
      choice === 'auto'
        ? null
        : prompt(
            `Begründung für ${student.firstName} ${student.lastName} am ` +
              `${formatDateGerman(lesson.date)} (optional):`,
            choice === 'absent' ? 'fehlte' : '',
          );

    // Abbrechen im Dialog lässt alles beim Alten.
    if (reason === null && choice !== 'auto') {
      select.value = this.lessonChoice(lesson);
      return;
    }

    try {
      this.store.participation.setParticipationOverride(
        this.courseId(),
        student.studentId,
        lesson.date,
        grade,
        reason,
      );
      this.changed.emit();
    } catch (err) {
      this.toasts.error(err, 'Die Note konnte nicht gesetzt werden.');
      select.value = this.lessonChoice(lesson);
    }
  }
}
