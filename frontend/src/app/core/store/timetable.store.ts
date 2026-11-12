/** Der Stundenplan: Wochenplan je Kurs, die laufende Stunde und der Import aus einem Kalender. */

import { AppError } from '../app-error';
import { parseTimetableIcs } from '../import/timetable-import';
import { currentLesson } from '../logic/lesson.logic';
import { trimToNull } from '../logic/text';
import { isValidTime, toMinutes } from '../logic/time';
import {
  CurrentLesson,
  DayOfWeek,
  TimetableEntry,
  TimetableEntryInput,
  TimetableImportPreview,
  TimetableImportResult,
  TimetableImportRow,
  WEEKDAY_NAMES,
} from '../models';
import { TimetableEntryRecord } from './database';
import { className, lessonContext, requireCourse, subjectOf } from './lookups';
import { StorePart } from './store-part';

/** Wochentag und Uhrzeiten einer Stunde - das, was eine Überschneidung ausmacht. */
interface TimeSlot {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
}

export class TimetableStore extends StorePart {
  getTimetable(): TimetableEntry[] {
    return this.db.timetableEntries
      .map<TimetableEntry>((e) => {
        const course = this.db.courses.find((c) => c.id === e.courseId);
        return {
          id: e.id,
          courseId: e.courseId,
          schoolClassName: course ? className(this.db, course.schoolClassId) : '',
          subjectName: course ? (subjectOf(this.db, course.subjectId)?.name ?? '') : '',
          dayOfWeek: e.dayOfWeek,
          startTime: e.startTime,
          endTime: e.endTime,
          room: e.room,
        };
      })
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek || toMinutes(a.startTime) - toMinutes(b.startTime));
  }

  /** Was laut Stundenplan gerade läuft - über alle Kurse hinweg. */
  getCurrentLesson(): CurrentLesson {
    return currentLesson(lessonContext(this.db), this.now());
  }

  createTimetableEntry(input: TimetableEntryInput): TimetableEntry {
    this.validate(input, null);

    const record = {
      id: this.db.nextIds.timetableEntry++,
      courseId: input.courseId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      room: trimToNull(input.room),
    };

    this.db.timetableEntries.push(record);
    this.changed();

    return this.getTimetable().find((e) => e.id === record.id)!;
  }

  updateTimetableEntry(id: number, input: TimetableEntryInput): TimetableEntry {
    const record = this.db.timetableEntries.find((e) => e.id === id);
    if (!record) {
      throw new AppError('Der Stundenplaneintrag existiert nicht.');
    }

    this.validate(input, id);

    record.courseId = input.courseId;
    record.dayOfWeek = input.dayOfWeek;
    record.startTime = input.startTime;
    record.endTime = input.endTime;
    record.room = trimToNull(input.room);
    this.changed();

    return this.getTimetable().find((e) => e.id === id)!;
  }

  deleteTimetableEntry(id: number): void {
    if (!this.db.timetableEntries.some((e) => e.id === id)) {
      throw new AppError('Der Stundenplaneintrag existiert nicht.');
    }

    this.db.timetableEntries = this.db.timetableEntries.filter((e) => e.id !== id);
    this.changed();
  }

  // --- Import -------------------------------------------------------------

  /**
   * Liest einen Kalenderexport und zeigt, was daraus würde - ohne etwas zu
   * speichern. Was bereits angelegt ist, hilft beim Erkennen von Klasse und
   * Fach im Termintitel.
   */
  previewTimetableImport(ics: string): TimetableImportPreview {
    const classNames = this.db.schoolClasses.map((c) => c.name);
    const subjectNames = this.db.subjects.flatMap((s) =>
      s.shortName.trim() === '' ? [s.name] : [s.name, s.shortName],
    );

    return parseTimetableIcs(ics, classNames, subjectNames);
  }

  /**
   * Übernimmt die bestätigten Zeilen. Fehlende Klassen, Fächer und Kurse
   * werden dabei angelegt; Dopplungen und Überschneidungen übersprungen.
   */
  applyTimetableImport(rows: readonly TimetableImportRow[]): TimetableImportResult {
    if (rows.length === 0) {
      throw new AppError('Es wurde keine Zeile zum Übernehmen ausgewählt.');
    }

    const skipped: string[] = [];
    let createdClasses = 0;
    let createdSubjects = 0;
    let createdCourses = 0;
    let createdLessons = 0;

    for (const row of rows) {
      const classLabel = row.schoolClassName.trim();
      const subjectLabel = row.subjectName.trim();
      const description =
        `${WEEKDAY_NAMES[row.dayOfWeek] ?? ''} ${row.startTime} ${subjectLabel} ${classLabel}`.trim();

      if (!isValidTime(row.startTime) || !isValidTime(row.endTime)) {
        skipped.push(`${description}: unlesbare Uhrzeit.`);
        continue;
      }

      if (toMinutes(row.endTime) <= toMinutes(row.startTime)) {
        skipped.push(`${description}: das Ende liegt nicht nach dem Beginn.`);
        continue;
      }

      if (classLabel === '' || subjectLabel === '') {
        skipped.push(`${description}: Klasse oder Fach fehlt.`);
        continue;
      }

      let schoolClass = this.db.schoolClasses.find(
        (c) => c.name.toLowerCase() === classLabel.toLowerCase(),
      );
      if (!schoolClass) {
        schoolClass = { id: this.db.nextIds.schoolClass++, name: classLabel };
        this.db.schoolClasses.push(schoolClass);
        createdClasses++;
      }

      let subject = this.db.subjects.find(
        (s) =>
          s.name.toLowerCase() === subjectLabel.toLowerCase() ||
          (s.shortName.trim() !== '' && s.shortName.toLowerCase() === subjectLabel.toLowerCase()),
      );
      if (!subject) {
        subject = {
          id: this.db.nextIds.subject++,
          name: subjectLabel,
          shortName:
            subjectLabel.length <= 4
              ? subjectLabel.toUpperCase()
              : subjectLabel.slice(0, 2).toUpperCase(),
        };
        this.db.subjects.push(subject);
        createdSubjects++;
      }

      const schoolClassId = schoolClass.id;
      const subjectId = subject.id;

      let course = this.db.courses.find(
        (c) => c.schoolClassId === schoolClassId && c.subjectId === subjectId,
      );
      if (!course) {
        course = { id: this.db.nextIds.course++, schoolClassId, subjectId };
        this.db.courses.push(course);
        createdCourses++;
      }

      const courseId = course.id;

      // Dieselbe Stunde ein zweites Mal anzulegen bringt nichts.
      const exists = this.db.timetableEntries.some(
        (e) =>
          e.courseId === courseId &&
          e.dayOfWeek === row.dayOfWeek &&
          e.startTime === row.startTime &&
          e.endTime === row.endTime,
      );
      if (exists) {
        skipped.push(`${description}: steht schon im Stundenplan.`);
        continue;
      }

      const overlap = this.findOverlap(row, null);
      if (overlap) {
        skipped.push(
          `${description}: überschneidet sich mit einer bereits eingetragenen Stunde ` +
            `(${overlap.startTime}-${overlap.endTime} Uhr).`,
        );
        continue;
      }

      this.db.timetableEntries.push({
        id: this.db.nextIds.timetableEntry++,
        courseId,
        dayOfWeek: row.dayOfWeek,
        startTime: row.startTime,
        endTime: row.endTime,
        room: trimToNull(row.room),
      });
      createdLessons++;
    }

    this.changed();

    return { createdClasses, createdSubjects, createdCourses, createdLessons, skipped };
  }

  // --- Prüfungen ----------------------------------------------------------

  /** Prüft Kurs, Uhrzeiten und Überschneidungen. */
  private validate(input: TimetableEntryInput, ignoreId: number | null): void {
    requireCourse(this.db, input.courseId);

    if (!isValidTime(input.startTime) || !isValidTime(input.endTime)) {
      throw new AppError('Die Uhrzeiten müssen im Format HH:mm angegeben werden.');
    }

    if (toMinutes(input.endTime) <= toMinutes(input.startTime)) {
      throw new AppError('Das Ende der Stunde muss nach ihrem Beginn liegen.');
    }

    const overlap = this.findOverlap(input, ignoreId);
    if (overlap) {
      throw new AppError(
        'Die Zeit überschneidet sich mit einer anderen Stunde ' +
          `(${overlap.startTime}-${overlap.endTime} Uhr).`,
      );
    }
  }

  /**
   * Eine bereits eingetragene Stunde zur selben Zeit - zwei Stunden
   * gleichzeitig wären im Stundenplan nicht auflösbar.
   */
  private findOverlap(slot: TimeSlot, ignoreId: number | null): TimetableEntryRecord | undefined {
    return this.db.timetableEntries.find(
      (e) =>
        e.dayOfWeek === slot.dayOfWeek &&
        e.id !== ignoreId &&
        toMinutes(slot.startTime) < toMinutes(e.endTime) &&
        toMinutes(slot.endTime) > toMinutes(e.startTime),
    );
  }
}
