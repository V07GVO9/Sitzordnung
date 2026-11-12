/**
 * Liest den Text einer PDF-Datei aus - ohne Bibliothek, nur so weit, wie es der
 * Import von Mitarbeitsübersichten braucht.
 *
 * Die Übersichten aus der Schul-App auf dem iPad werden über den
 * iOS-Druckdialog erzeugt. Darin steckt die Schrift "AppleSDGothicNeo" ohne
 * eingebettete Zeichentabelle - Standardwerkzeuge zeigen deshalb keinen oder
 * falschen Text. Die Zeichennummern folgen aber der Adobe-Korea1-Ordnung, in
 * der die Nummern 1 bis 95 genau die ASCII-Zeichen sind. Für Umlaute und die
 * Symbole der Bewertungsspalten gibt es eine kleine Zusatztabelle. Unbekannte
 * Zeichen werden zu "?" - die Namenszuordnung behandelt sie als Platzhalter.
 */

/** Ein Textstück mit seiner Position (x nach rechts, y nach unten). */
export interface PdfTextItem {
  x: number;
  y: number;
  text: string;
}

/** Eine Zeile: die Textstücke gleicher Höhe, von links nach rechts. */
export type PdfLine = PdfTextItem[];

/** Ein Inhaltsbereich - in der Regel genau eine Seite. */
export type PdfPage = PdfLine[];

/** Zeichen außerhalb des ASCII-Bereichs, die in den Übersichten vorkommen. */
const EXTRA_CHARACTERS: Record<number, string> = {
  0x46f2: 'ä',
  0x46f3: 'ë',
  0x46f4: 'ï',
  0x46f5: 'ö',
  0x46f6: 'ü',
  // Kreis = neutrale Bewertung
  0x009f: 'o',
  // Durchschnitt
  0x02a1: 'Ø',
  // Tendenzpfeile hinter dem Durchschnitt - für den Import ohne Bedeutung
  0x23e8: '',
  0x23e9: '',
};

/** Wandelt eine Zeichennummer (CID) in Text um. */
export function cidToText(cid: number): string {
  if (cid >= 1 && cid <= 0x5f) {
    return String.fromCharCode(cid + 0x1f);
  }
  return EXTRA_CHARACTERS[cid] ?? '?';
}

/** Liest einen Hex-String `<...>` - zwei Byte je Zeichen (Identity-H). */
function decodeHex(hex: string): string {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length % 4 !== 0) {
    // Ein Byte je Zeichen - bei einfachen Schriften.
    let text = '';
    for (let i = 0; i + 1 < clean.length; i += 2) {
      text += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
    }
    return text;
  }

  let text = '';
  for (let i = 0; i < clean.length; i += 4) {
    text += cidToText(parseInt(clean.slice(i, i + 4), 16));
  }
  return text;
}

/** Liest einen Literal-String `(...)` samt Escape-Sequenzen. */
function decodeLiteral(body: string): string {
  return body.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, esc: string) => {
    const simple: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
    if (esc in simple) {
      return simple[esc];
    }
    if (/^[0-7]+$/.test(esc)) {
      return String.fromCharCode(parseInt(esc, 8));
    }
    return esc;
  });
}

/** Text aus dem Operanden von Tj bzw. TJ. */
function decodeOperand(operand: string): string {
  let text = '';
  const parts = /<([0-9a-fA-F\s]*)>|\(((?:\\.|[^\\)])*)\)/g;
  for (let m = parts.exec(operand); m; m = parts.exec(operand)) {
    text += m[1] !== undefined ? decodeHex(m[1]) : decodeLiteral(m[2]);
  }
  return text;
}

/**
 * Holt die Textstücke aus einem (entpackten) Inhaltsstrom. Ausgewertet werden
 * die Position aus Tm/Td und der Text aus Tj/TJ.
 */
export function extractTextItems(content: string): PdfTextItem[] {
  const items: PdfTextItem[] = [];
  const blocks = /\bBT\b([\s\S]*?)\bET\b/g;

  for (let block = blocks.exec(content); block; block = blocks.exec(content)) {
    let x = 0;
    let y = 0;
    const ops =
      /([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm|([-\d.]+)\s+([-\d.]+)\s+T[dD]|(\[(?:[^\]\\]|\\.)*\]|<[0-9a-fA-F\s]*>|\((?:\\.|[^\\)])*\))\s*(TJ|Tj|'|")/g;

    for (let op = ops.exec(block[1]); op; op = ops.exec(block[1])) {
      if (op[1] !== undefined) {
        x = Number(op[5]);
        y = Number(op[6]);
      } else if (op[7] !== undefined) {
        x += Number(op[7]);
        y += Number(op[8]);
      } else {
        const text = decodeOperand(op[9]);
        if (text.trim() !== '') {
          items.push({ x, y, text: text.trim() });
        }
      }
    }
  }

  return items;
}

/** Fasst Textstücke gleicher Höhe zu Zeilen zusammen - von oben nach unten. */
export function groupLines(items: PdfTextItem[], tolerance = 2): PdfLine[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: PdfLine[] = [];

  for (const item of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line[0].y - item.y) <= tolerance) {
      line.push(item);
    } else {
      lines.push([item]);
    }
  }

  return lines.map((line) => line.sort((a, b) => a.x - b.x));
}

function latin1(bytes: Uint8Array): string {
  let text = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    text += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return text;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Liest alle Inhaltsströme mit Text aus einer PDF-Datei. Bilder und Schriften
 * werden übersprungen, gepackte Ströme (FlateDecode) entpackt.
 */
export async function readPdfPages(bytes: Uint8Array): Promise<PdfPage[]> {
  const raw = latin1(bytes);
  if (!raw.startsWith('%PDF')) {
    throw new Error('Die Datei ist keine PDF-Datei.');
  }

  const pages: PdfPage[] = [];
  const streams = />>\s*stream\r?\n/g;

  for (let m = streams.exec(raw); m; m = streams.exec(raw)) {
    // Das Wörterbuch des Stroms: vom Beginn seines Objekts bis "stream".
    const dict = raw.slice(Math.max(0, raw.lastIndexOf(' obj', m.index)), m.index);
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) {
      break;
    }
    streams.lastIndex = end;

    if (/\/Subtype\s*\/Image|\/FontFile|\/Type\s*\/(XRef|ObjStm|Metadata)/.test(dict)) {
      continue;
    }

    // Die Länge steht meist direkt im Wörterbuch - sonst gilt alles bis
    // "endstream" ohne den abschließenden Zeilenumbruch. Überzählige Bytes
    // würden das Entpacken scheitern lassen.
    const length = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
    let stop = end;
    if (length && start + Number(length[1]) <= end) {
      stop = start + Number(length[1]);
    } else {
      while (stop > start && (raw[stop - 1] === '\n' || raw[stop - 1] === '\r')) {
        stop--;
      }
    }

    let data = bytes.subarray(start, stop);
    if (/\/FlateDecode/.test(dict)) {
      try {
        data = await inflate(data);
      } catch {
        continue;
      }
    } else if (/\/Filter/.test(dict)) {
      continue;
    }

    const content = latin1(data);
    if (!/\bBT\b/.test(content)) {
      continue;
    }

    const items = extractTextItems(content);
    if (items.length) {
      pages.push(groupLines(items));
    }
  }

  return pages;
}
