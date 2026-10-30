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
const HANDLE_KEY = 'lastFile';

export interface AutosaveEntry {
  /** Der verschlüsselte Inhalt - dasselbe Format wie in der Datei. */
  content: string;
  /** Wann zuletzt gespeichert wurde, als ISO-8601-Zeichenkette. */
  savedAt: string;
  /** Name der zugehörigen Datei, nur zur Anzeige. */
  fileName: string | null;
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

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T> {
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

export async function readAutosave(): Promise<AutosaveEntry | null> {
  try {
    return (await run<AutosaveEntry | undefined>('readonly', (s) => s.get(KEY))) ?? null;
  } catch {
    // Ein privates Fenster oder gesperrter Speicher darf die App nicht aufhalten.
    return null;
  }
}

export async function writeAutosave(entry: AutosaveEntry): Promise<void> {
  try {
    await run('readwrite', (s) => s.put(entry, KEY));
  } catch {
    // Siehe oben: der Zwischenspeicher ist eine Zugabe, kein Muss.
  }
}

export async function clearAutosave(): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(KEY));
  } catch {
    // Nichts zu tun.
  }
}

/**
 * Der Griff auf die zuletzt benutzte Datei (nur Chrome/Edge). Er enthält keine
 * Daten, nur den Verweis - der Inhalt bleibt verschlüsselt in der Datei.
 */
export async function readFileHandle<T>(): Promise<T | null> {
  try {
    return (await run<T | undefined>('readonly', (s) => s.get(HANDLE_KEY))) ?? null;
  } catch {
    return null;
  }
}

export async function writeFileHandle(handle: unknown): Promise<void> {
  try {
    await run('readwrite', (s) => s.put(handle, HANDLE_KEY));
  } catch {
    // Lässt sich der Griff nicht ablegen, wird beim nächsten Mal wieder gesucht.
  }
}

export async function clearFileHandle(): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(HANDLE_KEY));
  } catch {
    // Nichts zu tun.
  }
}
