/**
 * Das selbsttätige Speichern. Der Dateidialog lässt sich im Test nicht öffnen,
 * deshalb wird der Dateigriff untergeschoben - der Weg dahinter ist derselbe,
 * den ein Browser mit File System Access API nimmt.
 */

import { TestBed } from '@angular/core/testing';
import { createEmptyDatabase } from './database';
import { FileHandle, SaveConflictError } from './file-system';
import { LocalStore } from './local-store';
import { OneDriveService } from './onedrive.service';
import { decryptDatabase, encryptDatabase } from './vault-crypto';
import { VaultService } from './vault.service';

const PASSWORT = 'TestPasswort123';

/** Ein Dateigriff, der das Geschriebene behält, statt es auf die Platte zu legen. */
class FakeHandle implements FileHandle {
  readonly name = 'test.sitzordnung';

  /** Hat der Browser das Schreiben ohne Rückfrage erlaubt? */
  erlaubt = true;

  async queryPermission(): Promise<PermissionState> {
    return this.erlaubt ? 'granted' : 'prompt';
  }

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

/**
 * Eine Datei in der Cloud: Hat ein anderes Gerät inzwischen gespeichert,
 * lehnt sie das Schreiben ab - wie OneDrive bei veralteter Versionskennung.
 */
class FakeCloudHandle extends FakeHandle {
  readonly location = 'onedrive' as const;
  readonly remoteId = 'datei-1';

  /** Der Stand, den ein anderes Gerät hochgeladen hat. */
  fremderStand: Blob | null = null;

  private ueberschreiben = false;

  allowOverwrite(): void {
    this.ueberschreiben = true;
  }

  override async getFile(): Promise<File> {
    if (this.fremderStand) {
      // Wer den fremden Stand lädt, arbeitet ab jetzt auf ihm weiter.
      const stand = this.fremderStand;
      this.geschrieben.push(stand);
      this.fremderStand = null;
      return new File([stand], this.name);
    }
    return super.getFile();
  }

  override async createWritable() {
    const schreiber = await super.createWritable();
    return {
      write: (data: Blob) => schreiber.write(data),
      close: async () => {
        if (this.fremderStand && !this.ueberschreiben) {
          throw new SaveConflictError();
        }
        this.fremderStand = null;
        this.ueberschreiben = false;
        await schreiber.close();
      },
    };
  }
}

/** Wartet, bis der Entprellzeitgeber gelaufen und die Schreibung durch ist. */
async function warteAufAutosave(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 3_400));
}

/** Legt einen leeren Bestand an und schiebt den Dateigriff unter. */
async function oeffne(vault: VaultService, handle: FileHandle | null): Promise<void> {
  await vault.createNew(PASSWORT);
  (vault as unknown as { setHandle(h: FileHandle | null): void }).setHandle(handle);
}

describe('VaultService', () => {
  // Das automatische Speichern wartet einige Sekunden ab - länger als Jasmine von sich aus.
  let vorherigesLimit: number;
  beforeAll(() => {
    vorherigesLimit = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 20_000;
  });
  afterAll(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = vorherigesLimit;
  });

  describe('VaultService - selbsttätiges Speichern', () => {
    let vault: VaultService;
    let store: LocalStore;
    let handle: FakeHandle;

    beforeEach(async () => {
      TestBed.configureTestingModule({});
      vault = TestBed.inject(VaultService);
      store = TestBed.inject(LocalStore);
      handle = new FakeHandle();

      await oeffne(vault, handle);
    });

    afterEach(async () => {
      await vault.closeVault();
    });

    it('meldet, dass eine Datei zum Zurückschreiben da ist', () => {
      expect(vault.hasFileHandle()).toBeTrue();
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
      // Was vom Anlegen noch aussteht, ist erst geschrieben; gezählt wird ab hier.
      await warteAufAutosave();
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
      expect(vault.autoSaveError()).not.toBeNull();
    });

    it('nimmt das Speichern wieder auf, sobald die Datei zurueck ist', async () => {
      handle.faelltAus = true;
      store.createClass('10a');
      await warteAufAutosave();
      expect(vault.autoSaveError()).not.toBeNull();

      handle.faelltAus = false;
      store.createClass('10b');
      await warteAufAutosave();

      expect(vault.autoSaveError()).toBeNull();
      expect(store.hasUnsavedChanges()).toBeFalse();
    });
  });

  describe('VaultService - Konflikt mit einem anderen Gerät', () => {
    let vault: VaultService;
    let store: LocalStore;
    let handle: FakeCloudHandle;

    beforeEach(async () => {
      TestBed.configureTestingModule({});
      vault = TestBed.inject(VaultService);
      store = TestBed.inject(LocalStore);
      handle = new FakeCloudHandle();
      await oeffne(vault, handle);
      await warteAufAutosave();

      // Ein anderes Gerät legt eine Klasse an und speichert.
      const fremd = createEmptyDatabase();
      fremd.schoolClasses.push({ id: 1, name: '11b' });
      handle.fremderStand = await encryptDatabase(fremd, PASSWORT);
    });

    afterEach(async () => {
      await vault.closeVault();
    });

    it('überschreibt den fremden Stand nicht stillschweigend', async () => {
      store.createClass('10a');
      await warteAufAutosave();

      expect(vault.isInOneDrive()).toBeTrue();
      expect(vault.saveConflict()).toBeTrue();
      expect(store.hasUnsavedChanges()).toBeTrue();
      // Der Konflikt wird eigens gefragt, nicht als allgemeiner Fehler gemeldet.
      expect(vault.autoSaveError()).toBeNull();
    });

    it('behält auf Wunsch den eigenen Stand', async () => {
      store.createClass('10a');
      await warteAufAutosave();

      await vault.keepMineAfterConflict();

      const bestand = await decryptDatabase(
        await handle.geschrieben[handle.geschrieben.length - 1].text(),
        PASSWORT,
      );
      expect(bestand.schoolClasses.map((c) => c.name)).toEqual(['10a']);
      expect(vault.saveConflict()).toBeFalse();
      expect(store.hasUnsavedChanges()).toBeFalse();
    });

    it('lädt auf Wunsch den Stand des anderen Geräts', async () => {
      store.createClass('10a');
      await warteAufAutosave();

      await vault.takeTheirsAfterConflict();

      expect(store.snapshot().schoolClasses.map((c) => c.name)).toEqual(['11b']);
      expect(vault.saveConflict()).toBeFalse();
      expect(store.hasUnsavedChanges()).toBeFalse();
    });
  });

  describe('VaultService - auf diesem Gerät merken', () => {
    let vault: VaultService;
    let store: LocalStore;
    let handle: FakeCloudHandle;

    beforeEach(async () => {
      handle = new FakeCloudHandle();
      // OneDrive liefert, was zuletzt in die Datei geschrieben wurde.
      const oneDrive = {
        open: async () => ({ content: await (await handle.getFile()).text(), handle }),
      };
      TestBed.configureTestingModule({
        providers: [{ provide: OneDriveService, useValue: oneDrive }],
      });
      vault = TestBed.inject(VaultService);
      store = TestBed.inject(LocalStore);

      await oeffne(vault, handle);
      store.createClass('10a');
      await vault.save();
    });

    afterEach(async () => {
      await vault.forgetOnDevice();
      await vault.closeVault();
    });

    it('öffnet den gemerkten Bestand ohne Passwort', async () => {
      await vault.rememberOnDevice();
      expect(vault.rememberedFile()).toBe(handle.name);

      await vault.closeVault();
      expect(store.isOpen()).toBeFalse();

      await vault.openRemembered(false);

      expect(store.isOpen()).toBeTrue();
      expect(store.snapshot().schoolClasses.map((c) => c.name)).toEqual(['10a']);
    });

    it('vergisst Datei und Passwort auf Wunsch', async () => {
      await vault.rememberOnDevice();
      await vault.forgetOnDevice();

      expect(vault.rememberedFile()).toBeNull();
      await expectAsync(vault.openRemembered(false)).toBeRejected();
    });

    it('legt das Passwort nicht im Klartext ab', async () => {
      await vault.rememberOnDevice();

      const { readRemembered } = await import('./browser-storage');
      const entry = await readRemembered();
      const gespeichert = new TextDecoder().decode(entry!.password);

      expect(gespeichert).not.toContain(PASSWORT);
    });
  });

  describe('VaultService - ohne Dateizugriff', () => {
    let vault: VaultService;
    let store: LocalStore;

    beforeEach(async () => {
      TestBed.configureTestingModule({});
      vault = TestBed.inject(VaultService);
      store = TestBed.inject(LocalStore);

      await oeffne(vault, null);
    });

    afterEach(async () => {
      await vault.closeVault();
    });

    it('loest keine ungefragten Downloads aus', async () => {
      expect(vault.hasFileHandle()).toBeFalse();

      store.createClass('10a');
      await warteAufAutosave();

      // Der Bestand bleibt offen ungespeichert - die Datei sichert der Benutzer.
      expect(store.hasUnsavedChanges()).toBeTrue();
      expect(vault.autoSaveError()).toBeNull();
    });
  });

  describe('VaultService - ohne Schreiberlaubnis des Browsers', () => {
    it('wartet mit dem Schreiben, bis die Erlaubnis einmal erteilt ist', async () => {
      TestBed.configureTestingModule({});
      const vault = TestBed.inject(VaultService);
      const store = TestBed.inject(LocalStore);
      const handle = new FakeHandle();
      handle.erlaubt = false;
      await oeffne(vault, handle);

      store.createClass('10a');
      await warteAufAutosave();

      expect(handle.geschrieben.length).toBe(0);
      expect(store.hasUnsavedChanges()).toBeTrue();
      await vault.closeVault();
    });
  });
});
