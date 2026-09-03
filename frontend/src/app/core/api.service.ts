import { Injectable, inject } from '@angular/core';
import { Observable, defer, of, throwError } from 'rxjs';
import {
  AppSettings,
  Course,
  CourseScoreboard,
  CurrentLesson,
  GradeScale,
  GradeScaleInput,
  Rating,
  RatingValue,
  RatingWindow,
  SchoolClass,
  SeatLayoutInput,
  SeatingPlan,
  Student,
  Subject,
  TimetableEntry,
  TimetableEntryInput,
} from './models';
import { DateRange, LocalStore } from './store/local-store';
import { readPhoto } from './store/photo';
import { download } from './store/file-system';

export type { DateRange } from './store/local-store';

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
  ): Observable<Rating> {
    return this.run(() => this.store.rate(courseId, studentId, value, comment));
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
  exportCsv(
    kind: 'ratings' | 'summary',
    courseId?: number | null,
    range?: DateRange,
  ): Observable<void> {
    return this.run(() => {
      const result =
        kind === 'ratings'
          ? this.store.exportRatings(courseId ?? null, range)
          : this.store.exportSummary(courseId ?? null, range);

      download(result.blob, result.fileName);
    });
  }

  getNeighbourLessonSlot(courseId: number, lesson: any, direction: string): Observable<any> {
    return throwError(() => new Error('Navigationsfunktion nicht verfügbar'));
  }

  getCurrentLessonSlot(courseId: number): Observable<any> {
    return throwError(() => new Error('Funktionalität nicht verfügbar'));
  }
}
