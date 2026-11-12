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
  DateRange,
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
  SchoolYearCounts,
  SchoolYearInput,
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
import { LocalStore } from './store/local-store';
import { readPhoto } from './import/photo';
import { download } from './persistence/file-system';
import { AppError } from './app-error';

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
    return this.run(() => this.store.masterData.getClasses());
  }

  createClass(name: string): Observable<SchoolClass> {
    return this.run(() => this.store.masterData.createClass(name));
  }

  updateClass(id: number, name: string): Observable<SchoolClass> {
    return this.run(() => this.store.masterData.updateClass(id, name));
  }

  deleteClass(id: number): Observable<void> {
    return this.run(() => this.store.masterData.deleteClass(id));
  }

  // --- Fächer ---

  getSubjects(): Observable<Subject[]> {
    return this.run(() => this.store.masterData.getSubjects());
  }

  createSubject(name: string, shortName: string): Observable<Subject> {
    return this.run(() => this.store.masterData.createSubject(name, shortName));
  }

  updateSubject(id: number, name: string, shortName: string): Observable<Subject> {
    return this.run(() => this.store.masterData.updateSubject(id, name, shortName));
  }

  deleteSubject(id: number): Observable<void> {
    return this.run(() => this.store.masterData.deleteSubject(id));
  }

  // --- Kurse ---

  getCourses(): Observable<Course[]> {
    return this.run(() => this.store.masterData.getCourses());
  }

  getCourse(id: number): Observable<Course> {
    return this.run(() => this.store.masterData.getCourse(id));
  }

  createCourse(schoolClassId: number, subjectId: number): Observable<Course> {
    return this.run(() => this.store.masterData.createCourse(schoolClassId, subjectId));
  }

  deleteCourse(id: number): Observable<void> {
    return this.run(() => this.store.masterData.deleteCourse(id));
  }

  getCourseStudents(courseId: number): Observable<Student[]> {
    return this.run(() => this.store.masterData.getCourseStudents(courseId));
  }

  // --- Schüler ---

  getStudents(classId: number): Observable<Student[]> {
    return this.run(() => this.store.masterData.getStudents(classId));
  }

  createStudent(classId: number, firstName: string, lastName: string): Observable<Student> {
    return this.run(() => this.store.masterData.createStudent(classId, firstName, lastName));
  }

  importStudents(
    classId: number,
    students: { firstName: string; lastName: string }[],
  ): Observable<Student[]> {
    return this.run(() => this.store.masterData.importStudents(classId, students));
  }

  updateStudent(id: number, firstName: string, lastName: string): Observable<Student> {
    return this.run(() => this.store.masterData.updateStudent(id, firstName, lastName));
  }

  deleteStudent(id: number): Observable<void> {
    return this.run(() => this.store.masterData.deleteStudent(id));
  }

  /**
   * Nimmt das Foto entgegen. Es wird vorher verkleinert - die Bilder wandern
   * in dieselbe Datei wie alles andere, ein Foto in Kameragröße würde sie
   * unnötig aufblähen.
   */
  uploadPhoto(studentId: number, file: File): Observable<Student> {
    return this.fromPromise(async () => {
      const dataUrl = await readPhoto(file);
      return this.store.masterData.setPhoto(studentId, dataUrl);
    });
  }

  deletePhoto(studentId: number): Observable<Student> {
    return this.run(() => this.store.masterData.deletePhoto(studentId));
  }

  // --- Sitzordnungen ---

  getSeatingPlans(courseId: number): Observable<SeatingPlan[]> {
    return this.run(() => this.store.seating.getSeatingPlans(courseId));
  }

  createSeatingPlan(
    courseId: number,
    name: string,
    rows: number,
    columns: number,
  ): Observable<SeatingPlan> {
    return this.run(() => this.store.seating.createSeatingPlan(courseId, name, rows, columns));
  }

  updateSeatingPlan(
    id: number,
    name: string,
    rows: number,
    columns: number,
  ): Observable<SeatingPlan> {
    return this.run(() => this.store.seating.updateSeatingPlan(id, name, rows, columns));
  }

  saveLayout(planId: number, layout: SeatLayoutInput): Observable<SeatingPlan> {
    return this.run(() => this.store.seating.saveLayout(planId, layout));
  }

  deleteSeatingPlan(id: number): Observable<void> {
    return this.run(() => this.store.seating.deleteSeatingPlan(id));
  }

  // --- Stundenplan ---

  getTimetable(): Observable<TimetableEntry[]> {
    return this.run(() => this.store.timetable.getTimetable());
  }

  getCurrentLesson(): Observable<CurrentLesson> {
    return this.run(() => this.store.timetable.getCurrentLesson());
  }

  createTimetableEntry(input: TimetableEntryInput): Observable<TimetableEntry> {
    return this.run(() => this.store.timetable.createTimetableEntry(input));
  }

  updateTimetableEntry(id: number, input: TimetableEntryInput): Observable<TimetableEntry> {
    return this.run(() => this.store.timetable.updateTimetableEntry(id, input));
  }

  previewTimetableImport(ics: string): Observable<TimetableImportPreview> {
    return this.run(() => this.store.timetable.previewTimetableImport(ics));
  }

  applyTimetableImport(rows: TimetableImportRow[]): Observable<TimetableImportResult> {
    return this.run(() => this.store.timetable.applyTimetableImport(rows));
  }

  deleteTimetableEntry(id: number): Observable<void> {
    return this.run(() => this.store.timetable.deleteTimetableEntry(id));
  }

  // --- Bewertungen ---

  getRatingWindow(courseId: number): Observable<RatingWindow> {
    return this.run(() => this.store.ratings.getRatingWindow(courseId));
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
      this.store.ratings.rate(courseId, studentId, value, comment, lessonDate, replaceSameDay),
    );
  }

  /** Nimmt genau diese Bewertung zurück - etwa nach einem Vertipper. */
  deleteRating(id: number): Observable<void> {
    return this.run(() => this.store.ratings.deleteRating(id));
  }

  undoLastRating(courseId: number, studentId: number): Observable<void> {
    return this.run(() => this.store.ratings.undoLastRating(courseId, studentId));
  }

  getScoreboard(courseId: number, range?: DateRange): Observable<CourseScoreboard> {
    return this.run(() => this.store.ratings.getScoreboard(courseId, range));
  }

  getRatings(courseId: number, range?: DateRange): Observable<Rating[]> {
    return this.run(() => this.store.ratings.getRatings(courseId, range));
  }

  // --- Notenschlüssel ---

  getGlobalGradeScale(): Observable<GradeScale> {
    return this.run(() => this.store.gradeScales.getGlobalGradeScale());
  }

  saveGlobalGradeScale(input: GradeScaleInput): Observable<GradeScale> {
    return this.run(() => this.store.gradeScales.saveGradeScale(null, input));
  }

  getCourseGradeScale(courseId: number): Observable<GradeScale> {
    return this.run(() => this.store.gradeScales.getCourseGradeScale(courseId));
  }

  saveCourseGradeScale(courseId: number, input: GradeScaleInput): Observable<GradeScale> {
    return this.run(() => this.store.gradeScales.saveGradeScale(courseId, input));
  }

  deleteCourseGradeScale(courseId: number): Observable<void> {
    return this.run(() => this.store.gradeScales.deleteCourseGradeScale(courseId));
  }

  // --- Noten ---

  getPeriods(): Observable<GradingPeriod[]> {
    return this.run(() => this.store.periods.getPeriods());
  }

  savePeriod(id: number | null, input: GradingPeriodInput): Observable<GradingPeriod> {
    return this.run(() => this.store.periods.savePeriod(id, input));
  }

  deletePeriod(id: number): Observable<void> {
    return this.run(() => this.store.periods.deletePeriod(id));
  }

  getScheme(courseId: number): Observable<GradingScheme> {
    return this.run(() => this.store.schemes.getScheme(courseId));
  }

  saveScheme(courseId: number, input: GradingSchemeInput): Observable<GradingScheme> {
    return this.run(() => this.store.schemes.saveScheme(courseId, input));
  }

  copyScheme(fromCourseId: number, toCourseIds: number[]): Observable<void> {
    return this.run(() => this.store.schemes.copyScheme(fromCourseId, toCourseIds));
  }

  getQuarterGrades(courseId: number): Observable<QuarterGrade[]> {
    return this.run(() => this.store.quarterGrades.getQuarterGrades(courseId));
  }

  setQuarterGrade(
    courseId: number,
    studentId: number,
    quarter: Quarter,
    area: GradeArea,
    value: number | null,
  ): Observable<QuarterGrade> {
    return this.run(() =>
      this.store.quarterGrades.setQuarterGrade(courseId, studentId, quarter, area, value),
    );
  }

  getGradeBook(courseId: number, range?: DateRange): Observable<GradeBook> {
    return this.run(() => this.store.gradeBook.getGradeBook(courseId, range));
  }

  createAssessment(courseId: number, input: AssessmentInput): Observable<Assessment> {
    return this.run(() => this.store.assessments.createAssessment(courseId, input));
  }

  updateAssessment(id: number, input: AssessmentInput): Observable<Assessment> {
    return this.run(() => this.store.assessments.updateAssessment(id, input));
  }

  deleteAssessment(id: number): Observable<void> {
    return this.run(() => this.store.assessments.deleteAssessment(id));
  }

  getAssessmentDetail(id: number): Observable<AssessmentDetail> {
    return this.run(() => this.store.assessments.getAssessmentDetail(id));
  }

  saveResults(
    id: number,
    results: AssessmentResultInput[],
    reason?: string | null,
  ): Observable<AssessmentDetail> {
    return this.run(() => this.store.assessments.saveResults(id, results, reason));
  }

  importAssessment(courseId: number, input: ImportedAssessmentInput): Observable<Assessment> {
    return this.run(() => this.store.assessments.importAssessment(courseId, input));
  }

  setAssessmentReleased(id: number, released: boolean): Observable<Assessment> {
    return this.run(() => this.store.assessments.setAssessmentReleased(id, released));
  }

  setParticipationOverride(
    courseId: number,
    studentId: number,
    lessonDate: string,
    grade: number | null | 'auto',
    reason?: string | null,
  ): Observable<void> {
    return this.run(() =>
      this.store.participation.setParticipationOverride(
        courseId,
        studentId,
        lessonDate,
        grade,
        reason,
      ),
    );
  }

  getAbsentStudentIds(courseId: number, lessonDate: string): Observable<number[]> {
    return this.run(() => this.store.participation.getAbsentStudentIds(courseId, lessonDate));
  }

  setAbsent(
    courseId: number,
    studentId: number,
    lessonDate: string,
    absent: boolean,
  ): Observable<void> {
    return this.run(() =>
      this.store.participation.setAbsent(courseId, studentId, lessonDate, absent),
    );
  }

  getLastBackupAt(): Observable<string | null> {
    return this.run(() => this.store.settings.getLastBackupAt());
  }

  getSchoolYearCounts(): Observable<SchoolYearCounts> {
    return this.run(() => this.store.schoolYear.getSchoolYearCounts());
  }

  startNewSchoolYear(input: SchoolYearInput): Observable<SchoolYearCounts> {
    return this.run(() => this.store.schoolYear.startNewSchoolYear(input));
  }

  getGradeChanges(courseId: number): Observable<GradeChange[]> {
    return this.run(() => this.store.gradeBook.getGradeChanges(courseId));
  }

  getGradeReports(courseId: number): Observable<GradeReport[]> {
    return this.run(() => this.store.gradeBook.getGradeReports(courseId));
  }

  /** Stellt die Notenbögen zusammen und vermerkt ihre Ausgabe. */
  issueReports(
    courseId: number,
    studentIds: number[],
    periodId: number | null,
  ): Observable<StudentReport[]> {
    return this.run(() => {
      const reports = this.store.gradeBook.getStudentReports(courseId, studentIds, periodId);
      if (reports.length === 0) {
        throw new AppError('Es ist kein Schüler ausgewählt.');
      }

      this.store.gradeBook.recordReports(courseId, reports, periodId);
      return reports;
    });
  }

  exportGradeBook(courseId: number, range?: DateRange): Observable<void> {
    return this.fromPromise(() => {
      const result = this.store.exports.exportGradeBook(courseId, range);
      return download(result.blob, result.fileName, { share: true });
    });
  }

  // --- Einstellungen ---

  getSettings(): Observable<AppSettings> {
    return this.run(() => this.store.settings.getSettings());
  }

  saveSettings(settings: AppSettings): Observable<AppSettings> {
    return this.run(() => this.store.settings.saveSettings(settings));
  }

  // --- Export ---

  /**
   * Baut die CSV-Datei und bietet sie zum Herunterladen an. Früher zeigte ein
   * Link auf das Backend; jetzt entsteht die Datei im Browser.
   */
  exportCsv(courseId?: number | null, range?: DateRange): Observable<void> {
    return this.fromPromise(() => {
      const result = this.store.exports.exportSummary(courseId ?? null, range);
      return download(result.blob, result.fileName, { share: true });
    });
  }

  /** Die Einzelbewertungen als druckfertiges HTML im Querformat. */
  exportRatings(courseId: number | null, range?: DateRange): Observable<void> {
    return this.fromPromise(() => {
      const result = this.store.exports.exportRatings(courseId, range);
      return download(result.blob, result.fileName, { share: true });
    });
  }

  exportLessonSheets(
    courseId: number | null,
    range?: DateRange,
    studentId?: number,
  ): Observable<void> {
    return this.fromPromise(() => {
      const result = this.store.exports.exportLessonSheets(courseId, range, studentId);
      return download(result.blob, result.fileName, { share: true });
    });
  }
}
