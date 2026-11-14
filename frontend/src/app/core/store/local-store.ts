/**
 * Der Datenspeicher der App. Der komplette Bestand wird im Speicher gehalten;
 * jede Änderung meldet sich über das Signal `revision`, damit die Ablage
 * (IndexedDB und Datei) mitzieht.
 *
 * Die Fachlogik - Prüfungen, Sortierungen, Notenberechnung - steckt in den
 * Teilspeichern, je einem für jeden Fachbereich. Sie arbeiten alle auf
 * demselben Bestand und sind hier als Eigenschaften erreichbar, etwa
 * `store.ratings.rate(...)` oder `store.gradeBook.getGradeBook(...)`.
 */

import { Injectable, computed, signal } from '@angular/core';
import { AssessmentStore } from './assessment.store';
import { Database, createEmptyDatabase, migrateDatabase } from './database';
import { ExportStore } from './export.store';
import { GradeBookStore } from './grade-book.store';
import { GradeScaleStore } from './grade-scale.store';
import { MasterDataStore } from './master-data.store';
import { ParticipationStore } from './participation.store';
import { PeriodStore } from './period.store';
import { QuarterGradeStore } from './quarter-grade.store';
import { RatingStore } from './rating.store';
import { SchemeStore } from './scheme.store';
import { SchoolYearStore } from './school-year.store';
import { SeatingStore } from './seating.store';
import { SettingsStore } from './settings.store';
import { StoreState } from './store-part';
import { TimetableStore } from './timetable.store';

@Injectable({ providedIn: 'root' })
export class LocalStore {
  private readonly state = new StoreState();

  /** Zählt jede Änderung mit - daran hängt die Speicherung. */
  readonly revision = this.state.revision.asReadonly();

  /** Wird auf true gesetzt, sobald ein Datenbestand geöffnet oder angelegt wurde. */
  readonly isOpen = signal(false);

  /** True, solange Änderungen noch nicht in die Datei geschrieben wurden. */
  readonly hasUnsavedChanges = computed(() => this.revision() > this.savedRevision());

  private readonly savedRevision = signal(0);

  /** Die Uhr des Speichers - in Tests lässt sie sich fest einstellen. */
  readonly clock = this.state.clock;

  // --- Teilspeicher -------------------------------------------------------

  /** Klassen, Fächer, Kurse und Schüler. */
  readonly masterData = new MasterDataStore(this.state);
  readonly seating = new SeatingStore(this.state);
  readonly timetable = new TimetableStore(this.state);
  /** Bewertungen im Unterricht und der Punktestand daraus. */
  readonly ratings = new RatingStore(this.state);
  /** Notenschlüssel für die Mitarbeitspunkte. */
  readonly gradeScales = new GradeScaleStore(this.state);
  /** Wer fehlte und welche Stundennote von Hand gesetzt wurde. */
  readonly participation = new ParticipationStore(this.state);
  /** Notenzeiträume wie „1. Halbjahr“. */
  readonly periods = new PeriodStore(this.state);
  /** Bewertungsschema je Kurs. */
  readonly schemes = new SchemeStore(this.state);
  /** Leistungsnachweise und ihre Ergebnisse. */
  readonly assessments = new AssessmentStore(this.state);
  readonly quarterGrades = new QuarterGradeStore(this.state);
  /** Notenübersicht, Änderungsprotokoll und Notenbögen. */
  readonly gradeBook = new GradeBookStore(this.state, this.schemes, this.assessments);
  /** CSV- und HTML-Exporte. */
  readonly exports = new ExportStore(this.state, this.ratings, this.gradeBook);
  readonly settings = new SettingsStore(this.state);
  readonly schoolYear = new SchoolYearStore(this.state, this.masterData);

  // --- Lebenszyklus -------------------------------------------------------

  /** Übernimmt einen geladenen oder neu angelegten Bestand. */
  load(database: Database): void {
    this.state.database = migrateDatabase(database);
    this.isOpen.set(true);
    this.savedRevision.set(this.revision());
  }

  /** Legt einen leeren Bestand an. */
  createNew(): void {
    this.load(createEmptyDatabase());
  }

  /** Schließt den Bestand und wirft ihn aus dem Speicher. */
  close(): void {
    this.state.database = createEmptyDatabase();
    this.isOpen.set(false);
    this.state.revision.set(0);
    this.savedRevision.set(0);
  }

  /** Der Bestand für die Ablage. Eine Kopie, damit niemand daran vorbeischreibt. */
  snapshot(): Database {
    return structuredClone(this.state.database);
  }

  /** Merkt sich, dass der (übergebene) Stand gesichert ist. */
  markSaved(revision = this.revision()): void {
    // Mit Stand: Was während des Schreibens dazukam, bleibt ungesichert.
    this.savedRevision.set(Math.max(this.savedRevision(), revision));
  }

  /**
   * Meldet eine Änderung, die nicht aus dem Bestand selbst kommt - etwa
   * wiederhergestellte Änderungen, die noch in keiner Datei stehen.
   */
  markChanged(): void {
    this.state.changed();
  }
}
