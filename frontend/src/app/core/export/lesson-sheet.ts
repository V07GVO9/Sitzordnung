/**
 * Baut die Stundenübersicht als eigenständiges HTML-Dokument: je Kurs eine
 * Druckseite (Querformat) mit der Mitarbeitsnote jedes Schülers an jedem
 * Unterrichtstag. Über den Druckdialog des Browsers entsteht daraus auf
 * Wunsch ein PDF.
 */

import { LessonSheet, LessonSheetCell, ratingSymbol } from '../models';
import { formatGrade } from '../logic/assessment.logic';
import { formatDateGerman } from '../logic/time';
import {
  dateBlocks,
  dateHeaderCell,
  escapeHtml,
  nameCell,
  periodText,
  printDocument,
} from './print-document';

function cell(c: LessonSheetCell): string {
  if (c.override) {
    const reason = c.override.reason ? ` title="${escapeHtml(c.override.reason)}"` : '';
    return c.override.grade === null
      ? `<td class="num absent"${reason}>f</td>`
      : `<td class="num manual"${reason}>${formatGrade(c.override.grade, 1)}<sup>H</sup></td>`;
  }

  // Im Kurs an diesem Tag gar nicht bewertet: zählt nicht.
  if (c.grade === null) {
    return '<td class="num none">–</td>';
  }

  if (!c.rated) {
    return `<td class="num auto">${formatGrade(c.autoGrade, 1)}</td>`;
  }

  return `<td class="num">${formatGrade(c.autoGrade, 1)}<small>${ratingSymbol(c.value)}</small></td>`;
}

/** Die Tabelle für die Tage `start` bis `end` - der letzte Block bekommt den Durchschnitt. */
function block(sheet: LessonSheet, start: number, end: number, withAverage: boolean): string {
  const head = sheet.dates
    .slice(start, end)
    .map((d) => dateHeaderCell(d.date, d.rated ? '' : ' unrated'))
    .join('');

  const rows = sheet.students.map((s) => {
    const cells = s.cells.slice(start, end).map(cell).join('');
    const avg = withAverage ? `<td class="num avg">${formatGrade(s.average, 2)}</td>` : '';
    return `<tr>${nameCell(s)}${cells}${avg}</tr>`;
  });

  return `
    <table>
      <thead><tr><th class="name">Name</th>${head}${withAverage ? '<th class="num avg">Ø</th>' : ''}</tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`;
}

function page(sheet: LessonSheet, issued: string): string {
  const period = periodText(sheet.from, sheet.to);

  let body: string;
  if (sheet.dates.length === 0) {
    body = '<p class="muted">In diesem Zeitraum gab es keinen Unterricht.</p>';
  } else if (sheet.students.length === 0) {
    body = '<p class="muted">Dieser Klasse sind keine Schüler zugeordnet.</p>';
  } else {
    body = dateBlocks(sheet.dates.length, (start, end, isLast) => block(sheet, start, end, isLast));
  }

  const unrated = sheet.dates.filter((d) => !d.rated).length;

  return `
  <section class="sheet">
    <header>
      <div>
        <div class="eyebrow">Mitarbeit · Noten je Unterrichtstag</div>
        <h1>${escapeHtml(sheet.schoolClassName)} · ${escapeHtml(sheet.subjectName)}</h1>
      </div>
      <div class="meta">
        <div>Zeitraum: <strong>${period}</strong></div>
        <div>${sheet.dates.length} Unterrichtstage, davon ${unrated} ohne Bewertung</div>
        <div>Stand: <strong>${formatDateGerman(issued)}</strong></div>
      </div>
    </header>
    ${body}
    <p class="legend">
      <span><b>2,0<small>+</small></b> bewertet (Zeichen = Bewertung des Tages)</span>
      <span><b class="auto">3,0</b> automatisch – Schüler an diesem Tag nicht bewertet</span>
      <span><b class="none">–</b> niemand bewertet – zählt nicht</span>
      <span><b class="manual">2,0<sup>H</sup></b> von Hand gesetzt</span>
      <span><b class="absent">f</b> fehlte – zählt nicht</span>
      <span><b class="unrated-key">Datum</b> Tag ganz ohne Bewertung im Kurs</span>
    </p>
  </section>`;
}

const STYLES = `  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #1c2430; margin: 0; background: #f2f4f7; }
  .sheet { background: #fff; max-width: 72rem; margin: 1.5rem auto; padding: 1.5rem; border-radius: 0.5rem; overflow-x: auto; }
  header { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; border-bottom: 2px solid #2f5d8a; padding-bottom: 0.6rem; margin-bottom: 0.8rem; }
  h1 { margin: 0.2rem 0; font-size: 1.35rem; }
  .eyebrow { text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.72rem; color: #2f5d8a; font-weight: 600; }
  .meta { text-align: right; font-size: 0.85rem; }
  table { border-collapse: collapse; font-size: 0.78rem; margin-bottom: 0.8rem; }
  th, td { padding: 0.2rem 0.25rem; border: 1px solid #d9dee5; }
  th { background: #f5f7fa; font-weight: 600; }
  th.name, td.name { text-align: left; white-space: nowrap; min-width: 11rem; }
  td.num, th.date { min-width: 2.5rem; }
  th.date { height: 4.2rem; vertical-align: bottom; padding: 0.2rem 0; }
  th.date span { display: inline-block; writing-mode: vertical-rl; transform: rotate(180deg); font-weight: 600; }
  th.unrated, .unrated-key { color: #8a5a00; background: #fff4dc; }
  .num { text-align: center; white-space: nowrap; }
  td small, .legend small { font-size: 0.7em; color: #4d5866; margin-left: 0.1rem; }
  td.auto, b.auto { color: #6b7685; font-style: italic; }
  td.manual, b.manual { font-weight: 700; color: #2f5d8a; }
  sup { font-size: 0.6em; }
  td.none, b.none { color: #6b7685; }
  td.absent, b.absent { color: #a33; font-weight: 600; }
  .avg { font-weight: 700; background: #e8f0f8; }
  .muted { color: #6b7685; }
  .legend { display: flex; flex-wrap: wrap; gap: 0.4rem 1.2rem; font-size: 0.75rem; color: #4d5866; margin: 0.4rem 0 0; }
  .legend b { display: inline-block; min-width: 2.2rem; text-align: center; border: 1px solid #d9dee5; padding: 0 0.2rem; margin-right: 0.25rem; font-weight: normal; }
  @media print {
    body { background: #fff; }
    .sheet { margin: 0; max-width: none; padding: 0; border-radius: 0; overflow: visible; page-break-after: always; break-after: page; }
    .sheet:last-child { page-break-after: auto; break-after: auto; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
    th, .avg, .unrated-key { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }`;

/** Das komplette Dokument, je Kurs eine Druckseite. */
export function renderLessonSheets(sheets: LessonSheet[], issued: string): string {
  const title =
    sheets.length === 1
      ? `Noten je Stunde ${sheets[0].schoolClassName} ${sheets[0].subjectName}`
      : 'Noten je Stunde – alle Kurse';

  return printDocument(
    title,
    STYLES,
    sheets.map((s) => page(s, issued)),
  );
}
