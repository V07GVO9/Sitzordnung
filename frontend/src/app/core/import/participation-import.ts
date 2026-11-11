/**
 * Übernimmt Mitarbeitsübersichten aus einem anderen Werkzeug (PDF-Export der
 * Schul-App: eine Seite je Schüler mit den Anzahlen --, -, o, +, ++ je Fach).
 *
 * Die Übersicht enthält nur Summen, keine einzelnen Stunden. Deshalb wird je
 * Fach ein mündlicher Leistungsnachweis angelegt, dessen Note der Durchschnitt
 * der Bewertungen ist - mit den Noten aus dem Bewertungsschema des Kurses.
 */

import { ParticipationGradesRecord } from '../store/database';
import { roundGrade } from '../logic/assessment.logic';
import { PdfLine, PdfPage } from './pdf-text';

export interface RatingCounts {
  minusMinus: number;
  minus: number;
  neutral: number;
  plus: number;
  plusPlus: number;
}

export interface ImportedSubjectRow {
  /** Bezeichnung in der Übersicht, etwa "LF3 B104". */
  label: string;
  counts: RatingCounts;
}

/** Eine Seite der Übersicht - ein Schüler. */
export interface ImportedStudentReport {
  /** Der Name ohne Rollenkürzel (KS1, KV2 ...), wie er in der Übersicht steht. */
  name: string;
  className: string | null;
  /** Zeitraum als `YYYY-MM-DD`. */
  from: string | null;
  to: string | null;
  subjects: ImportedSubjectRow[];
}

const COUNT_COLUMNS: Record<string, keyof RatingCounts> = {
  '--': 'minusMinus',
  '-': 'minus',
  o: 'neutral',
  '+': 'plus',
  '++': 'plusPlus',
};

const PERIOD = /vom\s+(\d{2})\.(\d{2})\.(\d{4})\s+bis\s+(\d{2})\.(\d{2})\.(\d{4})/;

/** Rollenkürzel, die die Schul-App in den Namen schreibt: Klassensprecher, Konferenzvertreter. */
const ROLE_TOKEN = /^K[SV]\d*$/i;

export function emptyCounts(): RatingCounts {
  return { minusMinus: 0, minus: 0, neutral: 0, plus: 0, plusPlus: 0 };
}

export function totalCount(counts: RatingCounts): number {
  return counts.minusMinus + counts.minus + counts.neutral + counts.plus + counts.plusPlus;
}

/** Entfernt Rollenkürzel und doppelte Leerzeichen. */
export function cleanName(raw: string): string {
  return raw
    .split(/\s+/)
    .filter((token) => token !== '' && !ROLE_TOKEN.test(token))
    .join(' ');
}

function lineText(line: PdfLine): string {
  return line.map((item) => item.text).join(' ');
}

/** Liest eine Seite der Übersicht - oder null, wenn sie nicht dazu passt. */
export function parseReportPage(page: PdfPage): ImportedStudentReport | null {
  const nameLine = page.find((line) => PERIOD.test(lineText(line)));
  if (!nameLine) {
    return null;
  }

  const text = lineText(nameLine);
  const period = PERIOD.exec(text)!;
  const name = cleanName(text.replace(PERIOD, ''));

  let className: string | null = null;
  const classLine = page.find((line) => line.some((item) => item.text === 'Klasse:'));
  if (classLine) {
    className = classLine.find((item) => item.text !== 'Klasse:')?.text ?? null;
  }

  // Die Kopfzeile der Tabelle legt fest, welche Spalte wo steht.
  const headerIndex = page.findIndex(
    (line) => line.some((i) => i.text === '--') && line.some((i) => i.text === '++'),
  );
  const subjects: ImportedSubjectRow[] = [];

  if (headerIndex >= 0) {
    const columns = page[headerIndex]
      .filter((item) => item.text in COUNT_COLUMNS)
      .map((item) => ({ x: item.x, key: COUNT_COLUMNS[item.text] }));
    // Alle Spalten mit Zahlen (auch "Beiträge" und "Störungen"), damit eine
    // Zahl der nächstgelegenen Spalte zugeordnet werden kann.
    const allColumns = page[headerIndex].map((item) => ({
      x: item.x,
      key: COUNT_COLUMNS[item.text] ?? null,
    }));

    for (const line of page.slice(headerIndex + 1)) {
      const [first, ...rest] = line;
      const numbers = rest.filter((item) => /^\d+$/.test(item.text));
      if (!first || /^\d+$/.test(first.text) || numbers.length < columns.length) {
        continue;
      }

      const counts = emptyCounts();
      for (const item of numbers) {
        const nearest = allColumns.reduce((best, column) =>
          Math.abs(column.x - item.x) < Math.abs(best.x - item.x) ? column : best,
        );
        if (nearest.key) {
          counts[nearest.key] = Number(item.text);
        }
      }
      subjects.push({ label: first.text, counts });
    }
  }

  return {
    name,
    className,
    from: `${period[3]}-${period[2]}-${period[1]}`,
    to: `${period[6]}-${period[5]}-${period[4]}`,
    subjects,
  };
}

export function parseReportPages(pages: PdfPage[]): ImportedStudentReport[] {
  return pages
    .map(parseReportPage)
    .filter((report): report is ImportedStudentReport => report !== null);
}

/** Durchschnitt der Bewertungen als Note (eine Nachkommastelle) - null ohne Bewertung. */
export function gradeFromCounts(
  counts: RatingCounts,
  grades: ParticipationGradesRecord,
): number | null {
  const total = totalCount(counts);
  if (total === 0) {
    return null;
  }

  const sum =
    counts.plusPlus * grades.plusPlus +
    counts.plus * grades.plus +
    counts.neutral * grades.neutral +
    counts.minus * grades.minus +
    counts.minusMinus * grades.minusMinus;

  return roundGrade(sum / total, 1);
}

/** Kurzbeschreibung für den Kommentar, etwa "4× +, 2× o". */
export function describeCounts(counts: RatingCounts): string {
  const parts: [number, string][] = [
    [counts.plusPlus, '++'],
    [counts.plus, '+'],
    [counts.neutral, 'o'],
    [counts.minus, '-'],
    [counts.minusMinus, '--'],
  ];
  return parts
    .filter(([n]) => n > 0)
    .map(([n, symbol]) => `${n}× ${symbol}`)
    .join(', ');
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[-\s]+/g, ' ')
    .trim();
}

/** "?" steht für ein Zeichen, das in der PDF nicht lesbar war. */
function namePattern(name: string): RegExp {
  const escaped = normalize(name)
    .split('?')
    .map((part) => part.replace(/[.*+^${}()|[\]\\]/g, '\\$&'))
    .join('.{1,2}');
  return new RegExp(`^${escaped}$`);
}

/**
 * Sucht den Schüler zu einem Namen aus der Übersicht. Erst der vollständige
 * Name (Vorname Nachname oder umgekehrt), dann erster Vorname + Nachname.
 * Mehrdeutige Treffer gelten als nicht gefunden.
 */
export function matchStudent<T extends { id: number; firstName: string; lastName: string }>(
  name: string,
  students: readonly T[],
): T | null {
  if (name.trim() === '') {
    return null;
  }

  const pattern = namePattern(name);
  const tokens = normalize(name).split(' ');

  const full = students.filter(
    (s) =>
      pattern.test(normalize(`${s.firstName} ${s.lastName}`)) ||
      pattern.test(normalize(`${s.lastName} ${s.firstName}`)),
  );
  if (full.length === 1) {
    return full[0];
  }
  if (full.length > 1) {
    return null;
  }

  if (tokens.length < 2) {
    return null;
  }

  const firstPattern = namePattern(tokens[0]);
  const lastPattern = namePattern(tokens[tokens.length - 1]);
  const loose = students.filter((s) => {
    const first = normalize(s.firstName).split(' ')[0];
    const lastParts = normalize(s.lastName).split(' ');
    return firstPattern.test(first) && lastPattern.test(lastParts[lastParts.length - 1]);
  });

  return loose.length === 1 ? loose[0] : null;
}

/** Passt eine Fachbezeichnung der Übersicht ("LF3 B104") zum Fach des Kurses? */
export function subjectMatches(label: string, shortName: string, name: string): boolean {
  const first = normalize(label).split(' ')[0];
  const n = normalize(label);
  return (
    (shortName.trim() !== '' && first === normalize(shortName)) ||
    (name.trim() !== '' && n.startsWith(normalize(name)))
  );
}
