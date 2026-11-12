/**
 * Eine Kopie der Menge, in der der Wert enthalten ist (`on`) oder fehlt -
 * für Auswahllisten mit Häkchen, deren Stand in einem Signal liegt.
 */
export function withToggled<T>(set: ReadonlySet<T>, value: T, on: boolean): Set<T> {
  const next = new Set(set);
  if (on) {
    next.add(value);
  } else {
    next.delete(value);
  }
  return next;
}
