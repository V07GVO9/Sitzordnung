import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ImportedStudentReport,
  RatingCounts,
  describeCounts,
  gradeFromCounts,
  matchStudent,
  parseReportPages,
  subjectMatches,
} from '../../core/import/participation-import';
import { readPdfPages } from '../../core/import/pdf-text';
import { formatGrade } from '../../core/logic/assessment.logic';
import { formatDateGerman, toDateKey } from '../../core/logic/time';
import { Assessment, Course, GradeBook } from '../../core/models';
import { LocalStore } from '../../core/store/local-store';
import { ToastService } from '../../core/ui/toast.service';

/** Eine Zeile der Vorschau beim Übernehmen einer Mitarbeitsübersicht. */
interface ImportRow {
  index: number;
  name: string;
  counts: RatingCounts | null;
  summary: string;
  grade: number | null;
  studentId: number | null;
}

/** Größte PDF-Datei, die übernommen wird - die Übersichten enthalten Fotos. */
const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

/**
 * Übernimmt Mitarbeitsnoten aus der PDF-Übersicht eines anderen Werkzeugs:
 * Datei lesen, Namen den Schülern zuordnen, Vorschau zeigen - und daraus
 * einen freigegebenen mündlichen Leistungsnachweis anlegen.
 */
@Component({
  selector: 'app-grades-participation-import',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './participation-import.html',
  styleUrl: './grades-tab.scss',
})
export class GradesParticipationImport {
  private readonly store = inject(LocalStore);
  private readonly toasts = inject(ToastService);

  readonly active = input.required<boolean>();
  readonly book = input.required<GradeBook>();
  readonly course = input<Course | null>(null);
  readonly courseId = input.required<number>();
  /** Der angelegte Leistungsnachweis. */
  readonly imported = output<Assessment>();

  readonly formatGrade = formatGrade;

  readonly importReports = signal<ImportedStudentReport[] | null>(null);
  readonly importFileName = signal('');
  readonly importBusy = signal(false);
  readonly importLabel = signal('');
  readonly importForm = signal({ typeKey: '', title: '', date: '' });
  /** Seite der Übersicht -> zugeordneter Schüler (null = nicht übernehmen). */
  readonly importAssignment = signal<Record<number, number | null>>({});

  readonly oralTypes = computed(() => this.book().scheme.types.filter((t) => t.area === 'oral'));

  /** Die Fächer, die in der Übersicht vorkommen. */
  readonly importLabels = computed(() => [
    ...new Set((this.importReports() ?? []).flatMap((r) => r.subjects.map((s) => s.label))),
  ]);

  readonly importRows = computed<ImportRow[]>(() => {
    const book = this.book();
    const label = this.importLabel();
    const assignment = this.importAssignment();
    return (this.importReports() ?? []).map((report, index) => {
      const counts = report.subjects.find((s) => s.label === label)?.counts ?? null;
      return {
        index,
        name: report.name,
        counts,
        summary: counts ? describeCounts(counts) : '',
        grade: counts ? gradeFromCounts(counts, book.scheme.participationGrades) : null,
        studentId: assignment[index] ?? null,
      };
    });
  });

  /** Zeilen, die tatsächlich übernommen werden. */
  readonly importReady = computed(() =>
    this.importRows().filter((r) => r.grade !== null && r.studentId !== null),
  );

  /** Schüler, die mehr als einer Zeile zugeordnet sind. */
  readonly importDuplicates = computed(() => {
    const ids = this.importReady().map((r) => r.studentId);
    return new Set(ids.filter((id, i) => ids.indexOf(id) !== i));
  });

  async importFileChosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    if (file.size > MAX_IMPORT_BYTES) {
      this.toasts.show('Die Datei ist größer als 50 MB.', 'error');
      return;
    }

    this.importBusy.set(true);
    try {
      const reports = parseReportPages(
        await readPdfPages(new Uint8Array(await file.arrayBuffer())),
      );
      if (reports.length === 0) {
        this.toasts.show(
          'In der Datei wurde keine Mitarbeitsübersicht gefunden (eine Seite je Schüler mit „vom … bis …").',
          'error',
        );
        return;
      }
      this.startImport(file.name, reports);
    } catch {
      this.toasts.show('Die PDF-Datei konnte nicht gelesen werden.', 'error');
    } finally {
      this.importBusy.set(false);
    }
  }

  private startImport(fileName: string, reports: ImportedStudentReport[]): void {
    const course = this.course();
    const students = this.book().students.map((s) => ({ ...s, id: s.studentId }));

    const labels = [...new Set(reports.flatMap((r) => r.subjects.map((s) => s.label)))];
    const label =
      labels.find(
        (l) => course && subjectMatches(l, course.subjectShortName, course.subjectName),
      ) ??
      labels[0] ??
      '';

    const assignment: Record<number, number | null> = {};
    reports.forEach((report, index) => {
      assignment[index] = matchStudent(report.name, students)?.id ?? null;
    });

    const period = reports.find((r) => r.from && r.to);
    const oral = this.oralTypes();
    const typeKey = oral.find((t) => /mitarbeit/i.test(t.key + t.label))?.key ?? oral[0]?.key ?? '';

    this.importFileName.set(fileName);
    this.importReports.set(reports);
    this.importAssignment.set(assignment);
    this.importLabel.set(label);
    this.importForm.set({
      typeKey,
      title: this.importTitle(label, period),
      date: period?.to ?? toDateKey(new Date()),
    });
  }

  private importTitle(label: string, period?: ImportedStudentReport): string {
    const range =
      period?.from && period.to
        ? ` ${formatDateGerman(period.from)}–${formatDateGerman(period.to)}`
        : '';
    return `Mitarbeit (übernommen) ${label}${range}`.replace(/\s+/g, ' ').trim();
  }

  selectImportLabel(label: string): void {
    const period = (this.importReports() ?? []).find((r) => r.from && r.to);
    this.importLabel.set(label);
    this.importForm.update((f) => ({ ...f, title: this.importTitle(label, period) }));
  }

  updateImportForm(patch: Partial<{ typeKey: string; title: string; date: string }>): void {
    this.importForm.update((f) => ({ ...f, ...patch }));
  }

  assignImport(index: number, studentId: string): void {
    const id = studentId === '' ? null : Number(studentId);
    this.importAssignment.update((a) => ({ ...a, [index]: id }));
  }

  cancelImport(): void {
    this.importReports.set(null);
    this.importAssignment.set({});
  }

  applyImport(): void {
    const form = this.importForm();
    const rows = this.importReady();
    const period = (this.importReports() ?? []).find((r) => r.from && r.to);

    try {
      const assessment = this.store.assessments.importAssessment(this.courseId(), {
        typeKey: form.typeKey,
        title: form.title,
        date: form.date,
        comment: `Übernommen aus ${this.importFileName()} (${this.importLabel()})`,
        results: rows.map((r) => ({
          studentId: r.studentId!,
          grade: r.grade!,
          comment: `${r.summary}${
            period?.from && period.to
              ? ` (${formatDateGerman(period.from)}–${formatDateGerman(period.to)})`
              : ''
          }`,
        })),
      });
      this.cancelImport();
      this.toasts.success(
        `„${assessment.title}" wurde mit ${rows.length} Noten angelegt und freigegeben.`,
      );
      this.imported.emit(assessment);
    } catch (err) {
      this.toasts.error(err, 'Die Übernahme ist fehlgeschlagen.');
    }
  }
}
