import { quarterOf, quarterRange, schoolYearOf } from './quarter.logic';

describe('Quartale', () => {
  it('ordnet Monate dem Schuljahresquartal zu', () => {
    expect(quarterOf(new Date(2026, 7, 15))).toBe(1);
    expect(quarterOf(new Date(2026, 10, 2))).toBe(2);
    expect(quarterOf(new Date(2027, 0, 20))).toBe(2);
    expect(quarterOf(new Date(2027, 2, 1))).toBe(3);
    expect(quarterOf(new Date(2027, 5, 1))).toBe(4);
  });

  it('lässt das Schuljahr am 1. August beginnen', () => {
    expect(schoolYearOf(new Date(2026, 6, 31))).toBe(2025);
    expect(schoolYearOf(new Date(2026, 7, 1))).toBe(2026);
    expect(schoolYearOf(new Date(2027, 0, 10))).toBe(2026);
  });

  it('liefert die Daten im laufenden Schuljahr', () => {
    const today = new Date(2027, 0, 10);
    expect(quarterRange(1, today)).toEqual({ from: '2026-08-01', to: '2026-10-31' });
    expect(quarterRange(2, today)).toEqual({ from: '2026-11-01', to: '2027-01-31' });
    expect(quarterRange(4, today)).toEqual({ from: '2027-05-01', to: '2027-07-31' });
  });
});
