/**
 * Die Exporte: Notenübersicht und Mitarbeit als CSV, Einzelbewertungen und
 * Noten je Unterrichtstag als druckfertiges HTML.
 */

import { AppError } from '../app-error';
import { CsvBuilder } from '../export/csv';
import { renderLessonSheets } from '../export/lesson-sheet';
import { RatingsSheet, renderRatingsSheets } from '../export/ratings-sheet';
import { average, formatGrade, lastRatingPerDay, sumOfDays } from '../logic/assessment.logic';
import { schoolYearOf } from '../logic/quarter.logic';
import { freeDayReason } from '../logic/school-calendar';
import { fileNamePart } from '../logic/text';
import { formatDateGerman, toDateKey, toTimeKey } from '../logic/time';
import { AREA_LABELS, Course, DateRange, DayOfWeek, ExportFile, LessonSheet } from '../models';
import { GradeBookStore } from './grade-book.store';
import {
  allCourses,
  lessonDates,
  participationOf,
  ratingsInRange,
  schemeOf,
  studentsOfCourse,
} from './lookups';
import { RatingStore } from './rating.store';
import { StorePart, StoreState } from './store-part';

/** Der Teil des Dateinamens, der sagt, wovon der Export handelt. */
function courseSuffix(courses: { schoolClassName: string; subjectName: string }[]): string {
  return courses.length === 1
    ? `${fileNamePart(courses[0].schoolClassName)}-${fileNamePart(courses[0].subjectName)}`
    : 'alle-kurse';
}

function htmlFile(html: string, fileName: string): ExportFile {
  return { blob: new Blob([html], { type: 'text/html;charset=utf-8' }), fileName };
}

export class ExportStore extends StorePart {
  constructor(
    state: StoreState,
    private readonly ratings: RatingStore,
    private readonly gradeBook: GradeBookStore,
  ) {
    super(state);
  }

  /** Die Notenübersicht als CSV - eine Zeile je Schüler. */
  exportGradeBook(courseId: number, range?: DateRange): ExportFile {
    const book = this.gradeBook.getGradeBook(courseId, range);
    const released = book.assessments.filter((a) => a.released);
    const csv = new CsvBuilder();

    csv.addRow(
      'Klasse',
      'Fach/Lernfeld',
      'Nachname',
      'Vorname',
      ...released.map((a) => `${a.title} (${formatDateGerman(a.date)})`),
      'Mitarbeit',
      `Schriftlich (${book.scheme.writtenPercent} %)`,
      `${AREA_LABELS.oral} (${100 - book.scheme.writtenPercent} %)`,
      'Gesamt',
    );

    const value = (grade: number | null) => (grade === null ? null : Math.round(grade * 100) / 100);

    for (const student of book.students) {
      csv.addRow(
        book.schoolClassName,
        book.subjectName,
        student.lastName,
        student.firstName,
        ...released.map((a) => value(student.assessmentGrades[a.id] ?? null)),
        value(student.participation),
        value(student.written),
        value(student.oral),
        value(student.overall),
      );
    }

    return {
      blob: csv.toBlob(),
      fileName:
        `noten-${fileNamePart(book.schoolClassName)}-` +
        `${fileNamePart(book.subjectShortName || book.subjectName)}-` +
        `${this.today()}.csv`,
    };
  }

  // --- Noten je Unterrichtstag --------------------------------------------

  /**
   * Je Kurs eine Übersicht: für jeden Unterrichtstag die Mitarbeitsnote jedes
   * Schülers - auch die automatische Note, wenn er nicht bewertet wurde.
   * Tage, an denen im Kurs niemand bewertet wurde, zählen nicht (Note null),
   * außer es ist von Hand eine Note gesetzt.
   */
  getLessonSheets(courseId: number | null, range?: DateRange): LessonSheet[] {
    return this.coursesToExport(courseId).map((course) => {
      const scheme = schemeOf(this.db, course.id);
      const ratedDates = new Set(lessonDates(this.db, course.id, range));
      const dates = [...new Set([...this.scheduledDates(course.id, range), ...ratedDates])].sort();
      const ratings = ratingsInRange(this.db, course.id, range);

      return {
        courseId: course.id,
        schoolClassName: course.schoolClassName,
        subjectName: course.subjectName,
        from: range?.from || dates[0] || null,
        to: range?.to || dates.at(-1) || null,
        dates: dates.map((date) => ({ date, rated: ratedDates.has(date) })),
        students: studentsOfCourse(this.db, course.id).map((student) => {
          const rated = new Set(
            ratings.filter((r) => r.studentId === student.id).map((r) => r.lessonDate),
          );
          const cells = participationOf(this.db, course.id, student.id, dates, scheme).map((l) => ({
            ...l,
            rated: rated.has(l.date),
            grade: ratedDates.has(l.date) || l.override ? l.grade : null,
          }));

          return {
            studentId: student.id,
            firstName: student.firstName,
            lastName: student.lastName,
            cells,
            average: average(cells.map((c) => c.grade)),
          };
        }),
      };
    });
  }

  /** Die Stundenübersicht als druckfertiges HTML - je Kurs eine Seite. */
  exportLessonSheets(courseId: number | null, range?: DateRange, studentId?: number): ExportFile {
    let sheets = this.getLessonSheets(courseId, range);
    let studentPart = '';
    if (studentId !== undefined) {
      sheets = sheets.map((sheet) => ({
        ...sheet,
        students: sheet.students.filter((s) => s.studentId === studentId),
      }));
      const student = sheets[0]?.students[0];
      if (!student) {
        throw new AppError('Der Schüler gehört nicht zu diesem Kurs.');
      }
      studentPart = `-${fileNamePart(`${student.lastName}-${student.firstName}`)}`;
    }
    const suffix = sheets.length === 1 ? courseSuffix(sheets) + studentPart : 'alle-kurse';

    return htmlFile(
      renderLessonSheets(sheets, this.today()),
      `noten-je-stunde-${suffix}-${this.today()}.html`,
    );
  }

  // --- Mitarbeit ----------------------------------------------------------

  /**
   * Die Einzelbewertungen als druckfertiges HTML im Querformat: je Kurs eine
   * Tabelle, Schüler in den Zeilen, Bewertungstage in den Spalten.
   */
  exportRatings(courseId: number | null, range?: DateRange): ExportFile {
    // Beim Export aller Kurse bleiben die ohne Bewertung im Zeitraum außen vor.
    const courses = this.coursesToExport(
      courseId,
      (c) => courseId !== null || ratingsInRange(this.db, c.id, range).length > 0,
    );

    const sheets: RatingsSheet[] = courses.map((course) => {
      // Nach Eingabe sortiert - die letzte Bewertung eines Tages zählt.
      const ratings = ratingsInRange(this.db, course.id, range).sort((a, b) => a.id - b.id);
      const dates = [...new Set(ratings.map((r) => r.lessonDate))].sort();

      return {
        schoolClassName: course.schoolClassName,
        subjectName: course.subjectName,
        from: range?.from || dates[0] || null,
        to: range?.to || dates.at(-1) || null,
        dates,
        students: studentsOfCourse(this.db, course.id).map((student) => {
          const own = ratings.filter((r) => r.studentId === student.id);
          return {
            firstName: student.firstName,
            lastName: student.lastName,
            cells: dates.map((date) =>
              own
                .filter((r) => r.lessonDate === date)
                .map((r) => ({
                  value: r.value,
                  time: toTimeKey(new Date(r.createdAt)),
                  comment: r.comment || null,
                })),
            ),
            points: sumOfDays(lastRatingPerDay(own)),
          };
        }),
      };
    });

    return htmlFile(
      renderRatingsSheets(sheets, this.today()),
      `bewertungen-${courseSuffix(sheets)}-${this.today()}.html`,
    );
  }

  /**
   * Eine Zeile pro Schüler mit Punktestand und - falls ein Notenschlüssel
   * hinterlegt ist - der daraus errechneten Note.
   */
  exportSummary(courseId: number | null, range?: DateRange): ExportFile {
    const courses = this.coursesToExport(courseId);

    const csv = new CsvBuilder();
    csv.addRow(
      'Klasse',
      'Fach',
      'Nachname',
      'Vorname',
      'Punkte',
      'Anzahl Bewertungen',
      'Mittelwert',
      'Note',
    );

    for (const course of courses) {
      for (const score of this.ratings.getScoreboard(course.id, range).students) {
        csv.addRow(
          course.schoolClassName,
          course.subjectName,
          score.lastName,
          score.firstName,
          score.points,
          score.ratingCount,
          score.average === null ? '' : formatGrade(score.average, 2),
          score.grade,
        );
      }
    }

    return {
      blob: csv.toBlob(),
      fileName: `mitarbeit-${courseSuffix(courses)}-${this.today()}.csv`,
    };
  }

  // --- Hilfen -------------------------------------------------------------

  private today(): string {
    return toDateKey(this.now());
  }

  /** Der gewählte Kurs oder - mit `null` - alle; ohne Treffer gibt es nichts zu exportieren. */
  private coursesToExport(
    courseId: number | null,
    alsoRequired: (course: Course) => boolean = () => true,
  ): Course[] {
    const courses = allCourses(this.db).filter(
      (c) => (courseId === null || c.id === courseId) && alsoRequired(c),
    );
    if (courses.length === 0) {
      throw new AppError('Es gibt keinen passenden Kurs zum Exportieren.');
    }
    return courses;
  }

  /**
   * Die Unterrichtstage eines Kurses laut Stundenplan - ohne Feiertage und
   * Ferien, höchstens bis heute. Ohne Startdatum ab Beginn des Schuljahres
   * (1. August) bzw. ab der ersten Bewertung, falls die früher liegt.
   */
  private scheduledDates(courseId: number, range?: DateRange): string[] {
    const weekdays = new Set(
      this.db.timetableEntries.filter((e) => e.courseId === courseId).map((e) => e.dayOfWeek),
    );
    if (weekdays.size === 0) {
      return [];
    }

    const now = this.now();
    const today = toDateKey(now);
    const yearStart = `${schoolYearOf(now)}-08-01`;
    const firstRating = lessonDates(this.db, courseId)[0];
    const from = range?.from || (firstRating && firstRating < yearStart ? firstRating : yearStart);
    const to = range?.to && range.to < today ? range.to : today;

    const dates: string[] = [];
    const [y, m, d] = from.split('-').map(Number);
    for (const day = new Date(y, m - 1, d); toDateKey(day) <= to; day.setDate(day.getDate() + 1)) {
      const key = toDateKey(day);
      if (weekdays.has(day.getDay() as DayOfWeek) && freeDayReason(key) === null) {
        dates.push(key);
      }
    }
    return dates;
  }
}
