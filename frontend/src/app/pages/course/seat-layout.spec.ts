import {
  DropTarget,
  clampGridSize,
  cropToGrid,
  fillFreeSeats,
  moveStudent,
  nextPlanName,
  placementOf,
  seatInOrder,
  seatsOf,
  shuffled,
} from './seat-layout';

const seat = (row: number, column: number): DropTarget => ({ kind: 'seat', row, column });
const pool: DropTarget = { kind: 'pool' };

/** Die Belegung als lesbares Objekt, etwa { '0:1': 7 }. */
const view = (placement: ReadonlyMap<string, number> | null) =>
  placement ? Object.fromEntries(placement) : null;

describe('Sitzplan - umsetzen', () => {
  const start = placementOf([
    { studentId: 1, row: 0, column: 0 },
    { studentId: 2, row: 0, column: 1 },
  ]);

  it('setzt auf einen freien Platz um', () => {
    expect(view(moveStudent(start, 1, seat(0, 0), seat(1, 1)))).toEqual({ '0:1': 2, '1:1': 1 });
  });

  it('tauscht, wenn auf dem Zielplatz schon jemand sitzt', () => {
    expect(view(moveStudent(start, 1, seat(0, 0), seat(0, 1)))).toEqual({ '0:0': 2, '0:1': 1 });
  });

  it('macht den Platz frei, wenn der Schüler in die Liste gezogen wird', () => {
    expect(view(moveStudent(start, 2, seat(0, 1), pool))).toEqual({ '0:0': 1 });
  });

  it('setzt aus der Liste auf einen Platz - wer dort saß, wandert in die Liste', () => {
    expect(view(moveStudent(start, 3, pool, seat(1, 0)))).toEqual({ '0:0': 1, '0:1': 2, '1:0': 3 });
    expect(view(moveStudent(start, 3, pool, seat(0, 0)))).toEqual({ '0:0': 3, '0:1': 2 });
  });

  it('meldet, wenn sich nichts ändert', () => {
    expect(moveStudent(start, 1, seat(0, 0), seat(0, 0))).toBeNull();
  });

  it('lässt die ursprüngliche Belegung unangetastet', () => {
    moveStudent(start, 1, seat(0, 0), pool);
    expect(view(start)).toEqual({ '0:0': 1, '0:1': 2 });
  });
});

describe('Sitzplan - verteilen', () => {
  it('füllt nur freie Plätze und nur mit denen, die noch nicht sitzen', () => {
    const start = placementOf([{ studentId: 2, row: 0, column: 1 }]);
    const result = fillFreeSeats(start, [1, 2, 3], 1, 3);

    expect(view(result.placement)).toEqual({ '0:0': 1, '0:1': 2, '0:2': 3 });
    expect(result.left).toBe(0);
  });

  it('zählt, wer keinen Platz mehr findet', () => {
    expect(fillFreeSeats(new Map(), [1, 2, 3], 1, 2).left).toBe(1);
    expect(seatInOrder([1, 2, 3, 4, 5], 2, 2).left).toBe(1);
  });

  it('setzt alle neu, Reihe für Reihe von vorn', () => {
    expect(view(seatInOrder([5, 6, 7], 2, 2).placement)).toEqual({ '0:0': 5, '0:1': 6, '1:0': 7 });
  });

  it('räumt Plätze außerhalb eines kleineren Rasters frei', () => {
    const start = placementOf([
      { studentId: 1, row: 0, column: 0 },
      { studentId: 2, row: 0, column: 3 },
      { studentId: 3, row: 2, column: 0 },
    ]);
    const result = cropToGrid(start, 2, 2);

    expect(view(result.placement)).toEqual({ '0:0': 1 });
    expect(result.dropped).toBe(2);
  });

  it('wandelt Plätze in eine Belegung und zurück', () => {
    const seats = [
      { studentId: 4, row: 1, column: 2 },
      { studentId: 9, row: 0, column: 0 },
    ];
    expect(seatsOf(placementOf(seats))).toEqual(seats);
  });
});

describe('Sitzplan - Kleinigkeiten', () => {
  it('begrenzt Reihen und Spalten auf 1 bis 20', () => {
    expect(clampGridSize(0)).toBe(1);
    expect(clampGridSize(NaN)).toBe(1);
    expect(clampGridSize(3.4)).toBe(3);
    expect(clampGridSize(99)).toBe(20);
  });

  it('mischt, ohne jemanden zu verlieren', () => {
    const mixed = shuffled([1, 2, 3, 4, 5], () => 0);

    expect(mixed).not.toEqual([1, 2, 3, 4, 5]);
    expect([...mixed].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('findet den ersten freien Namen', () => {
    expect(nextPlanName([])).toBe('Sitzordnung 1');
    expect(nextPlanName(['Sitzordnung 1', 'Frontal', 'Sitzordnung 2'])).toBe('Sitzordnung 3');
  });
});
