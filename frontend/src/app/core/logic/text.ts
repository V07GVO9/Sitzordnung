/** Kleine Helfer für Texte, die an mehreren Stellen gebraucht werden. */

/** Schneidet Leerraum an den Rändern ab - bleibt nichts übrig, wird daraus null. */
export function trimToNull(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

/** Eine Zahl mit Komma statt Punkt, wie im Deutschen üblich: aus 2.5 wird „2,5“. */
export function germanNumber(value: number): string {
  return String(value).replace('.', ',');
}

/**
 * Macht aus einem Namen ein Stück Dateiname: Alles außer Buchstaben und
 * Ziffern wird zum Bindestrich, an den Rändern fallen die Striche weg.
 */
export function fileNamePart(value: string): string {
  return value
    .split('')
    .map((c) => (/[\p{L}\p{N}]/u.test(c) ? c : '-'))
    .join('')
    .replace(/^-+|-+$/g, '');
}
