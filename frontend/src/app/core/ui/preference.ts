/**
 * Vorlieben, die je Gerät gelten - Darstellung, zuletzt gewählte Ansicht -
 * liegen im Browser, nicht im Datenbestand. Ist der Speicher gesperrt (etwa
 * im privaten Fenster), gilt die Wahl eben nur bis zum Neuladen.
 */

export function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ohne Speicher gilt die Wahl nur bis zum Neuladen.
  }
}
