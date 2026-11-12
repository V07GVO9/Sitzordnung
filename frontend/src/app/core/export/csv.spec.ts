/** CSV-Erzeugung - portiert aus den CsvBuilderTests des Backends. */

import { CsvBuilder, CsvDate, CsvLiteral } from './csv';

async function text(builder: CsvBuilder): Promise<string> {
  return builder.toBlob().text();
}

describe('CsvBuilder', () => {
  it('trennt mit Semikolon', async () => {
    const csv = new CsvBuilder().addRow('a', 'b', 'c');
    expect(await text(csv)).toContain('a;b;c');
  });

  it('stellt der Datei ein BOM voran', async () => {
    // Über die Bytes geprüft: beim Dekodieren als Text verschluckt der Browser
    // das BOM, in der Datei muss es aber stehen - sonst zeigt Excel Umlaute falsch.
    const bytes = new Uint8Array(await new CsvBuilder().addRow('a').toBlob().arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('setzt Felder mit Semikolon in Anführungszeichen', async () => {
    const content = await text(new CsvBuilder().addRow('Meier; Klaus'));
    expect(content).toContain('"Meier; Klaus"');
  });

  it('verdoppelt Anführungszeichen im Text', async () => {
    const content = await text(new CsvBuilder().addRow('Der "Chef"'));
    expect(content).toContain('"Der ""Chef"""');
  });

  it('entschärft eine führende Formel', async () => {
    const content = await text(new CsvBuilder().addRow('=SUMME(A1:A9)'));
    expect(content).toContain("'=SUMME(A1:A9)");
  });

  it('lässt negative Zahlen unangetastet', async () => {
    const content = await text(new CsvBuilder().addRow(-4));
    expect(content).toContain('-4');
    expect(content).not.toContain("'-4");
  });

  it('gibt ein Bewertungszeichen unverändert aus', async () => {
    const content = await text(new CsvBuilder().addRow(new CsvLiteral('--')));
    expect(content).toContain('--');
    expect(content).not.toContain("'--");
  });

  it('schreibt Datumsangaben im deutschen Format', async () => {
    const content = await text(new CsvBuilder().addRow(new CsvDate('2026-08-31')));
    expect(content).toContain('31.08.2026');
  });

  it('gibt Wahrheitswerte als ja und nein aus', async () => {
    const content = await text(new CsvBuilder().addRow(true, false));
    expect(content).toContain('ja;nein');
  });

  it('lässt leere Werte leer', async () => {
    const content = await text(new CsvBuilder().addRow('a', null, undefined, 'b'));
    expect(content).toContain('a;;;b');
  });
});
