/** Der Vermerk über die letzte Sicherungskopie im Bestand. */

import { StorePart } from './store-part';

export class SettingsStore extends StorePart {
  /** Wann zuletzt eine Sicherungskopie gezogen wurde - null: noch nie. */
  getLastBackupAt(): string | null {
    return this.db.settings.lastBackupAt ?? null;
  }

  /** Vermerkt eine gerade gezogene Sicherungskopie (steht in der Datei, gilt für alle Geräte). */
  markBackup(): void {
    this.db.settings.lastBackupAt = this.now().toISOString();
    this.changed();
  }
}
