import { PasswordField } from '../core/ui/password-field';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FilePickerCancelled, isNativeApp } from '../core/persistence/file-system';
import { OneDriveFile, OneDriveService } from '../core/persistence/onedrive.service';
import { isStrongPassword } from '../core/persistence/password-policy';
import { IDLE_LOCK_MS, VaultService } from '../core/persistence/vault.service';
import { ToastService } from '../core/ui/toast.service';
import { Icon } from '../core/ui/icon';
import { ConfirmService } from '../core/ui/confirm.service';
import { PasswordRules } from './password-rules';

/**
 * Der Startbildschirm. Solange kein Datenbestand geöffnet ist, zeigt die App
 * nichts als diese Karte - ohne Datei gibt es keine Daten.
 */
@Component({
  selector: 'app-vault-gate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Icon, PasswordRules, PasswordField],
  templateUrl: './vault-gate.html',
  styleUrl: './vault-gate.scss',
})
export class VaultGate {
  private readonly vault = inject(VaultService);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly oneDrive = inject(OneDriveService);

  /** Welcher Weg ist gerade gewählt: vorhandene Datei, neuer Bestand oder OneDrive? */
  readonly mode = signal<'open' | 'create' | 'onedrive'>('open');

  /** OneDrive gibt es nur, wenn die App bei Microsoft registriert ist - und nicht in der Android-App. */
  readonly showOneDrive = this.oneDrive.isConfigured && !isNativeApp();
  readonly account = this.oneDrive.account;

  /** Die Dateien im OneDrive-Ordner; null, solange sie nicht geladen sind. */
  readonly driveFiles = signal<OneDriveFile[] | null>(null);
  readonly selectedFile = signal<OneDriveFile | null>(null);
  /** Im OneDrive-Reiter: einen neuen Bestand anlegen statt einen vorhandenen öffnen. */
  readonly driveCreate = signal(false);
  readonly newFileName = signal('sitzordnung');
  /** OneDrive-Datei und Passwort auf diesem Gerät merken. */
  readonly remember = signal(false);

  /** Der gemerkte Bestand - und ob er gerade von selbst geöffnet wird. */
  readonly rememberedFile = this.vault.rememberedFile;
  readonly lockedByIdle = this.vault.lockedByIdle;
  readonly idleMinutes = IDLE_LOCK_MS / 60_000;
  readonly autoOpening = signal(false);
  /** Warum das Öffnen des gemerkten Bestands zuletzt nicht geklappt hat. */
  readonly rememberedError = signal<string | null>(null);

  /** Die zuletzt benutzte Datei auf diesem Rechner - dann genügt das Passwort. */
  readonly lastLocalFile = this.vault.lastLocalFile;

  readonly password = signal('');
  readonly passwordRepeat = signal('');
  readonly busy = signal(false);

  readonly canWriteInPlace = this.vault.canWriteInPlace;
  readonly isNativeApp = isNativeApp();

  /** Wird gerade ein neuer Bestand angelegt (mit Passwort-Wiederholung)? */
  readonly isCreating = computed(
    () => this.mode() === 'create' || (this.mode() === 'onedrive' && this.driveCreate()),
  );

  readonly passwordsMatch = computed(
    () => !this.isCreating() || this.password() === this.passwordRepeat(),
  );

  readonly canSubmit = computed(() => {
    if (this.busy() || !this.passwordsMatch()) {
      return false;
    }
    // Neue Bestände brauchen ein starkes Passwort; ältere Dateien öffnen weiter mit ihrem.
    if (this.isCreating() ? !isStrongPassword(this.password()) : this.password().length < 8) {
      return false;
    }
    if (this.mode() !== 'onedrive') {
      return true;
    }
    return this.driveCreate() ? this.newFileName().trim() !== '' : this.selectedFile() !== null;
  });

  constructor() {
    void this.autoOpen();
  }

  /** Öffnet beim Start den gemerkten OneDrive-Bestand - ohne jede Eingabe. */
  private async autoOpen(): Promise<void> {
    this.autoOpening.set(true);
    try {
      if (await this.vault.tryAutoOpen()) {
        this.toasts.success('Datenbestand aus OneDrive geöffnet.');
      }
    } catch (error) {
      // Meist ist nur die Anmeldung abgelaufen; ein Klick auf „Öffnen“ erneuert sie.
      this.rememberedError.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.autoOpening.set(false);
    }
  }

  /** Öffnet den gemerkten Bestand, notfalls mit Anmeldefenster. */
  async openRemembered(): Promise<void> {
    this.busy.set(true);
    try {
      await this.vault.openRemembered(true);
      this.toasts.success('Datenbestand aus OneDrive geöffnet.');
    } catch (error) {
      if (!(error instanceof FilePickerCancelled)) {
        this.toasts.error(error, 'Der gemerkte Bestand konnte nicht geöffnet werden.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  async forgetRemembered(): Promise<void> {
    await this.vault.forgetOnDevice();
    this.rememberedError.set(null);
    this.toasts.success('Datei und Passwort sind auf diesem Gerät vergessen.');
  }

  setMode(mode: 'open' | 'create' | 'onedrive'): void {
    this.mode.set(mode);
    this.password.set('');
    this.passwordRepeat.set('');

    if (mode === 'onedrive' && this.account() && this.driveFiles() === null) {
      // Still versuchen - klappt es nicht, hilft der Knopf „Anmelden“.
      void this.loadDriveFiles(false);
    }
  }

  setDriveCreate(create: boolean): void {
    this.driveCreate.set(create);
    this.password.set('');
    this.passwordRepeat.set('');
  }

  // --- OneDrive -------------------------------------------------------------

  private async rememberIfWanted(): Promise<void> {
    if (this.remember()) {
      await this.vault.rememberOnDevice();
      this.rememberedError.set(null);
    }
  }

  async signIn(): Promise<void> {
    this.busy.set(true);
    try {
      await this.oneDrive.signIn();
      await this.loadDriveFiles(true);
    } catch (error) {
      if (!(error instanceof FilePickerCancelled)) {
        this.toasts.error(error, 'Die Anmeldung bei Microsoft ist fehlgeschlagen.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  /** Abmelden heißt auch: dieses Gerät vergisst Datei und Passwort. */
  async signOut(): Promise<void> {
    await this.oneDrive.signOut();
    await this.vault.forgetOnDevice();
    this.rememberedError.set(null);
    this.driveFiles.set(null);
    this.selectedFile.set(null);
  }

  async loadDriveFiles(interactive = true): Promise<void> {
    try {
      const files = await this.oneDrive.listFiles(interactive);
      this.driveFiles.set(files);
      // Den einzigen oder zuletzt geänderten Bestand gleich vorauswählen.
      this.selectedFile.set(files[0] ?? null);
      this.driveCreate.set(files.length === 0);
    } catch (error) {
      if (interactive && !(error instanceof FilePickerCancelled)) {
        this.toasts.error(error, 'Die Dateien in OneDrive konnten nicht gelesen werden.');
      }
    }
  }

  async deleteDriveFile(file: OneDriveFile): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: `„${file.name}“ löschen?`,
      message:
        'Die Datei wird aus OneDrive gelöscht und landet dort im Papierkorb. ' +
        'Endgültig weg ist sie erst, wenn sie auch dort gelöscht wird.',
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      await this.oneDrive.delete(file);
      if (this.rememberedFile() === file.name) {
        await this.vault.forgetOnDevice();
      }
      this.toasts.success('Die Datei wurde gelöscht.');
      await this.loadDriveFiles();
    } catch (error) {
      this.toasts.error(error, 'Die Datei konnte nicht gelöscht werden.');
    }
  }

  modifiedText(file: OneDriveFile): string {
    return file.modifiedAt ? new Date(file.modifiedAt).toLocaleString('de-DE') : '';
  }

  async submit(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }

    this.busy.set(true);
    try {
      const selected = this.selectedFile();
      if (this.mode() === 'onedrive' && this.driveCreate()) {
        await this.vault.createInOneDrive(this.newFileName().trim(), this.password());
        await this.rememberIfWanted();
        this.toasts.success('Neuer Datenbestand in OneDrive angelegt.');
      } else if (this.mode() === 'onedrive' && selected) {
        await this.vault.openFromOneDrive(selected, this.password());
        await this.rememberIfWanted();
        this.toasts.success('Datenbestand aus OneDrive geöffnet.');
      } else if (this.mode() === 'create') {
        await this.vault.createNew(this.password());
        this.toasts.success('Neuer Datenbestand angelegt.');
      } else if (this.lastLocalFile()) {
        await this.vault.openLastLocalFile(this.password());
        this.toasts.success('Datenbestand geöffnet.');
      } else {
        await this.vault.open(this.password());
        this.toasts.success('Datenbestand geöffnet.');
      }

      this.password.set('');
      this.passwordRepeat.set('');
    } catch (error) {
      if (!(error instanceof FilePickerCancelled)) {
        this.toasts.error(error, 'Der Datenbestand konnte nicht geöffnet werden.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  /** Lässt die vorgemerkte Datei fallen, damit wieder der Dateidialog kommt. */
  async chooseOtherFile(): Promise<void> {
    await this.vault.forgetLastLocalFile();
  }
}
