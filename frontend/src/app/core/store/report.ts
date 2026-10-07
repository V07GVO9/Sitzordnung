/**
 * Baut die Notenbögen als eigenständiges HTML-Dokument: eine Seite je
 * Schüler, druckfertig. Über den Druckdialog des Browsers entsteht daraus
 * auf Wunsch ein PDF.
 *
 * Ein Notenbogen enthält nur die Noten eines einzigen Schülers - nie eine
 * Klassenliste.
 */

import { AREA_LABELS, GradeArea, ReportItem, STATUS_LABELS, StudentReport } from '../models';
import { formatGrade } from './assessment.logic';
import { formatDateGerman, toDateKey } from './time';

/** Maskiert Text für die Ausgabe in HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function itemGrade(item: ReportItem): string {
  if (item.status === 'excused') {
    return 'entschuldigt';
  }

  if (item.status === 'refused') {
    return `6,0 (${STATUS_LABELS.refused})`;
  }

  return formatGrade(item.grade, 1);
}

function areaTable(report: StudentReport, area: GradeArea): string {
  const items = report.items.filter((i) => i.area === area);
  const rows = items.map(
    (i) => `
        <tr>
          <td>${formatDateGerman(i.date)}</td>
          <td>${escapeHtml(i.title)}</td>
          <td>${escapeHtml(i.typeLabel)}</td>
          <td class="num">${String(i.weight).replace('.', ',')}</td>
          <td class="num">${itemGrade(i)}</td>
        </tr>`,
  );

  if (area === 'oral') {
    const p = report.participation;
    rows.push(`
        <tr>
          <td>laufend</td>
          <td>Mitarbeit im Unterricht (${p.countedCount} von ${p.lessonCount} Doppelstunden)</td>
          <td>Mitarbeit</td>
          <td class="num">${String(p.weight).replace('.', ',')}</td>
          <td class="num">${formatGrade(p.average, 2)}</td>
        </tr>`);
  }

  if (rows.length === 0) {
    rows.push('<tr><td colspan="5" class="muted">Noch keine Noten.</td></tr>');
  }

  const percent = area === 'written' ? report.writtenPercent : 100 - report.writtenPercent;

  return `
    <h2>${AREA_LABELS[area].replace(/^./, (c) => c.toUpperCase())} <span class="muted">(${percent} %)</span></h2>
    <table>
      <thead>
        <tr><th>Datum</th><th>Leistung</th><th>Art</th><th class="num">Gewicht</th><th class="num">Note</th></tr>
      </thead>
      <tbody>${rows.join('')}</tbody>
      <tfoot>
        <tr><td colspan="4">Note ${AREA_LABELS[area]}</td><td class="num">${formatGrade(report[area], 2)}</td></tr>
      </tfoot>
    </table>`;
}

function page(report: StudentReport): string {
  const issued = formatDateGerman(toDateKey(new Date(report.issuedAt)));

  return `
  <section class="sheet">
    <header>
      <div>
        <div class="eyebrow">Notenbogen · Zwischenstand</div>
        <h1>${escapeHtml(report.firstName)} ${escapeHtml(report.lastName)}</h1>
        <div>${escapeHtml(report.schoolClassName)} · ${escapeHtml(report.subjectName)}</div>
      </div>
      <div class="meta">
        <div>Zeitraum: <strong>${escapeHtml(report.periodName)}</strong></div>
        <div>Stand: <strong>${issued}</strong></div>
      </div>
    </header>

    <div class="overall">
      <span>Aktueller Notenstand</span>
      <strong>${formatGrade(report.overall, 2)}</strong>
    </div>
    ${report.partial ? '<p class="hint">Ein Bereich hat noch keine Noten - der Stand ist vorläufig.</p>' : ''}

    ${areaTable(report, 'written')}
    ${areaTable(report, 'oral')}

    <p class="hint">
      Gewichtung: schriftlich ${report.writtenPercent} %, mündlich/sonstig ${100 - report.writtenPercent} %.
      Innerhalb eines Bereichs zählt jede Note mit ihrem Gewicht. Die Mitarbeit ist der Durchschnitt
      der Doppelstunden. Dies ist ein Zwischenstand, keine Zeugnisnote - die Zeugnisnote legt die
      Lehrkraft unter Einbeziehung der gesamten Leistungsentwicklung fest.
    </p>

    <footer>
      <span>Zur Kenntnis genommen: ____________________</span>
      <span>Datum: ____________</span>
    </footer>
  </section>`;
}

/** Das komplette Dokument mit allen Bögen, je Schüler eine Druckseite. */
export function renderReports(reports: StudentReport[]): string {
  const title =
    reports.length === 1
      ? `Notenbogen ${reports[0].firstName} ${reports[0].lastName}`
      : `Notenbögen ${reports[0]?.schoolClassName ?? ''} ${reports[0]?.subjectName ?? ''}`;

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #1c2430; margin: 0; background: #f2f4f7; }
  .sheet { background: #fff; max-width: 48rem; margin: 1.5rem auto; padding: 2rem; border-radius: 0.5rem; }
  header { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; border-bottom: 2px solid #2f5d8a; padding-bottom: 0.75rem; }
  h1 { margin: 0.2rem 0; font-size: 1.5rem; }
  h2 { font-size: 1.05rem; margin: 1.5rem 0 0.4rem; }
  .eyebrow { text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.75rem; color: #2f5d8a; font-weight: 600; }
  .meta { text-align: right; font-size: 0.9rem; }
  .overall { display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; padding: 0.75rem 1rem; background: #e8f0f8; border-radius: 0.4rem; }
  .overall strong { font-size: 1.6rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid #d9dee5; }
  th { background: #f5f7fa; }
  tfoot td { font-weight: 600; border-top: 2px solid #9aa5b3; }
  .num { text-align: right; white-space: nowrap; }
  .muted { color: #6b7685; font-weight: normal; }
  .hint { font-size: 0.8rem; color: #4d5866; }
  footer { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-top: 2.5rem; font-size: 0.85rem; }
  @media print {
    body { background: #fff; }
    .sheet { margin: 0; max-width: none; padding: 0; border-radius: 0; page-break-after: always; break-after: page; }
    .sheet:last-child { page-break-after: auto; break-after: auto; }
    .overall, th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>${reports.map(page).join('')}
</body>
</html>`;
}
