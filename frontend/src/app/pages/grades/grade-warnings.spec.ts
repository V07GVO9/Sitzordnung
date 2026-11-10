import { Assessment, StudentGrades } from '../../core/models';
import { gradeWarnings } from './grade-warnings';

function student(patch: Partial<StudentGrades>): StudentGrades {
  return {
    studentId: 1,
    firstName: 'Anna',
    lastName: 'Adler',
    assessmentGrades: {},
    lessons: [],
    participation: null,
    written: null,
    oral: null,
    overall: null,
    partial: false,
    ...patch,
  };
}

const klassenarbeit = { id: 7, title: 'Klassenarbeit 1', area: 'written' } as Assessment;
const referat = { id: 8, title: 'Referat', area: 'oral' } as Assessment;

describe('gradeWarnings', () => {
  it('meldet nichts, wenn alles da ist', () => {
    const s = student({ assessmentGrades: { 7: 2 }, written: 2, overall: 2.5 });
    expect(gradeWarnings(s, [klassenarbeit], 50)).toEqual([]);
  });

  it('warnt bei einer Gesamtnote schlechter als 4,0 - so, wie sie angezeigt wird', () => {
    expect(gradeWarnings(student({ overall: 4.04 }), [], 50)).toEqual([]);
    expect(gradeWarnings(student({ overall: 4.06 }), [], 50).map((w) => w.kind)).toEqual([
      'below-four',
    ]);
  });

  it('warnt, wenn ein schriftlicher Nachweis zählt, der Schüler aber keine Note hat', () => {
    const kinds = gradeWarnings(
      student({ assessmentGrades: { 7: null } }),
      [klassenarbeit],
      50,
    ).map((w) => w.kind);
    expect(kinds).toEqual(['no-written', 'missing-results']);
  });

  it('fasst mehrere fehlende Ergebnisse zusammen', () => {
    const [warning] = gradeWarnings(student({ written: 2 }), [klassenarbeit, referat], 50);
    expect(warning.text).toBe('Ohne Note in 2 Leistungsnachweisen');
  });

  it('ohne schriftlichen Anteil im Schema keine Warnung „schriftlich“', () => {
    const s = student({ assessmentGrades: { 7: 3 } });
    expect(gradeWarnings(s, [klassenarbeit], 0)).toEqual([]);
  });
});
