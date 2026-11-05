/**
 * Erzeugt demo-daten/demo.sitzordnung aus den Demo-Daten – mit derselben
 * Import- und Verschlüsselungslogik, die auch die App benutzt.
 *
 * Aufruf siehe demo-daten/README.md
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LocalStore } from '../../frontend/src/app/core/store/local-store';
import { decryptDatabase, encryptDatabase } from '../../frontend/src/app/core/store/vault-crypto';

const PASSWORT = process.env['DEMO_PASSWORT'] ?? 'Demo-Sitzordnung-2026';
const dir = process.argv[2];

function namen(text: string) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [last, first] = line.split(',');
      return { firstName: (first ?? '').trim(), lastName: (last ?? '').trim() };
    });
}

async function main() {
  const store = new LocalStore();
  store.createNew();

  const preview = store.previewTimetableImport(readFileSync(join(dir, 'demo-stundenplan.ics'), 'utf8'));
  const result = store.applyTimetableImport(preview.rows);
  console.log('Stundenplan:', result);

  for (const klasse of store.getClasses()) {
    const datei = join(dir, `schueler-${klasse.name}.txt`);
    const created = store.importStudents(klasse.id, namen(readFileSync(datei, 'utf8')));
    console.log(`${klasse.name}: ${created.length} Schüler`);
  }

  const blob = await encryptDatabase(store.snapshot(), PASSWORT);
  const text = await blob.text();
  const ziel = join(dir, 'demo.sitzordnung');
  writeFileSync(ziel, text);

  const check = await decryptDatabase(text, PASSWORT);
  console.log(`Geprüft: ${check.students.length} Schüler, ${check.timetableEntries.length} Stunden → ${ziel}`);
}

main();
