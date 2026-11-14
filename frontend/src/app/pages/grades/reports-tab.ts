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
import { renderReports } from '../../core/export/report';
import { formatGrade } from '../../core/logic/assessment.logic';
import { withToggled } from '../../core/logic/sets';
import { formatDateTimeGerman, toDateKey } from '../../core/logic/time';
import { GradeBook, GradeReport, GradingPeriod, StudentReport } from '../../core/models';
import { download, isNativeApp } from '../../core/persistence/file-system';
import { LocalStore } from '../../core/store/local-store';
import { ToastService } from '../../core/ui/toast.service';

function htmlBlob(reports: StudentReport[]): Blob {
  return new Blob([renderReports(reports)], { type: 'text/html;charset=utf-8' });
}

/**
 * Reiter „Notenbögen“: je Schüler ein Bogen mit seinem Stand - zum Drucken
 * oder als HTML-Datei. Jede Ausgabe wird vermerkt.
 */
@Component({
  selector: 'app-grades-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reports-tab.html',
  styleUrl: './grades-tab.scss',
})
export class GradesReportsTab {
  private readonly store = inject(LocalStore);
  private readonly toasts = inject(ToastService);

  readonly active = input.required<boolean>();
  readonly book = input.required<GradeBook>();
  readonly courseId = input.required<number>();
  /** Der gewählte Zeitraum - null: gesamter Zeitraum. */
  readonly period = input<GradingPeriod | null>(null);
  /** Die bisher ausgegebenen Bögen. */
  readonly reports = input.required<GradeReport[]>();
  /** Bögen wurden ausgegeben - die Liste muss neu geladen werden. */
  readonly issued = output<void>();

  readonly formatGrade = formatGrade;
  readonly formatDateTime = formatDateTimeGerman;

  /** Für wen ein Bogen erzeugt wird. */
  readonly reportSelection = signal<Set<number>>(new Set());

  constructor() {
    // Solange niemand gewählt ist, sind alle Schüler vorausgewählt.
    effect(() => {
      const students = this.book().students;
      untracked(() => {
        if (this.reportSelection().size === 0) {
          this.reportSelection.set(new Set(students.map((s) => s.studentId)));
        }
      });
    });
  }

  toggleReportStudent(studentId: number, checked: boolean): void {
    this.reportSelection.update((set) => withToggled(set, studentId, checked));
  }

  selectAllForReport(all: boolean): void {
    this.reportSelection.set(new Set(all ? this.book().students.map((s) => s.studentId) : []));
  }

  /** Erzeugt die Bögen und öffnet den Druckdialog - dort lässt sich auch ein PDF speichern. */
  printReports(): void {
    this.issue((reports) => {
      // Die Android-App kann nicht drucken. Sie gibt die Bögen deshalb als Datei
      // weiter - in Chrome geöffnet, lassen sie sich dort drucken oder als PDF sichern.
      if (isNativeApp()) {
        void download(htmlBlob(reports), `notenboegen-${toDateKey(new Date())}.html`, {
          share: true,
        });
        return;
      }

      const frame = document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.width = '0';
      frame.style.height = '0';
      frame.style.border = '0';
      frame.srcdoc = renderReports(reports);
      frame.onload = () => {
        frame.contentWindow?.print();
        setTimeout(() => frame.remove(), 60_000);
      };
      document.body.appendChild(frame);
    });
  }

  /** Je Schüler eine eigene HTML-Datei - zum Hochladen in Moodle, Teams & Co. */
  downloadReports(): void {
    this.issue((reports) => {
      for (const report of reports) {
        const name = `${report.lastName}-${report.firstName}`.replace(/[^\p{L}\p{N}-]/gu, '-');
        void download(htmlBlob([report]), `notenbogen-${name}-${toDateKey(new Date())}.html`);
      }
    });
  }

  private issue(deliver: (reports: StudentReport[]) => void): void {
    const ids = [...this.reportSelection()];

    try {
      const reports = this.store.gradeBook.issueReports(
        this.courseId(),
        ids,
        this.period()?.id ?? null,
      );
      deliver(reports);
      this.toasts.success(
        `${reports.length} ${reports.length === 1 ? 'Notenbogen' : 'Notenbögen'} erzeugt und vermerkt.`,
      );
      this.issued.emit();
    } catch (err) {
      this.toasts.error(err, 'Die Notenbögen konnten nicht erzeugt werden.');
    }
  }
}
