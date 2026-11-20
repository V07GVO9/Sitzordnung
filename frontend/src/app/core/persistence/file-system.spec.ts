/**
 * Das Schreiben in eine Datei. Chrome und Edge legen dabei eine Schattenkopie
 * (`.crswap`) an - die darf weder nach einem Fehler liegen bleiben noch durch
 * gleichzeitige Schreibvorgänge vervielfacht werden.
 */

import { FileHandle, Writable, writeFile } from './file-system';

/** Ein Dateigriff, der mitzählt, welche Schattenkopien offen sind. */
class SwapHandle implements FileHandle {
  readonly name = 'test.sitzordnung';

  /** Offene Schattenkopien - nach jedem Vorgang muss das wieder 0 sein. */
  offen = 0;
  /** Wie viele Schattenkopien höchstens gleichzeitig offen waren. */
  hoechstens = 0;
  /** Der Stand der eigentlichen Datei. */
  inhalt: string | null = null;
  verworfen = 0;

  scheitertBeim: 'write' | 'close' | null = null;
  /** Hält jedes `close()` an, bis der Test es freigibt. */
  bremse: Promise<void> | null = null;

  async getFile(): Promise<File> {
    return new File([this.inhalt ?? ''], this.name);
  }

  async createWritable(): Promise<Writable> {
    this.offen++;
    this.hoechstens = Math.max(this.hoechstens, this.offen);
    let puffer: Blob | null = null;
    let erledigt = false;
    const schliessen = () => {
      if (!erledigt) {
        erledigt = true;
        this.offen--;
      }
    };

    return {
      write: async (data: Blob) => {
        if (this.scheitertBeim === 'write') {
          // Ein Schreibfehler tritt nur einmal auf.
          this.scheitertBeim = null;
          throw new Error('Platte voll');
        }
        puffer = data;
      },
      close: async () => {
        await this.bremse;
        if (this.scheitertBeim === 'close') {
          throw new Error('Ersetzen gescheitert');
        }
        this.inhalt = puffer ? await puffer.text() : '';
        schliessen();
      },
      abort: async () => {
        this.verworfen++;
        schliessen();
      },
    };
  }
}

describe('writeFile', () => {
  it('ersetzt die Datei und lässt keine Schattenkopie zurück', async () => {
    const handle = new SwapHandle();

    await writeFile(handle, new Blob(['neu']));

    expect(handle.inhalt).toBe('neu');
    expect(handle.offen).toBe(0);
    expect(handle.verworfen).toBe(0);
  });

  it('verwirft die Schattenkopie, wenn das Schreiben scheitert', async () => {
    const handle = new SwapHandle();
    handle.inhalt = 'alt';
    handle.scheitertBeim = 'write';

    await expectAsync(writeFile(handle, new Blob(['neu']))).toBeRejectedWithError('Platte voll');

    expect(handle.inhalt).toBe('alt');
    expect(handle.offen).toBe(0);
    expect(handle.verworfen).toBe(1);
  });

  it('verwirft die Schattenkopie, wenn das Ersetzen scheitert', async () => {
    const handle = new SwapHandle();
    handle.inhalt = 'alt';
    handle.scheitertBeim = 'close';

    await expectAsync(writeFile(handle, new Blob(['neu']))).toBeRejectedWithError(
      'Ersetzen gescheitert',
    );

    expect(handle.inhalt).toBe('alt');
    expect(handle.offen).toBe(0);
  });

  it('meldet den eigentlichen Fehler, auch wenn das Verwerfen scheitert', async () => {
    const handle = new SwapHandle();
    handle.scheitertBeim = 'write';
    const original = handle.createWritable.bind(handle);
    handle.createWritable = async () => ({
      ...(await original()),
      abort: async () => {
        throw new Error('schon zu');
      },
    });

    await expectAsync(writeFile(handle, new Blob(['neu']))).toBeRejectedWithError('Platte voll');
  });

  it('schreibt gleichzeitige Aufrufe nacheinander - der letzte Stand gewinnt', async () => {
    const handle = new SwapHandle();
    let freigeben!: () => void;
    handle.bremse = new Promise((resolve) => (freigeben = resolve));

    const erster = writeFile(handle, new Blob(['eins']));
    const zweiter = writeFile(handle, new Blob(['zwei']));
    const dritter = writeFile(handle, new Blob(['drei']));
    await Promise.resolve();
    freigeben();
    await Promise.all([erster, zweiter, dritter]);

    expect(handle.hoechstens).toBe(1);
    expect(handle.offen).toBe(0);
    expect(handle.inhalt).toBe('drei');
  });

  it('schreibt nach einem Fehlschlag trotzdem den nächsten Stand', async () => {
    const handle = new SwapHandle();
    handle.scheitertBeim = 'write';

    const erster = writeFile(handle, new Blob(['eins']));
    const zweiter = writeFile(handle, new Blob(['zwei']));

    await expectAsync(erster).toBeRejectedWithError('Platte voll');
    await zweiter;

    expect(handle.inhalt).toBe('zwei');
    expect(handle.offen).toBe(0);
  });
});
