/**
 * Die Belegung eines Sitzplans - wer auf welchem Platz sitzt - und was sich
 * damit anstellen lässt: umsetzen, tauschen, auffüllen, neu setzen. Alles
 * reine Funktionen, die eine neue Belegung liefern statt die alte zu ändern.
 */

import { Seat } from '../../core/models';

/** Woher ein gezogener Schüler kommt bzw. wohin er fällt. */
export type DropTarget = { kind: 'pool' } | { kind: 'seat'; row: number; column: number };

/** Die Belegung des Rasters: „Zeile:Spalte“ -> Schüler-Id. */
export type Placement = ReadonlyMap<string, number>;

/** Reihen und Spalten eines Sitzplans liegen zwischen 1 und 20. */
const MAX_GRID_SIZE = 20;

export function seatKey(row: number, column: number): string {
  return `${row}:${column}`;
}

export function placementOf(seats: readonly Seat[]): Placement {
  return new Map(seats.map((s) => [seatKey(s.row, s.column), s.studentId]));
}

export function seatsOf(placement: Placement): Seat[] {
  return [...placement.entries()].map(([key, studentId]) => {
    const [row, column] = key.split(':').map(Number);
    return { studentId, row, column };
  });
}

/**
 * Setzt einen Schüler um. Sitzt auf dem Zielplatz schon jemand, tauschen die
 * beiden; in die Liste „Ohne Platz“ gezogen, wird der Platz frei. Liefert
 * null, wenn der Schüler auf seinen eigenen Platz gefallen ist.
 */
export function moveStudent(
  placement: Placement,
  studentId: number,
  from: DropTarget,
  to: DropTarget,
): Placement | null {
  if (
    from.kind === 'seat' &&
    to.kind === 'seat' &&
    from.row === to.row &&
    from.column === to.column
  ) {
    return null;
  }

  const next = new Map(placement);
  const fromKey = from.kind === 'seat' ? seatKey(from.row, from.column) : null;

  if (to.kind === 'pool') {
    if (fromKey) {
      next.delete(fromKey);
    }
    return next;
  }

  const toKey = seatKey(to.row, to.column);
  const occupant = next.get(toKey);
  next.set(toKey, studentId);

  if (fromKey) {
    if (occupant !== undefined && occupant !== studentId) {
      next.set(fromKey, occupant);
    } else {
      next.delete(fromKey);
    }
  }

  return next;
}

/** Das Ergebnis, wenn Schüler auf Plätze verteilt werden. */
export interface Seating {
  placement: Placement;
  /** So viele Schüler haben keinen Platz mehr gefunden. */
  left: number;
}

/** Verteilt alle, die noch nicht sitzen, der Reihe nach auf die freien Plätze. */
export function fillFreeSeats(
  placement: Placement,
  studentIds: readonly number[],
  rows: number,
  columns: number,
): Seating {
  const next = new Map(placement);
  const taken = new Set(next.values());
  const queue = studentIds.filter((id) => !taken.has(id));

  for (let row = 0; row < rows && queue.length; row++) {
    for (let column = 0; column < columns && queue.length; column++) {
      const key = seatKey(row, column);
      if (!next.has(key)) {
        next.set(key, queue.shift()!);
      }
    }
  }

  return { placement: next, left: queue.length };
}

/** Setzt alle neu - in der gegebenen Reihenfolge, Reihe für Reihe von vorn. */
export function seatInOrder(studentIds: readonly number[], rows: number, columns: number): Seating {
  const next = new Map<string, number>();
  let index = 0;
  for (let row = 0; row < rows && index < studentIds.length; row++) {
    for (let column = 0; column < columns && index < studentIds.length; column++) {
      next.set(seatKey(row, column), studentIds[index++]);
    }
  }

  return { placement: next, left: studentIds.length - index };
}

/** Räumt die Plätze frei, die außerhalb des Rasters liegen. */
export function cropToGrid(
  placement: Placement,
  rows: number,
  columns: number,
): { placement: Placement; dropped: number } {
  const next = new Map(placement);
  let dropped = 0;
  for (const seat of seatsOf(placement)) {
    if (seat.row >= rows || seat.column >= columns) {
      next.delete(seatKey(seat.row, seat.column));
      dropped++;
    }
  }

  return { placement: next, dropped };
}

/** Begrenzt eine eingegebene Zahl von Reihen oder Spalten auf 1 bis 20. */
export function clampGridSize(value: number): number {
  return Math.min(MAX_GRID_SIZE, Math.max(1, Math.round(value) || 1));
}

/** Mischt nach Fisher-Yates: jede Reihenfolge ist gleich wahrscheinlich. */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Der erste freie Name „Sitzordnung n“. */
export function nextPlanName(taken: Iterable<string>): string {
  const names = new Set(taken);
  let n = 1;
  while (names.has(`Sitzordnung ${n}`)) {
    n++;
  }
  return `Sitzordnung ${n}`;
}
