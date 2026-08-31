import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AutosaveEntry } from '../core/store/browser-storage';
import { FilePickerCancelled } from '../core/store/file-system';
import { LocalStore } from '../core/store/local-store';
import { VaultService } from '../core/store/vault.service';
import { ToastService } from '../core/toast.service';

/**
 * Der Startbildschirm. Solange kein Datenbestand geöffnet ist, zeigt die App
 * nichts als diese Karte - ohne Datei gibt es keine Daten.
 */
@Component({
  selector: 'app-vault-gate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './vault-gate.html',
  styleUrl: './vault-gate.scss',
})
export class VaultGate {
  private readonly vault = inject(VaultService);
  private readonly store = inject(LocalStore);
  private readonly toasts = inject(ToastService);

  /** Welcher Weg ist gerade gewählt: vorhandene Datei oder neuer Bestand? */
  readonly mode = signal<'open' | 'create'>('open');

  readonly password = signal('');
  readonly passwordRepeat = signal('');
  readonly busy = signal(false);

  /** Ein Zwischenstand aus dem Browser, falls einer vorliegt. */
  readonly autosave = signal<AutosaveEntry | null>(null);

  readonly canWriteInPlace = this.vault.canWriteInPlace;

  readonly passwordsMatch = computed(
    () => this.mode() === 'open' || this.password() === this.passwordRepeat(),
  );

  readonly canSubmit = computed(
    () => !this.busy() && this.password().length >= 8 && this.passwordsMatch(),
  );

  constructor() {
    void this.vault.findAutosave().then((entry) => this.autosave.set(entry));
  }

  setMode(mode: 'open' | 'create'): void {
    this.mode.set(mode);
    this.password.set('');
    this.passwordRepeat.set('');
  }

  /** Wann wurde der Zwischenstand angelegt? */
  savedAtText(entry: AutosaveEntry): string {
    return new Date(entry.savedAt).toLocaleString('de-DE');
  }

  async submit(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }

    this.busy.set(true);
    try {
      if (this.mode() === 'create') {
        await this.vault.createNew(this.password());
        this.toasts.success('Neuer Datenbestand angelegt.');
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

  /** Setzt auf dem Zwischenstand im Browser auf. */
  async restore(): Promise<void> {
    const entry = this.autosave();
    if (!entry || this.password().length === 0) {
      return;
    }

    this.busy.set(true);
    try {
      await this.vault.restoreAutosave(entry, this.password());
      this.toasts.success('Zwischenstand geladen. Bitte in einer Datei sichern.');
      this.password.set('');
    } catch (error) {
      this.toasts.error(error, 'Der Zwischenstand konnte nicht geladen werden.');
    } finally {
      this.busy.set(false);
    }
  }

  /** Verwirft den Zwischenstand im Browser. */
  async discardAutosave(): Promise<void> {
    const confirmed = confirm(
      'Den Zwischenstand im Browser endgültig löschen? Was nicht in einer Datei steht, ist danach weg.',
    );
    if (!confirmed) {
      return;
    }

    await this.vault.closeVault();
    this.autosave.set(null);
    this.store.close();
    this.toasts.success('Der Zwischenstand wurde gelöscht.');
  }
}
