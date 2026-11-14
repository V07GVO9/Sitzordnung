/**
 * Die gemeinsame Grundlage des Datenspeichers: der Bestand im Speicher, die
 * Uhr und der Änderungszähler - und die Basisklasse, über die jeder
 * Teilspeicher darauf zugreift.
 */

import { signal } from '@angular/core';
import { Clock } from '../logic/time';
import { Database, createEmptyDatabase } from './database';

/** Was sich alle Teilspeicher teilen. Es gibt genau ein Exemplar je Datenspeicher. */
export class StoreState {
  /** Der komplette Bestand. Beim Laden und Schließen wird er als Ganzes ersetzt. */
  database: Database = createEmptyDatabase();

  /** Zählt jede Änderung mit - daran hängt die Speicherung. */
  readonly revision = signal(0);

  readonly clock = new Clock();

  changed(): void {
    this.revision.update((value) => value + 1);
  }
}

/**
 * Ein Teilspeicher kümmert sich um einen Fachbereich - etwa die Sitzordnungen
 * oder die Leistungsnachweise - und arbeitet dabei auf dem gemeinsamen Bestand.
 */
export abstract class StorePart {
  constructor(private readonly state: StoreState) {}

  /** Der aktuelle Bestand. Nicht zwischenspeichern - beim Laden wird er ersetzt. */
  protected get db(): Database {
    return this.state.database;
  }

  protected now(): Date {
    return this.state.clock.now();
  }

  /** Meldet eine Änderung am Bestand, damit die Ablage mitzieht. */
  protected changed(): void {
    this.state.changed();
  }
}
