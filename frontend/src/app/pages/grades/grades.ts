import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { formatDateGerman, toDateKey } from '../../core/logic/time';
import {
  Course,
  DateRange,
  GradeBook,
  GradeChange,
  GradeReport,
  GradingPeriod,
} from '../../core/models';
import { downloadExport } from '../../core/persistence/file-system';
import { LocalStore } from '../../core/store/local-store';
import { Icon } from '../../core/ui/icon';
import { ToastService } from '../../core/ui/toast.service';
import { GradesAssessmentsTab } from './assessments-tab';
import { GradesLogTab } from './log-tab';
import { GradesOverviewTab } from './overview-tab';
import { GradesParticipationTab } from './participation-tab';
import { GradesReportsTab } from './reports-tab';
import { GradesSchemeTab } from './scheme-tab';

type Tab = 'overview' | 'assessments' | 'participation' | 'scheme' | 'reports' | 'log';

/** Seltener gebraucht - diese Reiter liegen unter „Mehr“. */
const MORE_TABS: { tab: Tab; label: string }[] = [
  { tab: 'scheme', label: 'Bewertungsschema' },
  { tab: 'reports', label: 'Notenbögen' },
  { tab: 'log', label: 'Protokoll' },
];

/**
 * Die Notenverwaltung eines Kurses. Die Seite selbst kümmert sich um den
 * Kopf - Kurs, Zeitraum, Reiter - und hält das Notenbuch aktuell; was in
 * einem Reiter passiert, steht in dessen eigener Komponente.
 */
@Component({
  selector: 'app-grades',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    Icon,
    GradesOverviewTab,
    GradesAssessmentsTab,
    GradesParticipationTab,
    GradesSchemeTab,
    GradesReportsTab,
    GradesLogTab,
  ],
  templateUrl: './grades.html',
  styleUrl: './grades.scss',
})
export class GradesPage {
  private readonly store = inject(LocalStore);
  private readonly route = inject(ActivatedRoute);
  private readonly toasts = inject(ToastService);

  readonly formatDate = formatDateGerman;

  readonly courseId = signal(0);
  readonly tab = signal<Tab>('overview');
  readonly book = signal<GradeBook | null>(null);
  readonly courses = signal<Course[]>([]);

  // --- Zeiträume ---
  readonly periods = signal<GradingPeriod[]>([]);
  /** null = gesamter Zeitraum. */
  readonly periodId = signal<number | null>(null);
  readonly editingPeriods = signal(false);
  readonly periodForm = signal({ name: '', start: '', end: '' });

  // --- Notenbögen & Protokoll ---
  readonly reports = signal<GradeReport[]>([]);
  readonly changes = signal<GradeChange[]>([]);

  readonly period = computed(() => this.periods().find((p) => p.id === this.periodId()) ?? null);

  readonly moreTabs = MORE_TABS;
  /** Das Menü hinter „Mehr“. */
  readonly moreOpen = signal(false);
  /** Steht der aktive Reiter unter „Mehr“? Dann trägt der Knopf seinen Namen. */
  readonly activeMore = computed(() => MORE_TABS.find((t) => t.tab === this.tab()) ?? null);

  readonly otherCourses = computed(() => this.courses().filter((c) => c.id !== this.courseId()));

  readonly course = computed(() => this.courses().find((c) => c.id === this.courseId()) ?? null);

  private readonly assessmentsTab = viewChild(GradesAssessmentsTab);
  private readonly schemeTab = viewChild(GradesSchemeTab);

  private readonly range = computed<DateRange>(() => {
    const period = this.period();
    return period ? { from: period.start, to: period.end } : {};
  });

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('courseId'));
      if (Number.isFinite(id) && id > 0) {
        this.courseId.set(id);
        this.loadAll();
      }
    });
  }

  private loadAll(): void {
    const periods = this.store.periods.getPeriods();
    this.courses.set(this.store.masterData.getCourses());
    this.periods.set(periods);

    // Voreingestellt ist der Zeitraum, in dem heute liegt.
    const today = toDateKey(new Date());
    this.periodId.set(periods.find((p) => p.start <= today && p.end >= today)?.id ?? null);
    this.refresh();
  }

  /** Lädt die Notenübersicht neu - nach jeder Änderung. */
  refresh(): void {
    const courseId = this.courseId();

    try {
      this.book.set(this.store.gradeBook.getGradeBook(courseId, this.range()));
      this.changes.set(this.store.gradeBook.getGradeChanges(courseId));
      this.reloadReports();
    } catch (err) {
      this.toasts.error(err, 'Die Noten konnten nicht geladen werden.');
    }
  }

  /** Die Liste der ausgegebenen Notenbögen - nach jeder Ausgabe neu. */
  reloadReports(): void {
    this.reports.set(this.store.gradeBook.getGradeReports(this.courseId()));
  }

  selectTab(tab: Tab): void {
    this.moreOpen.set(false);
    this.tab.set(tab);
    if (tab === 'scheme') {
      // Beim Öffnen beginnt der Entwurf wieder beim gespeicherten Schema.
      this.schemeTab()?.resetSchemeDraft();
    }
  }

  selectPeriod(id: number | null): void {
    this.periodId.set(id);
    this.assessmentsTab()?.closeAssessment();
    this.refresh();
  }

  // --- Zeiträume ---

  updatePeriodForm(patch: Partial<{ name: string; start: string; end: string }>): void {
    this.periodForm.update((f) => ({ ...f, ...patch }));
  }

  savePeriod(): void {
    try {
      const period = this.store.periods.savePeriod(null, this.periodForm());
      this.periods.update((list) =>
        [...list, period].sort((a, b) => a.start.localeCompare(b.start)),
      );
      this.periodForm.set({ name: '', start: '', end: '' });
      this.toasts.success(`„${period.name}" wurde angelegt.`);
    } catch (err) {
      this.toasts.error(err, 'Der Zeitraum konnte nicht angelegt werden.');
    }
  }

  deletePeriod(period: GradingPeriod): void {
    if (!confirm(`Zeitraum „${period.name}" löschen? Noten bleiben erhalten.`)) {
      return;
    }

    try {
      this.store.periods.deletePeriod(period.id);
      this.periods.update((list) => list.filter((p) => p.id !== period.id));
      if (this.periodId() === period.id) {
        this.selectPeriod(null);
      }
    } catch (err) {
      this.toasts.error(err, 'Der Zeitraum konnte nicht gelöscht werden.');
    }
  }

  async exportCsv(): Promise<void> {
    try {
      await downloadExport(this.store.exports.exportGradeBook(this.courseId(), this.range()));
      this.toasts.success('Die CSV-Datei wurde erzeugt.');
    } catch (err) {
      this.toasts.error(err, 'Der Export ist fehlgeschlagen.');
    }
  }
}
