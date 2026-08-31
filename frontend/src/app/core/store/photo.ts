/**
 * Nimmt ein Foto entgegen und verkleinert es.
 *
 * Die Bilder liegen jetzt im selben Datenbestand wie alles andere. Ein Foto
 * direkt aus der Kamera würde die Datei um ein Vielfaches aufblähen, ohne dass
 * die Sitzordnung davon etwas hätte - für ein Bild von 2 cm Kantenlänge auf dem
 * Bildschirm genügt eine Kantenlänge von 400 Bildpunkten.
 */

import { AppError } from './app-error';

/** Größte Kantenlänge des gespeicherten Bildes. */
const MAX_EDGE = 400;

/** Größe der Datei, die entgegengenommen wird (5 MB) - wie früher im Backend. */
const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Liest das Foto ein und gibt es verkleinert als Data-URL zurück. */
export async function readPhoto(file: File): Promise<string> {
  if (!file || file.size === 0) {
    throw new AppError('Es wurde keine Datei ausgewählt.');
  }

  if (file.size > MAX_BYTES) {
    throw new AppError('Das Foto ist größer als 5 MB.');
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new AppError('Erlaubt sind nur JPEG-, PNG-, WebP- und GIF-Bilder.');
  }

  const bitmap = await createBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new AppError('Das Bild konnte nicht verarbeitet werden.');
  }

  context.drawImage(bitmap, 0, 0, width, height);

  // JPEG, weil die Bilder Fotos sind - PNG wäre um ein Vielfaches größer.
  return canvas.toDataURL('image/jpeg', 0.82);
}

/**
 * createImageBitmap ist der schnelle Weg; für Browser ohne diese Funktion
 * bleibt der Umweg über ein Image-Element.
 */
async function createBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Weiter mit dem Rückfallweg.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new AppError('Das Bild konnte nicht gelesen werden.'));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
