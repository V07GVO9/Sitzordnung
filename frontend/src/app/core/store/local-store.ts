/**
 * Der Datenspeicher der App. Hier liegt die Fachlogik, die früher in den
 * Controllern des Backends stand: Prüfungen, Sortierungen, Punktestände.
 *
 * Der komplette Bestand wird im Speicher gehalten. Jede Änderung meldet sich
 * über das Signal `revision`, damit die Ablage (IndexedDB und Datei) mitzieht.
 */

import { Injectable, computed, signal } from '@angular/core';
import {
  AppSettings,
  Course,
  CourseScoreboard,
  CurrentLesson,
  DayOfWeek,
  GradeScale,
  GradeScaleInput,
  Rating,
  RatingValue,
  RatingWindow,
  SchoolClass,
  SeatLayoutInput,
  SeatingPlan,
  Student,
  StudentScore,
  Subject,
  TimetableEntry,
  TimetableEntryInput,
  TimetableImportPreview,
  TimetableImportResult,
  TimetableImportRow,
  WEEKDAY_NAMES,
} from '../models';
import { AppError } from './app-error';
import {
  Database,
  GradeScaleRecord,
  MAX_PLANS_PER_COURSE,
  SeatingPlanRecord,
  StudentRecord,
  createEmptyDatabase,
} from './database';
import { CsvBuilder, CsvDate, CsvLiteral } from './csv';
import { effectiveScale, resolveGrade } from './grading.logic';
import { LessonContext, currentLesson, ratingWindow } from './lesson.logic';
import { Clock, isValidTime, toDateKey, toMinutes, toTimeKey } from './time';
import { parseTimetableIcs } from './timetable-import';

/** Ein Zeitraum für Auswertung und Export. Beide Grenzen sind optional. */
export interface DateRange {
  from?: string | null;
  to?: string | null;
}

/** "--", "-", "+" und "++" - andere Werte nimmt die App nicht an. */
const ALLOWED_RATING_VALUES = [-2, -1, 1, 2];

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

  /** Merkt sich, dass der aktuelle Stand gesichert ist. */
  markSaved(): void {
    this.savedRevision.set(this.revision());
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
  }

  /** Entfernt gelöschte Schüler aus Sitzordnungen und Bewertungen. */
  private removeStudentReferences(studentIds: number[]): void {
    if (studentIds.length === 0) {
      return;
    }

    const gone = new Set(studentIds);
    this.database.ratings = this.database.ratings.filter((r) => !gone.has(r.studentId));
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
  importStudents(
    classId: number,
    input: { firstName: string; lastName: string }[],
  ): Student[] {
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
    if (existing >= MAX_PLANS_PER_COURSE) {
      throw new AppError(
        `Pro Kurs sind höchstens ${MAX_PLANS_PER_COURSE} Sitzordnungen möglich.`,
      );
    }

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
      .sort(
        (a, b) => a.dayOfWeek - b.dayOfWeek || toMinutes(a.startTime) - toMinutes(b.startTime),
      );
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

  rate(courseId: number, studentId: number, value: RatingValue, comment?: string): Rating {
    if (!ALLOWED_RATING_VALUES.includes(value)) {
      throw new AppError('Erlaubt sind nur die Bewertungen ++ (2), + (1), - (-1) und -- (-2).');
    }

    const course = this.requireCourse(courseId);
    const student = this.requireStudent(studentId);

    if (student.schoolClassId !== course.schoolClassId) {
      throw new AppError('Der Schüler gehört nicht zur Klasse dieses Kurses.');
    }

    const window = this.getRatingWindow(courseId);
    if (!window.canRate) {
      throw new AppError(window.reason);
    }

    const now = this.clock.now();
    const record = {
      id: this.database.nextIds.rating++,
      courseId,
      studentId,
      value,
      lessonDate: toDateKey(now),
      createdAt: now.toISOString(),
      comment: comment?.trim() ? comment.trim() : null,
    };

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
   * Punktestand aller Schüler des Kurses. Jeder startet bei 0; die Punkte sind
   * die Summe aller Bewertungen im gewählten Zeitraum.
   */
  getScoreboard(courseId: number, range?: DateRange): CourseScoreboard {
    const course = this.requireCourse(courseId);
    const today = toDateKey(this.clock.now());
    const ratings = this.ratingsInRange(courseId, range);
    const scale = effectiveScale(this.database.gradeScales, courseId);

    // @ts-ignore - Type-Kompatibilität zwischen StudentRecord und StudentScore
    const students = this.studentsOfCourse(courseId).map<StudentScore>((s) => {
      const own = ratings.filter((r) => r.studentId === s.id);
      const points = own.reduce((sum, r) => sum + r.value, 0);

      return {
        studentId: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        points,
        ratingCount: own.length,
        pointsToday: own
          .filter((r) => r.lessonDate === today)
          .reduce((sum, r) => sum + r.value, 0),
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

  private static symbol(value: number): CsvLiteral {
    switch (value) {
      case 2:
        return new CsvLiteral('++');
      case 1:
        return new CsvLiteral('+');
      case -1:
        return new CsvLiteral('-');
      case -2:
        return new CsvLiteral('--');
      default:
        return new CsvLiteral(String(value));
    }
  }

  /** Jede einzelne Bewertung als eigene Zeile. */
  exportRatings(courseId: number | null, range?: DateRange): { blob: Blob; fileName: string } {
    const csv = new CsvBuilder();
    csv.addRow(
      'Datum',
      'Uhrzeit',
      'Klasse',
      'Fach',
      'Nachname',
      'Vorname',
      'Bewertung',
      'Punkte',
      'Kommentar',
    );

    const rows = this.ratingsInRange(courseId, range)
      .map((rating) => {
        const course = this.database.courses.find((c) => c.id === rating.courseId);
        const student = this.database.students.find((s) => s.id === rating.studentId);
        return {
          rating,
          className: course ? this.className(course.schoolClassId) : '',
          subjectName: course ? (this.subject(course.subjectId)?.name ?? '') : '',
          student,
        };
      })
      .sort(
        (a, b) =>
          a.className.localeCompare(b.className, 'de') ||
          a.subjectName.localeCompare(b.subjectName, 'de') ||
          a.rating.lessonDate.localeCompare(b.rating.lessonDate) ||
          (a.student?.lastName ?? '').localeCompare(b.student?.lastName ?? '', 'de'),
      );

    for (const row of rows) {
      csv.addRow(
        new CsvDate(row.rating.lessonDate),
        toTimeKey(new Date(row.rating.createdAt)),
        row.className,
        row.subjectName,
        row.student?.lastName,
        row.student?.firstName,
        LocalStore.symbol(row.rating.value),
        row.rating.value,
        row.rating.comment,
      );
    }

    return {
      blob: csv.toBlob(),
      fileName: `bewertungen-${toDateKey(this.clock.now())}.csv`,
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
    csv.addRow('Klasse', 'Fach', 'Nachname', 'Vorname', 'Punkte', 'Anzahl Bewertungen', 'Note');

    for (const course of courses) {
      const ratings = this.ratingsInRange(course.id, range);
      const scale = effectiveScale(this.database.gradeScales, course.id);

      for (const student of this.studentsOfCourse(course.id)) {
        const own = ratings.filter((r) => r.studentId === student.id);
        const points = own.reduce((sum, r) => sum + r.value, 0);

        csv.addRow(
          course.schoolClassName,
          course.subjectName,
          student.lastName,
          student.firstName,
          points,
          own.length,
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
