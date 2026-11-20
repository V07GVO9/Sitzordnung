/** Die Notenübersicht eines Kurses: der Notenstand jedes Schülers. */

import { average, combineGrades, resultGrade } from '../logic/assessment.logic';
import { DateRange, GradeBook, StudentGrades } from '../models';
import { AssessmentStore } from './assessment.store';
import { AssessmentRecord, GradingSchemeRecord, StudentRecord } from './database';
import {
  assessmentsInRange,
  lessonDates,
  participationOf,
  schemeOf,
  studentsOfCourse,
  toCourse,
} from './lookups';
import { SchemeStore } from './scheme.store';
import { StorePart, StoreState } from './store-part';

export class GradeBookStore extends StorePart {
  constructor(
    state: StoreState,
    private readonly schemes: SchemeStore,
    private readonly assessments: AssessmentStore,
  ) {
    super(state);
  }

  getGradeBook(courseId: number, range?: DateRange): GradeBook {
    const course = toCourse(this.db, courseId);
    const scheme = schemeOf(this.db, courseId);
    const released = this.releasedAssessments(courseId, range);
    const dates = lessonDates(this.db, courseId, range);

    return {
      courseId,
      schoolClassName: course.schoolClassName,
      subjectName: course.subjectName,
      subjectShortName: course.subjectShortName,
      scheme: this.schemes.getScheme(courseId),
      assessments: this.assessments.getAssessments(courseId, range),
      lessonDates: dates,
      students: studentsOfCourse(this.db, courseId).map((s) =>
        this.gradesOf(s, courseId, scheme, released, dates),
      ),
    };
  }

  // --- Hilfen -------------------------------------------------------------

  /** Nur freigegebene Nachweise zählen im Notenstand. */
  private releasedAssessments(courseId: number, range?: DateRange): AssessmentRecord[] {
    return assessmentsInRange(this.db, courseId, range).filter((a) => a.releasedAt !== null);
  }

  /** Alle Noten eines Schülers in einem Kurs - die Grundlage für Übersicht und Notenbogen. */
  private gradesOf(
    student: StudentRecord,
    courseId: number,
    scheme: GradingSchemeRecord,
    released: AssessmentRecord[],
    dates: string[],
  ): StudentGrades {
    const assessmentGrades: Record<number, number | null> = {};
    const items = released.map((a) => {
      const result = this.db.assessmentResults.find(
        (r) => r.assessmentId === a.id && r.studentId === student.id,
      );
      const grade = resultGrade(result, a, scheme);
      const type = scheme.types.find((t) => t.key === a.typeKey);
      assessmentGrades[a.id] = grade;

      return { area: type?.area ?? 'written', weight: type?.weight ?? 0, grade };
    });

    const lessons = participationOf(this.db, courseId, student.id, dates, scheme);
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
}
