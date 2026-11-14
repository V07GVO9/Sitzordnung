import { Assessment, StudentGrades } from '../../core/models';
import { roundGrade } from '../../core/logic/assessment.logic';

/** Ein Hinweis zu einem Schüler in der Notenübersicht. */
export interface GradeWarning {
  kind: 'below-four' | 'no-written' | 'missing-results';
  text: string;
}

/**
 * Hinweise, die beim Blick auf die Noten nicht untergehen sollen:
 * - Gesamtnote schlechter als 4,0 (so, wie sie angezeigt wird),
 * - keine schriftliche Note, obwohl schon ein schriftlicher Nachweis zählt,
 * - freigegebene Leistungsnachweise ohne Note für diesen Schüler.
 */
export function gradeWarnings(
  student: StudentGrades,
  released: Assessment[],
  writtenPercent: number,
): GradeWarning[] {
  const warnings: GradeWarning[] = [];

  if (student.overall !== null && roundGrade(student.overall, 1) > 4) {
    warnings.push({ kind: 'below-four', text: 'Gesamtnote schlechter als 4,0' });
  }

  const writtenReleased = released.some((a) => a.area === 'written');
  if (writtenPercent > 0 && writtenReleased && student.written === null) {
    warnings.push({ kind: 'no-written', text: 'Noch keine schriftliche Note' });
  }

  const missing = released.filter((a) => (student.assessmentGrades[a.id] ?? null) === null);
  if (missing.length === 1) {
    warnings.push({ kind: 'missing-results', text: `Ohne Note in „${missing[0].title}“` });
  } else if (missing.length > 1) {
    warnings.push({
      kind: 'missing-results',
      text: `Ohne Note in ${missing.length} Leistungsnachweisen`,
    });
  }

  return warnings;
}
