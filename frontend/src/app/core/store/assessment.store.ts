/** Die Leistungsnachweise - Klassenarbeit, Test, Referat ... - und ihre Ergebnisse. */

import { AppError } from '../app-error';
import { average, formatGrade, isValidGrade, resultGrade } from '../logic/assessment.logic';
import { germanNumber, trimToNull } from '../logic/text';
import { formatDateGerman, isValidDateKey } from '../logic/time';
import {
  Assessment,
  AssessmentDetail,
  AssessmentInput,
  AssessmentResultInput,
  DateRange,
  ImportedAssessmentInput,
} from '../models';
import { AssessmentRecord, AssessmentResultRecord, GradingSchemeRecord } from './database';
import { logGradeChange } from './grade-log';
import {
  assessmentsInRange,
  requireCourse,
  requireStudent,
  schemeOf,
  studentsOfCourse,
} from './lookups';
import { StorePart } from './store-part';

/** Beschreibt ein Ergebnis für das Änderungsprotokoll. */
function describeResult(result: AssessmentResultRecord | undefined, grade: number | null): string {
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
    return `${germanNumber(result.points)} P. (${formatGrade(grade, 1)})`;
  }

  return formatGrade(grade, 1);
}

export class AssessmentStore extends StorePart {
  getAssessments(courseId: number, range?: DateRange): Assessment[] {
    requireCourse(this.db, courseId);
    const scheme = schemeOf(this.db, courseId);
    return assessmentsInRange(this.db, courseId, range).map((a) => this.toAssessment(a, scheme));
  }

  createAssessment(courseId: number, input: AssessmentInput): Assessment {
    requireCourse(this.db, courseId);
    this.validate(courseId, input);

    const record: AssessmentRecord = {
      id: this.db.nextIds.assessment++,
      courseId,
      typeKey: input.typeKey,
      title: input.title.trim(),
      date: input.date,
      maxPoints: input.maxPoints,
      releasedAt: null,
      comment: trimToNull(input.comment),
    };

    this.db.assessments.push(record);
    this.changed();

    return this.toAssessment(record, schemeOf(this.db, courseId));
  }

  updateAssessment(id: number, input: AssessmentInput): Assessment {
    const record = this.requireAssessment(id);
    this.validate(record.courseId, input);

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
    record.comment = trimToNull(input.comment);

    // Ohne Punktzahl gibt es auch keine Punkte mehr.
    if (record.maxPoints === null) {
      for (const result of this.resultsOf(id)) {
        result.points = null;
      }
    }
    this.changed();

    return this.toAssessment(record, schemeOf(this.db, record.courseId));
  }

  deleteAssessment(id: number): void {
    this.requireAssessment(id);
    this.db.assessments = this.db.assessments.filter((a) => a.id !== id);
    this.db.assessmentResults = this.db.assessmentResults.filter((r) => r.assessmentId !== id);
    this.changed();
  }

  /** Der Nachweis samt einer Zeile für jeden Schüler des Kurses. */
  getAssessmentDetail(id: number): AssessmentDetail {
    const record = this.requireAssessment(id);
    const scheme = schemeOf(this.db, record.courseId);
    const results = this.resultsOf(id);

    return {
      assessment: this.toAssessment(record, scheme),
      results: studentsOfCourse(this.db, record.courseId).map((student) => {
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
    const course = requireCourse(this.db, record.courseId);
    const scheme = schemeOf(this.db, record.courseId);

    for (const input of inputs) {
      const student = requireStudent(this.db, input.studentId);
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
    const now = this.now().toISOString();
    const changes: { studentId: number; oldValue: string; newValue: string }[] = [];

    // Erst alles berechnen, dann prüfen, dann schreiben - ein Fehler soll
    // keinen halben Stand hinterlassen.
    const updates = inputs.map((input) => {
      const existing = this.db.assessmentResults.find(
        (r) => r.assessmentId === id && r.studentId === input.studentId,
      );
      const next: AssessmentResultRecord = {
        assessmentId: id,
        studentId: input.studentId,
        points: input.status === 'graded' ? input.points : null,
        grade: input.status === 'graded' ? input.grade : null,
        status: input.status,
        comment: trimToNull(input.comment),
      };

      const oldText = describeResult(existing, resultGrade(existing, record, scheme));
      const newText = describeResult(next, resultGrade(next, record, scheme));
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
      this.db.assessmentResults = this.db.assessmentResults.filter((r) => r !== existing);
      if (next) {
        this.db.assessmentResults.push(next);
      }
    }

    for (const change of changes) {
      logGradeChange(this.db, {
        courseId: record.courseId,
        studentId: change.studentId,
        what: `${record.title} (${formatDateGerman(record.date)})`,
        oldValue: change.oldValue,
        newValue: change.newValue,
        reason: reason ?? null,
        changedAt: now,
      });
    }
    this.changed();

    return this.getAssessmentDetail(id);
  }

  /** Gibt einen Nachweis frei oder nimmt die Freigabe zurück. */
  setAssessmentReleased(id: number, released: boolean): Assessment {
    const record = this.requireAssessment(id);
    record.releasedAt = released ? this.now().toISOString() : null;
    this.changed();

    return this.toAssessment(record, schemeOf(this.db, record.courseId));
  }

  /**
   * Legt einen Leistungsnachweis mit fertigen Noten an und gibt ihn frei - für
   * Mitarbeitsnoten, die aus einem anderen Werkzeug übernommen werden. Alles
   * wird vorab geprüft, damit kein halber Nachweis zurückbleibt.
   */
  importAssessment(courseId: number, input: ImportedAssessmentInput): Assessment {
    const course = requireCourse(this.db, courseId);
    this.validate(courseId, { ...input, maxPoints: null });

    if (input.results.length === 0) {
      throw new AppError('Es gibt keine Noten, die übernommen werden können.');
    }

    const seen = new Set<number>();
    for (const result of input.results) {
      const student = requireStudent(this.db, result.studentId);
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

  private requireAssessment(id: number): AssessmentRecord {
    const assessment = this.db.assessments.find((a) => a.id === id);
    if (!assessment) {
      throw new AppError('Der Leistungsnachweis existiert nicht.');
    }
    return assessment;
  }

  private resultsOf(assessmentId: number): AssessmentResultRecord[] {
    return this.db.assessmentResults.filter((r) => r.assessmentId === assessmentId);
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

  private validate(courseId: number, input: AssessmentInput): void {
    if (!schemeOf(this.db, courseId).types.some((t) => t.key === input.typeKey)) {
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
}
