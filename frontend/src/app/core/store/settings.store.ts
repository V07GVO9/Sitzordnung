/** Die Einstellungen im Bestand - und der Vermerk über die letzte Sicherungskopie. */

import { AppError } from '../app-error';
import { AppSettings } from '../models';
import { StorePart } from './store-part';

export class SettingsStore extends StorePart {
  getSettings(): AppSettings {
    const { toleranceMinutes, allowRatingOutsideLesson } = this.db.settings;
    return { toleranceMinutes, allowRatingOutsideLesson };
  }

  saveSettings(settings: AppSettings): AppSettings {
    if (settings.toleranceMinutes < 0 || settings.toleranceMinutes > 120) {
      throw new AppError('Die Kulanzzeit muss zwischen 0 und 120 Minuten liegen.');
    }

    this.db.settings = {
      ...this.db.settings,
      toleranceMinutes: settings.toleranceMinutes,
      allowRatingOutsideLesson: settings.allowRatingOutsideLesson,
    };
    this.changed();

    return this.getSettings();
  }

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
