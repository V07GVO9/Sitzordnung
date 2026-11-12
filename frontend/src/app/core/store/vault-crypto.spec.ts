/** Verschlüsselung der Datei. */

import { createEmptyDatabase } from './database';
import {
  ITERATIONS,
  VaultFormatError,
  VaultPasswordError,
  decryptDatabase,
  encryptDatabase,
} from './vault-crypto';

describe('vault-crypto', () => {
  it('liest zurück, was es geschrieben hat', async () => {
    const database = createEmptyDatabase();
    database.schoolClasses.push({ id: 1, name: '10a' });

    const blob = await encryptDatabase(database, 'geheimes-passwort');
    const restored = await decryptDatabase(await blob.text(), 'geheimes-passwort');

    expect(restored.schoolClasses).toEqual([{ id: 1, name: '10a' }]);
    expect(restored.gradeScales.length).toBe(1);
  });

  it('lehnt ein falsches Passwort ab', async () => {
    const blob = await encryptDatabase(createEmptyDatabase(), 'richtig-und-lang');

    await expectAsync(decryptDatabase(await blob.text(), 'falsch-und-lang')).toBeRejectedWithError(
      VaultPasswordError,
    );
  });

  it('merkt, wenn an der Datei etwas verändert wurde', async () => {
    const blob = await encryptDatabase(createEmptyDatabase(), 'geheimes-passwort');
    const file = JSON.parse(await blob.text());

    // Ein einzelnes Zeichen im verschlüsselten Teil austauschen.
    file.data = (file.data[0] === 'A' ? 'B' : 'A') + file.data.slice(1);

    await expectAsync(
      decryptDatabase(JSON.stringify(file), 'geheimes-passwort'),
    ).toBeRejectedWithError(VaultPasswordError);
  });

  it('legt den Klartext nicht in der Datei ab', async () => {
    const database = createEmptyDatabase();
    database.students.push({
      id: 1,
      firstName: 'Anna',
      lastName: 'Musterfrau',
      schoolClassId: 1,
      photo: null,
    });

    const content = await (await encryptDatabase(database, 'geheimes-passwort')).text();

    expect(content).not.toContain('Musterfrau');
    expect(content).not.toContain('Anna');
  });

  it('weist eine fremde Datei ab', async () => {
    await expectAsync(
      decryptDatabase(JSON.stringify({ hallo: 'welt' }), 'egal'),
    ).toBeRejectedWithError(VaultFormatError);
  });

  it('weist unlesbaren Inhalt ab', async () => {
    await expectAsync(decryptDatabase('kein json', 'egal')).toBeRejectedWithError(VaultFormatError);
  });

  it('schreibt neue Dateien mit mindestens 600 000 PBKDF2-Runden', async () => {
    const blob = await encryptDatabase(createEmptyDatabase(), 'geheimes-passwort');
    const file = JSON.parse(await blob.text());

    expect(ITERATIONS).toBeGreaterThanOrEqual(600_000);
    expect(file.kdf.iterations).toBe(ITERATIONS);
  });

  it('öffnet ältere Dateien mit 310 000 Runden weiterhin', async () => {
    const password = 'geheimes-passwort';
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const material = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 310_000, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    );
    const database = createEmptyDatabase();
    database.schoolClasses.push({ id: 7, name: 'KDM11' });
    const data = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(JSON.stringify(database)),
    );
    const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
    const content = JSON.stringify({
      format: 'sitzordnung-vault',
      version: 1,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 310_000, salt: b64(salt) },
      cipher: { name: 'AES-GCM', iv: b64(iv) },
      compression: 'none',
      data: b64(new Uint8Array(data)),
    });

    const restored = await decryptDatabase(content, password);
    expect(restored.schoolClasses).toEqual([{ id: 7, name: 'KDM11' }]);
  });

  it('weist eine Datei mit verdächtig wenigen Runden ab', async () => {
    const blob = await encryptDatabase(createEmptyDatabase(), 'geheimes-passwort');
    const file = JSON.parse(await blob.text());
    file.kdf.iterations = 1;

    await expectAsync(
      decryptDatabase(JSON.stringify(file), 'geheimes-passwort'),
    ).toBeRejectedWithError(VaultFormatError);
  });
});
