/**
 * Hält den Datenbestand und seine Datei zusammen: öffnen, anlegen, speichern.
 *
 * Das Passwort bleibt nur im Arbeitsspeicher dieser Seite - es wird weder
 * abgelegt noch irgendwohin übertragen. Nach dem Neuladen der Seite muss der
 * Bestand deshalb erneut geöffnet werden.
 */

import { Injectable, effect, inject, signal } from '@angular/core';
import { AppError } from './app-error';
import {
  AutosaveEntry,
  clearAutosave,
  clearRemembered,
  readAutosave,
  readRemembered,
  writeAutosave,
  writeRemembered,
} from './browser-storage';
import { createEmptyDatabase } from './database';
import {
  FileHandle,
  SaveConflictError,
  VAULT_EXTENSION,
  canWriteSilently,
  chooseSaveFile,
  download,
  openFile,
  supportsFileHandles,
  writeFile,
} from './file-system';
import { LocalStore } from './local-store';
import { OneDriveFile, OneDriveService } from './onedrive.service';
import { VaultPasswordError, decryptDatabase, encryptDatabase } from './vault-crypto';

/** So lange nach der letzten Änderung wird in den Zwischenspeicher geschrieben. */
const AUTOSAVE_DELAY_MS = 2_000;

/** So lange nach der letzten Änderung wird automatisch in die Datei geschrieben. */
const FILE_AUTOSAVE_DELAY_MS = 3_000;

/** Die Wahl „automatisch speichern“ gilt je Gerät und liegt deshalb im Browser. */
const AUTOSAVE_PREF_KEY = 'sitzordnung.autoSaveToFile';

const DEFAULT_FILE_NAME = 'sitzordnung' + VAULT_EXTENSION;

@Injectable({ providedIn: 'root' })
export class VaultService {
  private readonly store = inject(LocalStore);
  private readonly oneDrive = inject(OneDriveService);

  private password: string | null = null;
  private handle: FileHandle | null = null;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private fileAutosaveTimer: ReturnType<typeof setTimeout> | null = null;

  /** Name der geöffneten Datei, zur Anzeige in der Kopfzeile. */
  readonly fileName = signal<string | null>(null);

  /** Zeitpunkt der letzten Speicherung in die Datei. */
  readonly lastSavedAt = signal<Date | null>(null);

  /** True, während gespeichert wird. */
  readonly isSaving = signal(false);

  readonly canWriteInPlace = supportsFileHandles();

  /** Ist eine Datei gewählt, in die direkt zurückgeschrieben werden kann? */
  readonly hasFileHandle = signal(false);

  /** Nach jeder Änderung von selbst in die Datei schreiben (nur Chrome und Edge). */
  readonly autoSaveToFile = signal(readAutoSavePref());

  /** Der letzte Fehler beim automatischen Speichern - die Kopfzeile meldet ihn. */
  readonly autoSaveError = signal<unknown>(null);

  /** Liegt der Bestand in OneDrive statt auf diesem Gerät? */
  readonly isInOneDrive = signal(false);

  /**
   * Ein anderes Gerät hat die Datei seit dem Öffnen geändert. Bis die
   * Lehrkraft entscheidet, welcher Stand gilt, ruht das automatische Speichern.
   */
  readonly saveConflict = signal(false);

  /** Name des OneDrive-Bestands, den dieses Gerät sich gemerkt hat. */
  readonly rememberedFile = signal<string | null>(null);

  /** Von selbst geöffnet wird nur einmal je Seitenaufruf - nicht nach dem Schließen. */
  private autoOpenDone = false;

  constructor() {
    // Der Zwischenspeicher zieht bei jeder Änderung nach.
    this.watchChanges();

    void readRemembered().then((entry) => this.rememberedFile.set(entry?.fileName ?? null));

    window.addEventListener('beforeunload', (event) => {
      if (this.store.isOpen() && this.store.hasUnsavedChanges()) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
  }

  private watchChanges(): void {
    effect(() => {
      // Das Signal wird gelesen, damit der Effekt bei jeder Änderung erneut läuft.
      this.store.revision();

      if (this.autosaveTimer) {
        clearTimeout(this.autosaveTimer);
      }
      this.autosaveTimer = setTimeout(() => void this.writeAutosaveEntry(), AUTOSAVE_DELAY_MS);

      if (this.fileAutosaveTimer) {
        clearTimeout(this.fileAutosaveTimer);
      }
      if (this.autoSaveToFile()) {
        this.fileAutosaveTimer = setTimeout(() => void this.autoSave(), FILE_AUTOSAVE_DELAY_MS);
      }
    });
  }

  setAutoSaveToFile(enabled: boolean): void {
    this.autoSaveToFile.set(enabled);
    try {
      localStorage.setItem(AUTOSAVE_PREF_KEY, enabled ? '1' : '0');
    } catch {
      // Ohne Speicher gilt die Wahl nur bis zum Neuladen.
    }
  }

  /**
   * Schreibt still in die Datei, sofern der Browser das ohne Rückfrage
   * erlaubt. Sonst bleibt der Bestand als „nicht gespeichert“ markiert.
   */
  private async autoSave(): Promise<void> {
    const handle = this.handle;
    if (
      !handle ||
      this.isSaving() ||
      !this.store.isOpen() ||
      !this.store.hasUnsavedChanges() ||
      this.saveConflict() ||
      !(await canWriteSilently(handle))
    ) {
      return;
    }

    try {
      await this.save({ interactive: false });
      this.autoSaveError.set(null);
    } catch (error) {
      // Den Konflikt meldet die App eigens, mit der Frage, welcher Stand gilt.
      if (!(error instanceof SaveConflictError)) {
        this.autoSaveError.set(error);
      }
    }
  }

  private setHandle(handle: FileHandle | null): void {
    this.handle = handle;
    this.hasFileHandle.set(handle !== null);
    this.isInOneDrive.set(handle?.location === 'onedrive');
    this.saveConflict.set(false);
  }

  private async writeAutosaveEntry(): Promise<void> {
    if (!this.store.isOpen() || this.password === null) {
      return;
    }

    const blob = await encryptDatabase(this.store.snapshot(), this.password);
    await writeAutosave({
      content: await blob.text(),
      savedAt: new Date().toISOString(),
      fileName: this.fileName(),
      dirty: this.store.hasUnsavedChanges(),
    });
  }

  /** Gibt es einen Zwischenstand von der letzten Sitzung? */
  async findAutosave(): Promise<AutosaveEntry | null> {
    return readAutosave();
  }

  // --- Öffnen und Anlegen -------------------------------------------------

  /** Legt einen leeren Bestand an und fragt gleich nach einer Datei dafür. */
  async createNew(password: string): Promise<void> {
    this.requirePassword(password);

    this.password = password;
    this.store.load(createEmptyDatabase());

    if (this.canWriteInPlace) {
      try {
        this.setHandle(await chooseSaveFile(DEFAULT_FILE_NAME));
        this.fileName.set(this.handle?.name ?? DEFAULT_FILE_NAME);
        await this.save();
        return;
      } catch {
        // Der Bestand steht bereits - wählt die Lehrkraft jetzt keine Datei,
        // geht es ohne weiter und das Speichern läuft über einen Download.
        this.setHandle(null);
      }
    }

    this.fileName.set(DEFAULT_FILE_NAME);

    // Ohne Datei steht noch nichts auf der Festplatte. Das zählt als
    // ungesicherte Änderung, damit die App zum Speichern auffordert.
    this.store.revision.update((value) => value + 1);
  }

  /** Öffnet eine Datei und entschlüsselt sie. */
  async open(password: string): Promise<void> {
    const file = await openFile();
    await this.loadContent(file.content, password, file.name, file.handle);
  }

  /** Öffnet einen Bestand aus OneDrive. */
  async openFromOneDrive(file: OneDriveFile, password: string): Promise<void> {
    const { content, handle } = await this.oneDrive.open(file);
    await this.loadContent(content, password, handle.name, handle);
  }

  /** Legt einen leeren Bestand gleich in OneDrive an. */
  async createInOneDrive(name: string, password: string): Promise<void> {
    this.requirePassword(password);
    await this.oneDrive.ensureToken(true);

    const database = createEmptyDatabase();
    const handle = await this.oneDrive.create(name, await encryptDatabase(database, password));

    this.password = password;
    this.store.load(database);
    this.setHandle(handle);
    this.fileName.set(handle.name);
    this.lastSavedAt.set(new Date());
  }

  /** Legt den geöffneten Bestand als neue Datei in OneDrive ab und arbeitet dort weiter. */
  async moveToOneDrive(name: string): Promise<void> {
    if (!this.store.isOpen() || this.password === null) {
      throw new AppError('Es ist kein Datenbestand geöffnet.');
    }

    // Erst anmelden, solange das Anmeldefenster noch als Folge des Klicks gilt.
    await this.oneDrive.ensureToken(true);
    const handle = await this.oneDrive.create(
      name,
      await encryptDatabase(this.store.snapshot(), this.password),
    );
    this.setHandle(handle);
    this.fileName.set(handle.name);
    this.store.markSaved();
    this.lastSavedAt.set(new Date());
  }

  // --- Auf diesem Gerät merken --------------------------------------------

  /** Ist der geöffnete Bestand der, den sich dieses Gerät merkt? */
  isRemembered(): boolean {
    return (
      this.isInOneDrive() &&
      this.rememberedFile() !== null &&
      this.rememberedFile() === this.fileName()
    );
  }

  /**
   * Merkt sich OneDrive-Datei und Passwort auf diesem Gerät. Beim nächsten
   * Start öffnet die App den Bestand dann ohne Rückfrage.
   */
  async rememberOnDevice(): Promise<void> {
    const handle = this.handle;
    if (!handle?.remoteId || this.password === null) {
      throw new AppError('Merken lässt sich nur ein Bestand in OneDrive.');
    }

    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const password = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(this.password),
    );

    await writeRemembered({ fileId: handle.remoteId, fileName: handle.name, key, iv, password });
    this.rememberedFile.set(handle.name);
  }

  /** Vergisst Datei und Passwort auf diesem Gerät. */
  async forgetOnDevice(): Promise<void> {
    await clearRemembered();
    this.rememberedFile.set(null);
  }

  /**
   * Öffnet den gemerkten Bestand. Ohne `interactive` geht das nur still -
   * ist die Anmeldung bei Microsoft abgelaufen, schlägt es dann fehl.
   */
  async openRemembered(interactive: boolean): Promise<void> {
    const entry = await readRemembered();
    if (!entry) {
      throw new AppError('Auf diesem Gerät ist kein Bestand gemerkt.');
    }

    const password = new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: entry.iv as BufferSource },
        entry.key,
        entry.password,
      ),
    );
    const { content, handle } = await this.oneDrive.open(
      { id: entry.fileId, name: entry.fileName },
      interactive,
    );

    try {
      await this.loadContent(content, password, handle.name, handle);
    } catch (error) {
      if (error instanceof VaultPasswordError) {
        // Auf einem anderen Gerät wurde das Passwort geändert.
        await this.forgetOnDevice();
        throw new AppError(
          'Das gemerkte Passwort passt nicht mehr - vermutlich wurde es auf einem anderen Gerät geändert. Bitte neu eingeben.',
        );
      }
      throw error;
    }
  }

  /**
   * Öffnet beim Start den gemerkten Bestand, einmal je Seitenaufruf. Liegt im
   * Browser ein Zwischenstand mit ungesicherten Änderungen, entscheidet die
   * Lehrkraft selbst - sonst gingen diese Änderungen unter.
   */
  async tryAutoOpen(): Promise<boolean> {
    if (this.autoOpenDone || this.store.isOpen()) {
      return false;
    }
    this.autoOpenDone = true;

    if (!(await readRemembered()) || (await readAutosave())?.dirty) {
      return false;
    }

    await this.openRemembered(false);
    return true;
  }

  /** Konflikt: Der eigene Stand gilt und überschreibt den des anderen Geräts. */
  async keepMineAfterConflict(): Promise<void> {
    this.handle?.allowOverwrite?.();
    this.saveConflict.set(false);
    await this.save();
  }

  /** Konflikt: Der Stand des anderen Geräts gilt, die eigenen Änderungen entfallen. */
  async takeTheirsAfterConflict(): Promise<void> {
    const handle = this.handle;
    const password = this.password;
    if (!handle || password === null) {
      throw new AppError('Es ist kein Datenbestand geöffnet.');
    }

    const file = await handle.getFile();
    await this.loadContent(await file.text(), password, handle.name, handle);

    // Der Bestand bleibt offen - alle Seiten sollen den neuen Stand zeigen.
    this.store.revision.update((value) => value + 1);
    this.store.markSaved();
    this.lastSavedAt.set(new Date());
  }

  /** Setzt auf dem Zwischenstand aus dem Browser auf. */
  async restoreAutosave(entry: AutosaveEntry, password: string): Promise<void> {
    await this.loadContent(entry.content, password, entry.fileName, null);

    // Der Zwischenstand steht noch in keiner Datei. Das zählt als ungesicherte
    // Änderung, damit die App zum Speichern auffordert.
    this.store.revision.update((value) => value + 1);
  }

  private async loadContent(
    content: string,
    password: string,
    name: string | null,
    handle: FileHandle | null,
  ): Promise<void> {
    const database = await decryptDatabase(content, password);

    this.password = password;
    this.setHandle(handle);
    this.fileName.set(name);
    this.store.load(database);
    this.lastSavedAt.set(null);
  }

  // --- Speichern ----------------------------------------------------------

  /**
   * Schreibt den Bestand in die Datei - oder bietet ihn als Download an.
   * `interactive: false` heißt: von selbst ausgelöst, also ohne Anmeldefenster.
   */
  async save(options: { interactive?: boolean } = {}): Promise<void> {
    if (!this.store.isOpen() || this.password === null) {
      throw new AppError('Es ist kein Datenbestand geöffnet.');
    }

    this.isSaving.set(true);
    try {
      // Vor dem Verschlüsseln, damit ein Anmeldefenster noch als Folge des Klicks gilt.
      await this.handle?.prepare?.(options.interactive ?? true);

      const blob = await encryptDatabase(this.store.snapshot(), this.password);

      if (this.handle) {
        try {
          await writeFile(this.handle, blob);
        } catch (error) {
          if (error instanceof SaveConflictError) {
            this.saveConflict.set(true);
          }
          throw error;
        }
        // Die Android-App weicht auf eine neue Datei aus, wenn sie die alte nicht beschreiben darf.
        this.fileName.set(this.handle.name);
      } else {
        await download(blob, this.fileName() ?? DEFAULT_FILE_NAME);
      }

      this.store.markSaved();
      this.lastSavedAt.set(new Date());
      await this.writeAutosaveEntry();
    } finally {
      this.isSaving.set(false);
    }
  }

  /** Fragt nach einer neuen Datei und speichert dorthin. */
  async saveAs(): Promise<void> {
    if (this.canWriteInPlace) {
      const handle = await chooseSaveFile(this.fileName() ?? DEFAULT_FILE_NAME);
      if (handle) {
        this.setHandle(handle);
        this.fileName.set(handle.name);
      }
    }

    await this.save();
  }

  /** Vergibt ein neues Passwort. Wirksam wird es mit dem nächsten Speichern. */
  async changePassword(current: string, next: string): Promise<void> {
    if (this.password === null) {
      throw new AppError('Es ist kein Datenbestand geöffnet.');
    }

    if (current !== this.password) {
      throw new AppError('Das bisherige Passwort stimmt nicht.');
    }

    this.requirePassword(next);
    this.password = next;
    await this.save();

    if (this.isRemembered()) {
      await this.rememberOnDevice();
    }
  }

  /** Schließt den Bestand und räumt den Zwischenspeicher ab. */
  async closeVault(): Promise<void> {
    this.password = null;
    this.setHandle(null);
    this.fileName.set(null);
    this.lastSavedAt.set(null);
    this.store.close();
    await clearAutosave();
  }

  private requirePassword(password: string): void {
    if (password.length < 8) {
      throw new AppError('Das Passwort muss mindestens 8 Zeichen lang sein.');
    }
  }
}

function readAutoSavePref(): boolean {
  try {
    // Ohne ausdrückliche Wahl ist es eingeschaltet - wie in anderen Programmen auch.
    return localStorage.getItem(AUTOSAVE_PREF_KEY) !== '0';
  } catch {
    return false;
  }
}
