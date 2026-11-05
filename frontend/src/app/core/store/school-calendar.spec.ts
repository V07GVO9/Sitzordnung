import { easterSunday, freeDayReason, schoolQuarters } from './school-calendar';

describe('school-calendar (Niedersachsen)', () => {
  it('berechnet Ostersonntag', () => {
    expect(easterSunday(2026).getDate()).toBe(5);
    expect(easterSunday(2026).getMonth()).toBe(3);
    expect(easterSunday(2027).getMonth()).toBe(2);
    expect(easterSunday(2027).getDate()).toBe(28);
  });

  it('erkennt gesetzliche Feiertage', () => {
    expect(freeDayReason('2026-10-03')).toBe('Tag der Deutschen Einheit');
    expect(freeDayReason('2027-10-31')).toBe('Reformationstag');
    expect(freeDayReason('2027-05-06')).toBe('Christi Himmelfahrt');
    expect(freeDayReason('2027-05-17')).toBe('Pfingstmontag');
    expect(freeDayReason('2026-05-01')).toBe('Tag der Arbeit');
  });

  it('erkennt Ferien und Ferientage', () => {
    expect(freeDayReason('2026-10-12')).toBe('Herbstferien');
    expect(freeDayReason('2026-10-24')).toBe('Herbstferien');
    expect(freeDayReason('2027-01-08')).toBe('Weihnachtsferien');
    expect(freeDayReason('2026-05-15')).toBe('Schulfrei (Tag nach Himmelfahrt)');
  });

  it('liefert null an Schultagen', () => {
    expect(freeDayReason('2026-10-26')).toBeNull();
    expect(freeDayReason('2026-11-02')).toBeNull();
    expect(freeDayReason('2027-01-11')).toBeNull();
  });
});

describe('schoolQuarters', () => {
  it('teilt das Schuljahr 2026/27 an den Ferien auf', () => {
    expect(schoolQuarters('2026-11-05')).toEqual([
      { quarter: 1, from: '2026-08-13', to: '2026-10-24' },
      { quarter: 2, from: '2026-10-25', to: '2027-02-02' },
      { quarter: 3, from: '2027-02-03', to: '2027-04-03' },
      { quarter: 4, from: '2027-04-04', to: '2027-07-07' },
    ]);
  });

  it('nimmt in den Sommerferien das gerade beendete Schuljahr', () => {
    expect(schoolQuarters('2026-07-20')?.[0].from).toBe('2025-08-14');
  });

  it('liefert null außerhalb der Ferientabelle', () => {
    expect(schoolQuarters('2030-09-01')).toBeNull();
  });
});
