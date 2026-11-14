import { fileNamePart, germanNumber, trimToNull } from './text';

describe('trimToNull', () => {
  it('schneidet Leerraum ab', () => {
    expect(trimToNull('  B 104 ')).toBe('B 104');
  });

  it('macht aus leerem Text, null und undefined null', () => {
    expect(trimToNull('   ')).toBeNull();
    expect(trimToNull('')).toBeNull();
    expect(trimToNull(null)).toBeNull();
    expect(trimToNull(undefined)).toBeNull();
  });
});

describe('germanNumber', () => {
  it('schreibt das Komma deutsch', () => {
    expect(germanNumber(2.5)).toBe('2,5');
    expect(germanNumber(40)).toBe('40');
    expect(germanNumber(-1.25)).toBe('-1,25');
  });
});

describe('fileNamePart', () => {
  it('ersetzt alles außer Buchstaben und Ziffern durch Bindestriche', () => {
    expect(fileNamePart('LF3 Werte- und Leistungsprozesse')).toBe(
      'LF3-Werte--und-Leistungsprozesse',
    );
  });

  it('behält Umlaute und kürzt die Ränder', () => {
    expect(fileNamePart(' Özdemir/Çelik! ')).toBe('Özdemir-Çelik');
  });
});
