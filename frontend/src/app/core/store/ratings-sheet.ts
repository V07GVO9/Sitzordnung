/**
 * Baut die Einzelbewertungen als eigenständiges HTML-Dokument im Querformat:
 * je Kurs eine Tabelle mit den Schülern in den Zeilen und den Tagen, an denen
 * bewertet wurde, in den Spalten. Über den Druckdialog des Browsers entsteht
 * daraus auf Wunsch ein PDF.
 */

import { ratingSymbol } from '../models';
import { escapeHtml } from './report';
import { formatDateGerman } from './time';

/** So viele Tage passen lesbar nebeneinander; danach beginnt ein neuer Block. */
const DATES_PER_BLOCK = 20;

export interface RatingsSheetEntry {
  value: number;
  time: string;
  comment: string | null;
}

export interface RatingsSheetStudent {
  firstName: string;
  lastName: string;
  /** Je Bewertungstag alle Bewertungen in zeitlicher Reihenfolge - gleiche Reihenfolge wie dates. */
  cells: RatingsSheetEntry[][];
  points: number;
}

export interface RatingsSheet {
  schoolClassName: string;
  subjectName: string;
  from: string | null;
  to: string | null;
  dates: string[];
  students: RatingsSheetStudent[];
}

function cell(entries: RatingsSheetEntry[]): string {
  if (entries.length === 0) {
    return '<td class="num empty"></td>';
  }

  // Es zählt nur die letzte Bewertung des Tages; frühere stehen grau davor.
  const symbols = entries
    .map((e, i) => {
      const cls = i < entries.length - 1 ? ' class="old"' : '';
      return `<span${cls}>${ratingSymbol(e.value)}</span>`;
    })
    .join(' ');

  const comments = entries.filter((e) => e.comment).map((e) => `${e.time}: ${e.comment}`);
  const title = comments.length ? ` title="${escapeHtml(comments.join(' | '))}"` : '';
  const mark = comments.length ? '<sup>*</sup>' : '';

  return `<td class="num"${title}>${symbols}${mark}</td>`;
}

function block(sheet: RatingsSheet, start: number, withPoints: boolean): string {
  const dates = sheet.dates.slice(start, start + DATES_PER_BLOCK);
  const head = dates
    .map((d) => `<th class="date"><span>${formatDateGerman(d).slice(0, 6)}</span></th>`)
    .join('');

  const rows = sheet.students.map((s) => {
    const cells = s.cells
      .slice(start, start + DATES_PER_BLOCK)
      .map(cell)
      .join('');
    const points = withPoints ? `<td class="num sum">${s.points}</td>` : '';
    return `<tr><td class="name"><strong>${escapeHtml(s.lastName)}</strong>, ${escapeHtml(s.firstName)}</td>${cells}${points}</tr>`;
  });

  return `
    <table>
      <thead><tr><th class="name">Name</th>${head}${withPoints ? '<th class="num sum">Punkte</th>' : ''}</tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`;
}

function commentList(sheet: RatingsSheet): string {
  const items: string[] = [];
  for (const s of sheet.students) {
    s.cells.forEach((entries, i) => {
      for (const e of entries) {
        if (e.comment) {
          items.push(
            `<li>${formatDateGerman(sheet.dates[i])}, ${e.time} · <strong>${escapeHtml(s.lastName)}, ${escapeHtml(s.firstName)}</strong> (${ratingSymbol(e.value)}): ${escapeHtml(e.comment)}</li>`,
          );
        }
      }
    });
  }

  return items.length ? `<h2>Kommentare</h2><ul class="comments">${items.join('')}</ul>` : '';
}

function page(sheet: RatingsSheet, issued: string): string {
  const period =
    sheet.from && sheet.to
      ? `${formatDateGerman(sheet.from)} – ${formatDateGerman(sheet.to)}`
      : 'gesamter Zeitraum';

  let body: string;
  if (sheet.dates.length === 0) {
    body = '<p class="muted">In diesem Zeitraum wurde nicht bewertet.</p>';
  } else if (sheet.students.length === 0) {
    body = '<p class="muted">Dieser Klasse sind keine Schüler zugeordnet.</p>';
  } else {
    const blocks: string[] = [];
    for (let start = 0; start < sheet.dates.length; start += DATES_PER_BLOCK) {
      blocks.push(block(sheet, start, start + DATES_PER_BLOCK >= sheet.dates.length));
    }
    body = blocks.join('') + commentList(sheet);
  }

  return `
  <section class="sheet">
    <header>
      <div>
        <div class="eyebrow">Mitarbeit · Einzelbewertungen</div>
        <h1>${escapeHtml(sheet.schoolClassName)} · ${escapeHtml(sheet.subjectName)}</h1>
      </div>
      <div class="meta">
        <div>Zeitraum: <strong>${period}</strong></div>
        <div>${sheet.dates.length} Bewertungstage</div>
        <div>Stand: <strong>${formatDateGerman(issued)}</strong></div>
      </div>
    </header>
    ${body}
    <p class="legend">
      <span><b>++ + 0 − −−</b> Bewertung des Tages</span>
      <span><b><span class="old">+</span> −</b> mehrfach bewertet – es zählt die letzte</span>
      <span><b>&nbsp;</b> nicht bewertet – zählt 0</span>
      <span><b>+<sup>*</sup></b> mit Kommentar</span>
    </p>
  </section>`;
}

/** Das komplette Dokument, je Kurs eine Druckseite im Querformat. */
export function renderRatingsSheets(sheets: RatingsSheet[], issued: string): string {
  const title =
    sheets.length === 1
      ? `Einzelbewertungen ${sheets[0].schoolClassName} ${sheets[0].subjectName}`
      : 'Einzelbewertungen – alle Kurse';

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #1c2430; margin: 0; background: #f2f4f7; }
  .sheet { background: #fff; max-width: 72rem; margin: 1.5rem auto; padding: 1.5rem; border-radius: 0.5rem; overflow-x: auto; }
  header { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; border-bottom: 2px solid #2f5d8a; padding-bottom: 0.6rem; margin-bottom: 0.8rem; }
  h1 { margin: 0.2rem 0; font-size: 1.35rem; }
  h2 { font-size: 0.95rem; margin: 0.8rem 0 0.3rem; }
  .eyebrow { text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.72rem; color: #2f5d8a; font-weight: 600; }
  .meta { text-align: right; font-size: 0.85rem; }
  table { border-collapse: collapse; font-size: 0.78rem; margin-bottom: 0.8rem; }
  th, td { padding: 0.2rem 0.25rem; border: 1px solid #d9dee5; }
  th { background: #f5f7fa; font-weight: 600; }
  th.name, td.name { text-align: left; white-space: nowrap; min-width: 11rem; }
  td.num, th.date { min-width: 2.5rem; }
  th.date { height: 4.2rem; vertical-align: bottom; padding: 0.2rem 0; }
  th.date span { display: inline-block; writing-mode: vertical-rl; transform: rotate(180deg); font-weight: 600; }
  .num { text-align: center; white-space: nowrap; font-weight: 600; }
  .old { color: #9aa5b3; font-weight: normal; text-decoration: line-through; }
  sup { font-size: 0.6em; color: #2f5d8a; }
  .sum { font-weight: 700; background: #e8f0f8; }
  .muted { color: #6b7685; }
  .comments { font-size: 0.75rem; margin: 0; padding-left: 1.2rem; }
  .legend { display: flex; flex-wrap: wrap; gap: 0.4rem 1.2rem; font-size: 0.75rem; color: #4d5866; margin: 0.4rem 0 0; }
  .legend > span > b { display: inline-block; min-width: 2.2rem; text-align: center; border: 1px solid #d9dee5; padding: 0 0.2rem; margin-right: 0.25rem; }
  @media print {
    body { background: #fff; }
    .sheet { margin: 0; max-width: none; padding: 0; border-radius: 0; overflow: visible; page-break-after: always; break-after: page; }
    .sheet:last-child { page-break-after: auto; break-after: auto; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
    th, .sum { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>${sheets.map((s) => page(s, issued)).join('')}
</body>
</html>`;
}
