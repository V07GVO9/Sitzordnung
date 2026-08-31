/**
 * Ein fachlicher Fehler mit einem Text, der direkt angezeigt werden kann -
 * an der Stelle, an der früher das Backend mit 400, 403, 404 oder 409 antwortete.
 */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppError';
  }
}
