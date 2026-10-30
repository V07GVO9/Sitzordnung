/** Regeln für ein neues Passwort. */

import { isStrongPassword, unmetPasswordRules } from './password-policy';

describe('password-policy', () => {
  it('nimmt ein Passwort an, das alle Regeln erfüllt', () => {
    expect(isStrongPassword('Sitzplan#2026')).toBeTrue();
    expect(isStrongPassword('Übung-macht1')).toBeTrue();
  });

  it('verlangt mehr als 10 Zeichen', () => {
    expect(isStrongPassword('Abcdefg#12')).toBeFalse();
    expect(isStrongPassword('Abcdefgh#12')).toBeTrue();
  });

  it('meldet jede fehlende Regel einzeln', () => {
    expect(unmetPasswordRules('kleinbuchstaben').map((r) => r.label)).toEqual([
      'ein Großbuchstabe',
      'eine Zahl',
      'ein Sonderzeichen',
    ]);
    expect(unmetPasswordRules('').length).toBe(4);
  });

  it('zählt Leerzeichen nicht als Sonderzeichen', () => {
    expect(isStrongPassword('Abcdefgh 12')).toBeFalse();
  });
});
