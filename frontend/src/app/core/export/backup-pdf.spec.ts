/** Lesbare Sicherung als PDF. */

import { Assessment, GradeBook, GradingScheme, StudentGrades } from '../models';
import { BackupCourse, backupTable, layoutFor, renderBackupPdf, resultKey } from './backup-pdf';

function assessment(id: number, released: boolean): Assessment {
  return {
    id,
    courseId: 1,
    typeKey: 'ka',
    typeLabel: 'Klassenarbeit',
    area: 'written',
    weight: 2,
    title: `KA ${id}`,
    date: `2026-10-0${id}`,
    maxPoints: null,
    released,
    releasedAt: released ? '2026-10-10T00:00:00Z' : null,
    comment: null,
    average: null,
    gradedCount: 0,
  };
}

const student: StudentGrades = {
  studentId: 7,
  firstName: 'Anna',
  lastName: 'Adler',
  assessmentGrades: { 1: 2.3 },
  lessons: [
    { date: '2026-09-07', value: 1, autoGrade: 2, override: null, grade: 2 },
    {
      date: '2026-09-14',
      value: 0,
      autoGrade: 3,
      override: { grade: null, reason: null },
      grade: null,
    },
    {
      date: '2026-09-21',
      value: 0,
      autoGrade: 3,
      override: { grade: 1.5, reason: 'x' },
      grade: 1.5,
    },
  ],
  participation: 1.75,
  written: 2.3,
  oral: 1.75,
  overall: 2.03,
  partial: false,
};

const course: BackupCourse = {
  book: {
    courseId: 1,
    schoolClassName: 'KDM11',
    subjectName: 'LF3 Werteströme',
    subjectShortName: 'LF3',
    scheme: { writtenPercent: 50 } as GradingScheme,
    assessments: [assessment(2, false), assessment(1, true)],
    lessonDates: ['2026-09-07', '2026-09-14', '2026-09-21'],
    students: [student],
  } as GradeBook,
  results: new Map([
    [resultKey(7, 1), { grade: 2.3, status: 'graded' as const }],
    [resultKey(7, 2), { grade: null, status: 'excused' as const }],
  ]),
};

describe('Sicherung als PDF', () => {
  it('legt je Schüler genau eine Zeile mit allen Noten an', () => {
    const table = backupTable(course);

    expect(table.rows.length).toBe(1);
    expect(table.headers.length).toBe(1 + 2 + 3 + 4);
    expect(table.rows[0].map((c) => c.text)).toEqual([
      'Adler, Anna',
      '2,3',
      'e',
      '2',
      'f',
      '1,5',
      '1,75',
      '2,30',
      '1,75',
      '2,03',
    ]);
  });

  it('sortiert Nachweise nach Datum und kennzeichnet nicht freigegebene', () => {
    const table = backupTable(course);

    expect(table.headers[1]).toContain('KA 1');
    expect(table.headers[2]).toContain('nicht frei');
    expect(table.groups.map((g) => g.span)).toEqual([1, 2, 3, 4]);
    expect(table.rows[0][4].style).toBe('absent');
    expect(table.rows[0][5].style).toBe('manual');
  });

  it('verkleinert die Schrift, bis alle Spalten nebeneinander passen', () => {
    const width = (l: ReturnType<typeof layoutFor>, a: number, n: number) =>
      l.nameWidth + a * l.assessmentWidth + n * l.lessonWidth + 4 * l.summaryWidth;

    expect(layoutFor(2, 5).fontSize).toBe(9);
    const many = layoutFor(3, 39);
    expect(many.fontSize).toBeLessThan(9);
    expect(width(many, 3, 39)).toBeLessThanOrEqual(277);
    expect(layoutFor(10, 200).fontSize).toBe(4);
  });

  it('erzeugt eine PDF-Datei', async () => {
    const blob = await renderBackupPdf([course, course], new Date(2026, 10, 15, 9, 30));
    const head = new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer());

    expect(head).toBe('%PDF-');
  });
});
