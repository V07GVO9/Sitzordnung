import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { formatGrade } from '../../core/logic/assessment.logic';
import { formatDateGerman, toDateKey } from '../../core/logic/time';
import {
  AREA_LABELS,
  Assessment,
  AssessmentDetail,
  AssessmentInput,
  Course,
  GradeBook,
  ResultStatus,
  STATUS_LABELS,
} from '../../core/models';
import { LocalStore } from '../../core/store/local-store';
import { ToastService } from '../../core/ui/toast.service';
import { collectResults, ResultRow } from './assessment-results';
import { GradesParticipationImport } from './participation-import';

/** Ein Leistungsnachweis im Formular. */
interface AssessmentForm {
  typeKey: string;
  title: string;
  date: string;
  maxPoints: string;
}

function emptyForm(): AssessmentForm {
  return { typeKey: '', title: '', date: toDateKey(new Date()), maxPoints: '' };
}

function toInput(form: AssessmentForm): AssessmentInput {
  const maxPoints = form.maxPoints.trim() === '' ? null : Number(form.maxPoints.replace(',', '.'));
  return {
    typeKey: form.typeKey,
    title: form.title,
    date: form.date,
    maxPoints,
    comment: null,
  };
}

/**
 * Reiter „Leistungsnachweise“: Klassenarbeit, Test, Referat ... anlegen,
 * Punkte oder Noten eintragen und freigeben.
 */
@Component({
  selector: 'app-grades-assessments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, GradesParticipationImport],
  templateUrl: './assessments-tab.html',
  styleUrl: './grades-tab.scss',
  styles: `
    .mirror {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      align-items: center;
      margin: 0.75rem 0;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class GradesAssessmentsTab {
  private readonly store = inject(LocalStore);
  private readonly toasts = inject(ToastService);

  readonly active = input.required<boolean>();
  readonly book = input.required<GradeBook>();
  readonly course = input<Course | null>(null);
  readonly courseId = input.required<number>();
  /** Etwas wurde geändert - das Notenbuch muss neu geladen werden. */
  readonly changed = output<void>();

  readonly areaLabels = AREA_LABELS;
  readonly statusLabels = STATUS_LABELS;
  readonly statuses: ResultStatus[] = ['graded', 'excused', 'refused'];
  readonly formatGrade = formatGrade;
  readonly formatDate = formatDateGerman;

  readonly newForm = signal<AssessmentForm>(emptyForm());
  /** Der geöffnete Nachweis - null zeigt die Liste. */
  readonly detail = signal<AssessmentDetail | null>(null);
  readonly detailForm = signal<AssessmentForm>(emptyForm());
  readonly resultRows = signal<ResultRow[]>([]);
  readonly changeReason = signal('');

  /** Wie viele Ergebnisse auf jede ganze Note fallen - der Notenspiegel. */
  readonly distribution = computed(() => {
    const counts = [0, 0, 0, 0, 0, 0];
    for (const result of this.detail()?.results ?? []) {
      if (result.effectiveGrade !== null) {
        counts[Math.min(6, Math.max(1, Math.round(result.effectiveGrade))) - 1]++;
      }
    }
    return counts;
  });

  constructor() {
    // Solange im Formular keine Art gewählt ist, gilt die erste des Schemas.
    effect(() => {
      const types = this.book().scheme.types;
      untracked(() => {
        if (!this.newForm().typeKey && types.length) {
          this.newForm.update((f) => ({ ...f, typeKey: types[0].key }));
        }
      });
    });
  }

  updateNewForm(patch: Partial<AssessmentForm>): void {
    this.newForm.update((f) => ({ ...f, ...patch }));
  }

  updateDetailForm(patch: Partial<AssessmentForm>): void {
    this.detailForm.update((f) => ({ ...f, ...patch }));
  }

  createAssessment(): void {
    try {
      const assessment = this.store.assessments.createAssessment(
        this.courseId(),
        toInput(this.newForm()),
      );
      this.newForm.update((f) => ({ ...f, title: '', maxPoints: '' }));
      this.toasts.success(`„${assessment.title}" wurde angelegt. Jetzt die Noten eintragen.`);
      this.changed.emit();
      this.openAssessment(assessment.id);
    } catch (err) {
      this.toasts.error(err, 'Der Leistungsnachweis konnte nicht angelegt werden.');
    }
  }

  /** Aus einer PDF-Übersicht ist ein Nachweis entstanden - er wird gleich geöffnet. */
  onImported(assessment: Assessment): void {
    this.changed.emit();
    this.openAssessment(assessment.id);
  }

  openAssessment(id: number): void {
    try {
      this.applyDetail(this.store.assessments.getAssessmentDetail(id));
    } catch (err) {
      this.toasts.error(err, 'Der Leistungsnachweis konnte nicht geladen werden.');
    }
  }

  closeAssessment(): void {
    this.detail.set(null);
  }

  private applyDetail(detail: AssessmentDetail): void {
    const a = detail.assessment;
    const number = (value: number | null, digits?: number) =>
      value === null ? '' : (digits ? value.toFixed(digits) : String(value)).replace('.', ',');

    this.detail.set(detail);
    this.changeReason.set('');
    this.detailForm.set({
      typeKey: a.typeKey,
      title: a.title,
      date: a.date,
      maxPoints: number(a.maxPoints),
    });
    this.resultRows.set(
      detail.results.map((r) => ({
        studentId: r.studentId,
        name: `${r.lastName}, ${r.firstName}`,
        status: r.status,
        points: number(r.points),
        grade: number(r.grade, 1),
        comment: r.comment ?? '',
      })),
    );
  }

  updateRow(studentId: number, patch: Partial<ResultRow>): void {
    this.resultRows.update((rows) =>
      rows.map((r) => (r.studentId === studentId ? { ...r, ...patch } : r)),
    );
  }

  saveAssessment(): void {
    const detail = this.detail();
    if (!detail) {
      return;
    }

    let results;
    try {
      results = collectResults(this.resultRows());
    } catch (error) {
      this.toasts.error(error);
      return;
    }

    const id = detail.assessment.id;
    try {
      this.store.assessments.updateAssessment(id, toInput(this.detailForm()));
    } catch (err) {
      this.toasts.error(err, 'Der Leistungsnachweis konnte nicht gespeichert werden.');
      return;
    }

    try {
      this.applyDetail(this.store.assessments.saveResults(id, results, this.changeReason()));
      this.toasts.success('Gespeichert.');
      this.changed.emit();
    } catch (err) {
      this.toasts.error(err, 'Die Noten konnten nicht gespeichert werden.');
    }
  }

  setReleased(released: boolean): void {
    const detail = this.detail();
    if (!detail) {
      return;
    }

    if (
      !released &&
      !confirm('Freigabe zurücknehmen? Der Nachweis zählt dann nicht mehr im Notenstand.')
    ) {
      return;
    }

    try {
      this.store.assessments.setAssessmentReleased(detail.assessment.id, released);
      this.toasts.success(
        released ? 'Freigegeben - die Noten zählen jetzt.' : 'Die Freigabe wurde zurückgenommen.',
      );
      this.openAssessment(detail.assessment.id);
      this.changed.emit();
    } catch (err) {
      this.toasts.error(err, 'Die Freigabe konnte nicht geändert werden.');
    }
  }

  deleteAssessment(): void {
    const detail = this.detail();
    if (!detail || !confirm(`„${detail.assessment.title}" mit allen Noten löschen?`)) {
      return;
    }

    try {
      this.store.assessments.deleteAssessment(detail.assessment.id);
      this.detail.set(null);
      this.toasts.success('Der Leistungsnachweis wurde gelöscht.');
      this.changed.emit();
    } catch (err) {
      this.toasts.error(err, 'Der Leistungsnachweis konnte nicht gelöscht werden.');
    }
  }
}
