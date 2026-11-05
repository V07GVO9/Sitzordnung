/**
 * Hält den Datenbestand und seine Datei zusammen: öffnen, anlegen, speichern.
 *
 * Das Passwort bleibt nur im Arbeitsspeicher dieser Seite - es wird weder
 * abgelegt noch irgendwohin übertragen. Nach dem Neuladen der Seite muss der
 * Bestand deshalb erneut geöffnet werden.
 */

import { Injectable, effect, inject, signal } from '@angular/core';
import { ToastService } from '../toast.service';
import { ConfirmService } from '../ui/confirm.service';
import { AppError } from './app-error';
import {
  clearAutosave,
  clearLastFileHandle,
  clearRemembered,
  readAutosave,
  readLastFileHandle,
  readRemembered,
  writeAutosave,
  writeLastFileHandle,
  writeRemembered,
} from './browser-storage';
import { Database, createEmptyDatabase } from './database';
import {
  FileHandle,
  FilePickerCancelled,
  SaveConflictError,
  VAULT_EXTENSION,
  canWriteSilently,
  chooseSaveFile,
  download,
  isNativeApp,
  openFile,
  readHandle,
  supportsFileHandles,
  writeFile,
} from './file-system';
import { LocalStore } from './local-store';
import { OneDriveFile, OneDriveService } from './onedrive.service';
import { unmetPasswordRules } from './password-policy';
import { VaultPasswordError, decryptDatabase, encryptDatabase } from './vault-crypto';

/** So lange nach der letzten Änderung wird in den Zwischenspeicher geschrieben. */
const AUTOSAVE_DELAY_MS = 2_000;

/**
 * So kurz nach einer Änderung wird automatisch in die Datei geschrieben -
 * praktisch sofort. Die kleine Pause fasst nur schnelle Folgen (Ziehen,
 * mehrere Klicks) zu einem Schreibvorgang zusammen.
 */
const FILE_AUTOSAVE_DELAY_MS = 300;

/** Die Wahl „automatisch speichern“ gilt je Gerät und liegt deshalb im Browser. */
const AUTOSAVE_PREF_KEY = 'sitzordnung.autoSaveToFile';

const DEFAULT_FILE_NAME = 'sitzordnung' + VAULT_EXTENSION;

/** Prüfsumme einer Datei, um zu erkennen, ob sie anderswo geändert wurde. */
async function fingerprint(content: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

@Injectable({ providedIn: 'root' })
export class VaultService {
  private readonly store = inject(LocalStore);
  private readonly oneDrive = inject(OneDriveService);
  private readonly confirm = inject(ConfirmService);
  private readonly toasts = inject(ToastService);

  private password: string | null = null;
  /** Prüfsumme der Datei, wie sie zuletzt geöffnet oder gespeichert wurde. */
  private baseHash: string | null = null;
  private handle: FileHandle | null = null;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private fileAutosaveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Eine Änderung kam während einer Speicherung - danach gleich noch einmal schreiben. */
  private pendingAutoSave = false;

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

  /**
   * Die zuletzt benutzte Datei auf diesem Rechner (nur Chrome/Edge). Liegt sie
   * vor, genügt beim Start das Passwort - ohne Suchen im Dateidialog.
   */
  readonly lastLocalFile = signal<FileHandle | null>(null);

  /** Von selbst geöffnet wird nur einmal je Seitenaufruf - nicht nach dem Schließen. */
  private autoOpenDone = false;

  constructor() {
    // Der Zwischenspeicher zieht bei jeder Änderung nach.
    this.watchChanges();

    void readRemembered().then((entry) => this.rememberedFile.set(entry?.fileName ?? null));
    if (canRememberLocalFiles()) {
      void readLastFileHandle<FileHandle>().then((handle) => this.lastLocalFile.set(handle));
    }

    // Wird die Seite verlassen oder die App weggeschaltet, sofort schreiben.
    const flush = () => this.flushAutoSave();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flush();
      }
    });

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

      if (this.autoSaveToFile()) {
        this.scheduleAutoSave();
      }
    });
  }

  private scheduleAutoSave(): void {
    if (this.fileAutosaveTimer) {
      clearTimeout(this.fileAutosaveTimer);
    }
    this.fileAutosaveTimer = setTimeout(() => {
      this.fileAutosaveTimer = null;
      void this.autoSave();
    }, FILE_AUTOSAVE_DELAY_MS);
  }

  /** Schreibt eine anstehende automatische Speicherung ohne Wartezeit. */
  private flushAutoSave(): void {
    if (this.fileAutosaveTimer) {
      clearTimeout(this.fileAutosaveTimer);
      this.fileAutosaveTimer = null;
    }
    if (this.autoSaveToFile()) {
      void this.autoSave();
    }
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
    if (this.isSaving()) {
      // Läuft gerade eine Speicherung, kommt diese Änderung gleich danach dran.
      this.pendingAutoSave = true;
      return;
    }
    if (
      !handle ||
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
      baseHash: this.baseHash,
    });
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
        await this.rememberLocalFile(this.handle);
        return;
      } catch (error) {
        if (error instanceof FilePickerCancelled) {
          // Ohne gewählte Datei entsteht kein Bestand - sonst arbeitete man an
          // etwas, das nirgends liegt, und öffnete später die alte Datei.
          this.password = null;
          this.setHandle(null);
          this.store.close();
          throw error;
        }
        // Der Browser lässt die Datei nicht anlegen: weiter ohne Datei,
        // gespeichert wird dann über einen Download.
        this.setHandle(null);
      }
    }

    this.fileName.set(DEFAULT_FILE_NAME);

    // Die zuletzt benutzte Datei ist nicht diese - sie darf beim nächsten
    // Start nicht als „letzte Datei“ angeboten werden.
    await this.forgetLastLocalFile();

    // Ohne Datei steht noch nichts auf der Festplatte. Das zählt als
    // ungesicherte Änderung, damit die App zum Speichern auffordert.
    this.store.revision.update((value) => value + 1);

    if (!this.canWriteInPlace) {
      // Ohne Dateizugriff (z. B. Firefox, Safari) gleich einmal herunterladen,
      // damit die neue Datei sofort existiert.
      await this.save().catch(() => undefined);
    }
  }

  /** Öffnet eine Datei und entschlüsselt sie. */
  async open(password: string): Promise<void> {
    const file = await openFile();
    await this.loadContent(file.content, password, file.name, file.handle);
    await this.rememberLocalFile(file.handle);
  }

  /** Öffnet die zuletzt benutzte Datei ohne Dateidialog. */
  async openLastLocalFile(password: string): Promise<void> {
    const handle = this.lastLocalFile();
    if (!handle) {
      throw new AppError('Es ist keine Datei vorgemerkt.');
    }

    let content: string;
    try {
      content = await readHandle(handle);
    } catch (error) {
      if (error instanceof FilePickerCancelled) {
        throw error;
      }
      throw new AppError(
        `Die Datei „${handle.name}“ wurde nicht gefunden. Bitte über „Andere Datei wählen“ neu auswählen.`,
      );
    }

    await this.loadContent(content, password, handle.name, handle);
  }

  /** Vergisst die vorgemerkte Datei - die Datei selbst bleibt unberührt. */
  async forgetLastLocalFile(): Promise<void> {
    this.lastLocalFile.set(null);
    await clearLastFileHandle();
  }

  /** Merkt sich eine Datei auf diesem Rechner für den nächsten Start. */
  private async rememberLocalFile(handle: FileHandle | null): Promise<void> {
    // OneDrive und die Android-App haben ihren eigenen Weg.
    if (!handle || handle.location || !canRememberLocalFiles()) {
      return;
    }
    this.lastLocalFile.set(handle);
    await writeLastFileHandle(handle);
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
    const blob = await encryptDatabase(database, password);
    const handle = await this.oneDrive.create(name, blob);

    this.baseHash = await fingerprint(await blob.text());
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
    const blob = await encryptDatabase(this.store.snapshot(), this.password);
    const handle = await this.oneDrive.create(name, blob);
    const previousName = this.fileName();
    this.baseHash = await fingerprint(await blob.text());
    this.setHandle(handle);
    this.fileName.set(handle.name);
    this.store.markSaved();
    this.lastSavedAt.set(new Date());
    await this.dropAutosaveOf(previousName);
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
   * Öffnet beim Start den gemerkten Bestand, einmal je Seitenaufruf.
   * Ungesicherte Änderungen aus dem Browser übernimmt das Öffnen von selbst.
   */
  async tryAutoOpen(): Promise<boolean> {
    if (this.autoOpenDone || this.store.isOpen()) {
      return false;
    }
    this.autoOpenDone = true;

    if (!(await readRemembered())) {
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
    // Der Stand des anderen Geräts gilt - der eigene Zwischenstand bleibt außen vor.
    await this.loadContent(await file.text(), password, handle.name, handle, false);

    // Der Bestand bleibt offen - alle Seiten sollen den neuen Stand zeigen.
    this.store.revision.update((value) => value + 1);
    this.store.markSaved();
    this.lastSavedAt.set(new Date());
  }

  /**
   * Entschlüsselt eine Datei und öffnet sie. Liegen im Browser ungesicherte
   * Änderungen zu genau dieser Datei, werden sie gleich mit übernommen.
   */
  private async loadContent(
    content: string,
    password: string,
    name: string | null,
    handle: FileHandle | null,
    useAutosave = true,
  ): Promise<void> {
    let database = await decryptDatabase(content, password);
    const baseHash = await fingerprint(content);
    const pending = useAutosave ? await this.pendingChanges(name, baseHash, password) : null;
    if (pending) {
      database = pending;
    }

    this.password = password;
    this.baseHash = baseHash;
    this.setHandle(handle);
    this.fileName.set(name);
    this.store.load(database);
    this.lastSavedAt.set(null);

    if (pending) {
      // Die Änderungen stehen noch in keiner Datei - die App fordert zum Speichern auf.
      this.store.revision.update((value) => value + 1);
      this.toasts.success('Ungesicherte Änderungen wiederhergestellt.');
    }
  }

  /**
   * Der Zwischenstand aus dem Browser, sofern er Änderungen zu dieser Datei
   * enthält, die noch nicht gespeichert sind. Wurde die Datei inzwischen
   * anderswo gespeichert, entscheidet die Lehrkraft, welcher Stand gilt.
   */
  private async pendingChanges(
    name: string | null,
    baseHash: string,
    password: string,
  ): Promise<Database | null> {
    const entry = await readAutosave(name);
    if (!entry?.dirty) {
      return null;
    }

    let database: Database;
    try {
      database = await decryptDatabase(entry.content, password);
    } catch {
      // Mit einem anderen Passwort gesichert - dann gehört er nicht hierher.
      return null;
    }

    if (entry.baseHash === baseHash) {
      return database;
    }

    const keepFile = await this.confirm.ask({
      title: 'Die Datei ist neuer als deine Änderungen',
      message:
        `Im Browser liegen ungesicherte Änderungen vom ${new Date(entry.savedAt).toLocaleString('de-DE')}. ` +
        `„${name ?? 'Die Datei'}“ wurde danach an anderer Stelle gespeichert, vermutlich auf einem anderen Gerät. ` +
        'Welcher Stand soll gelten? Der andere geht dabei verloren.',
      confirmLabel: 'Stand der Datei laden',
      cancelLabel: 'Meine Änderungen behalten',
      danger: true,
    });
    return keepFile ? null : database;
  }

  /** Nach einem Umzug in eine andere Datei gehört der alte Zwischenstand niemandem mehr. */
  private async dropAutosaveOf(previousName: string | null): Promise<void> {
    if (previousName !== this.fileName()) {
      await clearAutosave(previousName);
    }
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
    // Der Stand, der jetzt geschrieben wird - spätere Änderungen gelten nicht als gesichert.
    // Stand und Inhalt gehören zusammen, deshalb beides vor dem ersten Warten.
    const revision = this.store.revision();
    const snapshot = this.store.snapshot();
    try {
      // Vor dem Verschlüsseln, damit ein Anmeldefenster noch als Folge des Klicks gilt.
      await this.handle?.prepare?.(options.interactive ?? true);

      const previousName = this.fileName();
      const blob = await encryptDatabase(snapshot, this.password);

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

      this.baseHash = await fingerprint(await blob.text());
      this.store.markSaved(revision);
      this.lastSavedAt.set(new Date());
      await this.writeAutosaveEntry();
      await this.dropAutosaveOf(previousName);
    } finally {
      this.isSaving.set(false);
      // Kam während des Schreibens etwas dazu, gleich hinterher speichern.
      // (Nicht nach einem Fehler ohne neue Änderung - sonst liefe es endlos.)
      const changedMeanwhile = this.store.revision() > revision;
      if (this.pendingAutoSave || changedMeanwhile) {
        this.pendingAutoSave = false;
        if (this.autoSaveToFile() && this.store.isOpen()) {
          this.scheduleAutoSave();
        }
      }
    }
  }

  /** Fragt nach einer neuen Datei und speichert dorthin. */
  async saveAs(): Promise<void> {
    const previousName = this.fileName();
    if (this.canWriteInPlace) {
      const handle = await chooseSaveFile(this.fileName() ?? DEFAULT_FILE_NAME);
      if (handle) {
        this.setHandle(handle);
        this.fileName.set(handle.name);
      }
    }

    await this.save();
    await this.dropAutosaveOf(previousName);
    await this.rememberLocalFile(this.handle);
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
    const name = this.fileName();
    this.password = null;
    this.baseHash = null;
    this.setHandle(null);
    this.fileName.set(null);
    this.lastSavedAt.set(null);
    this.store.close();
    await clearAutosave(name);
  }

  /** Ein neues Passwort muss die Regeln aus password-policy erfüllen. */
  private requirePassword(password: string): void {
    const unmet = unmetPasswordRules(password);
    if (unmet.length > 0) {
      throw new AppError(
        `Das Passwort braucht noch: ${unmet.map((rule) => rule.label).join(', ')}.`,
      );
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

/** Lässt sich ein Dateigriff im Browser ablegen? Nur mit File System Access API. */
function canRememberLocalFiles(): boolean {
  return !isNativeApp() && supportsFileHandles();
}
