/**
 * Ein kleiner Excel-Schreiber (.xlsx): Tabellenblätter mit Text und Zahlen,
 * Fett/Kursiv, Hintergrundfarbe, Rahmen, verbundenen Zellen, Spaltenbreiten
 * und fixierten Zeilen/Spalten. Mehr braucht der Notenexport nicht.
 */

import { createZip } from './zip';

export type BorderWeight = 'thin' | 'medium' | 'thick';

export interface XlsxStyle {
  bold?: boolean;
  italic?: boolean;
  /** Schriftfarbe als RGB, etwa "777777". */
  color?: string;
  /** Hintergrund als RGB, etwa "EEEEEE". */
  fill?: string;
  align?: 'left' | 'center';
  wrap?: boolean;
  /** Zahlenformat, etwa "0.0". */
  numFmt?: string;
  border?: { left?: BorderWeight; right?: BorderWeight; top?: BorderWeight; bottom?: BorderWeight };
}

export interface XlsxCell {
  value: string | number | null;
  style?: XlsxStyle;
}

export interface XlsxMerge {
  row1: number;
  col1: number;
  row2: number;
  col2: number;
}

export interface XlsxSheet {
  name: string;
  /** Zeilen von oben, Zellen von links - jeweils ab 0. */
  rows: XlsxCell[][];
  merges?: XlsxMerge[];
  /** Breite je Spalte in Zeichen. */
  colWidths?: number[];
  /** So viele Zeilen oben und Spalten links bleiben beim Blättern stehen. */
  freeze?: { rows: number; cols: number };
  landscape?: boolean;
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

/** 0 → A, 25 → Z, 26 → AA. */
export function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

export function cellRef(row: number, col: number): string {
  return `${columnName(col)}${row + 1}`;
}

/** Blattnamen dürfen höchstens 31 Zeichen haben, keine []:*?/\ und müssen eindeutig sein. */
export function sheetNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((raw) => {
    const base =
      raw
        .replace(/[[\]:*?/\\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || 'Blatt';
    let name = base.slice(0, 31);
    for (let n = 2; used.has(name.toLowerCase()); n++) {
      const suffix = ` (${n})`;
      name = base.slice(0, 31 - suffix.length) + suffix;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

/** Sammelt Schriften, Füllungen, Rahmen und Formate und vergibt ihre Nummern. */
class StyleTable {
  private readonly fonts = ['<font><sz val="11"/><name val="Calibri"/></font>'];
  private readonly fills = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
  ];
  private readonly borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
  private readonly numFmts: string[] = [];
  private readonly xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  private readonly xfIndex = new Map<string, number>();

  private indexOf(list: string[], xml: string): number {
    const found = list.indexOf(xml);
    if (found >= 0) {
      return found;
    }
    list.push(xml);
    return list.length - 1;
  }

  styleId(style: XlsxStyle | undefined): number {
    if (!style) {
      return 0;
    }
    const fontXml =
      '<font>' +
      (style.bold ? '<b/>' : '') +
      (style.italic ? '<i/>' : '') +
      '<sz val="11"/>' +
      (style.color ? `<color rgb="FF${style.color}"/>` : '') +
      '<name val="Calibri"/></font>';
    const fontId = this.indexOf(this.fonts, fontXml);
    const fillId = style.fill
      ? this.indexOf(
          this.fills,
          `<fill><patternFill patternType="solid"><fgColor rgb="FF${style.fill}"/><bgColor indexed="64"/></patternFill></fill>`,
        )
      : 0;
    const b = style.border ?? {};
    const side = (tag: string, weight?: BorderWeight) =>
      weight ? `<${tag} style="${weight}"><color rgb="FF000000"/></${tag}>` : `<${tag}/>`;
    const borderId = this.indexOf(
      this.borders,
      '<border>' +
        side('left', b.left) +
        side('right', b.right) +
        side('top', b.top) +
        side('bottom', b.bottom) +
        '<diagonal/></border>',
    );
    const numFmtId = style.numFmt ? 164 + this.indexOf(this.numFmts, style.numFmt) : 0;

    const align =
      style.align || style.wrap
        ? `<alignment${style.align ? ` horizontal="${style.align}"` : ''} vertical="center"${
            style.wrap ? ' wrapText="1"' : ''
          }/>`
        : '';
    const xf =
      `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"` +
      (numFmtId ? ' applyNumberFormat="1"' : '') +
      (fontId ? ' applyFont="1"' : '') +
      (fillId ? ' applyFill="1"' : '') +
      (borderId ? ' applyBorder="1"' : '') +
      (align ? ` applyAlignment="1">${align}</xf>` : '/>');
    let id = this.xfIndex.get(xf);
    if (id === undefined) {
      this.xfs.push(xf);
      id = this.xfs.length - 1;
      this.xfIndex.set(xf, id);
    }
    return id;
  }

  toXml(): string {
    const numFmts = this.numFmts.length
      ? `<numFmts count="${this.numFmts.length}">${this.numFmts
          .map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${escapeXml(f)}"/>`)
          .join('')}</numFmts>`
      : '';
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      numFmts +
      `<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts>` +
      `<fills count="${this.fills.length}">${this.fills.join('')}</fills>` +
      `<borders count="${this.borders.length}">${this.borders.join('')}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Standard" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>'
    );
  }
}

function sheetXml(sheet: XlsxSheet, styles: StyleTable): string {
  const freeze = sheet.freeze;
  const pane =
    freeze && (freeze.rows || freeze.cols)
      ? `<pane${freeze.cols ? ` xSplit="${freeze.cols}"` : ''}${
          freeze.rows ? ` ySplit="${freeze.rows}"` : ''
        } topLeftCell="${cellRef(freeze.rows, freeze.cols)}" activePane="bottomRight" state="frozen"/>`
      : '';
  const cols = sheet.colWidths?.length
    ? `<cols>${sheet.colWidths
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join('')}</cols>`
    : '';

  const rows = sheet.rows
    .map((cells, r) => {
      const xml = cells
        .map((cell, c) => {
          const ref = cellRef(r, c);
          const s = styles.styleId(cell.style);
          const sAttr = s ? ` s="${s}"` : '';
          if (cell.value === null || cell.value === '') {
            return s ? `<c r="${ref}"${sAttr}/>` : '';
          }
          if (typeof cell.value === 'number') {
            return `<c r="${ref}"${sAttr}><v>${cell.value}</v></c>`;
          }
          return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${escapeXml(
            cell.value,
          )}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${xml}</row>`;
    })
    .join('');

  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges
        .map((m) => `<mergeCell ref="${cellRef(m.row1, m.col1)}:${cellRef(m.row2, m.col2)}"/>`)
        .join('')}</mergeCells>`
    : '';

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    cols +
    `<sheetData>${rows}</sheetData>` +
    merges +
    '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
    `<pageSetup paperSize="9" orientation="${
      sheet.landscape ? 'landscape' : 'portrait'
    }" fitToWidth="1" fitToHeight="0"/>` +
    '</worksheet>'
  );
}

/** Baut die Arbeitsmappe als Bytes einer .xlsx-Datei. */
export function buildXlsx(sheets: XlsxSheet[]): Uint8Array {
  const styles = new StyleTable();
  const names = sheetNames(sheets.map((s) => s.name));
  const sheetFiles = sheets.map((sheet) => sheetXml(sheet, styles));
  const encoder = new TextEncoder();
  const file = (name: string, xml: string) => ({ name, data: encoder.encode(xml) });

  return createZip([
    file(
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join('') +
        '</Types>',
    ),
    file(
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ),
    file(
      'xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets>' +
        names
          .map((n, i) => `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
          .join('') +
        '</sheets></workbook>',
    ),
    file(
      'xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join('') +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>',
    ),
    file('xl/styles.xml', styles.toXml()),
    ...sheetFiles.map((xml, i) => file(`xl/worksheets/sheet${i + 1}.xml`, xml)),
  ]);
}

export function xlsxBlob(sheets: XlsxSheet[]): Blob {
  return new Blob([buildXlsx(sheets) as BlobPart], { type: XLSX_TYPE });
}
