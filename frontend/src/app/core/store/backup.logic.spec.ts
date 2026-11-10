import { backupDue } from './backup.logic';

describe('backupDue', () => {
  const now = new Date('2026-11-09T08:00:00Z');

  it('erinnert nicht bei leerem Bestand', () => {
    expect(backupDue(null, now, false)).toBeNull();
  });

  it('erinnert, wenn noch nie gesichert wurde', () => {
    expect(backupDue(null, now, true)).toEqual({ days: null });
  });

  it('erinnert erst ab 7 Tagen', () => {
    expect(backupDue('2026-11-03T09:00:00Z', now, true)).toBeNull();
    expect(backupDue('2026-11-02T08:00:00Z', now, true)).toEqual({ days: 7 });
  });
});
