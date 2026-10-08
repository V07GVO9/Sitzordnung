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

/** Die Unterrichtsstunde, auf die eine Bewertung gerade zählt. */
export interface LessonSlot {
  date: string;
  startTime: string;
  label: string;
  fromTimetable: boolean;
  /** Gibt es eine frühere Stunde dieses Kurses? */
  hasPrevious: boolean;
  /** Gibt es eine spätere? Über die aktuelle Stunde hinaus geht es nicht. */
  hasNext: boolean;
  /** Ist das die Stunde, der eine Bewertung ohne Blättern zugerechnet wird? */
  isCurrent: boolean;
}

/** Eine bestimmte Unterrichtsstunde, wie sie an die API übergeben wird. */
export interface LessonRef {
  date: string;
  startTime: string;
}

/** Die vier möglichen Bewertungen. */
export type RatingValue = -2 | -1 | 1 | 2;

export interface Rating {
  id: number;
  courseId: number;
  studentId: number;
  value: number;
  lessonDate: string;
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
  /** Die Bewertung der angezeigten Unterrichtsstunde, falls schon eine vergeben wurde. */
  currentLessonValue: number | null;
}

export interface CourseScoreboard {
  courseId: number;
  schoolClassName: string;
  subjectName: string;
  date: string;
  currentLesson?: LessonSlot;
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

export interface AppSettings {
  toleranceMinutes: number;
  allowRatingOutsideLesson: boolean;
}

export interface RatingWindow {
  canRate: boolean;
  reason: string;
  startTime: string | null;
  endTime: string | null;
}

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

// --- Noten ------------------------------------------------------------------

/** Schriftlich oder mündlich/sonstig - die beiden Bereiche einer Note. */
export type GradeArea = 'written' | 'oral';

/** graded = bewertet, excused = entschuldigt (zählt nicht), refused = verweigert (6,0). */
export type ResultStatus = 'graded' | 'excused' | 'refused';

export const AREA_LABELS: Record<GradeArea, string> = {
  written: 'schriftlich',
  oral: 'mündlich/sonstig',
};

export const STATUS_LABELS: Record<ResultStatus, string> = {
  graded: 'bewertet',
  excused: 'entschuldigt',
  refused: 'verweigert',
};

/** Ein Zeitraum für die Notenbildung, etwa ein Halbjahr. */
export interface GradingPeriod {
  id: number;
  name: string;
  start: string;
  end: string;
}

export interface GradingPeriodInput {
  name: string;
  start: string;
  end: string;
}

export interface AssessmentType {
  key: string;
  label: string;
  area: GradeArea;
  weight: number;
}

export interface PercentScaleEntry {
  minPercent: number;
  grade: number;
}

/** Welche Note eine Doppelstunde bringt - je nach Summe ihrer Bewertungen. */
export interface ParticipationGrades {
  plusPlus: number;
  plus: number;
  neutral: number;
  minus: number;
  minusMinus: number;
  unrated: number;
}

export interface GradingSchemeInput {
  writtenPercent: number;
  types: AssessmentType[];
  percentScale: PercentScaleEntry[];
  participationWeight: number;
  participationGrades: ParticipationGrades;
}

export interface GradingScheme extends GradingSchemeInput {
  courseId: number;
  /** True, solange für den Kurs noch kein eigenes Schema gespeichert ist. */
  isDefault: boolean;
}

export interface Assessment {
  id: number;
  courseId: number;
  typeKey: string;
  typeLabel: string;
  area: GradeArea;
  weight: number;
  title: string;
  date: string;
  maxPoints: number | null;
  released: boolean;
  releasedAt: string | null;
  comment: string | null;
  /** Durchschnitt der zählenden Noten. */
  average: number | null;
  gradedCount: number;
}

export interface AssessmentInput {
  typeKey: string;
  title: string;
  date: string;
  maxPoints: number | null;
  comment: string | null;
}

export interface AssessmentResultInput {
  studentId: number;
  points: number | null;
  grade: number | null;
  status: ResultStatus;
  comment: string | null;
}

export interface AssessmentResult extends AssessmentResultInput {
  firstName: string;
  lastName: string;
  /** Die Note, mit der das Ergebnis zählt. */
  effectiveGrade: number | null;
}

export interface AssessmentDetail {
  assessment: Assessment;
  results: AssessmentResult[];
}

/** Eine Doppelstunde aus Sicht eines Schülers. */
export interface LessonGrade {
  date: string;
  /** Summe der Bewertungen, begrenzt auf -2 bis +2; null = nicht bewertet. */
  value: number | null;
  /** Die Note, die sich aus den Bewertungen ergibt. */
  autoGrade: number;
  /** Von Hand gesetzt? Dann gilt deren Note - null heißt "fehlte". */
  override: { grade: number | null; reason: string | null } | null;
  /** Die Note, die zählt - null, wenn die Stunde nicht zählt. */
  grade: number | null;
}

export interface StudentGrades {
  studentId: number;
  firstName: string;
  lastName: string;
  /** Assessment-Id -> zählende Note (nur freigegebene Nachweise). */
  assessmentGrades: Record<number, number | null>;
  lessons: LessonGrade[];
  participation: number | null;
  written: number | null;
  oral: number | null;
  overall: number | null;
  partial: boolean;
}

/** Die komplette Notenübersicht eines Kurses für einen Zeitraum. */
export interface GradeBook {
  courseId: number;
  schoolClassName: string;
  subjectName: string;
  subjectShortName: string;
  scheme: GradingScheme;
  assessments: Assessment[];
  lessonDates: string[];
  students: StudentGrades[];
}

export interface GradeChange {
  id: number;
  studentId: number;
  studentName: string;
  what: string;
  oldValue: string;
  newValue: string;
  reason: string | null;
  changedAt: string;
}

export interface GradeReport {
  id: number;
  studentId: number;
  studentName: string;
  periodId: number | null;
  periodName: string | null;
  issuedAt: string;
  written: number | null;
  oral: number | null;
  overall: number | null;
}

/** Eine Zeile im Notenbogen. */
export interface ReportItem {
  date: string;
  title: string;
  typeLabel: string;
  area: GradeArea;
  weight: number;
  grade: number | null;
  status: ResultStatus | null;
}

/** Alles, was im Notenbogen eines Schülers steht. */
export interface StudentReport {
  studentId: number;
  firstName: string;
  lastName: string;
  schoolClassName: string;
  subjectName: string;
  periodName: string;
  issuedAt: string;
  writtenPercent: number;
  items: ReportItem[];
  participation: {
    lessonCount: number;
    countedCount: number;
    average: number | null;
    weight: number;
  };
  written: number | null;
  oral: number | null;
  overall: number | null;
  partial: boolean;
}

/** Die Farbklasse einer Bewertung - von Grün (++) bis Rot (−−), wie in der Klassenmappe. */
export function ratingClass(value: number | null | undefined): string {
  switch (value) {
    case 2:
      return 'rate-pp';
    case 1:
      return 'rate-p';
    case 0:
      return 'rate-o';
    case -1:
      return 'rate-m';
    case -2:
      return 'rate-mm';
    default:
      return '';
  }
}
