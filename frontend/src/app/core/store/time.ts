/**
 * Uhrzeiten und Datumsangaben. Die App rechnet bewusst in Ortszeit - der
 * Stundenplan der Lehrkraft steht in ihrer Zeitzone, nicht in UTC.
 */

/** Wandelt `HH:mm` in Minuten seit Mitternacht um. */
export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/** Prüft, ob die Zeichenkette eine gültige Uhrzeit im Format `HH:mm` ist. */
export function isValidTime(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  const [hours, minutes] = value.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

/** Der Tag als `YYYY-MM-DD` in Ortszeit - nicht über toISOString, das rechnet in UTC. */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Die Uhrzeit als `HH:mm` in Ortszeit. */
export function toTimeKey(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/** `2026-08-31` wird zu `31.08.2026` - so erwartet es Excel im deutschen Format. */
export function formatDateGerman(dateKey: string): string {
  const [year, month, day] = dateKey.split('-');
  return `${day}.${month}.${year}`;
}

/**
 * Liefert die aktuelle Zeit. In Tests lässt sich die Uhr fest einstellen -
 * das war früher die Aufgabe von IClock im Backend.
 */
export class Clock {
  private fixed: Date | null = null;

  now(): Date {
    return this.fixed ? new Date(this.fixed) : new Date();
  }

  /** Nur für Tests: stellt die Uhr auf einen festen Zeitpunkt.  */
  setFixed(date: Date | null): void {
    this.fixed = date;
  }
}
