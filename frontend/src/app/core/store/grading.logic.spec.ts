/** Notenschlüssel - portiert aus den GradingServiceTests des Backends. */

import { GradeScaleRecord } from './database';
import { effectiveScale, resolveGrade } from './grading.logic';

const scale: GradeScaleRecord = {
  id: 1,
  courseId: null,
  name: 'Standard',
  entries: [
    { minPoints: 12, grade: '1' },
    { minPoints: 8, grade: '2' },
    { minPoints: 4, grade: '3' },
    { minPoints: 0, grade: '4' },
  ],
};

describe('resolveGrade', () => {
  it('nimmt die Stufe, die der Punktestand gerade noch erreicht', () => {
    expect(resolveGrade(scale, 9)).toBe('2');
  });

  it('trifft die Punktgrenze genau', () => {
    expect(resolveGrade(scale, 12)).toBe('1');
  });

  it('nimmt bei hohen Punktzahlen die beste Stufe', () => {
    expect(resolveGrade(scale, 100)).toBe('1');
  });

  it('liefert nichts, wenn keine Stufe erreicht wird', () => {
    expect(resolveGrade(scale, -5)).toBeNull();
  });

  it('liefert ohne Schlüssel keine Note', () => {
    expect(resolveGrade(null, 10)).toBeNull();
  });

  it('liefert bei leerem Schlüssel keine Note', () => {
    expect(resolveGrade({ ...scale, entries: [] }, 10)).toBeNull();
  });
});

describe('effectiveScale', () => {
  const courseScale: GradeScaleRecord = { ...scale, id: 2, courseId: 7, name: 'Kurs' };

  it('bevorzugt den Schlüssel des Kurses', () => {
    expect(effectiveScale([scale, courseScale], 7)?.id).toBe(2);
  });

  it('fällt auf den globalen Schlüssel zurück', () => {
    expect(effectiveScale([scale, courseScale], 9)?.id).toBe(1);
  });

  it('liefert null, wenn gar kein Schlüssel hinterlegt ist', () => {
    expect(effectiveScale([], 7)).toBeNull();
  });
});
