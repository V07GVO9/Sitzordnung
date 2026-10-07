/** Notenbogen als HTML. */

import { StudentReport } from '../models';
import { escapeHtml, renderReports } from './report';

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
