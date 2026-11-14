/**
 * Unterrichtsfreie Tage in Niedersachsen: gesetzliche Feiertage (berechnet)
 * und Schulferien inkl. beweglicher Ferientage (Tabelle, Stand: KMK /
 * Niedersächsisches Kultusministerium, Schuljahre 2024/25 bis 2029/30).
 *
 * Die Ferientabelle muss für spätere Schuljahre ergänzt werden.
 */

/** Ferien und schulfreie Einzeltage, jeweils von–bis einschließlich. */
const SCHOOL_HOLIDAYS_NI: ReadonlyArray<readonly [from: string, to: string, name: string]> = [
  ['2024-06-24', '2024-08-03', 'Sommerferien'],
  ['2024-10-04', '2024-10-19', 'Herbstferien'],
  ['2024-11-01', '2024-11-01', 'Schulfrei (Tag nach dem Reformationstag)'],
  ['2024-12-23', '2025-01-04', 'Weihnachtsferien'],
  ['2025-02-03', '2025-02-04', 'Halbjahresferien'],
  ['2025-04-07', '2025-04-19', 'Osterferien'],
  ['2025-04-30', '2025-04-30', 'Schulfrei (Kirchentag)'],
  ['2025-05-02', '2025-05-02', 'Schulfrei (Tag nach dem 1. Mai)'],
  ['2025-05-30', '2025-05-30', 'Schulfrei (Tag nach Himmelfahrt)'],
  ['2025-06-10', '2025-06-10', 'Pfingstferien'],
  ['2025-07-03', '2025-08-13', 'Sommerferien'],
  ['2025-10-13', '2025-10-25', 'Herbstferien'],
  ['2025-12-22', '2026-01-05', 'Weihnachtsferien'],
  ['2026-02-02', '2026-02-03', 'Halbjahresferien'],
  ['2026-03-23', '2026-04-07', 'Osterferien'],
  ['2026-05-15', '2026-05-15', 'Schulfrei (Tag nach Himmelfahrt)'],
  ['2026-05-26', '2026-05-26', 'Pfingstferien'],
  ['2026-07-02', '2026-08-12', 'Sommerferien'],
  ['2026-10-12', '2026-10-24', 'Herbstferien'],
  ['2026-12-23', '2027-01-09', 'Weihnachtsferien'],
  ['2027-02-01', '2027-02-02', 'Halbjahresferien'],
  ['2027-03-22', '2027-04-03', 'Osterferien'],
  ['2027-05-07', '2027-05-07', 'Schulfrei (Tag nach Himmelfahrt)'],
  ['2027-05-18', '2027-05-18', 'Pfingstferien'],
  ['2027-07-08', '2027-08-18', 'Sommerferien'],
  ['2027-10-16', '2027-10-30', 'Herbstferien'],
  ['2027-12-23', '2028-01-08', 'Weihnachtsferien'],
  ['2028-01-31', '2028-02-01', 'Halbjahresferien'],
  ['2028-04-10', '2028-04-22', 'Osterferien'],
  ['2028-05-26', '2028-05-26', 'Schulfrei (Tag nach Himmelfahrt)'],
  ['2028-06-06', '2028-06-06', 'Pfingstferien'],
  ['2028-07-20', '2028-08-30', 'Sommerferien'],
  ['2028-10-02', '2028-10-02', 'Schulfrei (Tag vor dem 3. Oktober)'],
  ['2028-10-23', '2028-11-04', 'Herbstferien'],
  ['2028-12-27', '2029-01-06', 'Weihnachtsferien'],
  ['2029-02-01', '2029-02-02', 'Halbjahresferien'],
  ['2029-03-19', '2029-04-03', 'Osterferien'],
  ['2029-04-30', '2029-04-30', 'Schulfrei (Tag vor dem 1. Mai)'],
  ['2029-05-11', '2029-05-11', 'Schulfrei (Tag nach Himmelfahrt)'],
  ['2029-05-22', '2029-05-22', 'Pfingstferien'],
  ['2029-07-19', '2029-08-29', 'Sommerferien'],
  ['2029-10-04', '2029-10-05', 'Schulfrei (Tage nach dem 3. Oktober)'],
  ['2029-10-22', '2029-11-02', 'Herbstferien'],
  ['2029-12-21', '2030-01-05', 'Weihnachtsferien'],
  ['2030-01-31', '2030-02-01', 'Halbjahresferien'],
  ['2030-04-08', '2030-04-23', 'Osterferien'],
  ['2030-05-31', '2030-05-31', 'Schulfrei (Tag nach Himmelfahrt)'],
  ['2030-06-11', '2030-06-11', 'Pfingstferien'],
  ['2030-07-11', '2030-08-21', 'Sommerferien'],
];

/** Ostersonntag nach der Gaußschen Osterformel (Anonymer Gregorianischer Algorithmus). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 12);
}

function key(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

function shifted(base: Date, days: number): string {
  const date = new Date(base);
  date.setDate(date.getDate() + days);
  return key(date);
}

const holidayCache = new Map<number, Map<string, string>>();

/** Die gesetzlichen Feiertage in Niedersachsen für ein Jahr, je `YYYY-MM-DD`. */
export function publicHolidaysNI(year: number): Map<string, string> {
  const cached = holidayCache.get(year);
  if (cached) {
    return cached;
  }
  const easter = easterSunday(year);
  const map = new Map<string, string>([
    [`${year}-01-01`, 'Neujahr'],
    [shifted(easter, -2), 'Karfreitag'],
    [shifted(easter, 1), 'Ostermontag'],
    [`${year}-05-01`, 'Tag der Arbeit'],
    [shifted(easter, 39), 'Christi Himmelfahrt'],
    [shifted(easter, 50), 'Pfingstmontag'],
    [`${year}-10-03`, 'Tag der Deutschen Einheit'],
    [`${year}-10-31`, 'Reformationstag'],
    [`${year}-12-25`, '1. Weihnachtstag'],
    [`${year}-12-26`, '2. Weihnachtstag'],
  ]);
  holidayCache.set(year, map);
  return map;
}

/**
 * Warum an diesem Tag (`YYYY-MM-DD`) in Niedersachsen kein Unterricht ist -
 * Name des Feiertags bzw. der Ferien - oder `null` an einem Schultag.
 * Feiertage haben Vorrang vor Ferien.
 */
export function freeDayReason(dateKey: string): string | null {
  const holiday = publicHolidaysNI(Number(dateKey.slice(0, 4))).get(dateKey);
  if (holiday) {
    return holiday;
  }
  for (const [from, to, name] of SCHOOL_HOLIDAYS_NI) {
    if (dateKey >= from && dateKey <= to) {
      return name;
    }
  }
  return null;
}
