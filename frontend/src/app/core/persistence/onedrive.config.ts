/**
 * Zugangsdaten für die Anmeldung bei Microsoft (OneDrive).
 *
 * Die Anwendung muss dafür einmal bei Microsoft registriert werden - wie das
 * geht, steht in docs/onedrive-einrichten.md. Die Anwendungs-ID ist kein
 * Geheimnis: Sie steht ohnehin in jeder ausgelieferten Seite.
 *
 * Bleibt die ID leer, blendet die App die OneDrive-Ablage aus.
 */
export const ONEDRIVE_CONFIG = {
  /** „Anwendungs-ID (Client)“ aus der App-Registrierung. */
  clientId: '',

  /**
   * Wer sich anmelden darf. `common`: Schul- bzw. Arbeitskonten und private
   * Microsoft-Konten. Die Mandanten-ID der Schule beschränkt auf deren Konten.
   */
  tenant: 'common',

  /** Der Ordner in OneDrive, in dem die Datenbestände liegen. */
  folder: 'Sitzordnung',
};

/** Hierhin leitet Microsoft nach der Anmeldung zurück; main.ts nimmt die Antwort an. */
export const AUTH_REDIRECT_PATH = '/auth';
