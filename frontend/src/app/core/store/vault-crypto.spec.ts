/** Verschlüsselung der Datei. */

import { createEmptyDatabase } from './database';
import {
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

    await expectAsync(
      decryptDatabase(await blob.text(), 'falsch-und-lang'),
    ).toBeRejectedWithError(VaultPasswordError);
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
    await expectAsync(decryptDatabase('kein json', 'egal')).toBeRejectedWithError(
      VaultFormatError,
    );
  });
});
