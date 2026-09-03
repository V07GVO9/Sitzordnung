/**
 * Hält den Datenbestand und seine Datei zusammen: öffnen, anlegen, speichern.
 *
 * Das Passwort bleibt nur im Arbeitsspeicher dieser Seite - es wird weder
 * abgelegt noch irgendwohin übertragen. Nach dem Neuladen der Seite muss der
 * Bestand deshalb erneut geöffnet werden.
 */

import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AppError } from './app-error';
import { AutosaveEntry, clearAutosave, readAutosave, writeAutosave } from './browser-storage';
import { createEmptyDatabase } from './database';
import {
  FileHandle,
  VAULT_EXTENSION,
  chooseSaveFile,
  download,
  openFile,
  supportsFileHandles,
  writeFile,
} from './file-system';
import { LocalStore } from './local-store';
import { decryptDatabase, encryptDatabase } from './vault-crypto';

/** So lange nach der letzten Änderung wird gespeichert. */
const AUTOSAVE_DELAY_MS = 2_000;

const DEFAULT_FILE_NAME = 'sitzordnung' + VAULT_EXTENSION;

@Injectable({ providedIn: 'root' })
export class VaultService {
  private readonly store = inject(LocalStore);

  private password: string | null = null;
  private handle: FileHandle | null = null;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;

  /** Name der geöffneten Datei, zur Anzeige in der Kopfzeile. */
  readonly fileName = signal<string | null>(null);

  /** Zeitpunkt der letzten Speicherung in die Datei. */
  readonly lastSavedAt = signal<Date | null>(null);

  /** True, während gespeichert wird. */
  readonly isSaving = signal(false);

  /** Gesetzt, wenn das selbsttätige Speichern zuletzt nicht geklappt hat. */
  readonly saveError = signal<string | null>(null);

  readonly canWriteInPlace = supportsFileHandles();

  /**
   * Kann still in die Datei zurückgeschrieben werden? Nur dann läuft das
   * Speichern von allein. Ohne Dateizugriff bliebe nur ein Download, und den
   * ungefragt bei jeder Änderung auszulösen wäre eine Zumutung - dort muss
   * die Datei von Hand gesichert werden.
   */
  readonly speichertVonAllein = computed(() => this.handleSignal() !== null);

  /** Zeigt an, dass ein Bestand offen ist, der nicht von allein in die Datei geht. */
  readonly brauchtHandarbeit = computed(
    () => this.store.isOpen() && this.handleSignal() === null,
  );

  /** Der Dateigriff auch als Signal, damit die Oberfläche darauf reagieren kann. */
  private readonly handleSignal = signal<FileHandle | null>(null);

  constructor() {
    // Der Zwischenspeicher zieht bei jeder Änderung nach.
    this.watchChanges();

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
      this.autosaveTimer = setTimeout(() => void this.speichereVonAllein(), AUTOSAVE_DELAY_MS);
    });
  }

  /**
   * Speichert nach einer Änderung von allein: in die Datei, wenn wir hineinschreiben
   * dürfen, und in jedem Fall in den Zwischenspeicher des Browsers.
   *
   * Läuft ohne Zutun, darf also niemandem im Weg stehen: schlägt das Schreiben fehl
   * - etwa weil die Datei inzwischen verschoben wurde -, bleibt der Zwischenspeicher
   * als Netz, der Bestand gilt weiter als ungespeichert und es gibt einen Hinweis.
   */
  private async speichereVonAllein(): Promise<void> {
    if (!this.store.isOpen() || this.password === null) {
      return;
    }

    if (!this.handle) {
      await this.writeAutosaveEntry();
      return;
    }

    // Während einer laufenden Speicherung nicht dazwischenfunken.
    if (this.isSaving()) {
      this.autosaveTimer = setTimeout(() => void this.speichereVonAllein(), AUTOSAVE_DELAY_MS);
      return;
    }

    this.isSaving.set(true);
    try {
      const blob = await encryptDatabase(this.store.snapshot(), this.password);
      await writeFile(this.handle, blob);

      this.store.markSaved();
      this.lastSavedAt.set(new Date());
      this.saveError.set(null);
      await this.writeAutosaveEntry();
    } catch {
      this.saveError.set(
        'Die Datei ließ sich gerade nicht beschreiben. Die Änderungen liegen im Browser bereit.',
      );
      await this.writeAutosaveEntry();
    } finally {
      this.isSaving.set(false);
    }
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
    });
  }

  /** Gibt es einen Zwischenstand von der letzten Sitzung? */
  async findAutosave(): Promise<AutosaveEntry | null> {
    return readAutosave();
  }

  // --- Öffnen und Anlegen -------------------------------------------------

  /**
   * Öffnet einen leeren Bestand mit einer bereits gewählten Datei. Mit einem
   * Griff wird sofort geschrieben und danach läuft das Speichern von allein;
   * ohne einen gilt der Bestand als ungesichert, damit die App dazu auffordert.
   */
  async startWith(password: string, handle: FileHandle | null): Promise<void> {
    this.requirePassword(password);

    this.password = password;
    this.store.load(createEmptyDatabase());
    this.handle = handle;
    this.handleSignal.set(handle);
    this.saveError.set(null);

    if (handle) {
      this.fileName.set(handle.name);
      await this.save();
      return;
    }

    this.fileName.set(DEFAULT_FILE_NAME);

    // Ohne Datei steht noch nichts auf der Festplatte. Das zählt als
    // ungesicherte Änderung, damit die App zum Speichern auffordert.
    this.store.revision.update((value) => value + 1);
  }

  /** Legt einen leeren Bestand an und fragt gleich nach einer Datei dafür. */
  async createNew(password: string): Promise<void> {
    this.requirePassword(password);

    let handle: FileHandle | null = null;
    if (this.canWriteInPlace) {
      try {
        handle = await chooseSaveFile(DEFAULT_FILE_NAME);
      } catch {
        // Wählt die Lehrkraft jetzt keine Datei, geht es ohne weiter und das
        // Speichern läuft über einen Download.
        handle = null;
      }
    }

    await this.startWith(password, handle);
  }

  /** Öffnet eine Datei und entschlüsselt sie. */
  async open(password: string): Promise<void> {
    const file = await openFile();
    await this.loadContent(file.content, password, file.name, file.handle);
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
    this.handle = handle;
    this.handleSignal.set(handle);
    this.fileName.set(name);
    this.store.load(database);
    this.lastSavedAt.set(null);
  }

  // --- Speichern ----------------------------------------------------------

  /** Schreibt den Bestand in die Datei - oder bietet ihn als Download an. */
  async save(): Promise<void> {
    if (!this.store.isOpen() || this.password === null) {
      throw new AppError('Es ist kein Datenbestand geöffnet.');
    }

    this.isSaving.set(true);
    try {
      const blob = await encryptDatabase(this.store.snapshot(), this.password);

      if (this.handle) {
        await writeFile(this.handle, blob);
      } else {
        download(blob, this.fileName() ?? DEFAULT_FILE_NAME);
      }

      this.store.markSaved();
      this.lastSavedAt.set(new Date());
      this.saveError.set(null);
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
        this.handle = handle;
    this.handleSignal.set(handle);
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
  }

  /** Schließt den Bestand und räumt den Zwischenspeicher ab. */
  async closeVault(): Promise<void> {
    this.password = null;
    this.handle = null;
    this.handleSignal.set(null);
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
