/**
 * Das gemeinsame Gerüst der druckfertigen HTML-Dokumente - Notenbögen,
 * Noten je Unterrichtstag, Einzelbewertungen. Jedes ist eine eigenständige
 * Datei; über den Druckdialog des Browsers entsteht daraus auf Wunsch ein PDF.
 */

import { PersonName } from '../models';
import { formatDateGerman } from '../logic/time';

/** So viele Tage passen lesbar nebeneinander; danach beginnt ein neuer Block. */
const DATES_PER_BLOCK = 20;

/** Maskiert Text für die Ausgabe in HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Das komplette Dokument: Kopf mit Titel und Stilen, dahinter die Druckseiten. */
export function printDocument(title: string, styles: string, pages: string[]): string {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${styles}
</style>
</head>
<body>${pages.join('')}
</body>
</html>`;
}

/** „01.09.2026 – 30.09.2026“ - fehlt eine Grenze, „gesamter Zeitraum“. */
export function periodText(from: string | null, to: string | null): string {
  return from && to ? `${formatDateGerman(from)} – ${formatDateGerman(to)}` : 'gesamter Zeitraum';
}

/**
 * Breite Tabellen mit einer Spalte je Tag werden in Blöcke geteilt, damit sie
 * auf die Seite passen. `render` baut den Block ab Spalte `start`; nur der
 * letzte Block bekommt die Summenspalte.
 */
export function dateBlocks(
  dateCount: number,
  render: (start: number, end: number, isLast: boolean) => string,
): string {
  const blocks: string[] = [];
  for (let start = 0; start < dateCount; start += DATES_PER_BLOCK) {
    const end = start + DATES_PER_BLOCK;
    blocks.push(render(start, end, end >= dateCount));
  }
  return blocks.join('');
}

/** Die Namenszelle einer Zeile: „**Nachname**, Vorname“. */
export function nameCell(student: PersonName): string {
  return `<td class="name"><strong>${escapeHtml(student.lastName)}</strong>, ${escapeHtml(student.firstName)}</td>`;
}

/** Der Tag als Spaltenkopf - nur Tag und Monat („07.09.“), senkrecht gesetzt. */
export function dateHeaderCell(dateKey: string, extraClass = ''): string {
  return `<th class="date${extraClass}"><span>${formatDateGerman(dateKey).slice(0, 6)}</span></th>`;
}
