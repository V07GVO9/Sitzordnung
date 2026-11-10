/**
 * Zwischenspeicher im Browser (IndexedDB). Er dient als Netz gegen einen
 * Absturz oder ein versehentlich geschlossenes Fenster - die eigentliche
 * Ablage bleibt die verschlüsselte Datei.
 *
 * Auch hier liegen die Daten verschlüsselt: der Zwischenspeicher wird mit
 * demselben Passwort gesichert wie die Datei.
 */

const DB_NAME = 'sitzordnung';
const DB_VERSION = 1;
const STORE = 'vault';
const KEY = 'autosave';

export interface AutosaveEntry {
  /** Der verschlüsselte Inhalt - dasselbe Format wie in der Datei. */
  content: string;
  /** Wann zuletzt gespeichert wurde, als ISO-8601-Zeichenkette. */
  savedAt: string;
  /** Name der zugehörigen Datei - je Datei gibt es einen eigenen Zwischenstand. */
  fileName: string | null;
  /** Stand der Zwischenstand Änderungen, die noch in keiner Datei stehen? */
  dirty?: boolean;
  /**
   * Prüfsumme der Datei, auf der die Änderungen aufsetzen. Weicht die Datei
   * beim nächsten Öffnen davon ab, wurde sie inzwischen anderswo gespeichert.
   */
  baseHash?: string | null;
}

/** Je Datei ein eigener Platz, damit ein Zwischenstand nicht den einer anderen Datei verdrängt. */
function autosaveKey(fileName: string | null): string {
  return `${KEY}:${fileName ?? ''}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = action(transaction.objectStore(STORE));

        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      }),
  );
}

export async function readAutosave(fileName: string | null): Promise<AutosaveEntry | null> {
  try {
    const entry = await run<AutosaveEntry | undefined>('readonly', (s) =>
      s.get(autosaveKey(fileName)),
    );
    if (entry) {
      return entry;
    }
    // Ältere Versionen kannten nur einen einzigen Platz für alle Dateien.
    const legacy = await run<AutosaveEntry | undefined>('readonly', (s) => s.get(KEY));
    return legacy && legacy.fileName === fileName ? legacy : null;
  } catch {
    // Ein privates Fenster oder gesperrter Speicher darf die App nicht aufhalten.
    return null;
  }
}

export async function writeAutosave(entry: AutosaveEntry): Promise<void> {
  try {
    await run('readwrite', (s) => s.put(entry, autosaveKey(entry.fileName)));
    await clearLegacyAutosave(entry.fileName);
  } catch {
    // Siehe oben: der Zwischenspeicher ist eine Zugabe, kein Muss.
  }
}

export async function clearAutosave(fileName: string | null): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(autosaveKey(fileName)));
    await clearLegacyAutosave(fileName);
  } catch {
    // Nichts zu tun.
  }
}

/** Räumt den alten, gemeinsamen Platz ab - aber nur, wenn er zu dieser Datei gehört. */
async function clearLegacyAutosave(fileName: string | null): Promise<void> {
  const legacy = await run<AutosaveEntry | undefined>('readonly', (s) => s.get(KEY));
  if (legacy && legacy.fileName === fileName) {
    await run('readwrite', (s) => s.delete(KEY));
  }
}

// --- Gemerkter Bestand ------------------------------------------------------

const REMEMBERED_KEY = 'remembered';

/**
 * Der OneDrive-Bestand, den dieses Gerät beim Start von selbst öffnet.
 *
 * Das Passwort liegt nicht im Klartext hier, sondern mit einem Schlüssel
 * verschlüsselt, den der Browser nicht herausgibt (WebCrypto, nicht
 * exportierbar). Kopiert jemand den Speicher auf ein anderes Gerät, nützt
 * ihm das nichts. Wer dagegen an diesem entsperrten Gerät sitzt, kommt an
 * die Daten - deshalb nur auf eigenen Geräten verwenden.
 */
export interface RememberedEntry {
  fileId: string;
  fileName: string;
  key: CryptoKey;
  iv: Uint8Array;
  password: ArrayBuffer;
}

export async function readRemembered(): Promise<RememberedEntry | null> {
  try {
    return (
      (await run<RememberedEntry | undefined>('readonly', (s) => s.get(REMEMBERED_KEY))) ?? null
    );
  } catch {
    return null;
  }
}

export async function writeRemembered(entry: RememberedEntry): Promise<void> {
  await run('readwrite', (s) => s.put(entry, REMEMBERED_KEY));
}

export async function clearRemembered(): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(REMEMBERED_KEY));
  } catch {
    // Nichts zu tun.
  }
}

// --- Zuletzt benutzte Datei -------------------------------------------------

const LAST_FILE_KEY = 'lastFile';

/**
 * Der Griff auf die zuletzt benutzte Datei auf diesem Rechner (nur Chrome/Edge).
 * Er enthält keine Daten und kein Passwort, nur den Verweis auf die Datei.
 */
export async function readLastFileHandle<T>(): Promise<T | null> {
  try {
    return (await run<T | undefined>('readonly', (s) => s.get(LAST_FILE_KEY))) ?? null;
  } catch {
    return null;
  }
}

export async function writeLastFileHandle(handle: unknown): Promise<void> {
  try {
    await run('readwrite', (s) => s.put(handle, LAST_FILE_KEY));
  } catch {
    // Lässt sich der Griff nicht ablegen, wird beim nächsten Mal wieder gesucht.
  }
}

export async function clearLastFileHandle(): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(LAST_FILE_KEY));
  } catch {
    // Nichts zu tun.
  }
}
