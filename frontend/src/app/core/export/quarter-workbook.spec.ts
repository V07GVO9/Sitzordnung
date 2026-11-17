/** Quartalsnoten als Excel. */

import { WorkbookCourse, quarterSheet } from './quarter-workbook';
import { buildXlsx, columnName, sheetNames } from './xlsx';
import { crc32 } from './zip';

function course(): WorkbookCourse {
  const empty = {
    writtenPercent: null,
    writtenGrade: null,
    lessons: [],
    oral: null,
    final: null,
    partial: false,
  };
  return {
    schoolClassName: 'BFI10A',
    subjectName: 'LF3',
    writtenPercent: 50,
    quarters: [
      { quarter: 1, from: '2026-08-01', to: '2026-10-31', dates: ['2026-09-01', '2026-09-08'] },
      { quarter: 2, from: '2026-11-01', to: '2027-01-31', dates: [] },
    ],
    students: [
      {
        firstName: 'Ada',
        lastName: 'Lovelace',
        quarters: [
          {
            writtenPercent: 80,
            writtenGrade: 2,
            lessons: [
              { grade: 2, kind: 'rated' },
              { grade: 3, kind: 'unrated' },
            ],
            oral: 2.5,
            final: 2.3,
            partial: false,
          },
          empty,
        ],
      },
    ],
  };
}

describe('Quartalsnoten als Excel', () => {
  it('legt je Quartal einen Block mit schriftlich, Tagen, mündlich gesamt und Endnote an', () => {
    const sheet = quarterSheet(course(), '2026-11-17');
    const head = sheet.rows[4].map((c) => c.value);
    expect(head).toEqual([
      null,
      'Schriftl. %',
      'Schriftl. Note',
      '01.09.',
      '08.09.',
      'Mündl. gesamt',
      'Endnote',
      'Schriftl. %',
      'Schriftl. Note',
      'Mündl. gesamt',
      'Endnote',
    ]);
    expect(sheet.rows[5].map((c) => c.value)).toEqual([
      'Lovelace, Ada',
      80,
      2,
      2,
      3,
      2.5,
      2.3,
      null,
      null,
      null,
      null,
    ]);
  });

  it('rahmt jedes Quartal dick ein', () => {
    const sheet = quarterSheet(course(), '2026-11-17');
    const row = sheet.rows[5];
    expect(row[1].style?.border?.left).toBe('thick');
    expect(row[2].style?.border?.left).toBe('thin');
    expect(row[6].style?.border?.right).toBe('thick');
    expect(row[7].style?.border?.left).toBe('thick');
    expect(sheet.rows[3][3].style?.border?.top).toBe('thick');
    expect(row[3].style?.border?.bottom).toBe('thick');
  });

  it('erzeugt eine ZIP-Datei mit gültigen Blattnamen', () => {
    const bytes = buildXlsx([quarterSheet(course(), '2026-11-17')]);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(sheetNames(['A/B', 'A/B', 'x'.repeat(40)])).toEqual(['A B', 'A B (2)', 'x'.repeat(31)]);
    expect(columnName(0)).toBe('A');
    expect(columnName(26)).toBe('AA');
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});
