import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { formatGrade, parseGrade } from '../../core/logic/assessment.logic';
import { withToggled } from '../../core/logic/sets';
import {
  AREA_LABELS,
  AssessmentType,
  Course,
  GradeArea,
  GradeBook,
  GradingSchemeInput,
  ParticipationGrades,
  PercentScaleEntry,
} from '../../core/models';
import { LocalStore } from '../../core/store/local-store';
import { ToastService } from '../../core/ui/toast.service';

/**
 * Reiter „Bewertungsschema“: Gewichtung der Bereiche, Arten von
 * Leistungsnachweisen, Punkteschlüssel und Mitarbeitsnoten - als Entwurf, der
 * erst mit „Schema speichern“ gilt. Dazu das Übertragen auf andere Kurse.
 */
@Component({
  selector: 'app-grades-scheme',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './scheme-tab.html',
  styleUrl: './grades-tab.scss',
  styles: `
    .cols {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr));
      gap: 1.5rem;
      align-items: start;
    }
  `,
})
export class GradesSchemeTab {
  private readonly store = inject(LocalStore);
  private readonly toasts = inject(ToastService);

  readonly active = input.required<boolean>();
  readonly book = input.required<GradeBook>();
  readonly course = input<Course | null>(null);
  readonly courseId = input.required<number>();
  /** Die übrigen Kurse - auf sie lässt sich das Schema übertragen. */
  readonly otherCourses = input.required<Course[]>();
  /** Das Schema wurde gespeichert - das Notenbuch muss neu geladen werden. */
  readonly changed = output<void>();

  readonly areaLabels = AREA_LABELS;
  readonly areas: GradeArea[] = ['written', 'oral'];
  readonly formatGrade = formatGrade;

  /** Der Entwurf, an dem gerade gearbeitet wird. */
  readonly schemeDraft = signal<GradingSchemeInput | null>(null);
  readonly copyTargets = signal<Set<number>>(new Set());

  constructor() {
    // Ohne Entwurf - am Anfang und nach dem Speichern - gilt das Schema aus dem Notenbuch.
    effect(() => {
      this.book();
      untracked(() => {
        if (!this.schemeDraft()) {
          this.resetSchemeDraft();
        }
      });
    });
  }

  resetSchemeDraft(): void {
    const scheme = this.book().scheme;

    this.schemeDraft.set({
      writtenPercent: scheme.writtenPercent,
      types: scheme.types.map((t) => ({ ...t })),
      percentScale: scheme.percentScale.map((e) => ({ ...e })),
      participationWeight: scheme.participationWeight,
      participationGrades: { ...scheme.participationGrades },
    });

    const sameClass = this.otherCourses()
      .filter((c) => c.schoolClassId === this.course()?.schoolClassId)
      .map((c) => c.id);
    this.copyTargets.set(new Set(sameClass));
  }

  patchScheme(patch: Partial<GradingSchemeInput>): void {
    this.schemeDraft.update((d) => (d ? { ...d, ...patch } : d));
  }

  patchType(index: number, patch: Partial<AssessmentType>): void {
    const draft = this.schemeDraft();
    if (draft) {
      this.patchScheme({
        types: draft.types.map((t, i) => (i === index ? { ...t, ...patch } : t)),
      });
    }
  }

  addType(): void {
    const draft = this.schemeDraft();
    if (draft) {
      const key = `art-${Date.now().toString(36)}`;
      this.patchScheme({
        types: [...draft.types, { key, label: '', area: 'oral', weight: 1 }],
      });
    }
  }

  removeType(index: number): void {
    const draft = this.schemeDraft();
    if (draft) {
      this.patchScheme({ types: draft.types.filter((_, i) => i !== index) });
    }
  }

  patchScale(index: number, patch: Partial<PercentScaleEntry>): void {
    const draft = this.schemeDraft();
    if (draft) {
      this.patchScheme({
        percentScale: draft.percentScale.map((e, i) => (i === index ? { ...e, ...patch } : e)),
      });
    }
  }

  patchParticipation(key: keyof ParticipationGrades, text: string): void {
    const draft = this.schemeDraft();
    const grade = parseGrade(text);
    if (grade === null || Number.isNaN(grade)) {
      this.toasts.show('Bitte eine Note zwischen 1,0 und 6,0 eintragen.', 'error');
      return;
    }
    if (draft) {
      this.patchScheme({ participationGrades: { ...draft.participationGrades, [key]: grade } });
    }
  }

  /** Zahlen aus Eingabefeldern - mit Komma oder Punkt. */
  toNumber(text: string | number): number {
    return Number(String(text).replace(',', '.'));
  }

  saveScheme(): void {
    const draft = this.schemeDraft();
    if (!draft) {
      return;
    }

    try {
      this.store.schemes.saveScheme(this.courseId(), draft);
      this.toasts.success('Das Bewertungsschema wurde gespeichert.');
      this.schemeDraft.set(null);
      this.changed.emit();
    } catch (err) {
      this.toasts.error(err, 'Das Schema konnte nicht gespeichert werden.');
    }
  }

  toggleCopyTarget(courseId: number, checked: boolean): void {
    this.copyTargets.update((set) => withToggled(set, courseId, checked));
  }

  copyScheme(): void {
    const targets = [...this.copyTargets()];
    if (targets.length === 0) {
      this.toasts.show('Bitte mindestens einen Kurs auswählen.', 'error');
      return;
    }

    if (
      !this.book().scheme.isDefault ||
      confirm('Das Schema ist noch nicht gespeichert. Den Vorschlag übertragen?')
    ) {
      try {
        this.store.schemes.copyScheme(this.courseId(), targets);
        this.toasts.success(`Das Schema gilt jetzt auch für ${targets.length} weitere Kurse.`);
      } catch (err) {
        this.toasts.error(err, 'Das Schema konnte nicht übertragen werden.');
      }
    }
  }
}
