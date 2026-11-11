import { Injectable, inject } from '@angular/core';
import { Observable, defer, of, throwError } from 'rxjs';
import {
  AppSettings,
  Assessment,
  AssessmentDetail,
  AssessmentInput,
  ImportedAssessmentInput,
  AssessmentResultInput,
  Course,
  CourseScoreboard,
  CurrentLesson,
  GradeBook,
  GradeChange,
  GradeReport,
  GradeScale,
  GradeScaleInput,
  GradingPeriod,
  GradingPeriodInput,
  GradingScheme,
  GradingSchemeInput,
  Rating,
  RatingValue,
  RatingWindow,
  SchoolClass,
  SeatLayoutInput,
  SeatingPlan,
  Student,
  StudentReport,
  Subject,
  TimetableEntry,
  TimetableEntryInput,
  TimetableImportPreview,
  TimetableImportResult,
  TimetableImportRow,
  GradeArea,
  Quarter,
  QuarterGrade,
} from './models';
import { DateRange, LocalStore, SchoolYearCounts, SchoolYearInput } from './store/local-store';
import { readPhoto } from './import/photo';
import { download } from './persistence/file-system';
import { AppError } from './app-error';

export type { DateRange, SchoolYearCounts, SchoolYearInput } from './store/local-store';

/**
 * Die Schnittstelle, über die die Oberfläche an die Daten kommt.
 *
 * Früher lag dahinter eine Web-API mit Datenbank. Heute arbeitet sie gegen den
 * Datenbestand im Browser - die Methoden geben weiterhin Observables zurück,
 * damit die Seiten unverändert bleiben.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly store = inject(LocalStore);

  /**
   * Führt die Arbeit erst beim Abonnieren aus und macht aus einem Fehler
   * einen fehlgeschlagenen Observable - so wie es eine HTTP-Antwort täte.
   */
  private run<T>(action: () => T): Observable<T> {
    return defer(() => {
      try {
        return of(action());
      } catch (error) {
        return throwError(() => error);
      }
    });
  }

  private fromPromise<T>(action: () => Promise<T>): Observable<T> {
    return defer(action);
  }

  // --- Klassen ---

  getClasses(): Observable<SchoolClass[]> {
    return this.run(() => this.store.getClasses());
  }

  createClass(name: string): Observable<SchoolClass> {
    return this.run(() => this.store.createClass(name));
  }

  updateClass(id: number, name: string): Observable<SchoolClass> {
    return this.run(() => this.store.updateClass(id, name));
  }

  deleteClass(id: number): Observable<void> {
    return this.run(() => this.store.deleteClass(id));
  }

  // --- Fächer ---

  getSubjects(): Observable<Subject[]> {
    return this.run(() => this.store.getSubjects());
  }

  createSubject(name: string, shortName: string): Observable<Subject> {
    return this.run(() => this.store.createSubject(name, shortName));
  }

  updateSubject(id: number, name: string, shortName: string): Observable<Subject> {
    return this.run(() => this.store.updateSubject(id, name, shortName));
  }

  deleteSubject(id: number): Observable<void> {
    return this.run(() => this.store.deleteSubject(id));
  }

  // --- Kurse ---

  getCourses(): Observable<Course[]> {
    return this.run(() => this.store.getCourses());
  }

  getCourse(id: number): Observable<Course> {
    return this.run(() => this.store.getCourse(id));
  }

  createCourse(schoolClassId: number, subjectId: number): Observable<Course> {
    return this.run(() => this.store.createCourse(schoolClassId, subjectId));
  }

  deleteCourse(id: number): Observable<void> {
    return this.run(() => this.store.deleteCourse(id));
  }

  getCourseStudents(courseId: number): Observable<Student[]> {
    return this.run(() => this.store.getCourseStudents(courseId));
  }

  // --- Schüler ---

  getStudents(classId: number): Observable<Student[]> {
    return this.run(() => this.store.getStudents(classId));
  }

  createStudent(classId: number, firstName: string, lastName: string): Observable<Student> {
    return this.run(() => this.store.createStudent(classId, firstName, lastName));
  }

  importStudents(
    classId: number,
    students: { firstName: string; lastName: string }[],
  ): Observable<Student[]> {
    return this.run(() => this.store.importStudents(classId, students));
  }

  updateStudent(id: number, firstName: string, lastName: string): Observable<Student> {
    return this.run(() => this.store.updateStudent(id, firstName, lastName));
  }

  deleteStudent(id: number): Observable<void> {
    return this.run(() => this.store.deleteStudent(id));
  }

  /**
   * Nimmt das Foto entgegen. Es wird vorher verkleinert - die Bilder wandern
   * in dieselbe Datei wie alles andere, ein Foto in Kameragröße würde sie
   * unnötig aufblähen.
   */
  uploadPhoto(studentId: number, file: File): Observable<Student> {
    return this.fromPromise(async () => {
      const dataUrl = await readPhoto(file);
      return this.store.setPhoto(studentId, dataUrl);
    });
  }

  deletePhoto(studentId: number): Observable<Student> {
    return this.run(() => this.store.deletePhoto(studentId));
  }

  // --- Sitzordnungen ---

  getSeatingPlans(courseId: number): Observable<SeatingPlan[]> {
    return this.run(() => this.store.getSeatingPlans(courseId));
  }

  createSeatingPlan(
    courseId: number,
    name: string,
    rows: number,
    columns: number,
  ): Observable<SeatingPlan> {
    return this.run(() => this.store.createSeatingPlan(courseId, name, rows, columns));
  }

  updateSeatingPlan(
    id: number,
    name: string,
    rows: number,
    columns: number,
  ): Observable<SeatingPlan> {
    return this.run(() => this.store.updateSeatingPlan(id, name, rows, columns));
  }

  saveLayout(planId: number, layout: SeatLayoutInput): Observable<SeatingPlan> {
    return this.run(() => this.store.saveLayout(planId, layout));
  }

  deleteSeatingPlan(id: number): Observable<void> {
    return this.run(() => this.store.deleteSeatingPlan(id));
  }

  // --- Stundenplan ---

  getTimetable(): Observable<TimetableEntry[]> {
    return this.run(() => this.store.getTimetable());
  }

  getCurrentLesson(): Observable<CurrentLesson> {
    return this.run(() => this.store.getCurrentLesson());
  }

  createTimetableEntry(input: TimetableEntryInput): Observable<TimetableEntry> {
    return this.run(() => this.store.createTimetableEntry(input));
  }

  updateTimetableEntry(id: number, input: TimetableEntryInput): Observable<TimetableEntry> {
    return this.run(() => this.store.updateTimetableEntry(id, input));
  }

  previewTimetableImport(ics: string): Observable<TimetableImportPreview> {
    return this.run(() => this.store.previewTimetableImport(ics));
  }

  applyTimetableImport(rows: TimetableImportRow[]): Observable<TimetableImportResult> {
    return this.run(() => this.store.applyTimetableImport(rows));
  }

  deleteTimetableEntry(id: number): Observable<void> {
    return this.run(() => this.store.deleteTimetableEntry(id));
  }

  // --- Bewertungen ---

  getRatingWindow(courseId: number): Observable<RatingWindow> {
    return this.run(() => this.store.getRatingWindow(courseId));
  }

  rate(
    courseId: number,
    studentId: number,
    value: RatingValue,
    comment?: string,
    lessonDate?: string,
    replaceSameDay = false,
  ): Observable<Rating> {
    return this.run(() =>
      this.store.rate(courseId, studentId, value, comment, lessonDate, replaceSameDay),
    );
  }

  /** Nimmt genau diese Bewertung zurück - etwa nach einem Vertipper. */
  deleteRating(id: number): Observable<void> {
    return this.run(() => this.store.deleteRating(id));
  }

  undoLastRating(courseId: number, studentId: number): Observable<void> {
    return this.run(() => this.store.undoLastRating(courseId, studentId));
  }

  getScoreboard(courseId: number, range?: DateRange): Observable<CourseScoreboard> {
    return this.run(() => this.store.getScoreboard(courseId, range));
  }

  getRatings(courseId: number, range?: DateRange): Observable<Rating[]> {
    return this.run(() => this.store.getRatings(courseId, range));
  }

  // --- Notenschlüssel ---

  getGlobalGradeScale(): Observable<GradeScale> {
    return this.run(() => this.store.getGlobalGradeScale());
  }

  saveGlobalGradeScale(input: GradeScaleInput): Observable<GradeScale> {
    return this.run(() => this.store.saveGradeScale(null, input));
  }

  getCourseGradeScale(courseId: number): Observable<GradeScale> {
    return this.run(() => this.store.getCourseGradeScale(courseId));
  }

  saveCourseGradeScale(courseId: number, input: GradeScaleInput): Observable<GradeScale> {
    return this.run(() => this.store.saveGradeScale(courseId, input));
  }

  deleteCourseGradeScale(courseId: number): Observable<void> {
    return this.run(() => this.store.deleteCourseGradeScale(courseId));
  }

  // --- Noten ---

  getPeriods(): Observable<GradingPeriod[]> {
    return this.run(() => this.store.getPeriods());
  }

  savePeriod(id: number | null, input: GradingPeriodInput): Observable<GradingPeriod> {
    return this.run(() => this.store.savePeriod(id, input));
  }

  deletePeriod(id: number): Observable<void> {
    return this.run(() => this.store.deletePeriod(id));
  }

  getScheme(courseId: number): Observable<GradingScheme> {
    return this.run(() => this.store.getScheme(courseId));
  }

  saveScheme(courseId: number, input: GradingSchemeInput): Observable<GradingScheme> {
    return this.run(() => this.store.saveScheme(courseId, input));
  }

  copyScheme(fromCourseId: number, toCourseIds: number[]): Observable<void> {
    return this.run(() => this.store.copyScheme(fromCourseId, toCourseIds));
  }

  getQuarterGrades(courseId: number): Observable<QuarterGrade[]> {
    return this.run(() => this.store.getQuarterGrades(courseId));
  }

  setQuarterGrade(
    courseId: number,
    studentId: number,
    quarter: Quarter,
    area: GradeArea,
    value: number | null,
  ): Observable<QuarterGrade> {
    return this.run(() => this.store.setQuarterGrade(courseId, studentId, quarter, area, value));
  }

  getGradeBook(courseId: number, range?: DateRange): Observable<GradeBook> {
    return this.run(() => this.store.getGradeBook(courseId, range));
  }

  createAssessment(courseId: number, input: AssessmentInput): Observable<Assessment> {
    return this.run(() => this.store.createAssessment(courseId, input));
  }

  updateAssessment(id: number, input: AssessmentInput): Observable<Assessment> {
    return this.run(() => this.store.updateAssessment(id, input));
  }

  deleteAssessment(id: number): Observable<void> {
    return this.run(() => this.store.deleteAssessment(id));
  }

  getAssessmentDetail(id: number): Observable<AssessmentDetail> {
    return this.run(() => this.store.getAssessmentDetail(id));
  }

  saveResults(
    id: number,
    results: AssessmentResultInput[],
    reason?: string | null,
  ): Observable<AssessmentDetail> {
    return this.run(() => this.store.saveResults(id, results, reason));
  }

  importAssessment(courseId: number, input: ImportedAssessmentInput): Observable<Assessment> {
    return this.run(() => this.store.importAssessment(courseId, input));
  }

  setAssessmentReleased(id: number, released: boolean): Observable<Assessment> {
    return this.run(() => this.store.setAssessmentReleased(id, released));
  }

  setParticipationOverride(
    courseId: number,
    studentId: number,
    lessonDate: string,
    grade: number | null | 'auto',
    reason?: string | null,
  ): Observable<void> {
    return this.run(() =>
      this.store.setParticipationOverride(courseId, studentId, lessonDate, grade, reason),
    );
  }

  getAbsentStudentIds(courseId: number, lessonDate: string): Observable<number[]> {
    return this.run(() => this.store.getAbsentStudentIds(courseId, lessonDate));
  }

  setAbsent(
    courseId: number,
    studentId: number,
    lessonDate: string,
    absent: boolean,
  ): Observable<void> {
    return this.run(() => this.store.setAbsent(courseId, studentId, lessonDate, absent));
  }

  getLastBackupAt(): Observable<string | null> {
    return this.run(() => this.store.getLastBackupAt());
  }

  getSchoolYearCounts(): Observable<SchoolYearCounts> {
    return this.run(() => this.store.getSchoolYearCounts());
  }

  startNewSchoolYear(input: SchoolYearInput): Observable<SchoolYearCounts> {
    return this.run(() => this.store.startNewSchoolYear(input));
  }

  getGradeChanges(courseId: number): Observable<GradeChange[]> {
    return this.run(() => this.store.getGradeChanges(courseId));
  }

  getGradeReports(courseId: number): Observable<GradeReport[]> {
    return this.run(() => this.store.getGradeReports(courseId));
  }

  /** Stellt die Notenbögen zusammen und vermerkt ihre Ausgabe. */
  issueReports(
    courseId: number,
    studentIds: number[],
    periodId: number | null,
  ): Observable<StudentReport[]> {
    return this.run(() => {
      const reports = this.store.getStudentReports(courseId, studentIds, periodId);
      if (reports.length === 0) {
        throw new AppError('Es ist kein Schüler ausgewählt.');
      }

      this.store.recordReports(courseId, reports, periodId);
      return reports;
    });
  }

  exportGradeBook(courseId: number, range?: DateRange): Observable<void> {
    return this.fromPromise(() => {
      const result = this.store.exportGradeBook(courseId, range);
      return download(result.blob, result.fileName, { share: true });
    });
  }

  // --- Einstellungen ---

  getSettings(): Observable<AppSettings> {
    return this.run(() => this.store.getSettings());
  }

  saveSettings(settings: AppSettings): Observable<AppSettings> {
    return this.run(() => this.store.saveSettings(settings));
  }

  // --- Export ---

  /**
   * Baut die CSV-Datei und bietet sie zum Herunterladen an. Früher zeigte ein
   * Link auf das Backend; jetzt entsteht die Datei im Browser.
   */
  exportCsv(courseId?: number | null, range?: DateRange): Observable<void> {
    return this.fromPromise(() => {
      const result = this.store.exportSummary(courseId ?? null, range);
      return download(result.blob, result.fileName, { share: true });
    });
  }

  /** Die Einzelbewertungen als druckfertiges HTML im Querformat. */
  exportRatings(courseId: number | null, range?: DateRange): Observable<void> {
    return this.fromPromise(() => {
      const result = this.store.exportRatings(courseId, range);
      return download(result.blob, result.fileName, { share: true });
    });
  }

  exportLessonSheets(
    courseId: number | null,
    range?: DateRange,
    studentId?: number,
  ): Observable<void> {
    return this.fromPromise(() => {
      const result = this.store.exportLessonSheets(courseId, range, studentId);
      return download(result.blob, result.fileName, { share: true });
    });
  }
}
