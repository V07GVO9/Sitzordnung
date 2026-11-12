import { nextClassName } from './school-year';

describe('nextClassName', () => {
  it('zählt die erste Zahl im Klassennamen hoch', () => {
    expect(nextClassName('KDM11')).toBe('KDM12');
    expect(nextClassName('BFI10A')).toBe('BFI11A');
    expect(nextClassName('09b')).toBe('10b');
    expect(nextClassName('Vorklasse')).toBe('Vorklasse');
  });
});
