/**
 * Der Schuljahreswechsel: Klassen hochsetzen oder entfernen, die
 * Leistungsdaten des alten Jahres löschen und den Stundenplan leeren.
 */

import { AppError } from '../app-error';
import { toDateKey } from '../logic/time';
import { SchoolYearCounts, SchoolYearInput } from '../models';
import { requireClass } from './lookups';
import { MasterDataStore } from './master-data.store';
import { StorePart, StoreState } from './store-part';

export class SchoolYearStore extends StorePart {
  constructor(
    state: StoreState,
    private readonly masterData: MasterDataStore,
  ) {
    super(state);
  }

  /** Was beim Schuljahreswechsel gelöscht würde - für die Zusammenfassung vorab. */
  getSchoolYearCounts(): SchoolYearCounts {
    const today = toDateKey(this.now());
    return {
      ratings: this.db.ratings.length,
      participationOverrides: this.db.participationOverrides.length,
      assessments: this.db.assessments.length,
      quarterGrades: this.db.quarterGrades.length,
      gradeChanges: this.db.gradeChanges.length,
      gradeReports: this.db.gradeReports.length,
      pastPeriods: this.db.gradingPeriods.filter((p) => p.end < today).length,
      timetableEntries: this.db.timetableEntries.length,
    };
  }

  /**
   * Neues Schuljahr: Klassen entfernen (Abschluss) oder umbenennen
   * (hochsetzen), optional alle Leistungsdaten des alten Jahres löschen
   * (Löschfrist) und den Stundenplan leeren. Schüler, Fächer, Kurse,
   * Sitzordnungen, Notenschlüssel und Bewertungsschemata bleiben.
   */
  startNewSchoolYear(input: SchoolYearInput): SchoolYearCounts {
    const removed = new Set(input.deleteClassIds);
    for (const id of removed) {
      requireClass(this.db, id);
    }

    // Erst prüfen, dann ändern: Die neuen Namen müssen eindeutig und nicht leer sein.
    const finalNames = new Map(
      this.db.schoolClasses.filter((c) => !removed.has(c.id)).map((c) => [c.id, c.name]),
    );
    for (const { classId, name } of input.renames) {
      if (!finalNames.has(classId)) {
        continue;
      }
      const trimmed = name.trim();
      if (!trimmed) {
        throw new AppError('Jede Klasse braucht einen Namen.');
      }
      finalNames.set(classId, trimmed);
    }
    const names = [...finalNames.values()];
    const duplicate = names.find((n, i) => names.indexOf(n) !== i);
    if (duplicate) {
      throw new AppError(`Die Klasse '${duplicate}' gäbe es danach zweimal.`);
    }

    const counts = this.getSchoolYearCounts();
    for (const id of removed) {
      this.masterData.deleteClass(id);
    }
    for (const record of this.db.schoolClasses) {
      record.name = finalNames.get(record.id) ?? record.name;
    }

    if (input.deleteRecords) {
      const today = toDateKey(this.now());
      this.db.ratings = [];
      this.db.participationOverrides = [];
      this.db.assessments = [];
      this.db.assessmentResults = [];
      this.db.quarterGrades = [];
      this.db.gradeChanges = [];
      this.db.gradeReports = [];
      this.db.gradingPeriods = this.db.gradingPeriods.filter((p) => p.end >= today);
    }
    if (input.clearTimetable) {
      this.db.timetableEntries = [];
    }

    this.changed();
    return {
      ...counts,
      ...(input.deleteRecords
        ? {}
        : {
            ratings: 0,
            participationOverrides: 0,
            assessments: 0,
            quarterGrades: 0,
            gradeChanges: 0,
            gradeReports: 0,
            pastPeriods: 0,
          }),
      timetableEntries: input.clearTimetable ? counts.timetableEntries : 0,
    };
  }
}
