/**
 * Ein Farbton (0-359) aus dem Fachnamen. Gleiches Fach, gleiche Farbe -
 * ohne dass dafür etwas im Datenbestand stehen muss.
 */
export function subjectHue(name: string): number {
  let hash = 0;
  for (const char of name.toLowerCase()) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return hash % 360;
}
