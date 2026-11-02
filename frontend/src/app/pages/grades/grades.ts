import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService, DateRange } from '../../core/api.service';
import {
  AREA_LABELS,
  Assessment,
  AssessmentDetail,
  AssessmentType,
  Course,
  GradeArea,
  GradeBook,
  GradeChange,
  GradeReport,
  GradingPeriod,
  GradingSchemeInput,
  LessonGrade,
  ParticipationGrades,
  PercentScaleEntry,
  QUARTERS,
  Quarter,
  QuarterGradeBook,
  QuarterGradeInput,
  ResultStatus,
  STATUS_LABELS,
  StudentGrades,
  StudentReport,
  ratingSymbol,
} from '../../core/models';
import { average, combineGrades, formatGrade, parseGrade } from '../../core/store/assessment.logic';
import { download, isNativeApp } from '../../core/store/file-system';
import { renderReports } from '../../core/store/report';
import { formatDateGerman, toDateKey } from '../../core/store/time';
import { ToastService } from '../../core/toast.service';

type Tab = 'overview' | 'quarters' | 'assessments' | 'participation' | 'scheme' | 'reports' | 'log';

/** Eine Zeile der Eingabetabelle - Punkte und Note als Text, wie getippt. */
interface ResultRow {
  studentId: number;
  name: string;
  status: ResultStatus;
  points: string;
  grade: string;
  comment: string;
}

/** Eine Zeile der Quartalsnoten - je Quartal schriftlich und mündlich als Text, wie getippt. */
interface QuarterRow {
  studentId: number;
  name: string;
  cells: { written: string; oral: string }[];
}

/** Ein Leistungsnachweis im Formular. */
interface AssessmentForm {
  typeKey: string;
  title: string;
  date: string;
  maxPoints: string;
}

/** Die Auswahl in einer Zelle der Mitarbeitstabelle. */
const OVERRIDE_GRADES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6];

@Component({
  selector: 'app-grades',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  templateUrl: './grades.html',
  styleUrl: './grades.scss',
})
export class GradesPage {
  private readonly api = inject(ApiService);
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

  // --- Quartalsnoten ---
  readonly quarters = QUARTERS;
  readonly quarterBook = signal<QuarterGradeBook | null>(null);
  readonly quarterRows = signal<QuarterRow[]>([]);
  readonly quarterReason = signal('');

  /** Ungespeicherte Eingaben? Dann warnt der Wechsel des Schuljahres. */
  readonly quarterDirty = computed(() => {
    const book = this.quarterBook();
    return (
      !!book &&
      JSON.stringify(this.quarterRows()) !== JSON.stringify(GradesPage.toQuarterRows(book))
    );
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
    forkJoin({
      courses: this.api.getCourses(),
      periods: this.api.getPeriods(),
    }).subscribe({
      next: ({ courses, periods }) => {
        this.courses.set(courses);
        this.periods.set(periods);

        // Voreingestellt ist der Zeitraum, in dem heute liegt.
        const today = toDateKey(new Date());
        this.periodId.set(periods.find((p) => p.start <= today && p.end >= today)?.id ?? null);
        this.refresh();
      },
      error: (err) => this.toasts.error(err, 'Die Noten konnten nicht geladen werden.'),
    });
  }

  /** Lädt die Notenübersicht neu - nach jeder Änderung. */
  refresh(): void {
    const courseId = this.courseId();

    this.api.getGradeBook(courseId, this.range).subscribe({
      next: (book) => {
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
      },
      error: (err) => this.toasts.error(err, 'Die Noten konnten nicht geladen werden.'),
    });

    this.api.getGradeChanges(courseId).subscribe((changes) => this.changes.set(changes));
    if (!this.quarterDirty()) {
      this.loadQuarters(this.quarterBook()?.schoolYear);
    }
    this.api.getGradeReports(courseId).subscribe((reports) => this.reports.set(reports));
  }

  selectTab(tab: Tab): void {
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
    this.api.savePeriod(null, this.periodForm()).subscribe({
      next: (period) => {
        this.periods.update((list) =>
          [...list, period].sort((a, b) => a.start.localeCompare(b.start)),
        );
        this.periodForm.set({ name: '', start: '', end: '' });
        this.toasts.success(`„${period.name}" wurde angelegt.`);
      },
      error: (err) => this.toasts.error(err, 'Der Zeitraum konnte nicht angelegt werden.'),
    });
  }

  deletePeriod(period: GradingPeriod): void {
    if (!confirm(`Zeitraum „${period.name}" löschen? Noten bleiben erhalten.`)) {
      return;
    }

    this.api.deletePeriod(period.id).subscribe({
      next: () => {
        this.periods.update((list) => list.filter((p) => p.id !== period.id));
        if (this.periodId() === period.id) {
          this.selectPeriod(null);
        }
      },
      error: (err) => this.toasts.error(err, 'Der Zeitraum konnte nicht gelöscht werden.'),
    });
  }

  // --- Übersicht ---

  gradeOf(student: StudentGrades, assessment: Assessment): number | null {
    return student.assessmentGrades[assessment.id] ?? null;
  }

  exportCsv(): void {
    this.api.exportGradeBook(this.courseId(), this.range).subscribe({
      next: () => this.toasts.success('Die CSV-Datei wurde erzeugt.'),
      error: (err) => this.toasts.error(err, 'Der Export ist fehlgeschlagen.'),
    });
  }

  // --- Quartalsnoten ---

  private static toQuarterRows(book: QuarterGradeBook): QuarterRow[] {
    const text = (g: number | null) => (g === null ? '' : formatGrade(g, 1));
    return book.students.map((s) => ({
      studentId: s.studentId,
      name: `${s.lastName}, ${s.firstName}`,
      cells: s.quarters.map((q) => ({ written: text(q.written), oral: text(q.oral) })),
    }));
  }

  loadQuarters(schoolYear?: string): void {
    this.api.getQuarterGrades(this.courseId(), schoolYear).subscribe({
      next: (book) => this.applyQuarters(book),
      error: (err) => this.toasts.error(err, 'Die Quartalsnoten konnten nicht geladen werden.'),
    });
  }

  private applyQuarters(book: QuarterGradeBook): void {
    this.quarterBook.set(book);
    this.quarterRows.set(GradesPage.toQuarterRows(book));
    this.quarterReason.set('');
  }

  applyQuartersReset(): void {
    const book = this.quarterBook();
    if (book) {
      this.applyQuarters(book);
    }
  }

  selectSchoolYear(schoolYear: string, select: HTMLSelectElement): void {
    if (this.quarterDirty() && !confirm('Ungespeicherte Quartalsnoten verwerfen?')) {
      select.value = this.quarterBook()?.schoolYear ?? schoolYear;
      return;
    }
    this.loadQuarters(schoolYear);
  }

  /** Legt das nächste Schuljahr an - für den Wechsel im Sommer. */
  addSchoolYear(): void {
    const years = this.quarterBook()?.schoolYears ?? [];
    const last = years[years.length - 1];
    if (!last) {
      return;
    }
    const start = Number(last.slice(0, 4)) + 1;
    this.loadQuarters(`${start}/${String((start + 1) % 100).padStart(2, '0')}`);
  }

  updateQuarterCell(studentId: number, quarter: Quarter, area: GradeArea, value: string): void {
    this.quarterRows.update((rows) =>
      rows.map((r) =>
        r.studentId === studentId
          ? {
              ...r,
              cells: r.cells.map((c, i) => (i === quarter - 1 ? { ...c, [area]: value } : c)),
            }
          : r,
      ),
    );
  }

  /** Liest eine Zelle - NaN, wenn keine gültige Note drinsteht. */
  quarterValue(row: QuarterRow, quarter: Quarter, area: GradeArea): number | null {
    return parseGrade(row.cells[quarter - 1][area]);
  }

  isInvalid(row: QuarterRow, quarter: Quarter, area: GradeArea): boolean {
    return Number.isNaN(this.quarterValue(row, quarter, area));
  }

  private combineQuarter(written: number | null, oral: number | null): number | null {
    const valid = (g: number | null) => (g === null || Number.isNaN(g) ? null : g);
    return combineGrades(
      [
        { area: 'written', weight: 1, grade: valid(written) },
        { area: 'oral', weight: 1, grade: valid(oral) },
      ],
      this.quarterBook()?.writtenPercent ?? 50,
    ).overall;
  }

  /** Gesamtnote eines Quartals - schon beim Tippen. */
  quarterOverall(row: QuarterRow, quarter: Quarter): number | null {
    return this.combineQuarter(
      this.quarterValue(row, quarter, 'written'),
      this.quarterValue(row, quarter, 'oral'),
    );
  }

  /** Durchschnitt eines Bereichs über alle eingetragenen Quartale. */
  yearAverage(row: QuarterRow, area: GradeArea): number | null {
    return average(
      QUARTERS.map((q) => this.quarterValue(row, q, area)).map((g) =>
        g === null || Number.isNaN(g) ? null : g,
      ),
    );
  }

  yearOverall(row: QuarterRow): number | null {
    return this.combineQuarter(this.yearAverage(row, 'written'), this.yearAverage(row, 'oral'));
  }

  saveQuarters(): void {
    const book = this.quarterBook();
    if (!book) {
      return;
    }

    const inputs: QuarterGradeInput[] = [];
    for (const row of this.quarterRows()) {
      for (const quarter of QUARTERS) {
        const written = this.quarterValue(row, quarter, 'written');
        const oral = this.quarterValue(row, quarter, 'oral');
        if (Number.isNaN(written) || Number.isNaN(oral)) {
          this.toasts.show(
            `${row.name}, ${quarter}. Quartal: bitte eine Note zwischen 1,0 und 6,0 eintragen.`,
            'error',
          );
          return;
        }
        inputs.push({ studentId: row.studentId, quarter, written, oral });
      }
    }

    this.api
      .saveQuarterGrades(this.courseId(), book.schoolYear, inputs, this.quarterReason())
      .subscribe({
        next: (updated) => {
          this.applyQuarters(updated);
          this.toasts.success('Die Quartalsnoten wurden gespeichert.');
          this.api.getGradeChanges(this.courseId()).subscribe((c) => this.changes.set(c));
        },
        error: (err) =>
          this.toasts.error(err, 'Die Quartalsnoten konnten nicht gespeichert werden.'),
      });
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
    this.api.createAssessment(this.courseId(), GradesPage.toInput(this.newForm())).subscribe({
      next: (assessment) => {
        this.newForm.update((f) => ({ ...f, title: '', maxPoints: '' }));
        this.toasts.success(`„${assessment.title}" wurde angelegt. Jetzt die Noten eintragen.`);
        this.refresh();
        this.openAssessment(assessment.id);
      },
      error: (err) => this.toasts.error(err, 'Der Leistungsnachweis konnte nicht angelegt werden.'),
    });
  }

  openAssessment(id: number): void {
    this.api.getAssessmentDetail(id).subscribe({
      next: (detail) => this.applyDetail(detail),
      error: (err) => this.toasts.error(err, 'Der Leistungsnachweis konnte nicht geladen werden.'),
    });
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
    this.api.updateAssessment(id, GradesPage.toInput(this.detailForm())).subscribe({
      next: () =>
        this.api.saveResults(id, results, this.changeReason()).subscribe({
          next: (updated) => {
            this.applyDetail(updated);
            this.toasts.success('Gespeichert.');
            this.refresh();
          },
          error: (err) => this.toasts.error(err, 'Die Noten konnten nicht gespeichert werden.'),
        }),
      error: (err) =>
        this.toasts.error(err, 'Der Leistungsnachweis konnte nicht gespeichert werden.'),
    });
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

    this.api.setAssessmentReleased(detail.assessment.id, released).subscribe({
      next: () => {
        this.toasts.success(
          released ? 'Freigegeben - die Noten zählen jetzt.' : 'Die Freigabe wurde zurückgenommen.',
        );
        this.openAssessment(detail.assessment.id);
        this.refresh();
      },
      error: (err) => this.toasts.error(err, 'Die Freigabe konnte nicht geändert werden.'),
    });
  }

  deleteAssessment(): void {
    const detail = this.detail();
    if (!detail || !confirm(`„${detail.assessment.title}" mit allen Noten löschen?`)) {
      return;
    }

    this.api.deleteAssessment(detail.assessment.id).subscribe({
      next: () => {
        this.detail.set(null);
        this.toasts.success('Der Leistungsnachweis wurde gelöscht.');
        this.refresh();
      },
      error: (err) => this.toasts.error(err, 'Der Leistungsnachweis konnte nicht gelöscht werden.'),
    });
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

    this.api
      .setParticipationOverride(this.courseId(), student.studentId, lesson.date, grade, reason)
      .subscribe({
        next: () => this.refresh(),
        error: (err) => {
          this.toasts.error(err, 'Die Note konnte nicht gesetzt werden.');
          select.value = this.lessonChoice(lesson);
        },
      });
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

    this.api.saveScheme(this.courseId(), draft).subscribe({
      next: () => {
        this.toasts.success('Das Bewertungsschema wurde gespeichert.');
        this.schemeDraft.set(null);
        this.refresh();
      },
      error: (err) => this.toasts.error(err, 'Das Schema konnte nicht gespeichert werden.'),
    });
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
      this.api.copyScheme(this.courseId(), targets).subscribe({
        next: () =>
          this.toasts.success(`Das Schema gilt jetzt auch für ${targets.length} weitere Kurse.`),
        error: (err) => this.toasts.error(err, 'Das Schema konnte nicht übertragen werden.'),
      });
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

    this.api.issueReports(this.courseId(), ids, this.periodId()).subscribe({
      next: (reports) => {
        deliver(reports);
        this.toasts.success(
          `${reports.length} ${reports.length === 1 ? 'Notenbogen' : 'Notenbögen'} erzeugt und vermerkt.`,
        );
        this.api.getGradeReports(this.courseId()).subscribe((list) => this.reports.set(list));
      },
      error: (err) => this.toasts.error(err, 'Die Notenbögen konnten nicht erzeugt werden.'),
    });
  }

  formatDateTime(iso: string): string {
    const date = new Date(iso);
    return `${formatDateGerman(toDateKey(date))} ${date.toTimeString().slice(0, 5)}`;
  }
}
