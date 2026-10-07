/**
 * Der komplette Datenbestand der App - das, was früher in der SQLite-Datenbank
 * lag. Er wird als Ganzes im Speicher gehalten, in IndexedDB zwischengespeichert
 * und verschlüsselt in eine Datei geschrieben.
 */

import { DayOfWeek, GradeArea, ResultStatus } from '../models';

/** Ein Schüler samt Foto. Das Foto steckt als Data-URL direkt im Datensatz. */
export interface StudentRecord {
  id: number;
  firstName: string;
  lastName: string;
  schoolClassId: number;
  /** Data-URL des Fotos (`data:image/jpeg;base64,...`) oder null. */
  photo: string | null;
}

export interface SchoolClassRecord {
  id: number;
  name: string;
}

export interface SubjectRecord {
  id: number;
  name: string;
  shortName: string;
}

export interface CourseRecord {
  id: number;
  schoolClassId: number;
  subjectId: number;
}

export interface SeatRecord {
  studentId: number;
  row: number;
  column: number;
}

export interface SeatingPlanRecord {
  id: number;
  courseId: number;
  name: string;
  rows: number;
  columns: number;
  seats: SeatRecord[];
}

export interface TimetableEntryRecord {
  id: number;
  courseId: number;
  dayOfWeek: DayOfWeek;
  /** Uhrzeit als `HH:mm`. */
  startTime: string;
  endTime: string;
  room: string | null;
}

export interface RatingRecord {
  id: number;
  courseId: number;
  studentId: number;
  value: number;
  /** Unterrichtstag als `YYYY-MM-DD`. */
  lessonDate: string;
  /** Zeitpunkt der Eingabe als ISO-8601-Zeichenkette. */
  createdAt: string;
  comment: string | null;
}

export interface GradeScaleEntryRecord {
  minPoints: number;
  grade: string;
}

export interface GradeScaleRecord {
  id: number;
  /** null = globaler Standardschlüssel für alle Kurse ohne eigenen. */
  courseId: number | null;
  name: string;
  entries: GradeScaleEntryRecord[];
}

/** Ein Zeitraum, für den Noten gebildet werden - etwa ein Halbjahr. */
export interface GradingPeriodRecord {
  id: number;
  name: string;
  /** Erster und letzter Tag als `YYYY-MM-DD`. */
  start: string;
  end: string;
}

/** Eine Art von Leistungsnachweis mit ihrem Gewicht innerhalb des Bereichs. */
export interface AssessmentTypeRecord {
  key: string;
  label: string;
  area: GradeArea;
  weight: number;
}

/** Eine Stufe des Punkteschlüssels: ab so viel Prozent gibt es diese Note. */
export interface PercentScaleEntryRecord {
  minPercent: number;
  grade: number;
}

/**
 * Welche Note eine Doppelstunde bringt. Mehrere Bewertungen einer Stunde
 * werden addiert und auf -2 bis +2 begrenzt.
 */
export interface ParticipationGradesRecord {
  plusPlus: number;
  plus: number;
  /** Bewertet, aber in Summe 0 - etwa ein + und ein -. */
  neutral: number;
  minus: number;
  minusMinus: number;
  /** Für Schüler, die in einer gehaltenen Stunde keine Bewertung bekommen haben. */
  unrated: number;
}

/** Das Bewertungsschema eines Kurses - also eines Lernfelds oder Fachs. */
export interface GradingSchemeRecord {
  courseId: number;
  /** Anteil des schriftlichen Bereichs in Prozent, der Rest ist mündlich. */
  writtenPercent: number;
  types: AssessmentTypeRecord[];
  percentScale: PercentScaleEntryRecord[];
  /** Gewicht der Mitarbeit (Durchschnitt der Doppelstunden) im mündlichen Bereich. */
  participationWeight: number;
  participationGrades: ParticipationGradesRecord;
}

/** Ein Leistungsnachweis: Klassenarbeit, Test, Referat ... */
export interface AssessmentRecord {
  id: number;
  courseId: number;
  typeKey: string;
  title: string;
  /** Tag der Leistung als `YYYY-MM-DD`. */
  date: string;
  /** Erreichbare Punkte - null, wenn Noten direkt eingetragen werden. */
  maxPoints: number | null;
  /** Erst freigegebene Nachweise zählen und erscheinen im Notenbogen. */
  releasedAt: string | null;
  comment: string | null;
}

/** Das Ergebnis eines Schülers in einem Leistungsnachweis. */
export interface AssessmentResultRecord {
  assessmentId: number;
  studentId: number;
  points: number | null;
  grade: number | null;
  status: ResultStatus;
  comment: string | null;
}

/** Eine von Hand gesetzte Note für eine Doppelstunde. grade null = fehlte, zählt nicht. */
export interface ParticipationOverrideRecord {
  courseId: number;
  studentId: number;
  lessonDate: string;
  grade: number | null;
  reason: string | null;
}

/** Ein Eintrag im Änderungsprotokoll - geändert wird nie stillschweigend. */
export interface GradeChangeRecord {
  id: number;
  courseId: number;
  studentId: number;
  what: string;
  oldValue: string;
  newValue: string;
  reason: string | null;
  changedAt: string;
}

/** Vermerk, dass einem Schüler ein Notenbogen ausgehändigt wurde. */
export interface GradeReportRecord {
  id: number;
  courseId: number;
  studentId: number;
  periodId: number | null;
  issuedAt: string;
  written: number | null;
  oral: number | null;
  overall: number | null;
}

export interface AppSettingsRecord {
  toleranceMinutes: number;
  allowRatingOutsideLesson: boolean;
}

/**
 * Die laufenden Nummern je Tabelle. Früher vergab sie die Datenbank, jetzt
 * die App selbst - sie dürfen deshalb nie zurückgesetzt werden, solange
 * noch Datensätze auf sie verweisen.
 */
export interface IdCounters {
  schoolClass: number;
  subject: number;
  course: number;
  student: number;
  seatingPlan: number;
  timetableEntry: number;
  rating: number;
  gradeScale: number;
  gradingPeriod: number;
  assessment: number;
  gradeChange: number;
  gradeReport: number;
}

export interface Database {
  schoolClasses: SchoolClassRecord[];
  subjects: SubjectRecord[];
  courses: CourseRecord[];
  students: StudentRecord[];
  seatingPlans: SeatingPlanRecord[];
  timetableEntries: TimetableEntryRecord[];
  ratings: RatingRecord[];
  gradeScales: GradeScaleRecord[];
  gradingPeriods: GradingPeriodRecord[];
  gradingSchemes: GradingSchemeRecord[];
  assessments: AssessmentRecord[];
  assessmentResults: AssessmentResultRecord[];
  participationOverrides: ParticipationOverrideRecord[];
  gradeChanges: GradeChangeRecord[];
  gradeReports: GradeReportRecord[];
  settings: AppSettingsRecord;
  nextIds: IdCounters;
}

/** Höchstens so viele Sitzordnungen sind je Kurs vorgesehen. */
export const MAX_PLANS_PER_COURSE = 2;

/**
 * Ein frischer, leerer Datenbestand - mit demselben Vorschlag für den
 * Notenschlüssel, den früher das Backend beim ersten Start angelegt hat.
 */
export function createEmptyDatabase(): Database {
  return {
    schoolClasses: [],
    subjects: [],
    courses: [],
    students: [],
    seatingPlans: [],
    timetableEntries: [],
    ratings: [],
    gradeScales: [
      {
        id: 1,
        courseId: null,
        name: 'Standard-Notenschlüssel',
        entries: [
          { minPoints: 12, grade: '1' },
          { minPoints: 8, grade: '2' },
          { minPoints: 4, grade: '3' },
          { minPoints: 0, grade: '4' },
          { minPoints: -4, grade: '5' },
          // Auffangstufe: alles unterhalb der Note 5.
          { minPoints: -1000, grade: '6' },
        ],
      },
    ],
    gradingPeriods: [],
    gradingSchemes: [],
    assessments: [],
    assessmentResults: [],
    participationOverrides: [],
    gradeChanges: [],
    gradeReports: [],
    settings: { toleranceMinutes: 15, allowRatingOutsideLesson: false },
    nextIds: {
      schoolClass: 1,
      subject: 1,
      course: 1,
      student: 1,
      seatingPlan: 1,
      timetableEntry: 1,
      rating: 1,
      gradeScale: 2,
      gradingPeriod: 1,
      assessment: 1,
      gradeChange: 1,
      gradeReport: 1,
    },
  };
}

/**
 * Das Schema, das ein Kurs bekommt, solange keines eingestellt ist. Die Werte
 * sind nur ein Vorschlag - verbindlich sind die Beschlüsse der Schule.
 */
export function createDefaultScheme(courseId: number): GradingSchemeRecord {
  return {
    courseId,
    writtenPercent: 50,
    types: [
      { key: 'klassenarbeit', label: 'Klassenarbeit', area: 'written', weight: 2 },
      { key: 'test', label: 'Test', area: 'written', weight: 1 },
      { key: 'referat', label: 'Referat / Präsentation', area: 'oral', weight: 1 },
      { key: 'handlungsprodukt', label: 'Handlungsprodukt', area: 'oral', weight: 1 },
    ],
    // IHK-Schlüssel
    percentScale: [
      { minPercent: 92, grade: 1 },
      { minPercent: 81, grade: 2 },
      { minPercent: 67, grade: 3 },
      { minPercent: 50, grade: 4 },
      { minPercent: 30, grade: 5 },
      { minPercent: 0, grade: 6 },
    ],
    participationWeight: 2,
    participationGrades: { plusPlus: 1, plus: 2, neutral: 3, minus: 4, minusMinus: 5, unrated: 3 },
  };
}
