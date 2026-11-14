import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatGrade } from '../../core/logic/assessment.logic';
import { formatDateGerman } from '../../core/logic/time';
import { Assessment, Course, GradeBook, StudentGrades } from '../../core/models';
import { Icon } from '../../core/ui/icon';
import { GradeWarning, gradeWarnings } from './grade-warnings';

/** Reiter „Übersicht“: der Notenstand jedes Schülers, darüber die Hinweise. */
@Component({
  selector: 'app-grades-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  templateUrl: './overview-tab.html',
  styleUrl: './grades-tab.scss',
  styles: `
    /* Hinweise über der Notenübersicht. */
    .warn-box {
      margin: 0.5rem 0 0.75rem;
      border: 1px solid var(--warning);
      border-radius: var(--radius-sm, 0.5rem);
      background: var(--warning-soft);
      color: var(--warning-text);

      ul {
        margin: 0;
        padding: 0 0.9rem 0.6rem 2.1rem;
        font-size: 0.88rem;
        line-height: 1.5;
      }

      .bad {
        font-weight: 700;
      }
    }

    .warn-head {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      width: 100%;
      min-height: 2.6rem;
      padding: 0.4rem 0.75rem;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      text-align: left;
    }

    .warn-row td:first-child {
      box-shadow: inset 3px 0 0 var(--warning);
    }

    .warn-icon {
      margin-left: 0.3rem;
      color: var(--warning-text);
      vertical-align: -0.1em;
    }
  `,
})
export class GradesOverviewTab {
  readonly active = input.required<boolean>();
  readonly book = input.required<GradeBook>();
  /** Für den Link „Schüler anlegen“, wenn die Klasse leer ist. */
  readonly course = input<Course | null>(null);

  readonly formatGrade = formatGrade;
  readonly formatDate = formatDateGerman;

  readonly releasedAssessments = computed(() => this.book().assessments.filter((a) => a.released));

  /** Hinweise je Schüler - schlechter als 4,0, fehlende Noten. */
  readonly warnings = computed(() => {
    const book = this.book();
    const map = new Map<number, GradeWarning[]>();
    for (const student of book.students) {
      const list = gradeWarnings(student, this.releasedAssessments(), book.scheme.writtenPercent);
      if (list.length) {
        map.set(student.studentId, list);
      }
    }
    return map;
  });

  /** Für den Kasten über der Tabelle: wer welche Hinweise hat. */
  readonly warningRows = computed(() =>
    this.book()
      .students.filter((s) => this.warnings().has(s.studentId))
      .map((s) => ({
        name: `${s.lastName}, ${s.firstName}`,
        warnings: this.warnings().get(s.studentId)!,
      })),
  );
  readonly warningsOpen = signal(true);

  warningText(list: GradeWarning[]): string {
    return list.map((w) => w.text).join(' · ');
  }

  gradeOf(student: StudentGrades, assessment: Assessment): number | null {
    return student.assessmentGrades[assessment.id] ?? null;
  }
}
