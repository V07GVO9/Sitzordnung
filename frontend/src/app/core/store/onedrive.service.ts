/**
 * Ablage des Datenbestands in OneDrive - damit jedes Gerät denselben Stand hat.
 *
 * In OneDrive liegt genau dieselbe verschlüsselte Datei wie auf dem Rechner.
 * Ver- und entschlüsselt wird weiterhin nur im Browser; Microsoft bekommt
 * weder das Passwort noch Namen oder Noten zu sehen.
 *
 * Angemeldet wird über die Microsoft-Bibliothek MSAL (OAuth 2.0 mit PKCE),
 * die Dateien gehen über Microsoft Graph. Beides wird erst geladen, wenn
 * OneDrive tatsächlich gebraucht wird.
 *
 * Gleichzeitiges Arbeiten auf zwei Geräten: Jede Datei hat in OneDrive eine
 * Versionskennung (eTag). Gespeichert wird nur, wenn sie sich seit dem Öffnen
 * nicht geändert hat - sonst meldet die App einen Konflikt, statt den Stand
 * des anderen Geräts zu überschreiben.
 */

import { Injectable, signal } from '@angular/core';
import type { AccountInfo, IPublicClientApplication } from '@azure/msal-browser';
import { AppError } from './app-error';
import { FileHandle, FilePickerCancelled, SaveConflictError, VAULT_EXTENSION } from './file-system';
import { AUTH_REDIRECT_PATH, ONEDRIVE_CONFIG } from './onedrive.config';

const GRAPH = 'https://graph.microsoft.com/v1.0/me/drive';
const SCOPES = ['Files.ReadWrite'];

/** Eine Datei im OneDrive-Ordner der App. */
export interface OneDriveFile {
  id: string;
  name: string;
  size: number;
  modifiedAt: string;
}

interface DriveItem {
  id: string;
  name: string;
  size?: number;
  eTag?: string;
  lastModifiedDateTime?: string;
  file?: unknown;
  '@microsoft.graph.downloadUrl'?: string;
}

@Injectable({ providedIn: 'root' })
export class OneDriveService {
  /** Ist die App bei Microsoft registriert? Sonst bleibt OneDrive ausgeblendet. */
  readonly isConfigured = ONEDRIVE_CONFIG.clientId.trim() !== '';

  /** Das angemeldete Microsoft-Konto, zur Anzeige. */
  readonly account = signal<AccountInfo | null>(null);

  private client: Promise<IPublicClientApplication> | null = null;

  constructor() {
    if (this.isConfigured) {
      // Eine Anmeldung von früher steht im Browser - dann gleich anzeigen.
      void this.msal()
        .then((msal) => this.account.set(msal.getAllAccounts()[0] ?? null))
        .catch(() => undefined);
    }
  }

  private msal(): Promise<IPublicClientApplication> {
    if (!this.isConfigured) {
      return Promise.reject(
        new AppError('OneDrive ist für diese Installation nicht eingerichtet.'),
      );
    }

    this.client ??= import('@azure/msal-browser').then((lib) =>
      lib.createStandardPublicClientApplication({
        auth: {
          clientId: ONEDRIVE_CONFIG.clientId,
          authority: `https://login.microsoftonline.com/${ONEDRIVE_CONFIG.tenant}`,
          redirectUri: location.origin + AUTH_REDIRECT_PATH,
        },
        // Die Anmeldung soll ein Neuladen überstehen. Sie gibt nur Zugriff auf
        // OneDrive - der Datenbestand bleibt ohne Passwort verschlossen.
        cache: { cacheLocation: lib.BrowserCacheLocation.LocalStorage },
      }),
    );
    return this.client;
  }

  /** Meldet bei Microsoft an. Muss aus einem Klick heraus kommen (Anmeldefenster). */
  async signIn(): Promise<void> {
    const msal = await this.msal();
    try {
      const result = await msal.loginPopup({ scopes: SCOPES, prompt: 'select_account' });
      msal.setActiveAccount(result.account);
      this.accept(result);
    } catch (error) {
      throw await translateAuthError(error);
    }
  }

  async signOut(): Promise<void> {
    const msal = await this.msal();
    const account = this.account();
    this.account.set(null);
    writeLastUser(null);
    // Nur in diesem Browser abmelden - die Microsoft-Sitzung bleibt bestehen.
    await msal.clearCache(account ? { account } : undefined);
  }

  /**
   * Holt ein Zugriffstoken. Meist geht das still; ist die Anmeldung
   * abgelaufen, öffnet sich mit `interactive` das Anmeldefenster.
   */
  private async token(interactive: boolean): Promise<string> {
    const msal = await this.msal();
    const account = this.account() ?? msal.getAllAccounts()[0] ?? null;
    const loginHint = account?.username ?? readLastUser() ?? undefined;

    try {
      if (account) {
        return this.accept(await msal.acquireTokenSilent({ scopes: SCOPES, account }));
      }
      // MSAL hält seine Anmeldung nur bis zum Schließen des Browsers. Danach
      // genügt meist die noch laufende Microsoft-Sitzung - still, ohne Fenster.
      if (!interactive && loginHint) {
        return this.accept(await msal.ssoSilent({ scopes: SCOPES, loginHint }));
      }
    } catch (error) {
      if (!interactive) {
        throw new AppError(
          'Die Anmeldung bei OneDrive muss erneuert werden. Ein Klick auf „Öffnen“ bzw. „Speichern“ genügt.',
        );
      }
      console.warn('Stille Anmeldung bei OneDrive fehlgeschlagen', error);
    }

    if (!interactive) {
      throw new AppError('Nicht bei OneDrive angemeldet.');
    }

    try {
      return this.accept(
        await msal.acquireTokenPopup({
          scopes: SCOPES,
          account: account ?? undefined,
          loginHint: account ? undefined : loginHint,
        }),
      );
    } catch (error) {
      throw await translateAuthError(error);
    }
  }

  /** Merkt sich das Konto der erfolgreichen Anmeldung. */
  private accept(result: { accessToken: string; account: AccountInfo | null }): string {
    if (result.account) {
      this.account.set(result.account);
      writeLastUser(result.account.username);
    }
    return result.accessToken;
  }

  private async graph(
    path: string,
    init: RequestInit = {},
    interactive = false,
  ): Promise<Response> {
    const token = await this.token(interactive);
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);

    let response: Response;
    try {
      response = await fetch(GRAPH + path, { ...init, headers });
    } catch {
      throw new AppError('OneDrive ist nicht erreichbar. Besteht eine Internetverbindung?');
    }

    if (response.status === 401) {
      throw new AppError('OneDrive hat die Anmeldung abgelehnt. Bitte neu anmelden.');
    }
    if (response.status === 403) {
      throw new AppError(
        'OneDrive verweigert den Zugriff. Möglicherweise muss die Schule die App erst freigeben.',
      );
    }
    return response;
  }

  /** Die Datenbestände im OneDrive-Ordner der App. */
  async listFiles(interactive = true): Promise<OneDriveFile[]> {
    const response = await this.graph(
      `/root:/${encodeURIComponent(ONEDRIVE_CONFIG.folder)}:/children` +
        '?$select=id,name,size,lastModifiedDateTime,file&$top=200',
      {},
      interactive,
    );

    // Der Ordner entsteht erst mit der ersten Datei.
    if (response.status === 404) {
      return [];
    }
    await requireOk(response, 'Die Dateien in OneDrive konnten nicht gelesen werden.');

    const { value } = (await response.json()) as { value: DriveItem[] };
    return value
      .filter((item) => item.file && item.name.endsWith(VAULT_EXTENSION))
      .map((item) => ({
        id: item.id,
        name: item.name,
        size: item.size ?? 0,
        modifiedAt: item.lastModifiedDateTime ?? '',
      }))
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }

  /** Lädt eine Datei und gibt sie samt Griff zum Zurückschreiben zurück. */
  async open(
    file: Pick<OneDriveFile, 'id' | 'name'>,
    interactive = true,
  ): Promise<{ content: string; handle: FileHandle }> {
    const { blob, item } = await this.download(file.id, interactive);
    const handle = new OneDriveHandle(this, item.id, item.name);
    handle.eTag = item.eTag ?? null;
    return { content: await blob.text(), handle };
  }

  /** Legt eine neue Datei an. Eine vorhandene gleichen Namens bleibt unangetastet. */
  async create(name: string, content: Blob): Promise<FileHandle> {
    const fileName = name.endsWith(VAULT_EXTENSION) ? name : name + VAULT_EXTENSION;
    const path = `/${ONEDRIVE_CONFIG.folder}/${fileName}`
      .split('/')
      .map(encodeURIComponent)
      .join('/');

    const response = await this.graph(
      `/root:${path}:/content?@microsoft.graph.conflictBehavior=fail`,
      { method: 'PUT', body: content, headers: { 'Content-Type': 'application/octet-stream' } },
      true,
    );

    if (response.status === 409) {
      throw new AppError(`In OneDrive gibt es schon eine Datei „${fileName}“.`);
    }
    await requireOk(response, 'Die Datei konnte in OneDrive nicht angelegt werden.');

    const item = (await response.json()) as DriveItem;
    const handle = new OneDriveHandle(this, item.id, item.name);
    handle.eTag = item.eTag ?? null;
    return handle;
  }

  /** Löscht eine Datei. OneDrive legt sie in seinen Papierkorb. */
  async delete(file: OneDriveFile): Promise<void> {
    const response = await this.graph(`/items/${file.id}`, { method: 'DELETE' }, true);
    if (response.status !== 404) {
      await requireOk(response, 'Die Datei konnte in OneDrive nicht gelöscht werden.');
    }
  }

  // --- Für den Dateigriff ---------------------------------------------------

  /** @internal */
  async download(id: string, interactive = false): Promise<{ blob: Blob; item: DriveItem }> {
    const response = await this.graph(`/items/${id}`, {}, interactive);
    if (response.status === 404) {
      throw new AppError('Die Datei gibt es in OneDrive nicht mehr.');
    }
    await requireOk(response, 'Die Datei konnte aus OneDrive nicht geladen werden.');

    const item = (await response.json()) as DriveItem;
    const url = item['@microsoft.graph.downloadUrl'];
    if (!url) {
      throw new AppError('OneDrive hat keinen Download für die Datei geliefert.');
    }

    // Der Link ist vorab berechtigt und kurzlebig - ohne Token abrufen.
    const content = await fetch(url);
    await requireOk(content, 'Die Datei konnte aus OneDrive nicht geladen werden.');
    return { blob: await content.blob(), item };
  }

  /** @internal */
  async upload(id: string, content: Blob, eTag: string | null): Promise<DriveItem> {
    const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream' };
    if (eTag) {
      headers['If-Match'] = eTag;
    }

    const response = await this.graph(`/items/${id}/content`, {
      method: 'PUT',
      body: content,
      headers,
    });

    if (response.status === 412) {
      throw new SaveConflictError();
    }
    if (response.status === 404) {
      throw new AppError(
        'Die Datei gibt es in OneDrive nicht mehr. Bitte unter „Datei“ neu in OneDrive speichern.',
      );
    }
    await requireOk(response, 'Die Datei konnte nicht in OneDrive gespeichert werden.');
    return (await response.json()) as DriveItem;
  }

  /** Sorgt für eine gültige Anmeldung - mit `interactive` notfalls per Anmeldefenster. */
  async ensureToken(interactive: boolean): Promise<void> {
    await this.token(interactive);
  }
}

/** Eine Datei in OneDrive, die sich wie ein Datei-Griff auf dem Rechner verhält. */
class OneDriveHandle implements FileHandle {
  readonly location = 'onedrive' as const;

  /** Die Version, auf der der geöffnete Stand beruht. */
  eTag: string | null = null;

  private overwrite = false;

  constructor(
    private readonly drive: OneDriveService,
    readonly remoteId: string,
    public name: string,
  ) {}

  async queryPermission(): Promise<PermissionState> {
    return this.drive.account() ? 'granted' : 'prompt';
  }

  async prepare(interactive: boolean): Promise<void> {
    await this.drive.ensureToken(interactive);
  }

  allowOverwrite(): void {
    this.overwrite = true;
  }

  async getFile(): Promise<File> {
    const { blob, item } = await this.drive.download(this.remoteId);
    this.eTag = item.eTag ?? null;
    this.name = item.name;
    return new File([blob], item.name);
  }

  async createWritable() {
    let content: Blob = new Blob();
    return {
      write: async (data: Blob) => {
        content = data;
      },
      close: async () => {
        const item = await this.drive.upload(
          this.remoteId,
          content,
          this.overwrite ? null : this.eTag,
        );
        this.overwrite = false;
        this.eTag = item.eTag ?? null;
      },
    };
  }
}

/** Das zuletzt angemeldete Konto - als Hinweis für die stille Anmeldung. */
const LAST_USER_KEY = 'sitzordnung.oneDriveUser';

function readLastUser(): string | null {
  try {
    return localStorage.getItem(LAST_USER_KEY);
  } catch {
    return null;
  }
}

function writeLastUser(username: string | null): void {
  try {
    if (username) {
      localStorage.setItem(LAST_USER_KEY, username);
    } else {
      localStorage.removeItem(LAST_USER_KEY);
    }
  } catch {
    // Ohne Speicher wird beim nächsten Start eben nachgefragt.
  }
}

async function requireOk(response: Response, message: string): Promise<void> {
  if (!response.ok) {
    let detail = '';
    try {
      detail = ((await response.json()) as { error?: { message?: string } }).error?.message ?? '';
    } catch {
      // Ohne lesbare Antwort bleibt es bei der allgemeinen Meldung.
    }
    throw new AppError(detail ? `${message} (${detail})` : message);
  }
}

/** Übersetzt die Fehler der Anmeldung in Meldungen, die eine Lehrkraft versteht. */
async function translateAuthError(error: unknown): Promise<Error> {
  const { BrowserAuthError, BrowserAuthErrorCodes } = await import('@azure/msal-browser');

  if (error instanceof BrowserAuthError) {
    switch (error.errorCode) {
      case BrowserAuthErrorCodes.userCancelled:
        return new FilePickerCancelled();
      case BrowserAuthErrorCodes.popupWindowError:
      case BrowserAuthErrorCodes.emptyWindowError:
        return new AppError(
          'Das Anmeldefenster wurde blockiert. Bitte Pop-ups für diese Seite erlauben.',
        );
      case BrowserAuthErrorCodes.interactionInProgress:
        return new AppError('Eine Anmeldung läuft bereits in einem anderen Fenster.');
    }
  }

  const text = error instanceof Error ? error.message : String(error);
  // AADSTS65001 / 90094: Die Schule lässt Zustimmungen durch Lehrkräfte nicht zu.
  if (/AADSTS(65001|90094|90095)/.test(text)) {
    return new AppError(
      'Die Schule muss die App für OneDrive erst freigeben (Administrator-Zustimmung).',
    );
  }
  return new AppError(`Die Anmeldung bei Microsoft ist fehlgeschlagen. ${text}`);
}
