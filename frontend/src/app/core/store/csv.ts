/**
 * Baut CSV-Dateien, die Excel im deutschsprachigen Raum direkt richtig öffnet:
 * Semikolon als Trennzeichen und UTF-8 mit BOM.
 *
 * Portiert aus dem früheren CsvBuilder des Backends.
 */

import { formatDateGerman } from './time';

/**
 * Ein Wert aus einer festen Auswahl der App - etwa das Bewertungszeichen "++".
 * Solche Werte stammen nicht aus Benutzereingaben und werden deshalb nicht
 * gegen Formeln abgesichert, damit sie in der Tabelle lesbar bleiben.
 */
export class CsvLiteral {
  constructor(readonly value: string) {}
}

/** Ein Datum im Format `YYYY-MM-DD`, das als deutsches Datum ausgegeben wird. */
export class CsvDate {
  constructor(readonly dateKey: string) {}
}

export type CsvValue = string | number | boolean | null | undefined | CsvLiteral | CsvDate;

const SEPARATOR = ';';

export class CsvBuilder {
  private readonly lines: string[] = [];

  addRow(...values: CsvValue[]): this {
    this.lines.push(values.map(escape).join(SEPARATOR));
    return this;
  }

  /** Gibt die Datei als UTF-8-Blob mit vorangestelltem BOM zurück. */
  toBlob(): Blob {
    const text = this.lines.map((line) => line + '\r\n').join('');
    return new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  }
}

/** Prüft, ob der Text als deutsche Zahl durchgeht - dann ist er unbedenklich. */
function isNumeric(text: string): boolean {
  return /^[+-]?\d{1,3}(\.\d{3})*(,\d+)?$/.test(text) || /^[+-]?\d+(,\d+)?$/.test(text);
}

/**
 * Setzt Felder mit Trennzeichen, Anführungszeichen oder Zeilenumbruch in
 * Anführungszeichen. Führende =, +, - und @ werden entschärft, damit Excel
 * den Inhalt nicht als Formel auswertet.
 */
function escape(value: CsvValue): string {
  let text: string;

  if (value === null || value === undefined) {
    text = '';
  } else if (value instanceof CsvLiteral) {
    text = value.value;
  } else if (value instanceof CsvDate) {
    text = formatDateGerman(value.dateKey);
  } else if (typeof value === 'boolean') {
    text = value ? 'ja' : 'nein';
  } else if (typeof value === 'number') {
    text = String(value).replace('.', ',');
  } else {
    text = value;
  }

  // Reine Zahlen sind unbedenklich - negative Punktzahlen sollen als Zahl ankommen.
  const looksLikeFormula =
    !(value instanceof CsvLiteral) &&
    text.length > 0 &&
    ['=', '+', '-', '@'].includes(text[0]) &&
    !isNumeric(text);

  if (looksLikeFormula) {
    text = "'" + text;
  }

  if (
    text.includes(SEPARATOR) ||
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r')
  ) {
    text = '"' + text.replace(/"/g, '""') + '"';
  }

  return text;
}
