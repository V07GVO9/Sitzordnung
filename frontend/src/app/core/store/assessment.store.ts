/** Die Leistungsnachweise - Klassenarbeit, Test, Referat ... - und ihre Ergebnisse. */

import { average, resultGrade } from '../logic/assessment.logic';
import { Assessment, DateRange } from '../models';
import { AssessmentRecord, AssessmentResultRecord, GradingSchemeRecord } from './database';
import { assessmentsInRange, requireCourse, schemeOf } from './lookups';
import { StorePart } from './store-part';

export class AssessmentStore extends StorePart {
  getAssessments(courseId: number, range?: DateRange): Assessment[] {
    requireCourse(this.db, courseId);
    const scheme = schemeOf(this.db, courseId);
    return assessmentsInRange(this.db, courseId, range).map((a) => this.toAssessment(a, scheme));
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
}
