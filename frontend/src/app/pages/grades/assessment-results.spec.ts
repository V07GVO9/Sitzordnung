import { AppError } from '../../core/app-error';
import { collectResults, ResultRow } from './assessment-results';

function row(patch: Partial<ResultRow>): ResultRow {
  return {
    studentId: 1,
    name: 'Anna Adler',
    status: 'graded',
    points: '',
    grade: '',
    comment: '',
    ...patch,
  };
}

describe('collectResults', () => {
  it('wandelt Punkte, Note und Kommentar um', () => {
    expect(collectResults([row({ points: '17,5', grade: '2,3', comment: '  gut ' })])).toEqual([
      { studentId: 1, points: 17.5, grade: 2.3, status: 'graded', comment: 'gut' },
    ]);
  });

  it('lässt leere Felder leer', () => {
    expect(collectResults([row({})])).toEqual([
      { studentId: 1, points: null, grade: null, status: 'graded', comment: null },
    ]);
  });

  it('meldet eine ungültige Note als AppError mit dem Namen', () => {
    const rows = [row({ grade: '2' }), row({ studentId: 2, name: 'Ben Bauer', grade: '9' })];
    expect(() => collectResults(rows)).toThrowError(
      AppError,
      'Die Note für Ben Bauer ist keine Note zwischen 1,0 und 6,0.',
    );
  });

  it('meldet unlesbare Punkte als AppError mit dem Namen', () => {
    expect(() => collectResults([row({ points: 'abc' })])).toThrowError(
      AppError,
      'Die Punkte für Anna Adler sind keine Zahl.',
    );
  });
});
