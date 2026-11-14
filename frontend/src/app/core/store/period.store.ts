/** Die Notenzeiträume - etwa „1. Halbjahr“ -, auf die sich Noten eingrenzen lassen. */

import { AppError } from '../app-error';
import { isValidDateKey } from '../logic/time';
import { GradingPeriod, GradingPeriodInput } from '../models';
import { StorePart } from './store-part';

export class PeriodStore extends StorePart {
  getPeriods(): GradingPeriod[] {
    return [...this.db.gradingPeriods]
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((p) => ({ ...p }));
  }

  /** Legt einen Zeitraum an (id null) oder ändert ihn. */
  savePeriod(id: number | null, input: GradingPeriodInput): GradingPeriod {
    const name = input.name.trim();
    if (name === '') {
      throw new AppError('Der Zeitraum braucht einen Namen.');
    }

    if (!isValidDateKey(input.start) || !isValidDateKey(input.end)) {
      throw new AppError('Bitte Beginn und Ende als Datum angeben.');
    }

    if (input.end < input.start) {
      throw new AppError('Das Ende des Zeitraums muss nach seinem Beginn liegen.');
    }

    let record = id === null ? undefined : this.db.gradingPeriods.find((p) => p.id === id);
    if (id !== null && !record) {
      throw new AppError('Der Zeitraum existiert nicht.');
    }

    if (!record) {
      record = { id: this.db.nextIds.gradingPeriod++, name, start: '', end: '' };
      this.db.gradingPeriods.push(record);
    }

    record.name = name;
    record.start = input.start;
    record.end = input.end;
    this.changed();

    return { ...record };
  }

  deletePeriod(id: number): void {
    if (!this.db.gradingPeriods.some((p) => p.id === id)) {
      throw new AppError('Der Zeitraum existiert nicht.');
    }

    this.db.gradingPeriods = this.db.gradingPeriods.filter((p) => p.id !== id);
    this.changed();
  }
}
