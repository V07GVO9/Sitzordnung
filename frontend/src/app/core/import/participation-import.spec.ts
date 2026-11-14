import { PdfLine, PdfPage } from './pdf-text';
import {
  cleanName,
  describeCounts,
  emptyCounts,
  gradeFromCounts,
  matchStudent,
  parseReportPage,
  subjectMatches,
} from './participation-import';

function line(y: number, ...cells: [number, string][]): PdfLine {
  return cells.map(([x, text]) => ({ x, y, text }));
}

const COLUMNS = [173, 240, 297, 342, 387, 432, 477];

function row(y: number, label: string, values: number[], average?: string): PdfLine {
  const cells: [number, string][] = [
    [54, label],
    ...values.map((v, i): [number, string] => [COLUMNS[i], String(v)]),
  ];
  if (average) {
    cells.push([522, average]);
  }
  return line(y, ...cells);
}

/** Eine Seite, wie sie aus der Übersicht der Schul-App gelesen wird. */
function page(name: string): PdfPage {
  return [
    line(26, [246, 'erstellt am 05.11.2026 - Seite 1']),
    line(51.8, [54, name], [54.5, 'vom 01.08.2026 bis 05.11.2026']),
    line(76, [130, 'Klasse:'], [220, 'KDM261']),
    line(96, [130, 'Schuljahr:'], [220, '2026/27']),
    line(166, [54, 'Mitarbeit']),
    line(
      182,
      [158, 'Beiträge'],
      [222, 'Störungen'],
      [295, '--'],
      [342, '-'],
      [385, 'o'],
      [432, '+'],
      [474, '++'],
      [521, 'Ø'],
    ),
    row(197, 'LF3 B104', [0, 0, 0, 1, 3, 2, 1], '+'),
    row(212, 'Politik B104', [0, 0, 0, 0, 0, 0, 0]),
  ];
}

const SCHEME = { plusPlus: 1, plus: 2, neutral: 3, minus: 4, minusMinus: 5 };

describe('participation-import', () => {
  it('liest Name, Klasse, Zeitraum und Anzahlen je Fach', () => {
    const report = parseReportPage(page('Paul KS1 Weber'))!;

    expect(report.name).toBe('Paul Weber');
    expect(report.className).toBe('KDM261');
    expect(report.from).toBe('2026-08-01');
    expect(report.to).toBe('2026-11-05');
    expect(report.subjects.map((s) => s.label)).toEqual(['LF3 B104', 'Politik B104']);
    expect(report.subjects[0].counts).toEqual({
      minusMinus: 0,
      minus: 1,
      neutral: 3,
      plus: 2,
      plusPlus: 1,
    });
    expect(report.subjects[1].counts).toEqual(emptyCounts());
  });

  it('ignoriert Seiten ohne Übersicht', () => {
    expect(parseReportPage([line(10, [54, 'Irgendwas'])])).toBeNull();
  });

  it('entfernt Rollenkürzel aus Namen', () => {
    expect(cleanName('Mia-Sophie KV1 Öztürk')).toBe('Mia-Sophie Öztürk');
    expect(cleanName('Lena  KS2 Nachname')).toBe('Lena Nachname');
  });

  it('rechnet den Durchschnitt mit den Noten des Schemas', () => {
    const counts = { minusMinus: 0, minus: 1, neutral: 3, plus: 2, plusPlus: 1 };
    // (4 + 9 + 4 + 1) / 7 = 2,57...
    expect(gradeFromCounts(counts, SCHEME)).toBe(2.6);
    expect(gradeFromCounts(emptyCounts(), SCHEME)).toBeNull();
    expect(describeCounts(counts)).toBe('1× ++, 2× +, 3× o, 1× -');
  });

  describe('Zuordnung der Schüler', () => {
    const students = [
      { id: 1, firstName: 'Mia-Sophie', lastName: 'Öztürk' },
      { id: 2, firstName: 'Tim Felix', lastName: 'Berger' },
      { id: 3, firstName: 'Jonas', lastName: 'Müller' },
      { id: 4, firstName: 'Anna', lastName: 'Schmidt' },
      { id: 5, firstName: 'Anna', lastName: 'Schmitt' },
    ];

    it('findet vollständige Namen - auch mit Bindestrich und Umlaut', () => {
      expect(matchStudent('Mia-Sophie Öztürk', students)?.id).toBe(1);
      expect(matchStudent('Tim Felix Berger', students)?.id).toBe(2);
      expect(matchStudent('Berger Tim Felix', students)?.id).toBe(2);
    });

    it('behandelt unlesbare Zeichen als Platzhalter', () => {
      expect(matchStudent('Jonas M?ller', students)?.id).toBe(3);
      expect(matchStudent('Anna Schmi?t', students)).toBeNull();
    });

    it('nutzt den ersten Vornamen, wenn der zweite fehlt', () => {
      expect(matchStudent('Tim Berger', students)?.id).toBe(2);
    });

    it('ordnet Platzhalter und Unbekannte nicht zu', () => {
      expect(matchStudent('Klassensprecher', students)).toBeNull();
      expect(matchStudent('Lena Nachname', students)).toBeNull();
    });
  });

  it('erkennt das passende Fach', () => {
    expect(subjectMatches('LF3 B104', 'LF3', 'Werte- und Leistungsprozesse')).toBeTrue();
    expect(subjectMatches('Politik B104', 'PO', 'Politik')).toBeTrue();
    expect(subjectMatches('Politik B104', 'LF3', 'LF3 Werte')).toBeFalse();
  });
});
