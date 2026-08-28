import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Course,
  CourseScoreboard,
  CurrentLesson,
  GradeScale,
  GradeScaleInput,
  Rating,
  RatingValue,
  LessonSlot,
  SchoolClass,
  SeatLayoutInput,
  SeatingPlan,
  Student,
  Subject,
  TimetableEntry,
  TimetableEntryInput,
  TimetableImportPreview,
  TimetableImportResult,
  TimetableImportRow,
} from './models';

/** Ein Zeitraum für Auswertung und Export. Beide Grenzen sind optional. */
export interface DateRange {
  from?: string | null;
  to?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api';

  private range(range?: DateRange): HttpParams {
    let params = new HttpParams();
    if (range?.from) {
      params = params.set('from', range.from);
    }
    if (range?.to) {
      params = params.set('to', range.to);
    }
    return params;
  }

  // --- Klassen ---

  getClasses(): Observable<SchoolClass[]> {
    return this.http.get<SchoolClass[]>(`${this.base}/classes`);
  }

  createClass(name: string): Observable<SchoolClass> {
    return this.http.post<SchoolClass>(`${this.base}/classes`, { name });
  }

  updateClass(id: number, name: string): Observable<SchoolClass> {
    return this.http.put<SchoolClass>(`${this.base}/classes/${id}`, { name });
  }

  deleteClass(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/classes/${id}`);
  }

  // --- Fächer ---

  getSubjects(): Observable<Subject[]> {
    return this.http.get<Subject[]>(`${this.base}/subjects`);
  }

  createSubject(name: string, shortName: string): Observable<Subject> {
    return this.http.post<Subject>(`${this.base}/subjects`, { name, shortName });
  }

  updateSubject(id: number, name: string, shortName: string): Observable<Subject> {
    return this.http.put<Subject>(`${this.base}/subjects/${id}`, { name, shortName });
  }

  deleteSubject(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/subjects/${id}`);
  }

  // --- Kurse ---

  getCourses(): Observable<Course[]> {
    return this.http.get<Course[]>(`${this.base}/courses`);
  }

  getCourse(id: number): Observable<Course> {
    return this.http.get<Course>(`${this.base}/courses/${id}`);
  }

  createCourse(schoolClassId: number, subjectId: number): Observable<Course> {
    return this.http.post<Course>(`${this.base}/courses`, { schoolClassId, subjectId });
  }

  deleteCourse(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/courses/${id}`);
  }

  getCourseStudents(courseId: number): Observable<Student[]> {
    return this.http.get<Student[]>(`${this.base}/courses/${courseId}/students`);
  }

  // --- Schüler ---

  getStudents(classId: number): Observable<Student[]> {
    return this.http.get<Student[]>(`${this.base}/classes/${classId}/students`);
  }

  createStudent(classId: number, firstName: string, lastName: string): Observable<Student> {
    return this.http.post<Student>(`${this.base}/classes/${classId}/students`, {
      firstName,
      lastName,
    });
  }

  importStudents(
    classId: number,
    students: { firstName: string; lastName: string }[],
  ): Observable<Student[]> {
    return this.http.post<Student[]>(`${this.base}/classes/${classId}/students/import`, students);
  }

  updateStudent(id: number, firstName: string, lastName: string): Observable<Student> {
    return this.http.put<Student>(`${this.base}/students/${id}`, { firstName, lastName });
  }

  deleteStudent(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/students/${id}`);
  }

  uploadPhoto(studentId: number, file: File): Observable<Student> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<Student>(`${this.base}/students/${studentId}/photo`, form);
  }

  deletePhoto(studentId: number): Observable<Student> {
    return this.http.delete<Student>(`${this.base}/students/${studentId}/photo`);
  }

  // --- Sitzordnungen ---

  getSeatingPlans(courseId: number): Observable<SeatingPlan[]> {
    return this.http.get<SeatingPlan[]>(`${this.base}/courses/${courseId}/seatingplans`);
  }

  createSeatingPlan(
    courseId: number,
    name: string,
    rows: number,
    columns: number,
  ): Observable<SeatingPlan> {
    return this.http.post<SeatingPlan>(`${this.base}/courses/${courseId}/seatingplans`, {
      name,
      rows,
      columns,
    });
  }

  updateSeatingPlan(
    id: number,
    name: string,
    rows: number,
    columns: number,
  ): Observable<SeatingPlan> {
    return this.http.put<SeatingPlan>(`${this.base}/seatingplans/${id}`, { name, rows, columns });
  }

  saveLayout(planId: number, layout: SeatLayoutInput): Observable<SeatingPlan> {
    return this.http.put<SeatingPlan>(`${this.base}/seatingplans/${planId}/layout`, layout);
  }

  deleteSeatingPlan(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/seatingplans/${id}`);
  }

  // --- Stundenplan ---

  getTimetable(): Observable<TimetableEntry[]> {
    return this.http.get<TimetableEntry[]>(`${this.base}/timetable`);
  }

  getCurrentLesson(): Observable<CurrentLesson> {
    return this.http.get<CurrentLesson>(`${this.base}/timetable/current`);
  }

  createTimetableEntry(input: TimetableEntryInput): Observable<TimetableEntry> {
    return this.http.post<TimetableEntry>(`${this.base}/timetable`, input);
  }

  updateTimetableEntry(id: number, input: TimetableEntryInput): Observable<TimetableEntry> {
    return this.http.put<TimetableEntry>(`${this.base}/timetable/${id}`, input);
  }

  deleteTimetableEntry(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/timetable/${id}`);
  }

  /** Liest eine Kalenderdatei ein und zeigt, was daraus würde - speichert nichts. */
  previewTimetableImport(file: File): Observable<TimetableImportPreview> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<TimetableImportPreview>(`${this.base}/timetable/import/preview`, form);
  }

  applyTimetableImport(entries: TimetableImportRow[]): Observable<TimetableImportResult> {
    const nutzdaten = entries.map((e) => ({
      dayOfWeek: e.dayOfWeek,
      startTime: e.startTime,
      endTime: e.endTime,
      schoolClassName: e.schoolClassName,
      subjectName: e.subjectName,
      room: e.room,
    }));

    return this.http.post<TimetableImportResult>(`${this.base}/timetable/import/apply`, {
      entries: nutzdaten,
    });
  }

  // --- Bewertungen ---

  /** Welcher Unterrichtsstunde wird eine Bewertung gerade zugerechnet? */
  getCurrentLessonSlot(courseId: number): Observable<LessonSlot> {
    return this.http.get<LessonSlot>(`${this.base}/courses/${courseId}/current-lesson`);
  }

  rate(
    courseId: number,
    studentId: number,
    value: RatingValue,
    comment?: string,
  ): Observable<Rating> {
    return this.http.post<Rating>(`${this.base}/ratings`, {
      courseId,
      studentId,
      value,
      comment: comment ?? null,
    });
  }

  undoLastRating(courseId: number, studentId: number): Observable<void> {
    return this.http.post<void>(
      `${this.base}/courses/${courseId}/students/${studentId}/undo`,
      {},
    );
  }

  getScoreboard(courseId: number, range?: DateRange): Observable<CourseScoreboard> {
    return this.http.get<CourseScoreboard>(`${this.base}/courses/${courseId}/scoreboard`, {
      params: this.range(range),
    });
  }

  getRatings(courseId: number, range?: DateRange): Observable<Rating[]> {
    return this.http.get<Rating[]>(`${this.base}/courses/${courseId}/ratings`, {
      params: this.range(range),
    });
  }

  // --- Notenschlüssel ---

  getGlobalGradeScale(): Observable<GradeScale> {
    return this.http.get<GradeScale>(`${this.base}/gradescales/global`);
  }

  saveGlobalGradeScale(input: GradeScaleInput): Observable<GradeScale> {
    return this.http.put<GradeScale>(`${this.base}/gradescales/global`, input);
  }

  getCourseGradeScale(courseId: number): Observable<GradeScale> {
    return this.http.get<GradeScale>(`${this.base}/courses/${courseId}/gradescale`);
  }

  saveCourseGradeScale(courseId: number, input: GradeScaleInput): Observable<GradeScale> {
    return this.http.put<GradeScale>(`${this.base}/courses/${courseId}/gradescale`, input);
  }

  deleteCourseGradeScale(courseId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/courses/${courseId}/gradescale`);
  }


  // --- Export ---

  /** Baut die Adresse für einen CSV-Download. */
  exportUrl(kind: 'ratings' | 'summary', courseId?: number | null, range?: DateRange): string {
    let params = this.range(range);
    if (courseId) {
      params = params.set('courseId', String(courseId));
    }
    const query = params.toString();
    return `${this.base}/export/${kind}.csv${query ? '?' + query : ''}`;
  }
}
