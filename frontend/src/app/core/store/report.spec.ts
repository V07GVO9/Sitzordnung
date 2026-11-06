/** Notenbogen als HTML. */

import { StudentReport } from '../models';
import { escapeHtml, renderReports } from './report';
import { renderLessonSheets } from './lesson-sheet';

const report: StudentReport = {
  studentId: 1,
  firstName: 'Anna',
  lastName: '<Adler>',
  schoolClassName: 'KDM261',
  subjectName: 'LF3',
  periodName: '1. Halbjahr',
  issuedAt: '2026-10-05T10:00:00.000Z',
  writtenPercent: 50,
  items: [
    {
      date: '2026-10-05',
      title: 'Klassenarbeit 1',
      typeLabel: 'Klassenarbeit',
      area: 'written',
      weight: 2,
      grade: 2.3,
      status: 'graded',
    },
  ],
  participation: { lessonCount: 4, countedCount: 3, average: 2.25, weight: 2 },
  written: 2.3,
  oral: 2.25,
  overall: 2.275,
  partial: false,
};

describe('renderReports', () => {
  it('maskiert Namen', () => {
    expect(escapeHtml('<b>&"')).toBe('&lt;b&gt;&amp;&quot;');
    expect(renderReports([report])).not.toContain('<Adler>');
  });

  it('zeigt Noten mit Komma und die Mitarbeit', () => {
    const html = renderReports([report]);

    expect(html).toContain('2,3');
    expect(html).toContain('2,28');
    expect(html).toContain('3 von 4 Doppelstunden');
  });

  it('legt je Schüler eine eigene Seite an', () => {
    const html = renderReports([report, { ...report, studentId: 2 }]);
    expect(html.match(/class="sheet"/g)?.length).toBe(2);
  });
});

describe('renderLessonSheets', () => {
  it('kennzeichnet automatische, händische und fehlende Noten', () => {
    const html = renderLessonSheets(
      [
        {
          courseId: 1,
          schoolClassName: 'KDM261',
          subjectName: '<LF3>',
          from: '2026-09-21',
          to: '2026-09-28',
          dates: [
            { date: '2026-09-14', rated: false },
            { date: '2026-09-21', rated: true },
            { date: '2026-09-28', rated: true },
          ],
          students: [
            {
              studentId: 1,
              firstName: 'Anna',
              lastName: 'Adler',
              average: 2,
              cells: [
                {
                  date: '2026-09-14',
                  rated: false,
                  value: 0,
                  autoGrade: 3,
                  override: null,
                  grade: null,
                },
                {
                  date: '2026-09-21',
                  rated: false,
                  value: 0,
                  autoGrade: 3,
                  override: null,
                  grade: 3,
                },
                {
                  date: '2026-09-28',
                  rated: true,
                  value: 2,
                  autoGrade: 1,
                  override: { grade: null, reason: 'krank' },
                  grade: null,
                },
              ],
            },
          ],
        },
      ],
      '2026-10-05',
    );

    expect(html).toContain('&lt;LF3&gt;');
    expect(html).toContain('<td class="num auto">3,0</td>');
    expect(html).toContain('class="num absent" title="krank">f</td>');
    expect(html).toContain('<td class="num none">–</td>');
    expect(html).toContain('3 Unterrichtstage, davon 1 ohne Bewertung');
  });
});
