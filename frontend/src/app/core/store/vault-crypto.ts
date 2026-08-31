/**
 * Verschlüsselt den Datenbestand für die Ablage in einer Datei.
 *
 * Verfahren: aus dem Passwort wird per PBKDF2 (SHA-256) ein Schlüssel
 * abgeleitet, damit verschlüsselt AES-GCM den Inhalt. AES-GCM erkennt
 * nachträgliche Veränderungen an der Datei, ein falsches Passwort schlägt
 * deshalb sauber fehl statt Datenmüll zu liefern.
 *
 * Alles läuft über die WebCrypto-Schnittstelle des Browsers; die Daten
 * verlassen den Rechner nicht.
 */

import { Database } from './database';

/** Kennung, an der eine Datei dieser App zu erkennen ist. */
const FORMAT = 'sitzordnung-vault';

/** Aktuelle Fassung des Dateiformats. */
const VERSION = 1;

/**
 * Anzahl der PBKDF2-Runden. Hoch genug, um das Durchprobieren von Passwörtern
 * teuer zu machen, niedrig genug, um den Start nicht spürbar zu bremsen.
 */
const ITERATIONS = 310_000;

const SALT_BYTES = 16;
const IV_BYTES = 12;

interface VaultFile {
  format: typeof FORMAT;
  version: number;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  compression: 'gzip' | 'none';
  data: string;
}

/** Wird geworfen, wenn eine Datei nicht zu dieser App gehört oder beschädigt ist. */
export class VaultFormatError extends Error {}

/** Wird geworfen, wenn das Passwort nicht passt. */
export class VaultPasswordError extends Error {
  constructor() {
    super('Das Passwort ist falsch, oder die Datei wurde verändert.');
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  // In Blöcken, weil String.fromCharCode bei großen Datenmengen sonst
  // an die Grenze der Argumentliste stößt.
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Packt die Daten, sofern der Browser Kompression anbietet. */
async function compress(bytes: Uint8Array): Promise<{ bytes: Uint8Array; used: boolean }> {
  if (typeof CompressionStream === 'undefined') {
    return { bytes, used: false };
  }

  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  const packed = new Uint8Array(await new Response(stream).arrayBuffer());
  return { bytes: packed, used: true };
}

async function decompress(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Verschlüsselt den Datenbestand und gibt den Inhalt der Datei zurück. */
export async function encryptDatabase(database: Database, password: string): Promise<Blob> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt, ITERATIONS);

  const plain = new TextEncoder().encode(JSON.stringify(database));
  const packed = await compress(plain);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    packed.bytes as BufferSource,
  );

  const file: VaultFile = {
    format: FORMAT,
    version: VERSION,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: toBase64(salt) },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    compression: packed.used ? 'gzip' : 'none',
    data: toBase64(new Uint8Array(encrypted)),
  };

  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

/** Liest eine verschlüsselte Datei wieder ein. */
export async function decryptDatabase(content: string, password: string): Promise<Database> {
  let file: VaultFile;

  try {
    file = JSON.parse(content) as VaultFile;
  } catch {
    throw new VaultFormatError('Die Datei lässt sich nicht lesen.');
  }

  if (file?.format !== FORMAT) {
    throw new VaultFormatError('Die Datei gehört nicht zu dieser Anwendung.');
  }

  if (file.version > VERSION) {
    throw new VaultFormatError(
      'Die Datei stammt aus einer neueren Fassung der Anwendung und lässt sich hier nicht öffnen.',
    );
  }

  const key = await deriveKey(password, fromBase64(file.kdf.salt), file.kdf.iterations);

  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(file.cipher.iv) as BufferSource },
      key,
      fromBase64(file.data) as BufferSource,
    );
  } catch {
    // AES-GCM unterscheidet nicht zwischen falschem Passwort und veränderter Datei.
    throw new VaultPasswordError();
  }

  const bytes =
    file.compression === 'gzip'
      ? await decompress(new Uint8Array(decrypted))
      : new Uint8Array(decrypted);

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as Database;
  } catch {
    throw new VaultFormatError('Der Inhalt der Datei ist beschädigt.');
  }
}
