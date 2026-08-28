/** Die Datenstrukturen, die die API liefert und entgegennimmt. */

export interface SchoolClass {
  id: number;
  name: string;
  studentCount: number;
}

export interface Subject {
  id: number;
  name: string;
  shortName: string;
}

export interface Course {
  id: number;
  schoolClassId: number;
  schoolClassName: string;
  subjectId: number;
  subjectName: string;
  subjectShortName: string;
  seatingPlanCount: number;
}

export interface Student {
  id: number;
  firstName: string;
  lastName: string;
  schoolClassId: number;
  hasPhoto: boolean;
  photoUrl: string | null;
}

export interface Seat {
  studentId: number;
  row: number;
  column: number;
}

export interface SeatingPlan {
  id: number;
  courseId: number;
  name: string;
  rows: number;
  columns: number;
  seats: Seat[];
}

export interface SeatLayoutInput {
  rows: number;
  columns: number;
  seats: Seat[];
}

/** 0 = Sonntag, 1 = Montag ... wie in .NET und JavaScript. */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface TimetableEntry {
  id: number;
  courseId: number;
  schoolClassName: string;
  subjectName: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  room: string | null;
}

export interface TimetableEntryInput {
  courseId: number;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  room: string | null;
}

export interface CurrentLesson {
  hasLesson: boolean;
  courseId: number | null;
  schoolClassName: string | null;
  subjectName: string | null;
  startTime: string | null;
  endTime: string | null;
  room: string | null;
  message: string;
}

/** Die Unterrichtsstunde, der eine Bewertung gerade zugerechnet wird. */
export interface LessonSlot {
  date: string;
  startTime: string;
  label: string;
  fromTimetable: boolean;
}

/** Die vier möglichen Bewertungen. */
export type RatingValue = -2 | -1 | 1 | 2;

export interface Rating {
  id: number;
  courseId: number;
  studentId: number;
  value: number;
  lessonDate: string;
  lessonStart: string;
  createdAt: string;
  comment: string | null;
}

export interface StudentScore {
  studentId: number;
  firstName: string;
  lastName: string;
  points: number;
  ratingCount: number;
  pointsToday: number;
  grade: string | null;
  /** Die Bewertung dieser Unterrichtsstunde, falls schon eine vergeben wurde. */
  currentLessonValue: number | null;
}

export interface CourseScoreboard {
  courseId: number;
  schoolClassName: string;
  subjectName: string;
  date: string;
  currentLesson: LessonSlot;
  students: StudentScore[];
}

export interface GradeScaleEntry {
  minPoints: number;
  grade: string;
}

export interface GradeScale {
  id: number;
  courseId: number | null;
  name: string;
  isGlobalDefault: boolean;
  entries: GradeScaleEntry[];
}

export interface GradeScaleInput {
  name: string;
  entries: GradeScaleEntry[];
}

export const WEEKDAY_NAMES: Record<number, string> = {
  1: 'Montag',
  2: 'Dienstag',
  3: 'Mittwoch',
  4: 'Donnerstag',
  5: 'Freitag',
  6: 'Samstag',
  0: 'Sonntag',
};

/** Die Wochentage in der Reihenfolge, in der ein Stundenplan sie zeigt. */
export const SCHOOL_DAYS: DayOfWeek[] = [1, 2, 3, 4, 5];

export function ratingSymbol(value: number): string {
  switch (value) {
    case 2:
      return '++';
    case 1:
      return '+';
    case -1:
      return '−';
    case -2:
      return '−−';
    default:
      return String(value);
  }
}

export function fullName(student: { firstName: string; lastName: string }): string {
  return `${student.firstName} ${student.lastName}`.trim();
}

export function initials(student: { firstName: string; lastName: string }): string {
  const first = student.firstName?.charAt(0) ?? '';
  const last = student.lastName?.charAt(0) ?? '';
  return (first + last).toUpperCase() || '?';
}

// --- Stundenplan-Import -----------------------------------------------------

export interface TimetableImportRow {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  schoolClassName: string;
  subjectName: string;
  room: string | null;
  occurrences: number;
  looksRegular: boolean;
  sourceTitle: string;
}

export interface TimetableImportPreview {
  rows: TimetableImportRow[];
  warnings: string[];
}

export interface TimetableImportResult {
  createdClasses: number;
  createdSubjects: number;
  createdCourses: number;
  createdLessons: number;
  skipped: string[];
}

// --- Schülerimport ----------------------------------------------------------

export interface StudentImportRow {
  firstName: string;
  lastName: string;
  className: string;
}

export interface StudentImportPreview {
  rows: StudentImportRow[];
  warnings: string[];
}

export interface StudentImportResult {
  createdClasses: number;
  createdStudents: number;
  skipped: string[];
}
