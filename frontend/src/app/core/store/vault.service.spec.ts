/**
 * Das selbsttätige Speichern. Der Dateidialog lässt sich im Test nicht öffnen,
 * deshalb wird der Dateigriff untergeschoben - der Weg dahinter ist derselbe,
 * den ein Browser mit File System Access API nimmt.
 */

import { TestBed } from '@angular/core/testing';
import { FileHandle } from './file-system';
import { LocalStore } from './local-store';
import { decryptDatabase } from './vault-crypto';
import { VaultService } from './vault.service';

const PASSWORT = 'TestPasswort123';

/** Ein Dateigriff, der das Geschriebene behält, statt es auf die Platte zu legen. */
class FakeHandle implements FileHandle {
  readonly name = 'test.sitzordnung';

  /** Jede abgeschlossene Schreibung, in der Reihenfolge ihres Auftretens. */
  readonly geschrieben: Blob[] = [];

  /** Lässt die nächste Schreibung scheitern. */
  faelltAus = false;

  async getFile(): Promise<File> {
    const letzte = this.geschrieben[this.geschrieben.length - 1];
    return new File([letzte ?? new Blob()], this.name);
  }

  async createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> {
    if (this.faelltAus) {
      throw new Error('Die Datei ist nicht erreichbar.');
    }

    let puffer: Blob | null = null;
    return {
      write: async (data: Blob) => {
        puffer = data;
      },
      close: async () => {
        if (puffer) {
          this.geschrieben.push(puffer);
        }
      },
    };
  }
}

/** Wartet, bis der Entprellzeitgeber gelaufen und die Schreibung durch ist. */
async function warteAufAutosave(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 2_400));
}

describe('VaultService - selbsttätiges Speichern', () => {
  let vault: VaultService;
  let store: LocalStore;
  let handle: FakeHandle;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    vault = TestBed.inject(VaultService);
    store = TestBed.inject(LocalStore);
    handle = new FakeHandle();

    await vault.startWith(PASSWORT, handle);
  });

  afterEach(async () => {
    await vault.closeVault();
  });

  it('meldet, dass von allein gespeichert wird, sobald eine Datei da ist', () => {
    expect(vault.speichertVonAllein()).toBeTrue();
    expect(vault.brauchtHandarbeit()).toBeFalse();
  });

  it('schreibt eine Änderung ohne Zutun in die Datei', async () => {
    store.createClass('10a');
    expect(store.hasUnsavedChanges()).toBeTrue();

    await warteAufAutosave();

    expect(handle.geschrieben.length).toBeGreaterThan(0);
    expect(store.hasUnsavedChanges()).toBeFalse();
    expect(vault.lastSavedAt()).not.toBeNull();
  });

  it('legt in der Datei ab, was wirklich im Bestand steht', async () => {
    store.createClass('10a');
    await warteAufAutosave();

    const inhalt = await handle.geschrieben[handle.geschrieben.length - 1].text();
    const bestand = await decryptDatabase(inhalt, PASSWORT);

    expect(bestand.schoolClasses.map((c) => c.name)).toEqual(['10a']);
  });

  it('fasst schnell aufeinanderfolgende Änderungen zu einer Schreibung zusammen', async () => {
    // Beim Anlegen wurde bereits einmal geschrieben; gezählt wird ab hier.
    const vorher = handle.geschrieben.length;

    store.createClass('10a');
    store.createClass('10b');
    store.createClass('10c');

    await warteAufAutosave();

    expect(handle.geschrieben.length - vorher).toBe(1);
  });

  it('haelt den Bestand als ungespeichert, wenn die Datei nicht erreichbar ist', async () => {
    handle.faelltAus = true;
    store.createClass('10a');

    await warteAufAutosave();

    expect(store.hasUnsavedChanges()).toBeTrue();
    expect(vault.saveError()).not.toBeNull();
  });

  it('nimmt das Speichern wieder auf, sobald die Datei zurueck ist', async () => {
    handle.faelltAus = true;
    store.createClass('10a');
    await warteAufAutosave();
    expect(vault.saveError()).not.toBeNull();

    handle.faelltAus = false;
    store.createClass('10b');
    await warteAufAutosave();

    expect(vault.saveError()).toBeNull();
    expect(store.hasUnsavedChanges()).toBeFalse();
  });
});

describe('VaultService - ohne Dateizugriff', () => {
  let vault: VaultService;
  let store: LocalStore;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    vault = TestBed.inject(VaultService);
    store = TestBed.inject(LocalStore);

    await vault.startWith(PASSWORT, null);
  });

  afterEach(async () => {
    await vault.closeVault();
  });

  it('verlangt Handarbeit, statt ungefragt Downloads auszuloesen', async () => {
    expect(vault.speichertVonAllein()).toBeFalse();
    expect(vault.brauchtHandarbeit()).toBeTrue();

    store.createClass('10a');
    await warteAufAutosave();

    // Der Bestand bleibt offen ungespeichert - die Datei sichert der Benutzer.
    expect(store.hasUnsavedChanges()).toBeTrue();
    expect(vault.saveError()).toBeNull();
  });
});
