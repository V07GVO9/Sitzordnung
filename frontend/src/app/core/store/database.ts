/**
 * Der komplette Datenbestand der App - das, was früher in der SQLite-Datenbank
 * lag. Er wird als Ganzes im Speicher gehalten, in IndexedDB zwischengespeichert
 * und verschlüsselt in eine Datei geschrieben.
 */

import { DayOfWeek } from '../models';

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
    },
  };
}
