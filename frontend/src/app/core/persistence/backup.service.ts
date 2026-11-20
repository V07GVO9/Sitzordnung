/**
 * Sicherungskopien in OneDrive - und die zentrale Prüfung, wann die nächste
 * fällig ist.
 *
 * Maßgeblich ist das Erstellungsdatum der neuesten Kopie im OneDrive-Ordner
 * für Sicherungskopien. Weil alle Geräte denselben Ordner lesen, erinnert ein
 * Gerät nicht mehr, sobald irgendein Gerät eine aktuelle Kopie abgelegt hat.
 *
 * Gefragt wird OneDrive sparsam: einmal beim Öffnen eines Bestands und danach
 * nur, wenn die App wieder in den Vordergrund kommt, eine Erinnerung fällig
 * wäre und die letzte Abfrage länger als eine Stunde her ist (vielleicht hat
 * inzwischen ein anderes Gerät gesichert). Ist eine Kopie noch frisch, gibt
 * es nichts nachzufragen - bis zum Fälligkeitstag kann sich daran nichts ändern.
 */

import { DOCUMENT, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { BACKUP_INTERVAL_DAYS, backupDue } from '../logic/backup.logic';
import { toDateKey } from '../logic/time';
import { LocalStore } from '../store/local-store';
import { readPreference, writePreference } from '../ui/preference';
import { OneDriveService } from './onedrive.service';
import { VaultService } from './vault.service';

/** Tag, an dem „Später“ gewählt wurde - dann erst morgen wieder erinnern (je Gerät). */
const SNOOZE_KEY = 'sitzordnung.sicherung-spaeter';

/** Frühestens nach so langer Zeit wird der Sicherungsordner erneut abgefragt. */
const RECHECK_MS = 60 * 60_000;

@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly store = inject(LocalStore);
  private readonly vault = inject(VaultService);
  private readonly oneDrive = inject(OneDriveService);

  /**
   * Erstellungszeit der neuesten Sicherungskopie. null: Es gibt noch keine,
   * undefined: noch nicht geprüft - dann erinnert die App (noch) nicht.
   */
  private readonly lastBackupAt = signal<string | null | undefined>(undefined);

  private readonly snoozedOn = signal(readPreference(SNOOZE_KEY));

  private lastCheckAt = 0;
  private checking: Promise<void> | null = null;

  constructor() {
    // Bei jedem geöffneten Bestand einmal nachsehen.
    effect(() => {
      const open = this.store.isOpen();
      this.vault.fileName();
      untracked(() => {
        if (open) {
          void this.refresh();
        } else {
          this.lastBackupAt.set(undefined);
        }
      });
    });

    const doc = inject(DOCUMENT);
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'visible' && this.shouldRecheck()) {
        void this.refresh();
      }
    });
  }

  /**
   * Ist eine Sicherungskopie fällig? null: nein (oder heute auf „Später“
   * geschoben) - sonst, wie viele Tage die letzte her ist.
   */
  due(hasData: boolean): { days: number | null } | null {
    const last = this.lastBackupAt();
    if (last === undefined || this.snoozedOn() === toDateKey(new Date())) {
      return null;
    }
    return backupDue(last, new Date(), hasData);
  }

  /** Legt eine Sicherungskopie in OneDrive ab - ohne Rückfrage nach dem Ort. */
  async createBackup(): Promise<void> {
    const createdAt = await this.vault.saveBackupCopy();
    this.lastBackupAt.set(createdAt);
    this.lastCheckAt = Date.now();
  }

  /** „Später“: heute auf diesem Gerät nicht mehr erinnern. */
  snooze(): void {
    const today = toDateKey(new Date());
    this.snoozedOn.set(today);
    writePreference(SNOOZE_KEY, today);
  }

  /** Neu fragen nur, wenn sonst eine Erinnerung erschiene - und nicht ständig. */
  private shouldRecheck(): boolean {
    const last = this.lastBackupAt();
    if (!this.store.isOpen() || last === undefined) {
      return false;
    }
    const wouldRemind =
      last === null || Date.now() - Date.parse(last) >= BACKUP_INTERVAL_DAYS * 86_400_000;
    return wouldRemind && Date.now() - this.lastCheckAt >= RECHECK_MS;
  }

  /** Liest die neueste Kopie aus dem OneDrive-Ordner; laufende Abfragen werden geteilt. */
  private refresh(): Promise<void> {
    this.checking ??= (async () => {
      let last: string | null;
      try {
        last = await this.oneDrive.latestBackupAt();
      } catch {
        // OneDrive gerade nicht erreichbar oder nicht angemeldet: Dann zählt der
        // Vermerk in der Datei, den jede Sicherung mitschreibt.
        last = this.store.settings.getLastBackupAt();
      }
      try {
        // Inzwischen geschlossen? Dann gilt das Ergebnis nicht mehr.
        if (this.store.isOpen()) {
          this.lastBackupAt.set(last);
        }
      } finally {
        this.lastCheckAt = Date.now();
        this.checking = null;
      }
    })();
    return this.checking;
  }
}
