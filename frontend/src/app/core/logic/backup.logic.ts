/** Nach so vielen Tagen erinnert die App an eine neue Sicherungskopie. */
export const BACKUP_INTERVAL_DAYS = 7;

/**
 * Ist eine Sicherungskopie fällig? Liefert null, wenn nicht - sonst, wie
 * viele Tage die letzte her ist (null-Tage: noch nie). Ein leerer Bestand
 * braucht keine Erinnerung.
 */
export function backupDue(
  lastBackupAt: string | null,
  now: Date,
  hasData: boolean,
): { days: number | null } | null {
  if (!hasData) {
    return null;
  }
  if (!lastBackupAt) {
    return { days: null };
  }
  const days = Math.floor((now.getTime() - new Date(lastBackupAt).getTime()) / 86_400_000);
  return days >= BACKUP_INTERVAL_DAYS ? { days } : null;
}
