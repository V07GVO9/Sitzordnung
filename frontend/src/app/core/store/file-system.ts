/**
 * Zugriff auf eine Datei auf dem Rechner.
 *
 * Wo der Browser die File System Access API anbietet (Chrome, Edge), merkt
 * sich die App die gewählte Datei und schreibt beim Speichern direkt dorthin
 * zurück. Sonst bleibt es beim klassischen Öffnen-Dialog und Download -
 * das funktioniert in jedem Browser.
 */

/** Der Teil der File System Access API, den die App benutzt. */
export interface FileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
}

interface FilePickerWindow {
  showOpenFilePicker?(options?: unknown): Promise<FileHandle[]>;
  showSaveFilePicker?(options?: unknown): Promise<FileHandle>;
}

/** Die Dateiendung, unter der die App ihren Datenbestand ablegt. */
export const VAULT_EXTENSION = '.sitzordnung';

const PICKER_OPTIONS = {
  types: [
    {
      description: 'Sitzordnung-Datenbestand',
      accept: { 'application/json': [VAULT_EXTENSION] },
    },
  ],
};

function picker(): FilePickerWindow {
  return window as unknown as FilePickerWindow;
}

/** Kann der Browser direkt in eine gewählte Datei zurückschreiben? */
export function supportsFileHandles(): boolean {
  return typeof picker().showSaveFilePicker === 'function';
}

/** Wird geworfen, wenn der Benutzer den Dateidialog abbricht. */
export class FilePickerCancelled extends Error {}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Öffnet den Dateidialog und gibt Inhalt und - falls möglich - die Datei zurück. */
export async function openFile(): Promise<{ content: string; handle: FileHandle | null; name: string }> {
  const show = picker().showOpenFilePicker;

  if (show) {
    try {
      const [handle] = await show(PICKER_OPTIONS);
      const file = await handle.getFile();
      return { content: await file.text(), handle, name: handle.name };
    } catch (error) {
      if (isAbort(error)) {
        throw new FilePickerCancelled();
      }
      // Lehnt der Browser den Dialog ab - etwa in einem eingebetteten Fenster -
      // bleibt der Weg über das Dateifeld.
    }
  }

  return openViaInput();
}

/** Der Rückfallweg: ein verstecktes Dateifeld. */
function openViaInput(): Promise<{ content: string; handle: null; name: string }> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = VAULT_EXTENSION + ',application/json';

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new FilePickerCancelled());
        return;
      }

      resolve({ content: await file.text(), handle: null, name: file.name });
    };

    // Bricht der Benutzer ab, meldet der Browser das nicht zuverlässig - der
    // Dialog bleibt dann einfach ohne Folge, was hier ausreicht.
    input.click();
  });
}

/** Fragt nach einem Speicherort für eine neue Datei. */
export async function chooseSaveFile(suggestedName: string): Promise<FileHandle | null> {
  const show = picker().showSaveFilePicker;
  if (!show) {
    return null;
  }

  try {
    return await show({ ...PICKER_OPTIONS, suggestedName });
  } catch (error) {
    if (isAbort(error)) {
      throw new FilePickerCancelled();
    }
    throw error;
  }
}

/** Schreibt den Inhalt in die gemerkte Datei. */
export async function writeFile(handle: FileHandle, blob: Blob): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

/** Bietet den Inhalt als Download an - der Weg ohne File System Access API. */
export function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // Erst freigeben, wenn der Browser den Download übernommen hat.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
