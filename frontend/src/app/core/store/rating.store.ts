/** Die Bewertungen im Unterricht (++ bis −−) und der Punktestand, der sich daraus ergibt. */

import { AppError } from '../app-error';
import { lastRatingPerDay, sumOfDays } from '../logic/assessment.logic';
import { effectiveScale, resolveGrade } from '../logic/grading.logic';
import { ratingWindow } from '../logic/lesson.logic';
import { trimToNull } from '../logic/text';
import { isValidDateKey, toDateKey } from '../logic/time';
import {
  CourseScoreboard,
  DateRange,
  Rating,
  RatingValue,
  RatingWindow,
  StudentScore,
} from '../models';
import {
  className,
  lessonContext,
  ratingsInRange,
  requireCourse,
  requireStudentOfCourse,
  studentsOfCourse,
  subjectOf,
} from './lookups';
import { StorePart } from './store-part';

/** "--", "-", "0", "+" und "++" - andere Werte nimmt die App nicht an. */
const ALLOWED_RATING_VALUES = [-2, -1, 0, 1, 2];

/**
 * Wie viele Unterrichtseinheiten gehalten wurden: jeder Tag, an dem
 * mindestens ein Schüler bewertet wurde. Wer an so einem Tag keine
 * Bewertung hat, bekommt dort die 0 - deshalb hat jeder Schüler gleich
 * viele Bewertungen.
 */
function lessonCount(ratings: { lessonDate: string }[]): number {
  return new Set(ratings.map((r) => r.lessonDate)).size;
}

export class RatingStore extends StorePart {
  /** Sagt, ob in diesem Kurs laut Stundenplan gerade bewertet werden darf. */
  getRatingWindow(courseId: number): RatingWindow {
    requireCourse(this.db, courseId);
    return ratingWindow(lessonContext(this.db), courseId, this.now());
  }

  /**
   * Vergibt eine Bewertung. Ohne Datum gilt sie für die laufende Stunde und nur
   * innerhalb des Stundenplans. Mit Datum wird sie gezielt für diesen Tag
   * eingetragen - so lassen sich Stunden aus dem Wochenplan jederzeit nachtragen.
   */
  rate(
    courseId: number,
    studentId: number,
    value: RatingValue,
    comment?: string | null,
    lessonDate?: string,
    replaceSameDay = false,
  ): Rating {
    if (!ALLOWED_RATING_VALUES.includes(value)) {
      throw new AppError(
        'Erlaubt sind nur die Bewertungen ++ (2), + (1), 0 (0), - (-1) und -- (-2).',
      );
    }

    requireStudentOfCourse(this.db, courseId, studentId);

    if (lessonDate === undefined) {
      const window = this.getRatingWindow(courseId);
      if (!window.canRate) {
        throw new AppError(window.reason);
      }
    } else if (!isValidDateKey(lessonDate)) {
      throw new AppError('Das Datum der Stunde ist ungültig.');
    }

    const now = this.now();
    const record = {
      id: this.db.nextIds.rating++,
      courseId,
      studentId,
      value,
      lessonDate: lessonDate ?? toDateKey(now),
      createdAt: now.toISOString(),
      comment: trimToNull(comment),
    };

    // Listenansicht: je Schüler und Tag nur eine Bewertung - der letzte
    // Klick ersetzt die vorige.
    if (replaceSameDay) {
      this.db.ratings = this.db.ratings.filter(
        (r) =>
          !(
            r.courseId === courseId &&
            r.studentId === studentId &&
            r.lessonDate === record.lessonDate
          ),
      );
    }

    this.db.ratings.push(record);
    this.changed();

    return { ...record };
  }

  /**
   * Nimmt eine Bewertung zurück. Ein Vertipper soll korrigierbar sein, ohne
   * dass dafür der Stundenplan erneut geprüft wird.
   */
  deleteRating(id: number): void {
    if (!this.db.ratings.some((r) => r.id === id)) {
      throw new AppError('Die Bewertung existiert nicht.');
    }

    this.db.ratings = this.db.ratings.filter((r) => r.id !== id);
    this.changed();
  }

  /** Die letzte Bewertung eines Schülers in diesem Kurs zurücknehmen. */
  undoLastRating(courseId: number, studentId: number): void {
    // Die Id wächst mit jeder Bewertung, ist also die zuletzt vergebene.
    const last = this.db.ratings
      .filter((r) => r.courseId === courseId && r.studentId === studentId)
      .sort((a, b) => b.id - a.id)[0];

    if (!last) {
      throw new AppError('Für diesen Schüler gibt es noch keine Bewertung.');
    }

    this.db.ratings = this.db.ratings.filter((r) => r.id !== last.id);
    this.changed();
  }

  /** Alle Einzelbewertungen eines Kurses, optional auf einen Zeitraum eingegrenzt. */
  getRatings(courseId: number, range?: DateRange): Rating[] {
    requireCourse(this.db, courseId);

    return ratingsInRange(this.db, courseId, range)
      .map((r) => ({ ...r }))
      .sort((a, b) => b.lessonDate.localeCompare(a.lessonDate) || b.id - a.id);
  }

  /**
   * Punktestand aller Schüler des Kurses. Je Unterrichtseinheit zählt nur die
   * letzte Bewertung, ohne Bewertung die 0. Die Punkte sind die Summe dieser
   * Tagesbewertungen, der Mittelwert teilt sie durch die gehaltenen Einheiten.
   */
  getScoreboard(courseId: number, range?: DateRange): CourseScoreboard {
    const course = requireCourse(this.db, courseId);
    const today = toDateKey(this.now());
    const ratings = ratingsInRange(this.db, courseId, range);
    const scale = effectiveScale(this.db.gradeScales, courseId);
    const lessons = lessonCount(ratings);

    const students = studentsOfCourse(this.db, courseId).map<StudentScore>((s) => {
      const perDay = lastRatingPerDay(ratings.filter((r) => r.studentId === s.id));
      const points = sumOfDays(perDay);

      return {
        studentId: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        points,
        ratingCount: lessons,
        average: lessons ? points / lessons : null,
        pointsToday: perDay.get(today) ?? 0,
        grade: resolveGrade(scale, points),
      };
    });

    return {
      courseId: course.id,
      schoolClassName: className(this.db, course.schoolClassId),
      subjectName: subjectOf(this.db, course.subjectId)?.name ?? '',
      date: today,
      students,
    };
  }
}
