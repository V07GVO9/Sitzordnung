/**
 * Die Notenübersicht eines Kurses: der Notenstand jedes Schülers, das
 * Änderungsprotokoll und die Notenbögen.
 */

import { AppError } from '../app-error';
import { average, combineGrades, resultGrade } from '../logic/assessment.logic';
import {
  DateRange,
  GradeBook,
  GradeChange,
  GradeReport,
  StudentGrades,
  StudentReport,
} from '../models';
import { AssessmentStore } from './assessment.store';
import { AssessmentRecord, GradingSchemeRecord, StudentRecord } from './database';
import {
  assessmentsInRange,
  lessonDates,
  participationOf,
  requireCourse,
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

  getGradeChanges(courseId: number): GradeChange[] {
    requireCourse(this.db, courseId);

    return this.db.gradeChanges
      .filter((c) => c.courseId === courseId)
      .sort((a, b) => b.changedAt.localeCompare(a.changedAt) || b.id - a.id)
      .map((c) => ({
        id: c.id,
        studentId: c.studentId,
        studentName: this.studentName(c.studentId),
        what: c.what,
        oldValue: c.oldValue,
        newValue: c.newValue,
        reason: c.reason,
        changedAt: c.changedAt,
      }));
  }

  // --- Notenbögen ---------------------------------------------------------

  /** Der Inhalt der Notenbögen - nur freigegebene Nachweise erscheinen darin. */
  getStudentReports(
    courseId: number,
    studentIds: number[],
    periodId: number | null,
  ): StudentReport[] {
    const course = toCourse(this.db, courseId);
    const scheme = schemeOf(this.db, courseId);
    const { range, name } = this.periodRange(periodId);
    const released = this.releasedAssessments(courseId, range);
    const dates = lessonDates(this.db, courseId, range);
    const wanted = new Set(studentIds);
    const issuedAt = this.now().toISOString();

    return studentsOfCourse(this.db, courseId)
      .filter((s) => wanted.has(s.id))
      .map((student) => {
        const grades = this.gradesOf(student, courseId, scheme, released, dates);

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
            const result = this.db.assessmentResults.find(
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

  /** Stellt die Notenbögen zusammen und vermerkt ihre Ausgabe. */
  issueReports(courseId: number, studentIds: number[], periodId: number | null): StudentReport[] {
    const reports = this.getStudentReports(courseId, studentIds, periodId);
    if (reports.length === 0) {
      throw new AppError('Es ist kein Schüler ausgewählt.');
    }

    this.recordReports(courseId, reports, periodId);
    return reports;
  }

  /** Vermerkt, dass die Notenbögen ausgegeben wurden - mit dem Stand von damals. */
  recordReports(courseId: number, reports: StudentReport[], periodId: number | null): void {
    requireCourse(this.db, courseId);

    for (const report of reports) {
      this.db.gradeReports.push({
        id: this.db.nextIds.gradeReport++,
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
    requireCourse(this.db, courseId);

    return this.db.gradeReports
      .filter((r) => r.courseId === courseId)
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt) || b.id - a.id)
      .map((r) => ({
        id: r.id,
        studentId: r.studentId,
        studentName: this.studentName(r.studentId),
        periodId: r.periodId,
        periodName: this.db.gradingPeriods.find((p) => p.id === r.periodId)?.name ?? null,
        issuedAt: r.issuedAt,
        written: r.written,
        oral: r.oral,
        overall: r.overall,
      }));
  }

  // --- Hilfen -------------------------------------------------------------

  /** Nur freigegebene Nachweise zählen im Notenstand. */
  private releasedAssessments(courseId: number, range?: DateRange): AssessmentRecord[] {
    return assessmentsInRange(this.db, courseId, range).filter((a) => a.releasedAt !== null);
  }

  /** „Nachname, Vorname“ - leer, falls es den Schüler nicht mehr gibt. */
  private studentName(studentId: number): string {
    const student = this.db.students.find((s) => s.id === studentId);
    return student ? `${student.lastName}, ${student.firstName}` : '';
  }

  /** Der Datumsbereich eines Zeitraums - ohne Zeitraum gilt alles. */
  private periodRange(periodId: number | null): { range: DateRange; name: string } {
    if (periodId === null) {
      return { range: {}, name: 'Gesamter Zeitraum' };
    }

    const period = this.db.gradingPeriods.find((p) => p.id === periodId);
    if (!period) {
      throw new AppError('Der Zeitraum existiert nicht.');
    }

    return { range: { from: period.start, to: period.end }, name: period.name };
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
