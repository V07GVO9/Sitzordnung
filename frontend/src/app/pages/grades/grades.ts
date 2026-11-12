import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  AREA_LABELS,
  Assessment,
  AssessmentDetail,
  AssessmentType,
  Course,
  DateRange,
  GradeArea,
  GradeBook,
  GradeChange,
  GradeReport,
  GradingPeriod,
  GradingSchemeInput,
  LessonGrade,
  ParticipationGrades,
  PercentScaleEntry,
  ResultStatus,
  STATUS_LABELS,
  StudentGrades,
  StudentReport,
  ratingSymbol,
} from '../../core/models';
import { formatGrade, parseGrade } from '../../core/logic/assessment.logic';
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
import { download, downloadExport, isNativeApp } from '../../core/persistence/file-system';
import { LocalStore } from '../../core/store/local-store';
import { renderReports } from '../../core/export/report';
import { formatDateGerman, toDateKey } from '../../core/logic/time';
import { Icon } from '../../core/ui/icon';
import { GradeWarning, gradeWarnings } from './grade-warnings';
import { ToastService } from '../../core/ui/toast.service';

type Tab = 'overview' | 'assessments' | 'participation' | 'scheme' | 'reports' | 'log';

/** Seltener gebraucht - diese Reiter liegen unter „Mehr“. */
const MORE_TABS: { tab: Tab; label: string }[] = [
  { tab: 'scheme', label: 'Bewertungsschema' },
  { tab: 'reports', label: 'Notenbögen' },
  { tab: 'log', label: 'Protokoll' },
];

/** Eine Zeile der Eingabetabelle - Punkte und Note als Text, wie getippt. */
interface ResultRow {
  studentId: number;
  name: string;
  status: ResultStatus;
  points: string;
  grade: string;
  comment: string;
}

/** Ein Leistungsnachweis im Formular. */
interface AssessmentForm {
  typeKey: string;
  title: string;
  date: string;
  maxPoints: string;
}

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

/** Die Auswahl in einer Zelle der Mitarbeitstabelle. */
const OVERRIDE_GRADES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6];

@Component({
  selector: 'app-grades',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, Icon],
  templateUrl: './grades.html',
  styleUrl: './grades.scss',
})
export class GradesPage {
  private readonly store = inject(LocalStore);
  private readonly route = inject(ActivatedRoute);
  private readonly toasts = inject(ToastService);

  readonly areaLabels = AREA_LABELS;
  readonly statusLabels = STATUS_LABELS;
  readonly statuses: ResultStatus[] = ['graded', 'excused', 'refused'];
  readonly areas: GradeArea[] = ['written', 'oral'];
  readonly overrideGrades = OVERRIDE_GRADES;
  readonly formatGrade = formatGrade;
  readonly formatDate = formatDateGerman;
  readonly ratingSymbol = ratingSymbol;

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

  // --- Leistungsnachweise ---
  readonly newForm = signal<AssessmentForm>(this.emptyForm());
  readonly detail = signal<AssessmentDetail | null>(null);
  readonly detailForm = signal<AssessmentForm>(this.emptyForm());
  readonly resultRows = signal<ResultRow[]>([]);
  readonly changeReason = signal('');

  // --- Übernahme aus anderem Werkzeug (PDF) ---
  readonly importReports = signal<ImportedStudentReport[] | null>(null);
  readonly importFileName = signal('');
  readonly importBusy = signal(false);
  readonly importLabel = signal('');
  readonly importForm = signal({ typeKey: '', title: '', date: '' });
  /** Seite der Übersicht -> zugeordneter Schüler (null = nicht übernehmen). */
  readonly importAssignment = signal<Record<number, number | null>>({});

  readonly oralTypes = computed(
    () => this.book()?.scheme.types.filter((t) => t.area === 'oral') ?? [],
  );

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
        grade: counts && book ? gradeFromCounts(counts, book.scheme.participationGrades) : null,
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

  // --- Schema ---
  readonly schemeDraft = signal<GradingSchemeInput | null>(null);
  readonly copyTargets = signal<Set<number>>(new Set());

  // --- Notenbögen & Protokoll ---
  readonly reportSelection = signal<Set<number>>(new Set());
  readonly reports = signal<GradeReport[]>([]);
  readonly changes = signal<GradeChange[]>([]);

  readonly period = computed(() => this.periods().find((p) => p.id === this.periodId()) ?? null);

  readonly releasedAssessments = computed(
    () => this.book()?.assessments.filter((a) => a.released) ?? [],
  );

  readonly moreTabs = MORE_TABS;
  /** Das Menü hinter „Mehr“. */
  readonly moreOpen = signal(false);
  /** Steht der aktive Reiter unter „Mehr“? Dann trägt der Knopf seinen Namen. */
  readonly activeMore = computed(() => MORE_TABS.find((t) => t.tab === this.tab()) ?? null);

  /** Hinweise je Schüler - schlechter als 4,0, fehlende Noten. */
  readonly warnings = computed(() => {
    const book = this.book();
    const map = new Map<number, GradeWarning[]>();
    if (!book) {
      return map;
    }
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
    (this.book()?.students ?? [])
      .filter((s) => this.warnings().has(s.studentId))
      .map((s) => ({
        name: `${s.lastName}, ${s.firstName}`,
        warnings: this.warnings().get(s.studentId)!,
      })),
  );
  readonly warningsOpen = signal(true);

  warningText(list: GradeWarning[]): string {
    return list.map((w) => w.text).join(' · ');
  }

  readonly otherCourses = computed(() => this.courses().filter((c) => c.id !== this.courseId()));

  readonly course = computed(() => this.courses().find((c) => c.id === this.courseId()) ?? null);

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

  private get range(): DateRange {
    const period = this.period();
    return period ? { from: period.start, to: period.end } : {};
  }

  constructor() {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('courseId'));
      if (Number.isFinite(id) && id > 0) {
        this.courseId.set(id);
        this.loadAll();
      }
    });
  }

  private emptyForm(): AssessmentForm {
    return { typeKey: '', title: '', date: toDateKey(new Date()), maxPoints: '' };
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
      const book = this.store.gradeBook.getGradeBook(courseId, this.range);
      this.book.set(book);

      if (!this.newForm().typeKey && book.scheme.types.length) {
        this.newForm.update((f) => ({ ...f, typeKey: book.scheme.types[0].key }));
      }
      if (this.reportSelection().size === 0) {
        this.reportSelection.set(new Set(book.students.map((s) => s.studentId)));
      }
      if (!this.schemeDraft()) {
        this.resetSchemeDraft();
      }

      this.changes.set(this.store.gradeBook.getGradeChanges(courseId));
      this.reports.set(this.store.gradeBook.getGradeReports(courseId));
    } catch (err) {
      this.toasts.error(err, 'Die Noten konnten nicht geladen werden.');
    }
  }

  selectTab(tab: Tab): void {
    this.moreOpen.set(false);
    this.tab.set(tab);
    if (tab === 'scheme') {
      this.resetSchemeDraft();
    }
  }

  selectPeriod(id: number | null): void {
    this.periodId.set(id);
    this.detail.set(null);
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

  // --- Übersicht ---

  gradeOf(student: StudentGrades, assessment: Assessment): number | null {
    return student.assessmentGrades[assessment.id] ?? null;
  }

  async exportCsv(): Promise<void> {
    try {
      await downloadExport(this.store.exports.exportGradeBook(this.courseId(), this.range));
      this.toasts.success('Die CSV-Datei wurde erzeugt.');
    } catch (err) {
      this.toasts.error(err, 'Der Export ist fehlgeschlagen.');
    }
  }

  // --- Leistungsnachweise ---

  updateNewForm(patch: Partial<AssessmentForm>): void {
    this.newForm.update((f) => ({ ...f, ...patch }));
  }

  updateDetailForm(patch: Partial<AssessmentForm>): void {
    this.detailForm.update((f) => ({ ...f, ...patch }));
  }

  private static toInput(form: AssessmentForm) {
    const maxPoints =
      form.maxPoints.trim() === '' ? null : Number(form.maxPoints.replace(',', '.'));
    return {
      typeKey: form.typeKey,
      title: form.title,
      date: form.date,
      maxPoints,
      comment: null,
    };
  }

  createAssessment(): void {
    try {
      const assessment = this.store.assessments.createAssessment(
        this.courseId(),
        GradesPage.toInput(this.newForm()),
      );
      this.newForm.update((f) => ({ ...f, title: '', maxPoints: '' }));
      this.toasts.success(`„${assessment.title}" wurde angelegt. Jetzt die Noten eintragen.`);
      this.refresh();
      this.openAssessment(assessment.id);
    } catch (err) {
      this.toasts.error(err, 'Der Leistungsnachweis konnte nicht angelegt werden.');
    }
  }

  // --- Übernahme aus anderem Werkzeug (PDF) ---

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
    const book = this.book();
    const course = this.course();
    const students = (book?.students ?? []).map((s) => ({ ...s, id: s.studentId }));

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
      this.refresh();
      this.openAssessment(assessment.id);
    } catch (err) {
      this.toasts.error(err, 'Die Übernahme ist fehlgeschlagen.');
    }
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

  /** Wandelt die Eingabetabelle in Ergebnisse um - oder meldet die erste unbrauchbare Zeile. */
  private collectResults() {
    const results = [];

    for (const row of this.resultRows()) {
      const grade = parseGrade(row.grade);
      if (Number.isNaN(grade)) {
        throw new Error(`Die Note für ${row.name} ist keine Note zwischen 1,0 und 6,0.`);
      }

      const pointsText = row.points.trim().replace(',', '.');
      const points = pointsText === '' ? null : Number(pointsText);
      if (points !== null && !Number.isFinite(points)) {
        throw new Error(`Die Punkte für ${row.name} sind keine Zahl.`);
      }

      results.push({
        studentId: row.studentId,
        points,
        grade,
        status: row.status,
        comment: row.comment.trim() || null,
      });
    }

    return results;
  }

  saveAssessment(): void {
    const detail = this.detail();
    if (!detail) {
      return;
    }

    let results;
    try {
      results = this.collectResults();
    } catch (error) {
      this.toasts.error(error);
      return;
    }

    const id = detail.assessment.id;
    try {
      this.store.assessments.updateAssessment(id, GradesPage.toInput(this.detailForm()));
    } catch (err) {
      this.toasts.error(err, 'Der Leistungsnachweis konnte nicht gespeichert werden.');
      return;
    }

    try {
      this.applyDetail(this.store.assessments.saveResults(id, results, this.changeReason()));
      this.toasts.success('Gespeichert.');
      this.refresh();
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
      this.refresh();
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
      this.refresh();
    } catch (err) {
      this.toasts.error(err, 'Der Leistungsnachweis konnte nicht gelöscht werden.');
    }
  }

  // --- Mitarbeit ---

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
      this.refresh();
    } catch (err) {
      this.toasts.error(err, 'Die Note konnte nicht gesetzt werden.');
      select.value = this.lessonChoice(lesson);
    }
  }

  // --- Bewertungsschema ---

  resetSchemeDraft(): void {
    const scheme = this.book()?.scheme;
    if (!scheme) {
      return;
    }

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
      this.refresh();
    } catch (err) {
      this.toasts.error(err, 'Das Schema konnte nicht gespeichert werden.');
    }
  }

  toggleCopyTarget(courseId: number, checked: boolean): void {
    this.copyTargets.update((set) => {
      const next = new Set(set);
      if (checked) {
        next.add(courseId);
      } else {
        next.delete(courseId);
      }
      return next;
    });
  }

  copyScheme(): void {
    const targets = [...this.copyTargets()];
    if (targets.length === 0) {
      this.toasts.show('Bitte mindestens einen Kurs auswählen.', 'error');
      return;
    }

    if (
      !this.book()?.scheme.isDefault ||
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

  // --- Notenbögen ---

  toggleReportStudent(studentId: number, checked: boolean): void {
    this.reportSelection.update((set) => {
      const next = new Set(set);
      if (checked) {
        next.add(studentId);
      } else {
        next.delete(studentId);
      }
      return next;
    });
  }

  selectAllForReport(all: boolean): void {
    this.reportSelection.set(
      new Set(all ? (this.book()?.students.map((s) => s.studentId) ?? []) : []),
    );
  }

  /** Erzeugt die Bögen und öffnet den Druckdialog - dort lässt sich auch ein PDF speichern. */
  printReports(): void {
    this.issue((reports) => {
      // Die Android-App kann nicht drucken. Sie gibt die Bögen deshalb als Datei
      // weiter - in Chrome geöffnet, lassen sie sich dort drucken oder als PDF sichern.
      if (isNativeApp()) {
        void download(
          new Blob([renderReports(reports)], { type: 'text/html;charset=utf-8' }),
          `notenboegen-${toDateKey(new Date())}.html`,
          { share: true },
        );
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
        download(
          new Blob([renderReports([report])], { type: 'text/html;charset=utf-8' }),
          `notenbogen-${name}-${toDateKey(new Date())}.html`,
        );
      }
    });
  }

  private issue(deliver: (reports: StudentReport[]) => void): void {
    const ids = [...this.reportSelection()];

    try {
      const reports = this.store.gradeBook.issueReports(this.courseId(), ids, this.periodId());
      deliver(reports);
      this.toasts.success(
        `${reports.length} ${reports.length === 1 ? 'Notenbogen' : 'Notenbögen'} erzeugt und vermerkt.`,
      );
      this.reports.set(this.store.gradeBook.getGradeReports(this.courseId()));
    } catch (err) {
      this.toasts.error(err, 'Die Notenbögen konnten nicht erzeugt werden.');
    }
  }

  formatDateTime(iso: string): string {
    const date = new Date(iso);
    return `${formatDateGerman(toDateKey(date))} ${date.toTimeString().slice(0, 5)}`;
  }
}
