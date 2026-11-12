import { cidToText, extractTextItems, groupLines, readPdfPages } from './pdf-text';

/** Kodiert Text so, wie ihn der iOS-Druckdialog schreibt (Korea1-CIDs, Identity-H). */
function hex(text: string): string {
  const special: Record<string, number> = { ä: 0x46f2, ö: 0x46f5, ü: 0x46f6 };
  return (
    '<' +
    [...text]
      .map((ch) => {
        const cid = special[ch] ?? ch.charCodeAt(0) - 0x1f;
        return cid.toString(16).padStart(4, '0');
      })
      .join('') +
    '>'
  );
}

function textBlock(x: number, y: number, text: string): string {
  return `q 1 0 0 -1 0 842 cm BT 9 0 0 -9 ${x} ${y} Tm /C1 1 Tf ${hex(text)} Tj ET Q\n`;
}

function pdfWith(streams: Uint8Array[], dicts: string[]): Uint8Array {
  const parts: Uint8Array[] = [new TextEncoder().encode('%PDF-1.3\n')];
  streams.forEach((data, i) => {
    parts.push(
      new TextEncoder().encode(
        `${i + 3} 0 obj\n<< ${dicts[i]} /Length ${data.length} >>\nstream\n`,
      ),
    );
    parts.push(data);
    parts.push(new TextEncoder().encode('\nendstream\nendobj\n'));
  });
  parts.push(new TextEncoder().encode('%%EOF\n'));
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function deflate(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

describe('pdf-text', () => {
  it('übersetzt ASCII, Umlaute und Bewertungssymbole', () => {
    expect(cidToText(0x46)).toBe('e');
    expect(cidToText(0x0e)).toBe('-');
    expect(cidToText(0x46f6)).toBe('ü');
    expect(cidToText(0x009f)).toBe('o');
    expect(cidToText(0x7777)).toBe('?');
  });

  it('liest Text mit Position aus Tm und TJ', () => {
    const items = extractTextItems(
      'BT 8 0 0 -8 54 51.8 Tm /C1 1 Tf [ <002c004d> 10 <0042> ] TJ ET ' +
        'BT 9 0 0 -9 220 51.8 Tm /C1 1 Tf (abc) Tj ET',
    );
    expect(items).toEqual([
      { x: 54, y: 51.8, text: 'Kla' },
      { x: 220, y: 51.8, text: 'abc' },
    ]);
  });

  it('fasst Stücke gleicher Höhe zu Zeilen zusammen', () => {
    const lines = groupLines([
      { x: 200, y: 10, text: 'b' },
      { x: 50, y: 11, text: 'a' },
      { x: 50, y: 30, text: 'c' },
    ]);
    expect(lines.map((l) => l.map((i) => i.text))).toEqual([['a', 'b'], ['c']]);
  });

  it('liest gepackte Ströme und überspringt Bilder', async () => {
    const content = textBlock(54, 50, 'Anna Müller') + textBlock(220, 50, 'Störungen');
    const pdf = pdfWith(
      [await deflate(content), new Uint8Array([1, 2, 3])],
      ['/Filter /FlateDecode', '/Subtype /Image /Filter /FlateDecode'],
    );

    const pages = await readPdfPages(pdf);
    expect(pages.length).toBe(1);
    expect(pages[0][0].map((i) => i.text)).toEqual(['Anna Müller', 'Störungen']);
  });

  it('lehnt Dateien ab, die keine PDF sind', async () => {
    await expectAsync(readPdfPages(new TextEncoder().encode('hallo'))).toBeRejected();
  });
});
