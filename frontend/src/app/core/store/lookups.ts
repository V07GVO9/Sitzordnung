/**
 * Nachschlagen im Bestand: reine Funktionen, die mehrere Teilspeicher
 * brauchen. Sie lesen nur - geändert wird der Bestand in den Teilspeichern.
 */

import { AppError } from '../app-error';
import { participationLessons } from '../logic/assessment.logic';
import { LessonContext } from '../logic/lesson.logic';
import { Course, DateRange, LessonGrade, byLastName } from '../models';
import {
  AssessmentRecord,
  CourseRecord,
  Database,
  GradingSchemeRecord,
  RatingRecord,
  StudentRecord,
  SubjectRecord,
  createDefaultScheme,
} from './database';

// --- Prüfen, ob es etwas gibt -------------------------------------------------

export function requireClass(db: Database, id: number): void {
  if (!db.schoolClasses.some((c) => c.id === id)) {
    throw new AppError('Die Klasse existiert nicht.');
  }
}

export function requireCourse(db: Database, id: number): CourseRecord {
  const course = db.courses.find((c) => c.id === id);
  if (!course) {
    throw new AppError('Der angegebene Kurs existiert nicht.');
  }
  return course;
}

export function requireStudent(db: Database, id: number): StudentRecord {
  const student = db.students.find((s) => s.id === id);
  if (!student) {
    throw new AppError('Der angegebene Schüler existiert nicht.');
  }
  return student;
}

/** Kurs und Schüler müssen existieren, und der Schüler muss zur Klasse des Kurses gehören. */
export function requireStudentOfCourse(db: Database, courseId: number, studentId: number): void {
  const course = requireCourse(db, courseId);
  const student = requireStudent(db, studentId);

  if (student.schoolClassId !== course.schoolClassId) {
    throw new AppError('Der Schüler gehört nicht zur Klasse dieses Kurses.');
  }
}

// --- Klassen, Fächer, Kurse, Schüler ------------------------------------------

export function className(db: Database, id: number): string {
  return db.schoolClasses.find((c) => c.id === id)?.name ?? '';
}

export function subjectOf(db: Database, id: number): SubjectRecord | undefined {
  return db.subjects.find((s) => s.id === id);
}

/** Der Kurs, wie ihn die Oberfläche braucht - mit den Namen von Klasse und Fach. */
export function toCourse(db: Database, id: number): Course {
  const course = requireCourse(db, id);
  const subject = subjectOf(db, course.subjectId);

  return {
    id: course.id,
    schoolClassId: course.schoolClassId,
    schoolClassName: className(db, course.schoolClassId),
    subjectId: course.subjectId,
    subjectName: subject?.name ?? '',
    subjectShortName: subject?.shortName ?? '',
    seatingPlanCount: db.seatingPlans.filter((p) => p.courseId === course.id).length,
  };
}

/** Alle Kurse, nach Klasse und Fach sortiert. */
export function allCourses(db: Database): Course[] {
  return db.courses
    .map((c) => toCourse(db, c.id))
    .sort(
      (a, b) =>
        a.schoolClassName.localeCompare(b.schoolClassName, 'de') ||
        a.subjectName.localeCompare(b.subjectName, 'de'),
    );
}

/** Die Schüler eines Kurses - also die seiner Klasse, nach Namen sortiert. */
export function studentsOfCourse(db: Database, courseId: number): StudentRecord[] {
  const course = requireCourse(db, courseId);
  return db.students.filter((s) => s.schoolClassId === course.schoolClassId).sort(byLastName);
}

// --- Stundenplan ----------------------------------------------------------------

/** Alles, was die Stundenplanprüfung zum Beschreiben einer Stunde braucht. */
export function lessonContext(db: Database): LessonContext {
  return {
    entries: db.timetableEntries,
    courses: db.courses,
    schoolClasses: db.schoolClasses,
    subjects: db.subjects,
    settings: db.settings,
  };
}

// --- Bewertungen und Mitarbeit --------------------------------------------------

/** Liegt der Tag im Zeitraum? Ohne Grenze gilt die Seite als offen. */
export function inRange(dateKey: string, range?: DateRange): boolean {
  return (!range?.from || dateKey >= range.from) && (!range?.to || dateKey <= range.to);
}

/** Die Bewertungen eines Kurses (null: aller Kurse) im Zeitraum. */
export function ratingsInRange(
  db: Database,
  courseId: number | null,
  range?: DateRange,
): RatingRecord[] {
  return db.ratings.filter(
    (r) => (courseId === null || r.courseId === courseId) && inRange(r.lessonDate, range),
  );
}

/** Die Tage, an denen der Kurs Unterricht hatte - erkennbar an den Bewertungen. */
export function lessonDates(db: Database, courseId: number, range?: DateRange): string[] {
  return [...new Set(ratingsInRange(db, courseId, range).map((r) => r.lessonDate))].sort();
}

/** Die Mitarbeitsnoten eines Schülers an den angegebenen Unterrichtstagen. */
export function participationOf(
  db: Database,
  courseId: number,
  studentId: number,
  dates: string[],
  scheme: GradingSchemeRecord,
): LessonGrade[] {
  return participationLessons(
    dates,
    db.ratings.filter((r) => r.courseId === courseId && r.studentId === studentId),
    db.participationOverrides.filter((o) => o.courseId === courseId && o.studentId === studentId),
    scheme.participationGrades,
  );
}

// --- Noten ----------------------------------------------------------------------

/** Das gespeicherte Schema des Kurses oder - solange es keines gibt - der Vorschlag. */
export function schemeOf(db: Database, courseId: number): GradingSchemeRecord {
  return db.gradingSchemes.find((g) => g.courseId === courseId) ?? createDefaultScheme(courseId);
}

/** Die Leistungsnachweise eines Kurses im Zeitraum, nach Datum sortiert. */
export function assessmentsInRange(
  db: Database,
  courseId: number,
  range?: DateRange,
): AssessmentRecord[] {
  return db.assessments
    .filter((a) => a.courseId === courseId && inRange(a.date, range))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
}
