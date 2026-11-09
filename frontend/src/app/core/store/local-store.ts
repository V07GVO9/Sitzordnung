/**
 * Der Datenspeicher der App. Hier liegt die Fachlogik, die früher in den
 * Controllern des Backends stand: Prüfungen, Sortierungen, Punktestände.
 *
 * Der komplette Bestand wird im Speicher gehalten. Jede Änderung meldet sich
 * über das Signal `revision`, damit die Ablage (IndexedDB und Datei) mitzieht.
 */

import { Injectable, computed, signal } from '@angular/core';
import {
  AREA_LABELS,
  GradeArea,
  AppSettings,
  Assessment,
  AssessmentDetail,
  AssessmentInput,
  ImportedAssessmentInput,
  AssessmentResultInput,
  Course,
  CourseScoreboard,
  CurrentLesson,
  DayOfWeek,
  GradeBook,
  LessonSheet,
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
  StudentGrades,
  StudentReport,
  StudentScore,
  Subject,
  TimetableEntry,
  TimetableEntryInput,
  TimetableImportPreview,
  TimetableImportResult,
  TimetableImportRow,
  Quarter,
  QuarterGrade,
  WEEKDAY_NAMES,
} from '../models';
import { AppError } from './app-error';
import {
  AssessmentRecord,
  AssessmentResultRecord,
  Database,
  GradeScaleRecord,
  GradingSchemeRecord,
  ParticipationOverrideRecord,
  SeatingPlanRecord,
  StudentRecord,
  createDefaultScheme,
  createEmptyDatabase,
} from './database';
import {
  average,
  combineGrades,
  formatGrade,
  lastRatingPerDay,
  gradeFromPercent,
  isValidGrade,
  participationLessons,
  resultGrade,
  roundGrade,
} from './assessment.logic';
import { CsvBuilder } from './csv';
import { effectiveScale, resolveGrade } from './grading.logic';
import { quarterRange } from './quarter.logic';
import { LessonContext, currentLesson, ratingWindow } from './lesson.logic';
import {
  Clock,
  formatDateGerman,
  isValidDateKey,
  isValidTime,
  toDateKey,
  toMinutes,
  toTimeKey,
} from './time';
import { parseTimetableIcs } from './timetable-import';
import { freeDayReason } from './school-calendar';
import { renderLessonSheets } from './lesson-sheet';
import { RatingsSheet, renderRatingsSheets } from './ratings-sheet';

/** Ein Zeitraum für Auswertung und Export. Beide Grenzen sind optional. */
export interface DateRange {
  from?: string | null;
  to?: string | null;
}

/** "--", "-", "+" und "++" - andere Werte nimmt die App nicht an. */
const ALLOWED_RATING_VALUES = [-2, -1, 0, 1, 2];

@Injectable({ providedIn: 'root' })
export class LocalStore {
  private database: Database = createEmptyDatabase();

  /** Zählt jede Änderung mit - daran hängt die Speicherung. */
  readonly revision = signal(0);

  /** Wird auf true gesetzt, sobald ein Datenbestand geöffnet oder angelegt wurde. */
  readonly isOpen = signal(false);

  /** True, solange Änderungen noch nicht in die Datei geschrieben wurden. */
  readonly hasUnsavedChanges = computed(() => this.revision() > this.savedRevision());

  private readonly savedRevision = signal(0);

  readonly clock = new Clock();

  // --- Lebenszyklus -------------------------------------------------------

  /** Übernimmt einen geladenen oder neu angelegten Bestand. */
  load(database: Database): void {
    this.database = migrate(database);
    this.isOpen.set(true);
    this.savedRevision.set(this.revision());
  }

  /** Legt einen leeren Bestand an. */
  createNew(): void {
    this.load(createEmptyDatabase());
  }

  /** Schließt den Bestand und wirft ihn aus dem Speicher. */
  close(): void {
    this.database = createEmptyDatabase();
    this.isOpen.set(false);
    this.revision.set(0);
    this.savedRevision.set(0);
  }

  /** Der Bestand für die Ablage. Eine Kopie, damit niemand daran vorbeischreibt. */
  snapshot(): Database {
    return structuredClone(this.database);
  }

  /** Merkt sich, dass der (übergebene) Stand gesichert ist. */
  markSaved(revision = this.revision()): void {
    // Mit Stand: Was während des Schreibens dazukam, bleibt ungesichert.
    this.savedRevision.set(Math.max(this.savedRevision(), revision));
  }

  private changed(): void {
    this.revision.update((value) => value + 1);
  }

  // --- Hilfsmittel --------------------------------------------------------

  private byName<T extends { name: string }>(a: T, b: T): number {
    return a.name.localeCompare(b.name, 'de');
  }

  private byStudentName(a: StudentRecord, b: StudentRecord): number {
    return (
      a.lastName.localeCompare(b.lastName, 'de') || a.firstName.localeCompare(b.firstName, 'de')
    );
  }

  private requireClass(id: number): void {
    if (!this.database.schoolClasses.some((c) => c.id === id)) {
      throw new AppError('Die Klasse existiert nicht.');
    }
  }

  private requireCourse(id: number) {
    const course = this.database.courses.find((c) => c.id === id);
    if (!course) {
      throw new AppError('Der angegebene Kurs existiert nicht.');
    }
    return course;
  }

  private className(id: number): string {
    return this.database.schoolClasses.find((c) => c.id === id)?.name ?? '';
  }

  private subject(id: number) {
    return this.database.subjects.find((s) => s.id === id);
  }

  private toStudent(record: StudentRecord): Student {
    return {
      id: record.id,
      firstName: record.firstName,
      lastName: record.lastName,
      schoolClassId: record.schoolClassId,
      hasPhoto: record.photo !== null,
      photoUrl: record.photo,
    };
  }

  private toCourse(id: number): Course {
    const course = this.requireCourse(id);
    const subject = this.subject(course.subjectId);

    return {
      id: course.id,
      schoolClassId: course.schoolClassId,
      schoolClassName: this.className(course.schoolClassId),
      subjectId: course.subjectId,
      subjectName: subject?.name ?? '',
      subjectShortName: subject?.shortName ?? '',
      seatingPlanCount: this.database.seatingPlans.filter((p) => p.courseId === course.id).length,
    };
  }

  private toPlan(record: SeatingPlanRecord): SeatingPlan {
    return {
      id: record.id,
      courseId: record.courseId,
      name: record.name,
      rows: record.rows,
      columns: record.columns,
      seats: [...record.seats].sort((a, b) => a.row - b.row || a.column - b.column),
    };
  }

  private toGradeScale(record: GradeScaleRecord): GradeScale {
    return {
      id: record.id,
      courseId: record.courseId,
      name: record.name,
      isGlobalDefault: record.courseId === null,
      entries: [...record.entries].sort((a, b) => b.minPoints - a.minPoints),
    };
  }

  private lessonContext(): LessonContext {
    return {
      entries: this.database.timetableEntries,
      courses: this.database.courses,
      schoolClasses: this.database.schoolClasses,
      subjects: this.database.subjects,
      settings: this.database.settings,
    };
  }

  /** Die Schüler eines Kurses - also die seiner Klasse, nach Namen sortiert. */
  private studentsOfCourse(courseId: number): StudentRecord[] {
    const course = this.requireCourse(courseId);
    return this.database.students
      .filter((s) => s.schoolClassId === course.schoolClassId)
      .sort((a, b) => this.byStudentName(a, b));
  }

  private ratingsInRange(courseId: number | null, range?: DateRange) {
    return this.database.ratings.filter(
      (r) =>
        (courseId === null || r.courseId === courseId) &&
        (!range?.from || r.lessonDate >= range.from) &&
        (!range?.to || r.lessonDate <= range.to),
    );
  }

  // --- Klassen ------------------------------------------------------------

  getClasses(): SchoolClass[] {
    return this.database.schoolClasses
      .map((c) => ({
        id: c.id,
        name: c.name,
        studentCount: this.database.students.filter((s) => s.schoolClassId === c.id).length,
      }))
      .sort((a, b) => this.byName(a, b));
  }

  createClass(rawName: string): SchoolClass {
    const name = rawName.trim();
    if (this.database.schoolClasses.some((c) => c.name === name)) {
      throw new AppError(`Die Klasse '${name}' gibt es bereits.`);
    }

    const record = { id: this.database.nextIds.schoolClass++, name };
    this.database.schoolClasses.push(record);
    this.changed();

    return { id: record.id, name: record.name, studentCount: 0 };
  }

  updateClass(id: number, rawName: string): SchoolClass {
    const record = this.database.schoolClasses.find((c) => c.id === id);
    if (!record) {
      throw new AppError('Die Klasse existiert nicht.');
    }

    const name = rawName.trim();
    if (this.database.schoolClasses.some((c) => c.name === name && c.id !== id)) {
      throw new AppError(`Die Klasse '${name}' gibt es bereits.`);
    }

    record.name = name;
    this.changed();

    return {
      id: record.id,
      name: record.name,
      studentCount: this.database.students.filter((s) => s.schoolClassId === id).length,
    };
  }

  /** Löscht die Klasse samt Schülern, Kursen, Sitzordnungen und Bewertungen. */
  deleteClass(id: number): void {
    this.requireClass(id);

    const students = this.database.students.filter((s) => s.schoolClassId === id).map((s) => s.id);
    this.database.courses
      .filter((c) => c.schoolClassId === id)
      .map((c) => c.id)
      .forEach((courseId) => this.removeCourseData(courseId));

    this.database.courses = this.database.courses.filter((c) => c.schoolClassId !== id);
    this.database.students = this.database.students.filter((s) => s.schoolClassId !== id);
    this.database.schoolClasses = this.database.schoolClasses.filter((c) => c.id !== id);
    this.removeStudentReferences(students);
    this.changed();
  }

  // --- Fächer -------------------------------------------------------------

  getSubjects(): Subject[] {
    return [...this.database.subjects].sort((a, b) => this.byName(a, b));
  }

  createSubject(rawName: string, rawShort: string): Subject {
    const name = rawName.trim();
    if (this.database.subjects.some((s) => s.name === name)) {
      throw new AppError(`Das Fach '${name}' gibt es bereits.`);
    }

    const record = {
      id: this.database.nextIds.subject++,
      name,
      shortName: rawShort.trim(),
    };
    this.database.subjects.push(record);
    this.changed();

    return { ...record };
  }

  updateSubject(id: number, rawName: string, rawShort: string): Subject {
    const record = this.database.subjects.find((s) => s.id === id);
    if (!record) {
      throw new AppError('Das Fach existiert nicht.');
    }

    const name = rawName.trim();
    if (this.database.subjects.some((s) => s.name === name && s.id !== id)) {
      throw new AppError(`Das Fach '${name}' gibt es bereits.`);
    }

    record.name = name;
    record.shortName = rawShort.trim();
    this.changed();

    return { ...record };
  }

  deleteSubject(id: number): void {
    if (!this.database.subjects.some((s) => s.id === id)) {
      throw new AppError('Das Fach existiert nicht.');
    }

    this.database.courses
      .filter((c) => c.subjectId === id)
      .map((c) => c.id)
      .forEach((courseId) => this.removeCourseData(courseId));

    this.database.courses = this.database.courses.filter((c) => c.subjectId !== id);
    this.database.subjects = this.database.subjects.filter((s) => s.id !== id);
    this.changed();
  }

  // --- Kurse --------------------------------------------------------------

  getCourses(): Course[] {
    return this.database.courses
      .map((c) => this.toCourse(c.id))
      .sort(
        (a, b) =>
          a.schoolClassName.localeCompare(b.schoolClassName, 'de') ||
          a.subjectName.localeCompare(b.subjectName, 'de'),
      );
  }

  getCourse(id: number): Course {
    return this.toCourse(id);
  }

  createCourse(schoolClassId: number, subjectId: number): Course {
    if (!this.database.schoolClasses.some((c) => c.id === schoolClassId)) {
      throw new AppError('Die angegebene Klasse existiert nicht.');
    }

    if (!this.database.subjects.some((s) => s.id === subjectId)) {
      throw new AppError('Das angegebene Fach existiert nicht.');
    }

    const exists = this.database.courses.some(
      (c) => c.schoolClassId === schoolClassId && c.subjectId === subjectId,
    );
    if (exists) {
      throw new AppError('Diese Klasse ist in diesem Fach bereits angelegt.');
    }

    const record = { id: this.database.nextIds.course++, schoolClassId, subjectId };
    this.database.courses.push(record);
    this.changed();

    return this.toCourse(record.id);
  }

  deleteCourse(id: number): void {
    this.requireCourse(id);
    this.removeCourseData(id);
    this.database.courses = this.database.courses.filter((c) => c.id !== id);
    this.changed();
  }

  /** Räumt alles weg, was an einem Kurs hängt. */
  private removeCourseData(courseId: number): void {
    this.database.seatingPlans = this.database.seatingPlans.filter((p) => p.courseId !== courseId);
    this.database.timetableEntries = this.database.timetableEntries.filter(
      (e) => e.courseId !== courseId,
    );
    this.database.ratings = this.database.ratings.filter((r) => r.courseId !== courseId);
    this.database.gradeScales = this.database.gradeScales.filter((g) => g.courseId !== courseId);

    const assessments = new Set(
      this.database.assessments.filter((a) => a.courseId === courseId).map((a) => a.id),
    );
    this.database.assessments = this.database.assessments.filter((a) => a.courseId !== courseId);
    this.database.assessmentResults = this.database.assessmentResults.filter(
      (r) => !assessments.has(r.assessmentId),
    );
    this.database.gradingSchemes = this.database.gradingSchemes.filter(
      (g) => g.courseId !== courseId,
    );
    this.database.participationOverrides = this.database.participationOverrides.filter(
      (o) => o.courseId !== courseId,
    );
    this.database.quarterGrades = this.database.quarterGrades.filter(
      (q) => q.courseId !== courseId,
    );
    this.database.gradeChanges = this.database.gradeChanges.filter((c) => c.courseId !== courseId);
    this.database.gradeReports = this.database.gradeReports.filter((r) => r.courseId !== courseId);
  }

  /** Entfernt gelöschte Schüler aus Sitzordnungen und Bewertungen. */
  private removeStudentReferences(studentIds: number[]): void {
    if (studentIds.length === 0) {
      return;
    }

    const gone = new Set(studentIds);
    this.database.ratings = this.database.ratings.filter((r) => !gone.has(r.studentId));
    this.database.assessmentResults = this.database.assessmentResults.filter(
      (r) => !gone.has(r.studentId),
    );
    this.database.participationOverrides = this.database.participationOverrides.filter(
      (o) => !gone.has(o.studentId),
    );
    this.database.quarterGrades = this.database.quarterGrades.filter((q) => !gone.has(q.studentId));
    this.database.gradeChanges = this.database.gradeChanges.filter((c) => !gone.has(c.studentId));
    this.database.gradeReports = this.database.gradeReports.filter((r) => !gone.has(r.studentId));
    for (const plan of this.database.seatingPlans) {
      plan.seats = plan.seats.filter((s) => !gone.has(s.studentId));
    }
  }

  getCourseStudents(courseId: number): Student[] {
    return this.studentsOfCourse(courseId).map((s) => this.toStudent(s));
  }

  // --- Schüler ------------------------------------------------------------

  getStudents(classId: number): Student[] {
    this.requireClass(classId);
    return this.database.students
      .filter((s) => s.schoolClassId === classId)
      .sort((a, b) => this.byStudentName(a, b))
      .map((s) => this.toStudent(s));
  }

  createStudent(classId: number, firstName: string, lastName: string): Student {
    this.requireClass(classId);

    const record: StudentRecord = {
      id: this.database.nextIds.student++,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      schoolClassId: classId,
      photo: null,
    };

    this.database.students.push(record);
    this.changed();

    return this.toStudent(record);
  }

  /** Legt mehrere Schüler auf einmal an - gedacht für eingefügte Namenslisten. */
  importStudents(classId: number, input: { firstName: string; lastName: string }[]): Student[] {
    this.requireClass(classId);

    const records = input
      .filter((i) => i.firstName.trim() !== '' || i.lastName.trim() !== '')
      .map<StudentRecord>((i) => ({
        id: this.database.nextIds.student++,
        firstName: i.firstName.trim(),
        lastName: i.lastName.trim(),
        schoolClassId: classId,
        photo: null,
      }));

    if (records.length === 0) {
      throw new AppError('Die Liste enthält keine verwertbaren Namen.');
    }

    this.database.students.push(...records);
    this.changed();

    return records.map((r) => this.toStudent(r));
  }

  private requireStudent(id: number): StudentRecord {
    const student = this.database.students.find((s) => s.id === id);
    if (!student) {
      throw new AppError('Der angegebene Schüler existiert nicht.');
    }
    return student;
  }

  updateStudent(id: number, firstName: string, lastName: string): Student {
    const record = this.requireStudent(id);
    record.firstName = firstName.trim();
    record.lastName = lastName.trim();
    this.changed();

    return this.toStudent(record);
  }

  deleteStudent(id: number): void {
    this.requireStudent(id);
    this.database.students = this.database.students.filter((s) => s.id !== id);
    this.removeStudentReferences([id]);
    this.changed();
  }

  /** Legt das bereits verkleinerte Foto als Data-URL am Schüler ab. */
  setPhoto(id: number, dataUrl: string): Student {
    const record = this.requireStudent(id);
    record.photo = dataUrl;
    this.changed();

    return this.toStudent(record);
  }

  deletePhoto(id: number): Student {
    const record = this.requireStudent(id);
    record.photo = null;
    this.changed();

    return this.toStudent(record);
  }

  // --- Sitzordnungen ------------------------------------------------------

  getSeatingPlans(courseId: number): SeatingPlan[] {
    this.requireCourse(courseId);
    return this.database.seatingPlans
      .filter((p) => p.courseId === courseId)
      .sort((a, b) => a.id - b.id)
      .map((p) => this.toPlan(p));
  }

  createSeatingPlan(courseId: number, name: string, rows: number, columns: number): SeatingPlan {
    this.requireCourse(courseId);

    const existing = this.database.seatingPlans.filter((p) => p.courseId === courseId).length;
    const record: SeatingPlanRecord = {
      id: this.database.nextIds.seatingPlan++,
      courseId,
      name: name.trim() === '' ? `Sitzordnung ${existing + 1}` : name.trim(),
      rows,
      columns,
      seats: [],
    };

    this.database.seatingPlans.push(record);
    this.changed();

    return this.toPlan(record);
  }

  private requirePlan(id: number): SeatingPlanRecord {
    const plan = this.database.seatingPlans.find((p) => p.id === id);
    if (!plan) {
      throw new AppError('Die Sitzordnung existiert nicht.');
    }
    return plan;
  }

  updateSeatingPlan(id: number, name: string, rows: number, columns: number): SeatingPlan {
    const plan = this.requirePlan(id);

    plan.name = name.trim();
    plan.rows = rows;
    plan.columns = columns;

    // Plätze, die durch ein kleineres Raster herausfallen, werden freigeräumt.
    plan.seats = plan.seats.filter((s) => s.row < plan.rows && s.column < plan.columns);
    this.changed();

    return this.toPlan(plan);
  }

  /**
   * Speichert die komplette Belegung nach dem Verschieben per Drag and Drop.
   * Die bisherige Belegung wird dabei ersetzt.
   */
  saveLayout(planId: number, input: SeatLayoutInput): SeatingPlan {
    const plan = this.requirePlan(planId);
    const course = this.requireCourse(plan.courseId);

    if (input.seats.some((s) => s.row >= input.rows || s.column >= input.columns)) {
      throw new AppError('Mindestens ein Platz liegt außerhalb des Rasters.');
    }

    const positions = new Set(input.seats.map((s) => `${s.row}:${s.column}`));
    if (positions.size !== input.seats.length) {
      throw new AppError('Auf einem Platz darf nur ein Schüler sitzen.');
    }

    const studentIds = new Set(input.seats.map((s) => s.studentId));
    if (studentIds.size !== input.seats.length) {
      throw new AppError('Ein Schüler kann nur an einem Platz sitzen.');
    }

    // Es dürfen nur Schüler der Klasse gesetzt werden, zu der der Kurs gehört.
    const belongs = [...studentIds].every((id) =>
      this.database.students.some((s) => s.id === id && s.schoolClassId === course.schoolClassId),
    );
    if (!belongs) {
      throw new AppError('Mindestens ein Schüler gehört nicht zur Klasse dieses Kurses.');
    }

    plan.rows = input.rows;
    plan.columns = input.columns;
    plan.seats = input.seats.map((s) => ({
      studentId: s.studentId,
      row: s.row,
      column: s.column,
    }));
    this.changed();

    return this.toPlan(plan);
  }

  deleteSeatingPlan(id: number): void {
    this.requirePlan(id);
    this.database.seatingPlans = this.database.seatingPlans.filter((p) => p.id !== id);
    this.changed();
  }

  // --- Stundenplan --------------------------------------------------------

  getTimetable(): TimetableEntry[] {
    return this.database.timetableEntries
      .map<TimetableEntry>((e) => {
        const course = this.database.courses.find((c) => c.id === e.courseId);
        return {
          id: e.id,
          courseId: e.courseId,
          schoolClassName: course ? this.className(course.schoolClassId) : '',
          subjectName: course ? (this.subject(course.subjectId)?.name ?? '') : '',
          dayOfWeek: e.dayOfWeek,
          startTime: e.startTime,
          endTime: e.endTime,
          room: e.room,
        };
      })
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek || toMinutes(a.startTime) - toMinutes(b.startTime));
  }

  getCurrentLesson(): CurrentLesson {
    return currentLesson(this.lessonContext(), this.clock.now());
  }

  /** Prüft Kurs, Uhrzeiten und Überschneidungen. */
  private validateTimetable(input: TimetableEntryInput, ignoreId: number | null): void {
    this.requireCourse(input.courseId);

    if (!isValidTime(input.startTime) || !isValidTime(input.endTime)) {
      throw new AppError('Die Uhrzeiten müssen im Format HH:mm angegeben werden.');
    }

    if (toMinutes(input.endTime) <= toMinutes(input.startTime)) {
      throw new AppError('Das Ende der Stunde muss nach ihrem Beginn liegen.');
    }

    // Zwei Stunden zur selben Zeit wären im Stundenplan nicht auflösbar.
    const overlap = this.database.timetableEntries.find(
      (e) =>
        e.dayOfWeek === input.dayOfWeek &&
        e.id !== ignoreId &&
        toMinutes(input.startTime) < toMinutes(e.endTime) &&
        toMinutes(input.endTime) > toMinutes(e.startTime),
    );

    if (overlap) {
      throw new AppError(
        'Die Zeit überschneidet sich mit einer anderen Stunde ' +
          `(${overlap.startTime}-${overlap.endTime} Uhr).`,
      );
    }
  }

  createTimetableEntry(input: TimetableEntryInput): TimetableEntry {
    this.validateTimetable(input, null);

    const record = {
      id: this.database.nextIds.timetableEntry++,
      courseId: input.courseId,
      dayOfWeek: input.dayOfWeek as DayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      room: input.room?.trim() ? input.room.trim() : null,
    };

    this.database.timetableEntries.push(record);
    this.changed();

    return this.getTimetable().find((e) => e.id === record.id)!;
  }

  updateTimetableEntry(id: number, input: TimetableEntryInput): TimetableEntry {
    const record = this.database.timetableEntries.find((e) => e.id === id);
    if (!record) {
      throw new AppError('Der Stundenplaneintrag existiert nicht.');
    }

    this.validateTimetable(input, id);

    record.courseId = input.courseId;
    record.dayOfWeek = input.dayOfWeek as DayOfWeek;
    record.startTime = input.startTime;
    record.endTime = input.endTime;
    record.room = input.room?.trim() ? input.room.trim() : null;
    this.changed();

    return this.getTimetable().find((e) => e.id === id)!;
  }

  deleteTimetableEntry(id: number): void {
    if (!this.database.timetableEntries.some((e) => e.id === id)) {
      throw new AppError('Der Stundenplaneintrag existiert nicht.');
    }

    this.database.timetableEntries = this.database.timetableEntries.filter((e) => e.id !== id);
    this.changed();
  }

  // --- Bewertungen --------------------------------------------------------

  getRatingWindow(courseId: number): RatingWindow {
    this.requireCourse(courseId);
    return ratingWindow(this.lessonContext(), courseId, this.clock.now());
  }

  /**
   * Vergibt eine Bewertung. Ohne Datum gilt sie für die laufende Stunde und nur
   * innerhalb des Stundenplans. Mit Datum wird sie gezielt für diesen Tag
   * eingetragen - so lassen sich Stunden aus dem Wochenplan jederzeit nachtragen.
   */
  rate(
    courseId: number,
    studentId: number,
    value: RatingValue,
    comment?: string,
    lessonDate?: string,
    replaceSameDay = false,
  ): Rating {
    if (!ALLOWED_RATING_VALUES.includes(value)) {
      throw new AppError(
        'Erlaubt sind nur die Bewertungen ++ (2), + (1), 0 (0), - (-1) und -- (-2).',
      );
    }

    const course = this.requireCourse(courseId);
    const student = this.requireStudent(studentId);

    if (student.schoolClassId !== course.schoolClassId) {
      throw new AppError('Der Schüler gehört nicht zur Klasse dieses Kurses.');
    }

    if (lessonDate === undefined) {
      const window = this.getRatingWindow(courseId);
      if (!window.canRate) {
        throw new AppError(window.reason);
      }
    } else if (!isValidDateKey(lessonDate)) {
      throw new AppError('Das Datum der Stunde ist ungültig.');
    }

    const now = this.clock.now();
    const record = {
      id: this.database.nextIds.rating++,
      courseId,
      studentId,
      value,
      lessonDate: lessonDate ?? toDateKey(now),
      createdAt: now.toISOString(),
      comment: comment?.trim() ? comment.trim() : null,
    };

    // Listenansicht: je Schüler und Tag nur eine Bewertung - der letzte
    // Klick ersetzt die vorige.
    if (replaceSameDay) {
      this.database.ratings = this.database.ratings.filter(
        (r) =>
          !(
            r.courseId === courseId &&
            r.studentId === studentId &&
            r.lessonDate === record.lessonDate
          ),
      );
    }

    this.database.ratings.push(record);
    this.changed();

    return { ...record };
  }

  /**
   * Nimmt eine Bewertung zurück. Ein Vertipper soll korrigierbar sein, ohne
   * dass dafür der Stundenplan erneut geprüft wird.
   */
  deleteRating(id: number): void {
    if (!this.database.ratings.some((r) => r.id === id)) {
      throw new AppError('Die Bewertung existiert nicht.');
    }

    this.database.ratings = this.database.ratings.filter((r) => r.id !== id);
    this.changed();
  }

  /** Die letzte Bewertung eines Schülers in diesem Kurs zurücknehmen. */
  undoLastRating(courseId: number, studentId: number): void {
    // Die Id wächst mit jeder Bewertung, ist also die zuletzt vergebene.
    const last = this.database.ratings
      .filter((r) => r.courseId === courseId && r.studentId === studentId)
      .sort((a, b) => b.id - a.id)[0];

    if (!last) {
      throw new AppError('Für diesen Schüler gibt es noch keine Bewertung.');
    }

    this.database.ratings = this.database.ratings.filter((r) => r.id !== last.id);
    this.changed();
  }

  /** Alle Einzelbewertungen eines Kurses, optional auf einen Zeitraum eingegrenzt. */
  getRatings(courseId: number, range?: DateRange): Rating[] {
    this.requireCourse(courseId);

    return this.ratingsInRange(courseId, range)
      .map((r) => ({ ...r }))
      .sort((a, b) => b.lessonDate.localeCompare(a.lessonDate) || b.id - a.id);
  }

  /**
   * Wie viele Unterrichtseinheiten gehalten wurden: jeder Tag, an dem
   * mindestens ein Schüler bewertet wurde. Wer an so einem Tag keine
   * Bewertung hat, bekommt dort die 0 - deshalb hat jeder Schüler gleich
   * viele Bewertungen.
   */
  private static lessonCount(ratings: { lessonDate: string }[]): number {
    return new Set(ratings.map((r) => r.lessonDate)).size;
  }

  /** Summe der Tagesbewertungen - je Tag zählt nur die letzte. */
  private static sumOf(perDay: Map<string, number>): number {
    return [...perDay.values()].reduce((sum, v) => sum + v, 0);
  }

  /**
   * Punktestand aller Schüler des Kurses. Je Unterrichtseinheit zählt nur die
   * letzte Bewertung, ohne Bewertung die 0. Die Punkte sind die Summe dieser
   * Tagesbewertungen, der Mittelwert teilt sie durch die gehaltenen Einheiten.
   */
  getScoreboard(courseId: number, range?: DateRange): CourseScoreboard {
    const course = this.requireCourse(courseId);
    const today = toDateKey(this.clock.now());
    const ratings = this.ratingsInRange(courseId, range);
    const scale = effectiveScale(this.database.gradeScales, courseId);
    const lessonCount = LocalStore.lessonCount(ratings);

    // @ts-ignore - Type-Kompatibilität zwischen StudentRecord und StudentScore
    const students = this.studentsOfCourse(courseId).map<StudentScore>((s) => {
      const perDay = lastRatingPerDay(ratings.filter((r) => r.studentId === s.id));
      const points = LocalStore.sumOf(perDay);

      return {
        studentId: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        points,
        ratingCount: lessonCount,
        average: lessonCount ? points / lessonCount : null,
        pointsToday: perDay.get(today) ?? 0,
        grade: resolveGrade(scale, points),
      };
    });

    return {
      courseId: course.id,
      schoolClassName: this.className(course.schoolClassId),
      subjectName: this.subject(course.subjectId)?.name ?? '',
      date: today,
      students,
    };
  }

  // --- Notenschlüssel -----------------------------------------------------

  getGlobalGradeScale(): GradeScale {
    const scale = this.database.gradeScales.find((g) => g.courseId === null);
    if (!scale) {
      throw new AppError('Es ist kein globaler Notenschlüssel hinterlegt.');
    }

    return this.toGradeScale(scale);
  }

  /** Der Schlüssel, der für diesen Kurs tatsächlich angewendet wird. */
  getCourseGradeScale(courseId: number): GradeScale {
    this.requireCourse(courseId);

    const scale = effectiveScale(this.database.gradeScales, courseId);
    if (!scale) {
      throw new AppError('Für diesen Kurs ist kein Notenschlüssel hinterlegt.');
    }

    return this.toGradeScale(scale);
  }

  saveGradeScale(courseId: number | null, input: GradeScaleInput): GradeScale {
    if (courseId !== null) {
      this.requireCourse(courseId);
    }

    if (input.entries.length === 0) {
      throw new AppError('Ein Notenschlüssel braucht mindestens eine Stufe.');
    }

    if (input.entries.some((e) => e.grade.trim() === '')) {
      throw new AppError('Jede Stufe braucht eine Note.');
    }

    if (new Set(input.entries.map((e) => e.minPoints)).size !== input.entries.length) {
      throw new AppError('Zwei Stufen dürfen nicht dieselbe Punktgrenze haben.');
    }

    let scale = this.database.gradeScales.find((g) => g.courseId === courseId);
    if (!scale) {
      scale = {
        id: this.database.nextIds.gradeScale++,
        courseId,
        name: '',
        entries: [],
      };
      this.database.gradeScales.push(scale);
    }

    scale.name =
      input.name.trim() === ''
        ? courseId === null
          ? 'Standard-Notenschlüssel'
          : 'Notenschlüssel'
        : input.name.trim();

    scale.entries = input.entries.map((e) => ({
      minPoints: e.minPoints,
      grade: e.grade.trim(),
    }));
    this.changed();

    return this.toGradeScale(scale);
  }

  /** Entfernt den kursspezifischen Schlüssel, danach gilt wieder der globale. */
  deleteCourseGradeScale(courseId: number): void {
    if (!this.database.gradeScales.some((g) => g.courseId === courseId)) {
      throw new AppError('Für diesen Kurs ist kein eigener Notenschlüssel hinterlegt.');
    }

    this.database.gradeScales = this.database.gradeScales.filter((g) => g.courseId !== courseId);
    this.changed();
  }

  // --- Notenzeiträume -----------------------------------------------------

  getPeriods(): GradingPeriod[] {
    return [...this.database.gradingPeriods]
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((p) => ({ ...p }));
  }

  /** Legt einen Zeitraum an (id null) oder ändert ihn. */
  savePeriod(id: number | null, input: GradingPeriodInput): GradingPeriod {
    const name = input.name.trim();
    if (name === '') {
      throw new AppError('Der Zeitraum braucht einen Namen.');
    }

    if (!isValidDateKey(input.start) || !isValidDateKey(input.end)) {
      throw new AppError('Bitte Beginn und Ende als Datum angeben.');
    }

    if (input.end < input.start) {
      throw new AppError('Das Ende des Zeitraums muss nach seinem Beginn liegen.');
    }

    let record = id === null ? undefined : this.database.gradingPeriods.find((p) => p.id === id);
    if (id !== null && !record) {
      throw new AppError('Der Zeitraum existiert nicht.');
    }

    if (!record) {
      record = { id: this.database.nextIds.gradingPeriod++, name, start: '', end: '' };
      this.database.gradingPeriods.push(record);
    }

    record.name = name;
    record.start = input.start;
    record.end = input.end;
    this.changed();

    return { ...record };
  }

  deletePeriod(id: number): void {
    if (!this.database.gradingPeriods.some((p) => p.id === id)) {
      throw new AppError('Der Zeitraum existiert nicht.');
    }

    this.database.gradingPeriods = this.database.gradingPeriods.filter((p) => p.id !== id);
    this.changed();
  }

  /** Der Datumsbereich eines Zeitraums - ohne Zeitraum gilt alles. */
  private periodRange(periodId: number | null): { range: DateRange; name: string } {
    if (periodId === null) {
      return { range: {}, name: 'Gesamter Zeitraum' };
    }

    const period = this.database.gradingPeriods.find((p) => p.id === periodId);
    if (!period) {
      throw new AppError('Der Zeitraum existiert nicht.');
    }

    return { range: { from: period.start, to: period.end }, name: period.name };
  }

  // --- Bewertungsschema ---------------------------------------------------

  /** Das gespeicherte Schema des Kurses oder - solange es keines gibt - der Vorschlag. */
  private schemeRecord(courseId: number): GradingSchemeRecord {
    return (
      this.database.gradingSchemes.find((g) => g.courseId === courseId) ??
      createDefaultScheme(courseId)
    );
  }

  getScheme(courseId: number): GradingScheme {
    this.requireCourse(courseId);
    const record = structuredClone(this.schemeRecord(courseId));

    return {
      ...record,
      percentScale: record.percentScale.sort((a, b) => b.minPercent - a.minPercent),
      isDefault: !this.database.gradingSchemes.some((g) => g.courseId === courseId),
    };
  }

  private validateScheme(courseId: number, input: GradingSchemeInput): void {
    if (
      !Number.isFinite(input.writtenPercent) ||
      input.writtenPercent < 0 ||
      input.writtenPercent > 100
    ) {
      throw new AppError('Der schriftliche Anteil muss zwischen 0 und 100 % liegen.');
    }

    if (input.types.some((t) => t.key.trim() === '' || t.label.trim() === '')) {
      throw new AppError('Jede Art von Leistungsnachweis braucht einen Namen.');
    }

    if (new Set(input.types.map((t) => t.key)).size !== input.types.length) {
      throw new AppError('Zwei Arten von Leistungsnachweisen haben denselben Namen.');
    }

    if (input.types.some((t) => !(t.weight >= 0) || !['written', 'oral'].includes(t.area))) {
      throw new AppError('Jede Art braucht einen Bereich und ein Gewicht ab 0.');
    }

    const used = this.database.assessments.find(
      (a) => a.courseId === courseId && !input.types.some((t) => t.key === a.typeKey),
    );
    if (used) {
      throw new AppError(
        `Die Art von „${used.title}" wird noch verwendet und kann nicht entfernt werden.`,
      );
    }

    if (input.percentScale.length === 0) {
      throw new AppError('Der Punkteschlüssel braucht mindestens eine Stufe.');
    }

    if (input.percentScale.some((e) => !isValidGrade(e.grade) || !Number.isFinite(e.minPercent))) {
      throw new AppError('Im Punkteschlüssel sind nur Noten von 1 bis 6 möglich.');
    }

    if (new Set(input.percentScale.map((e) => e.minPercent)).size !== input.percentScale.length) {
      throw new AppError('Zwei Stufen des Punkteschlüssels haben dieselbe Prozentgrenze.');
    }

    if (!input.percentScale.some((e) => e.minPercent <= 0)) {
      throw new AppError('Der Punkteschlüssel braucht eine Stufe ab 0 %.');
    }

    if (!(input.participationWeight >= 0)) {
      throw new AppError('Das Gewicht der Mitarbeit darf nicht negativ sein.');
    }

    if (!Object.values(input.participationGrades).every((g) => isValidGrade(g))) {
      throw new AppError('Für die Mitarbeit sind nur Noten von 1,0 bis 6,0 möglich.');
    }
  }

  saveScheme(courseId: number, input: GradingSchemeInput): GradingScheme {
    this.requireCourse(courseId);
    this.validateScheme(courseId, input);

    const record: GradingSchemeRecord = {
      courseId,
      writtenPercent: input.writtenPercent,
      types: input.types.map((t) => ({
        key: t.key.trim(),
        label: t.label.trim(),
        area: t.area,
        weight: t.weight,
      })),
      percentScale: input.percentScale.map((e) => ({ minPercent: e.minPercent, grade: e.grade })),
      participationWeight: input.participationWeight,
      participationGrades: { ...input.participationGrades },
    };

    this.database.gradingSchemes = [
      ...this.database.gradingSchemes.filter((g) => g.courseId !== courseId),
      record,
    ];
    this.changed();

    return this.getScheme(courseId);
  }

  /** Überträgt das Schema eines Kurses auf andere - etwa auf alle Lernfelder einer Klasse. */
  copyScheme(fromCourseId: number, toCourseIds: number[]): void {
    const source = this.schemeRecord(fromCourseId);
    this.requireCourse(fromCourseId);

    // Erst alles prüfen, dann schreiben - sonst bliebe ein halber Stand zurück.
    const targets = toCourseIds.filter((id) => id !== fromCourseId);
    for (const target of targets) {
      this.requireCourse(target);
      this.validateScheme(target, source);
    }

    for (const target of targets) {
      this.database.gradingSchemes = [
        ...this.database.gradingSchemes.filter((g) => g.courseId !== target),
        { ...structuredClone(source), courseId: target },
      ];
    }
    this.changed();
  }

  // --- Leistungsnachweise -------------------------------------------------

  private requireAssessment(id: number): AssessmentRecord {
    const assessment = this.database.assessments.find((a) => a.id === id);
    if (!assessment) {
      throw new AppError('Der Leistungsnachweis existiert nicht.');
    }
    return assessment;
  }

  private resultsOf(assessmentId: number): AssessmentResultRecord[] {
    return this.database.assessmentResults.filter((r) => r.assessmentId === assessmentId);
  }

  private toAssessment(record: AssessmentRecord, scheme: GradingSchemeRecord): Assessment {
    const type = scheme.types.find((t) => t.key === record.typeKey);
    const grades = this.resultsOf(record.id)
      .map((r) => resultGrade(r, record, scheme))
      .filter((g): g is number => g !== null);

    return {
      ...record,
      typeLabel: type?.label ?? record.typeKey,
      area: type?.area ?? 'written',
      weight: type?.weight ?? 0,
      released: record.releasedAt !== null,
      average: average(grades),
      gradedCount: grades.length,
    };
  }

  private assessmentsInRange(courseId: number, range?: DateRange): AssessmentRecord[] {
    return this.database.assessments
      .filter(
        (a) =>
          a.courseId === courseId &&
          (!range?.from || a.date >= range.from) &&
          (!range?.to || a.date <= range.to),
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  }

  getAssessments(courseId: number, range?: DateRange): Assessment[] {
    this.requireCourse(courseId);
    const scheme = this.schemeRecord(courseId);
    return this.assessmentsInRange(courseId, range).map((a) => this.toAssessment(a, scheme));
  }

  private validateAssessment(courseId: number, input: AssessmentInput): void {
    if (!this.schemeRecord(courseId).types.some((t) => t.key === input.typeKey)) {
      throw new AppError('Diese Art von Leistungsnachweis gibt es im Bewertungsschema nicht.');
    }

    if (input.title.trim() === '') {
      throw new AppError('Der Leistungsnachweis braucht einen Titel.');
    }

    if (!isValidDateKey(input.date)) {
      throw new AppError('Bitte ein gültiges Datum angeben.');
    }

    if (input.maxPoints !== null && !(input.maxPoints > 0)) {
      throw new AppError('Die erreichbare Punktzahl muss größer als 0 sein.');
    }
  }

  createAssessment(courseId: number, input: AssessmentInput): Assessment {
    this.requireCourse(courseId);
    this.validateAssessment(courseId, input);

    const record: AssessmentRecord = {
      id: this.database.nextIds.assessment++,
      courseId,
      typeKey: input.typeKey,
      title: input.title.trim(),
      date: input.date,
      maxPoints: input.maxPoints,
      releasedAt: null,
      comment: input.comment?.trim() ? input.comment.trim() : null,
    };

    this.database.assessments.push(record);
    this.changed();

    return this.toAssessment(record, this.schemeRecord(courseId));
  }

  updateAssessment(id: number, input: AssessmentInput): Assessment {
    const record = this.requireAssessment(id);
    this.validateAssessment(record.courseId, input);

    // Art und Punktzahl verändern Noten - bei freigegebenen Nachweisen nur mit
    // Umweg über das Zurücknehmen der Freigabe.
    if (
      record.releasedAt !== null &&
      (record.typeKey !== input.typeKey || record.maxPoints !== input.maxPoints)
    ) {
      throw new AppError(
        'Art und Punktzahl lassen sich erst ändern, wenn die Freigabe zurückgenommen ist.',
      );
    }

    record.typeKey = input.typeKey;
    record.title = input.title.trim();
    record.date = input.date;
    record.maxPoints = input.maxPoints;
    record.comment = input.comment?.trim() ? input.comment.trim() : null;

    // Ohne Punktzahl gibt es auch keine Punkte mehr.
    if (record.maxPoints === null) {
      for (const result of this.resultsOf(id)) {
        result.points = null;
      }
    }
    this.changed();

    return this.toAssessment(record, this.schemeRecord(record.courseId));
  }

  deleteAssessment(id: number): void {
    this.requireAssessment(id);
    this.database.assessments = this.database.assessments.filter((a) => a.id !== id);
    this.database.assessmentResults = this.database.assessmentResults.filter(
      (r) => r.assessmentId !== id,
    );
    this.changed();
  }

  /** Der Nachweis samt einer Zeile für jeden Schüler des Kurses. */
  getAssessmentDetail(id: number): AssessmentDetail {
    const record = this.requireAssessment(id);
    const scheme = this.schemeRecord(record.courseId);
    const results = this.resultsOf(id);

    return {
      assessment: this.toAssessment(record, scheme),
      results: this.studentsOfCourse(record.courseId).map((student) => {
        const result = results.find((r) => r.studentId === student.id);
        return {
          studentId: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          points: result?.points ?? null,
          grade: result?.grade ?? null,
          status: result?.status ?? 'graded',
          comment: result?.comment ?? null,
          effectiveGrade: resultGrade(result, record, scheme),
        };
      }),
    };
  }

  /** Beschreibt ein Ergebnis für das Änderungsprotokoll. */
  private static describeResult(
    result: AssessmentResultRecord | undefined,
    grade: number | null,
  ): string {
    if (!result) {
      return '–';
    }

    if (result.status === 'excused') {
      return 'entschuldigt';
    }

    if (result.status === 'refused') {
      return 'verweigert (6,0)';
    }

    if (result.points !== null) {
      return `${String(result.points).replace('.', ',')} P. (${formatGrade(grade, 1)})`;
    }

    return formatGrade(grade, 1);
  }

  /**
   * Speichert die Ergebnisse. Ist der Nachweis schon freigegeben, braucht jede
   * Änderung eine Begründung und landet im Protokoll.
   */
  saveResults(
    id: number,
    inputs: AssessmentResultInput[],
    reason?: string | null,
  ): AssessmentDetail {
    const record = this.requireAssessment(id);
    const course = this.requireCourse(record.courseId);
    const scheme = this.schemeRecord(record.courseId);

    for (const input of inputs) {
      const student = this.requireStudent(input.studentId);
      if (student.schoolClassId !== course.schoolClassId) {
        throw new AppError('Mindestens ein Schüler gehört nicht zur Klasse dieses Kurses.');
      }

      if (!['graded', 'excused', 'refused'].includes(input.status)) {
        throw new AppError('Unbekannter Status eines Ergebnisses.');
      }

      if (input.grade !== null && !isValidGrade(input.grade)) {
        throw new AppError(
          `Die Note für ${student.firstName} ${student.lastName} liegt nicht zwischen 1,0 und 6,0.`,
        );
      }

      if (input.points !== null) {
        if (record.maxPoints === null) {
          throw new AppError('Für diesen Leistungsnachweis ist keine Punktzahl hinterlegt.');
        }
        if (!(input.points >= 0) || input.points > record.maxPoints) {
          throw new AppError(
            `Die Punkte für ${student.firstName} ${student.lastName} müssen zwischen 0 und ${record.maxPoints} liegen.`,
          );
        }
      }
    }

    const released = record.releasedAt !== null;
    const now = this.clock.now().toISOString();
    const changes: { studentId: number; oldValue: string; newValue: string }[] = [];

    // Erst alles berechnen, dann prüfen, dann schreiben - ein Fehler soll
    // keinen halben Stand hinterlassen.
    const updates = inputs.map((input) => {
      const existing = this.database.assessmentResults.find(
        (r) => r.assessmentId === id && r.studentId === input.studentId,
      );
      const next: AssessmentResultRecord = {
        assessmentId: id,
        studentId: input.studentId,
        points: input.status === 'graded' ? input.points : null,
        grade: input.status === 'graded' ? input.grade : null,
        status: input.status,
        comment: input.comment?.trim() ? input.comment.trim() : null,
      };

      const oldText = LocalStore.describeResult(existing, resultGrade(existing, record, scheme));
      const newText = LocalStore.describeResult(next, resultGrade(next, record, scheme));
      if (released && oldText !== newText) {
        changes.push({ studentId: input.studentId, oldValue: oldText, newValue: newText });
      }

      const isEmpty = next.status === 'graded' && next.points === null && next.grade === null;
      return { existing, next: isEmpty && !next.comment ? null : next };
    });

    if (changes.length && !reason?.trim()) {
      throw new AppError(
        'Der Nachweis ist freigegeben - bitte eine Begründung für die Änderung angeben.',
      );
    }

    for (const { existing, next } of updates) {
      this.database.assessmentResults = this.database.assessmentResults.filter(
        (r) => r !== existing,
      );
      if (next) {
        this.database.assessmentResults.push(next);
      }
    }

    for (const change of changes) {
      this.logChange(
        record.courseId,
        change.studentId,
        `${record.title} (${formatDateGerman(record.date)})`,
        change.oldValue,
        change.newValue,
        reason ?? null,
        now,
      );
    }
    this.changed();

    return this.getAssessmentDetail(id);
  }

  /** Gibt einen Nachweis frei oder nimmt die Freigabe zurück. */
  setAssessmentReleased(id: number, released: boolean): Assessment {
    const record = this.requireAssessment(id);
    record.releasedAt = released ? this.clock.now().toISOString() : null;
    this.changed();

    return this.toAssessment(record, this.schemeRecord(record.courseId));
  }

  /**
   * Legt einen Leistungsnachweis mit fertigen Noten an und gibt ihn frei - für
   * Mitarbeitsnoten, die aus einem anderen Werkzeug übernommen werden. Alles
   * wird vorab geprüft, damit kein halber Nachweis zurückbleibt.
   */
  importAssessment(courseId: number, input: ImportedAssessmentInput): Assessment {
    const course = this.requireCourse(courseId);
    this.validateAssessment(courseId, { ...input, maxPoints: null });

    if (input.results.length === 0) {
      throw new AppError('Es gibt keine Noten, die übernommen werden können.');
    }

    const seen = new Set<number>();
    for (const result of input.results) {
      const student = this.requireStudent(result.studentId);
      if (student.schoolClassId !== course.schoolClassId) {
        throw new AppError('Mindestens ein Schüler gehört nicht zur Klasse dieses Kurses.');
      }
      if (seen.has(result.studentId)) {
        throw new AppError(
          `${student.firstName} ${student.lastName} ist mehreren Zeilen zugeordnet.`,
        );
      }
      seen.add(result.studentId);
      if (!isValidGrade(result.grade)) {
        throw new AppError(
          `Die Note für ${student.firstName} ${student.lastName} liegt nicht zwischen 1,0 und 6,0.`,
        );
      }
    }

    const assessment = this.createAssessment(courseId, {
      typeKey: input.typeKey,
      title: input.title,
      date: input.date,
      maxPoints: null,
      comment: input.comment,
    });
    this.saveResults(
      assessment.id,
      input.results.map((r) => ({
        studentId: r.studentId,
        points: null,
        grade: r.grade,
        status: 'graded' as const,
        comment: r.comment,
      })),
    );

    return this.setAssessmentReleased(assessment.id, true);
  }

  private logChange(
    courseId: number,
    studentId: number,
    what: string,
    oldValue: string,
    newValue: string,
    reason: string | null,
    changedAt: string,
  ): void {
    this.database.gradeChanges.push({
      id: this.database.nextIds.gradeChange++,
      courseId,
      studentId,
      what,
      oldValue,
      newValue,
      reason: reason?.trim() ? reason.trim() : null,
      changedAt,
    });
  }

  // --- Mitarbeit je Doppelstunde ------------------------------------------

  /** Die Tage, an denen der Kurs Unterricht hatte - erkennbar an den Bewertungen. */
  private lessonDates(courseId: number, range?: DateRange): string[] {
    return [...new Set(this.ratingsInRange(courseId, range).map((r) => r.lessonDate))].sort();
  }

  /**
   * Setzt die Note einer Doppelstunde von Hand. grade null = fehlte (zählt
   * nicht), 'auto' = wieder die Note aus den Bewertungen.
   */
  setParticipationOverride(
    courseId: number,
    studentId: number,
    lessonDate: string,
    grade: number | null | 'auto',
    reason?: string | null,
  ): void {
    const course = this.requireCourse(courseId);
    const student = this.requireStudent(studentId);
    if (student.schoolClassId !== course.schoolClassId) {
      throw new AppError('Der Schüler gehört nicht zur Klasse dieses Kurses.');
    }

    if (!this.lessonDates(courseId).includes(lessonDate)) {
      throw new AppError('An diesem Tag gab es in diesem Kurs keine bewertete Stunde.');
    }

    if (typeof grade === 'number' && !isValidGrade(grade)) {
      throw new AppError('Die Note muss zwischen 1,0 und 6,0 liegen.');
    }

    const scheme = this.schemeRecord(courseId);
    const before = this.participationFor(courseId, studentId, [lessonDate], scheme)[0];

    this.database.participationOverrides = this.database.participationOverrides.filter(
      (o) => !(o.courseId === courseId && o.studentId === studentId && o.lessonDate === lessonDate),
    );

    if (grade !== 'auto') {
      this.database.participationOverrides.push({
        courseId,
        studentId,
        lessonDate,
        grade,
        reason: reason?.trim() ? reason.trim() : null,
      });
    }

    const after = this.participationFor(courseId, studentId, [lessonDate], scheme)[0];
    const describe = (g: number | null) => (g === null ? 'fehlte' : formatGrade(g, 1));

    if (describe(before.grade) !== describe(after.grade)) {
      this.logChange(
        courseId,
        studentId,
        `Mitarbeit ${formatDateGerman(lessonDate)}`,
        describe(before.grade),
        describe(after.grade) + (grade === 'auto' ? ' (aus Bewertungen)' : ''),
        reason ?? null,
        this.clock.now().toISOString(),
      );
    }
    this.changed();
  }

  /** Die an einem Tag als „fehlt“ markierten Schüler eines Kurses. */
  getAbsentStudentIds(courseId: number, lessonDate: string): number[] {
    this.requireCourse(courseId);
    return this.database.participationOverrides
      .filter((o) => o.courseId === courseId && o.lessonDate === lessonDate && o.grade === null)
      .map((o) => o.studentId);
  }

  /**
   * Markiert einen Schüler für den Tag als fehlend - schon zu Stundenbeginn,
   * bevor jemand bewertet wurde. Die Doppelstunde zählt für ihn dann nicht.
   * Zurücknehmen entfernt nur das „fehlt“, keine von Hand gesetzte Note.
   */
  setAbsent(courseId: number, studentId: number, lessonDate: string, absent: boolean): void {
    const course = this.requireCourse(courseId);
    const student = this.requireStudent(studentId);
    if (student.schoolClassId !== course.schoolClassId) {
      throw new AppError('Der Schüler gehört nicht zur Klasse dieses Kurses.');
    }
    if (!isValidDateKey(lessonDate)) {
      throw new AppError('Das Datum der Stunde ist ungültig.');
    }

    const same = (o: ParticipationOverrideRecord) =>
      o.courseId === courseId && o.studentId === studentId && o.lessonDate === lessonDate;
    const existing = this.database.participationOverrides.find(same);
    if (absent ? existing?.grade === null : existing?.grade !== null) {
      return;
    }

    this.database.participationOverrides = this.database.participationOverrides.filter(
      (o) => !same(o),
    );
    if (absent) {
      this.database.participationOverrides.push({
        courseId,
        studentId,
        lessonDate,
        grade: null,
        reason: 'fehlt (im Unterricht markiert)',
      });
    }

    this.logChange(
      courseId,
      studentId,
      `Mitarbeit ${formatDateGerman(lessonDate)}`,
      absent ? (existing ? formatGrade(existing.grade!, 1) : 'aus Bewertungen') : 'fehlte',
      absent ? 'fehlte' : 'aus Bewertungen',
      'im Unterricht markiert',
      this.clock.now().toISOString(),
    );
    this.changed();
  }

  private participationFor(
    courseId: number,
    studentId: number,
    lessonDates: string[],
    scheme: GradingSchemeRecord,
  ) {
    return participationLessons(
      lessonDates,
      this.database.ratings.filter((r) => r.courseId === courseId && r.studentId === studentId),
      this.database.participationOverrides.filter(
        (o) => o.courseId === courseId && o.studentId === studentId,
      ),
      scheme.participationGrades,
    );
  }

  // --- Quartalsnoten -----------------------------------------------------

  /**
   * Alle Quartalsnoten eines Kurses. Ist für mündlich nichts eingetragen,
   * steht dort als Vorschlag der Durchschnitt der Mitarbeitsnoten im Quartal.
   */
  getQuarterGrades(courseId: number): QuarterGrade[] {
    this.requireCourse(courseId);
    const stored: QuarterGrade[] = this.database.quarterGrades
      .filter((q) => q.courseId === courseId)
      .map(({ studentId, quarter, area, percent, grade }) => ({
        studentId,
        quarter,
        area,
        percent,
        grade,
        suggested: false,
      }));

    const hasOral = new Set(
      stored.filter((q) => q.area === 'oral').map((q) => `${q.studentId}:${q.quarter}`),
    );
    const scheme = this.schemeRecord(courseId);
    const today = this.clock.now();
    const suggestions: QuarterGrade[] = [];

    for (const quarter of [1, 2, 3, 4] as Quarter[]) {
      const dates = this.lessonDates(courseId, quarterRange(quarter, today));
      if (dates.length === 0) {
        continue;
      }
      for (const student of this.getCourseStudents(courseId)) {
        if (hasOral.has(`${student.id}:${quarter}`)) {
          continue;
        }
        const avg = average(
          this.participationFor(courseId, student.id, dates, scheme).map((l) => l.grade),
        );
        if (avg !== null) {
          suggestions.push({
            studentId: student.id,
            quarter,
            area: 'oral',
            percent: null,
            grade: roundGrade(avg, 1),
            suggested: true,
          });
        }
      }
    }

    return [...stored, ...suggestions];
  }

  /**
   * Trägt eine Quartalsnote ein: schriftlich in Prozent (die Note folgt aus
   * dem Prozentschlüssel), mündlich direkt als Note. null löscht den Eintrag -
   * mündlich gilt dann wieder der Durchschnitt der Mitarbeit.
   */
  setQuarterGrade(
    courseId: number,
    studentId: number,
    quarter: Quarter,
    area: GradeArea,
    value: number | null,
  ): QuarterGrade {
    const course = this.requireCourse(courseId);
    const student = this.requireStudent(studentId);
    if (student.schoolClassId !== course.schoolClassId) {
      throw new AppError('Der Schüler gehört nicht zur Klasse dieses Kurses.');
    }
    if (![1, 2, 3, 4].includes(quarter)) {
      throw new AppError('Es gibt nur die Quartale 1 bis 4.');
    }

    let percent: number | null = null;
    let grade: number | null = null;
    if (area === 'written') {
      if (value !== null && !(Number.isFinite(value) && value >= 0 && value <= 100)) {
        throw new AppError('Die Prozentzahl muss zwischen 0 und 100 liegen.');
      }
      percent = value;
      grade =
        value === null ? null : gradeFromPercent(this.schemeRecord(courseId).percentScale, value);
    } else {
      if (value !== null && !isValidGrade(value)) {
        throw new AppError('Die Note muss zwischen 1,0 und 6,0 liegen.');
      }
      grade = value === null ? null : roundGrade(value, 1);
    }

    const matches = (q: { courseId: number; studentId: number; quarter: number; area: string }) =>
      q.courseId === courseId &&
      q.studentId === studentId &&
      q.quarter === quarter &&
      q.area === area;
    const before = this.database.quarterGrades.find(matches);
    this.database.quarterGrades = this.database.quarterGrades.filter((q) => !matches(q));

    if (grade !== null || percent !== null) {
      this.database.quarterGrades.push({ courseId, studentId, quarter, area, percent, grade });
    }

    const describe = (p: number | null, g: number | null) =>
      p === null && g === null
        ? '–'
        : p === null
          ? formatGrade(g, 1)
          : `${String(p).replace('.', ',')} % / ${formatGrade(g, 1)}`;
    const oldText = describe(before?.percent ?? null, before?.grade ?? null);
    const newText = describe(percent, grade);
    if (oldText !== newText) {
      this.logChange(
        courseId,
        studentId,
        `${quarter}. Quartal ${AREA_LABELS[area]}`,
        oldText,
        newText,
        null,
        this.clock.now().toISOString(),
      );
    }
    this.changed();

    return { studentId, quarter, area, percent, grade, suggested: false };
  }

  // --- Notenübersicht -----------------------------------------------------

  /** Alle Noten eines Schülers in einem Kurs - die Grundlage für Übersicht und Notenbogen. */
  private gradesOf(
    student: StudentRecord,
    courseId: number,
    scheme: GradingSchemeRecord,
    released: AssessmentRecord[],
    lessonDates: string[],
  ): StudentGrades {
    const assessmentGrades: Record<number, number | null> = {};
    const items = released.map((a) => {
      const result = this.database.assessmentResults.find(
        (r) => r.assessmentId === a.id && r.studentId === student.id,
      );
      const grade = resultGrade(result, a, scheme);
      const type = scheme.types.find((t) => t.key === a.typeKey);
      assessmentGrades[a.id] = grade;

      return { area: type?.area ?? 'written', weight: type?.weight ?? 0, grade };
    });

    const lessons = this.participationFor(courseId, student.id, lessonDates, scheme);
    const participation = average(lessons.map((l) => l.grade));
    const combined = combineGrades(
      [...items, { area: 'oral', weight: scheme.participationWeight, grade: participation }],
      scheme.writtenPercent,
    );

    return {
      studentId: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      assessmentGrades,
      lessons,
      participation,
      ...combined,
    };
  }

  getGradeBook(courseId: number, range?: DateRange): GradeBook {
    const course = this.toCourse(courseId);
    const scheme = this.schemeRecord(courseId);
    const assessments = this.assessmentsInRange(courseId, range);
    const released = assessments.filter((a) => a.releasedAt !== null);
    const lessonDates = this.lessonDates(courseId, range);

    return {
      courseId,
      schoolClassName: course.schoolClassName,
      subjectName: course.subjectName,
      subjectShortName: course.subjectShortName,
      scheme: this.getScheme(courseId),
      assessments: assessments.map((a) => this.toAssessment(a, scheme)),
      lessonDates,
      students: this.studentsOfCourse(courseId).map((s) =>
        this.gradesOf(s, courseId, scheme, released, lessonDates),
      ),
    };
  }

  getGradeChanges(courseId: number): GradeChange[] {
    this.requireCourse(courseId);

    return this.database.gradeChanges
      .filter((c) => c.courseId === courseId)
      .sort((a, b) => b.changedAt.localeCompare(a.changedAt) || b.id - a.id)
      .map((c) => {
        const student = this.database.students.find((s) => s.id === c.studentId);
        return {
          id: c.id,
          studentId: c.studentId,
          studentName: student ? `${student.lastName}, ${student.firstName}` : '',
          what: c.what,
          oldValue: c.oldValue,
          newValue: c.newValue,
          reason: c.reason,
          changedAt: c.changedAt,
        };
      });
  }

  // --- Notenbögen ---------------------------------------------------------

  /** Der Inhalt der Notenbögen - nur freigegebene Nachweise erscheinen darin. */
  getStudentReports(
    courseId: number,
    studentIds: number[],
    periodId: number | null,
  ): StudentReport[] {
    const course = this.toCourse(courseId);
    const scheme = this.schemeRecord(courseId);
    const { range, name } = this.periodRange(periodId);
    const released = this.assessmentsInRange(courseId, range).filter((a) => a.releasedAt !== null);
    const lessonDates = this.lessonDates(courseId, range);
    const wanted = new Set(studentIds);
    const issuedAt = this.clock.now().toISOString();

    return this.studentsOfCourse(courseId)
      .filter((s) => wanted.has(s.id))
      .map((student) => {
        const grades = this.gradesOf(student, courseId, scheme, released, lessonDates);

        return {
          studentId: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          schoolClassName: course.schoolClassName,
          subjectName: course.subjectName,
          periodName: name,
          issuedAt,
          writtenPercent: scheme.writtenPercent,
          items: released.map((a) => {
            const type = scheme.types.find((t) => t.key === a.typeKey);
            const result = this.database.assessmentResults.find(
              (r) => r.assessmentId === a.id && r.studentId === student.id,
            );
            return {
              date: a.date,
              title: a.title,
              typeLabel: type?.label ?? a.typeKey,
              area: type?.area ?? 'written',
              weight: type?.weight ?? 0,
              grade: grades.assessmentGrades[a.id] ?? null,
              status: result?.status ?? null,
            };
          }),
          participation: {
            lessonCount: grades.lessons.length,
            countedCount: grades.lessons.filter((l) => l.grade !== null).length,
            average: grades.participation,
            weight: scheme.participationWeight,
          },
          written: grades.written,
          oral: grades.oral,
          overall: grades.overall,
          partial: grades.partial,
        };
      });
  }

  /** Vermerkt, dass die Notenbögen ausgegeben wurden - mit dem Stand von damals. */
  recordReports(courseId: number, reports: StudentReport[], periodId: number | null): void {
    this.requireCourse(courseId);

    for (const report of reports) {
      this.database.gradeReports.push({
        id: this.database.nextIds.gradeReport++,
        courseId,
        studentId: report.studentId,
        periodId,
        issuedAt: report.issuedAt,
        written: report.written,
        oral: report.oral,
        overall: report.overall,
      });
    }
    this.changed();
  }

  getGradeReports(courseId: number): GradeReport[] {
    this.requireCourse(courseId);

    return this.database.gradeReports
      .filter((r) => r.courseId === courseId)
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt) || b.id - a.id)
      .map((r) => {
        const student = this.database.students.find((s) => s.id === r.studentId);
        return {
          id: r.id,
          studentId: r.studentId,
          studentName: student ? `${student.lastName}, ${student.firstName}` : '',
          periodId: r.periodId,
          periodName: this.database.gradingPeriods.find((p) => p.id === r.periodId)?.name ?? null,
          issuedAt: r.issuedAt,
          written: r.written,
          oral: r.oral,
          overall: r.overall,
        };
      });
  }

  /** Die Notenübersicht als CSV - eine Zeile je Schüler. */
  exportGradeBook(courseId: number, range?: DateRange): { blob: Blob; fileName: string } {
    const book = this.getGradeBook(courseId, range);
    const released = book.assessments.filter((a) => a.released);
    const csv = new CsvBuilder();

    csv.addRow(
      'Klasse',
      'Fach/Lernfeld',
      'Nachname',
      'Vorname',
      ...released.map((a) => `${a.title} (${formatDateGerman(a.date)})`),
      'Mitarbeit',
      `Schriftlich (${book.scheme.writtenPercent} %)`,
      `${AREA_LABELS.oral} (${100 - book.scheme.writtenPercent} %)`,
      'Gesamt',
    );

    const value = (grade: number | null) => (grade === null ? null : Math.round(grade * 100) / 100);

    for (const student of book.students) {
      csv.addRow(
        book.schoolClassName,
        book.subjectName,
        student.lastName,
        student.firstName,
        ...released.map((a) => value(student.assessmentGrades[a.id] ?? null)),
        value(student.participation),
        value(student.written),
        value(student.oral),
        value(student.overall),
      );
    }

    return {
      blob: csv.toBlob(),
      fileName:
        `noten-${LocalStore.fileNamePart(book.schoolClassName)}-` +
        `${LocalStore.fileNamePart(book.subjectShortName || book.subjectName)}-` +
        `${toDateKey(this.clock.now())}.csv`,
    };
  }

  // --- Stundenübersicht --------------------------------------------------

  /**
   * Die Unterrichtstage eines Kurses laut Stundenplan - ohne Feiertage und
   * Ferien, höchstens bis heute. Ohne Startdatum ab Beginn des Schuljahres
   * (1. August) bzw. ab der ersten Bewertung, falls die früher liegt.
   */
  private scheduledDates(courseId: number, range?: DateRange): string[] {
    const weekdays = new Set(
      this.database.timetableEntries.filter((e) => e.courseId === courseId).map((e) => e.dayOfWeek),
    );
    if (weekdays.size === 0) {
      return [];
    }

    const now = this.clock.now();
    const today = toDateKey(now);
    const yearStart = `${now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1}-08-01`;
    const firstRating = this.lessonDates(courseId)[0];
    const from = range?.from || (firstRating && firstRating < yearStart ? firstRating : yearStart);
    const to = range?.to && range.to < today ? range.to : today;

    const dates: string[] = [];
    const [y, m, d] = from.split('-').map(Number);
    for (const day = new Date(y, m - 1, d); toDateKey(day) <= to; day.setDate(day.getDate() + 1)) {
      const key = toDateKey(day);
      if (weekdays.has(day.getDay() as DayOfWeek) && freeDayReason(key) === null) {
        dates.push(key);
      }
    }
    return dates;
  }

  /**
   * Je Kurs eine Übersicht: für jeden Unterrichtstag die Mitarbeitsnote jedes
   * Schülers - auch die automatische Note, wenn er nicht bewertet wurde.
   * Tage, an denen im Kurs niemand bewertet wurde, zählen nicht (Note null),
   * außer es ist von Hand eine Note gesetzt.
   */
  getLessonSheets(courseId: number | null, range?: DateRange): LessonSheet[] {
    const courses = this.getCourses().filter((c) => courseId === null || c.id === courseId);
    if (courses.length === 0) {
      throw new AppError('Es gibt keinen passenden Kurs zum Exportieren.');
    }

    return courses.map((course) => {
      const scheme = this.schemeRecord(course.id);
      const ratedDates = new Set(this.lessonDates(course.id, range));
      const dates = [...new Set([...this.scheduledDates(course.id, range), ...ratedDates])].sort();
      const ratings = this.ratingsInRange(course.id, range);

      return {
        courseId: course.id,
        schoolClassName: course.schoolClassName,
        subjectName: course.subjectName,
        from: range?.from || dates[0] || null,
        to: range?.to || dates.at(-1) || null,
        dates: dates.map((date) => ({ date, rated: ratedDates.has(date) })),
        students: this.studentsOfCourse(course.id).map((student) => {
          const rated = new Set(
            ratings.filter((r) => r.studentId === student.id).map((r) => r.lessonDate),
          );
          const cells = this.participationFor(course.id, student.id, dates, scheme).map((l) => ({
            ...l,
            rated: rated.has(l.date),
            grade: ratedDates.has(l.date) || l.override ? l.grade : null,
          }));

          return {
            studentId: student.id,
            firstName: student.firstName,
            lastName: student.lastName,
            cells,
            average: average(cells.map((c) => c.grade)),
          };
        }),
      };
    });
  }

  /** Die Stundenübersicht als druckfertiges HTML - je Kurs eine Seite. */
  exportLessonSheets(
    courseId: number | null,
    range?: DateRange,
    studentId?: number,
  ): { blob: Blob; fileName: string } {
    let sheets = this.getLessonSheets(courseId, range);
    let studentPart = '';
    if (studentId !== undefined) {
      sheets = sheets.map((sheet) => ({
        ...sheet,
        students: sheet.students.filter((s) => s.studentId === studentId),
      }));
      const student = sheets[0]?.students[0];
      if (!student) {
        throw new AppError('Der Schüler gehört nicht zu diesem Kurs.');
      }
      studentPart = `-${LocalStore.fileNamePart(`${student.lastName}-${student.firstName}`)}`;
    }
    const suffix =
      sheets.length === 1
        ? `${LocalStore.fileNamePart(sheets[0].schoolClassName)}-` +
          LocalStore.fileNamePart(sheets[0].subjectName) +
          studentPart
        : 'alle-kurse';

    return {
      blob: new Blob([renderLessonSheets(sheets, toDateKey(this.clock.now()))], {
        type: 'text/html;charset=utf-8',
      }),
      fileName: `noten-je-stunde-${suffix}-${toDateKey(this.clock.now())}.html`,
    };
  }

  // --- Einstellungen ------------------------------------------------------

  getSettings(): AppSettings {
    return { ...this.database.settings };
  }

  saveSettings(settings: AppSettings): AppSettings {
    if (settings.toleranceMinutes < 0 || settings.toleranceMinutes > 120) {
      throw new AppError('Die Kulanzzeit muss zwischen 0 und 120 Minuten liegen.');
    }

    this.database.settings = {
      toleranceMinutes: settings.toleranceMinutes,
      allowRatingOutsideLesson: settings.allowRatingOutsideLesson,
    };
    this.changed();

    return this.getSettings();
  }

  // --- Export -------------------------------------------------------------

  private static fileNamePart(value: string): string {
    return value
      .split('')
      .map((c) => (/[\p{L}\p{N}]/u.test(c) ? c : '-'))
      .join('')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Die Einzelbewertungen als druckfertiges HTML im Querformat: je Kurs eine
   * Tabelle, Schüler in den Zeilen, Bewertungstage in den Spalten.
   */
  exportRatings(courseId: number | null, range?: DateRange): { blob: Blob; fileName: string } {
    const courses = this.getCourses().filter(
      (c) =>
        (courseId === null || c.id === courseId) &&
        (courseId !== null || this.ratingsInRange(c.id, range).length > 0),
    );
    if (courses.length === 0) {
      throw new AppError('Es gibt keinen passenden Kurs zum Exportieren.');
    }

    const sheets: RatingsSheet[] = courses.map((course) => {
      // Nach Eingabe sortiert - die letzte Bewertung eines Tages zählt.
      const ratings = this.ratingsInRange(course.id, range).sort((a, b) => a.id - b.id);
      const dates = [...new Set(ratings.map((r) => r.lessonDate))].sort();

      return {
        schoolClassName: course.schoolClassName,
        subjectName: course.subjectName,
        from: range?.from || dates[0] || null,
        to: range?.to || dates.at(-1) || null,
        dates,
        students: this.studentsOfCourse(course.id).map((student) => {
          const own = ratings.filter((r) => r.studentId === student.id);
          return {
            firstName: student.firstName,
            lastName: student.lastName,
            cells: dates.map((date) =>
              own
                .filter((r) => r.lessonDate === date)
                .map((r) => ({
                  value: r.value,
                  time: toTimeKey(new Date(r.createdAt)),
                  comment: r.comment || null,
                })),
            ),
            points: LocalStore.sumOf(lastRatingPerDay(own)),
          };
        }),
      };
    });

    const suffix =
      sheets.length === 1
        ? `${LocalStore.fileNamePart(sheets[0].schoolClassName)}-` +
          LocalStore.fileNamePart(sheets[0].subjectName)
        : 'alle-kurse';

    return {
      blob: new Blob([renderRatingsSheets(sheets, toDateKey(this.clock.now()))], {
        type: 'text/html;charset=utf-8',
      }),
      fileName: `bewertungen-${suffix}-${toDateKey(this.clock.now())}.html`,
    };
  }

  /**
   * Eine Zeile pro Schüler mit Punktestand und - falls ein Notenschlüssel
   * hinterlegt ist - der daraus errechneten Note.
   */
  exportSummary(courseId: number | null, range?: DateRange): { blob: Blob; fileName: string } {
    const courses = this.getCourses().filter((c) => courseId === null || c.id === courseId);

    if (courses.length === 0) {
      throw new AppError('Es gibt keinen passenden Kurs zum Exportieren.');
    }

    const csv = new CsvBuilder();
    csv.addRow(
      'Klasse',
      'Fach',
      'Nachname',
      'Vorname',
      'Punkte',
      'Anzahl Bewertungen',
      'Mittelwert',
      'Note',
    );

    for (const course of courses) {
      const ratings = this.ratingsInRange(course.id, range);
      const scale = effectiveScale(this.database.gradeScales, course.id);
      const lessonCount = LocalStore.lessonCount(ratings);

      for (const student of this.studentsOfCourse(course.id)) {
        const points = LocalStore.sumOf(
          lastRatingPerDay(ratings.filter((r) => r.studentId === student.id)),
        );

        csv.addRow(
          course.schoolClassName,
          course.subjectName,
          student.lastName,
          student.firstName,
          points,
          lessonCount,
          lessonCount ? formatGrade(points / lessonCount, 2) : '',
          resolveGrade(scale, points),
        );
      }
    }

    const suffix =
      courses.length === 1
        ? `${LocalStore.fileNamePart(courses[0].schoolClassName)}-` +
          LocalStore.fileNamePart(courses[0].subjectName)
        : 'alle-kurse';

    return {
      blob: csv.toBlob(),
      fileName: `mitarbeit-${suffix}-${toDateKey(this.clock.now())}.csv`,
    };
  }

  // --- Stundenplan-Import ---------------------------------------------------

  /**
   * Liest einen Kalenderexport und zeigt, was daraus würde - ohne etwas zu
   * speichern. Was bereits angelegt ist, hilft beim Erkennen von Klasse und
   * Fach im Termintitel.
   */
  previewTimetableImport(ics: string): TimetableImportPreview {
    const klassen = this.database.schoolClasses.map((c) => c.name);
    const faecher = this.database.subjects.flatMap((s) =>
      s.shortName.trim() === '' ? [s.name] : [s.name, s.shortName],
    );

    return parseTimetableIcs(ics, klassen, faecher);
  }

  /**
   * Übernimmt die bestätigten Zeilen. Fehlende Klassen, Fächer und Kurse
   * werden dabei angelegt; Dopplungen und Überschneidungen übersprungen.
   */
  applyTimetableImport(rows: readonly TimetableImportRow[]): TimetableImportResult {
    if (rows.length === 0) {
      throw new AppError('Es wurde keine Zeile zum Übernehmen ausgewählt.');
    }

    const skipped: string[] = [];
    let createdClasses = 0;
    let createdSubjects = 0;
    let createdCourses = 0;
    let createdLessons = 0;

    for (const zeile of rows) {
      const klassenName = zeile.schoolClassName.trim();
      const fachName = zeile.subjectName.trim();
      const beschreibung =
        `${WEEKDAY_NAMES[zeile.dayOfWeek] ?? ''} ${zeile.startTime} ${fachName} ${klassenName}`.trim();

      if (!isValidTime(zeile.startTime) || !isValidTime(zeile.endTime)) {
        skipped.push(`${beschreibung}: unlesbare Uhrzeit.`);
        continue;
      }

      if (toMinutes(zeile.endTime) <= toMinutes(zeile.startTime)) {
        skipped.push(`${beschreibung}: das Ende liegt nicht nach dem Beginn.`);
        continue;
      }

      if (klassenName === '' || fachName === '') {
        skipped.push(`${beschreibung}: Klasse oder Fach fehlt.`);
        continue;
      }

      let klasse = this.database.schoolClasses.find(
        (c) => c.name.toLowerCase() === klassenName.toLowerCase(),
      );
      if (!klasse) {
        klasse = { id: this.database.nextIds.schoolClass++, name: klassenName };
        this.database.schoolClasses.push(klasse);
        createdClasses++;
      }

      let fach = this.database.subjects.find(
        (s) =>
          s.name.toLowerCase() === fachName.toLowerCase() ||
          (s.shortName.trim() !== '' && s.shortName.toLowerCase() === fachName.toLowerCase()),
      );
      if (!fach) {
        fach = {
          id: this.database.nextIds.subject++,
          name: fachName,
          shortName:
            fachName.length <= 4 ? fachName.toUpperCase() : fachName.slice(0, 2).toUpperCase(),
        };
        this.database.subjects.push(fach);
        createdSubjects++;
      }

      const klassenId = klasse.id;
      const fachId = fach.id;

      let kurs = this.database.courses.find(
        (c) => c.schoolClassId === klassenId && c.subjectId === fachId,
      );
      if (!kurs) {
        kurs = {
          id: this.database.nextIds.course++,
          schoolClassId: klassenId,
          subjectId: fachId,
        };
        this.database.courses.push(kurs);
        createdCourses++;
      }

      const kursId = kurs.id;

      // Dieselbe Stunde ein zweites Mal anzulegen bringt nichts.
      const schonDa = this.database.timetableEntries.some(
        (e) =>
          e.courseId === kursId &&
          e.dayOfWeek === zeile.dayOfWeek &&
          e.startTime === zeile.startTime &&
          e.endTime === zeile.endTime,
      );
      if (schonDa) {
        skipped.push(`${beschreibung}: steht schon im Stundenplan.`);
        continue;
      }

      // Zwei Stunden zur selben Zeit wären im Stundenplan nicht auflösbar.
      const kollision = this.database.timetableEntries.find(
        (e) =>
          e.dayOfWeek === zeile.dayOfWeek &&
          toMinutes(zeile.startTime) < toMinutes(e.endTime) &&
          toMinutes(zeile.endTime) > toMinutes(e.startTime),
      );
      if (kollision) {
        skipped.push(
          `${beschreibung}: überschneidet sich mit einer bereits eingetragenen Stunde ` +
            `(${kollision.startTime}-${kollision.endTime} Uhr).`,
        );
        continue;
      }

      this.database.timetableEntries.push({
        id: this.database.nextIds.timetableEntry++,
        courseId: kursId,
        dayOfWeek: zeile.dayOfWeek,
        startTime: zeile.startTime,
        endTime: zeile.endTime,
        room: zeile.room?.trim() ? zeile.room.trim() : null,
      });
      createdLessons++;
    }

    this.changed();

    return { createdClasses, createdSubjects, createdCourses, createdLessons, skipped };
  }
}

/**
 * Ergänzt fehlende Felder in einem eingelesenen Bestand, damit auch eine
 * ältere Datei geöffnet werden kann.
 */
function migrate(database: Database): Database {
  const empty = createEmptyDatabase();

  return {
    ...empty,
    ...database,
    settings: { ...empty.settings, ...database.settings },
    nextIds: { ...empty.nextIds, ...database.nextIds },
  };
}
