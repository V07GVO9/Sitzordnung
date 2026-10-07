/** Rechenregeln für Leistungsnachweise, Mitarbeit und Gesamtnote. */

import {
  clampLessonValue,
  combineGrades,
  formatGrade,
  gradeFromPercent,
  lessonGradeFor,
  parseGrade,
  participationLessons,
  resultGrade,
  weightedAverage,
} from './assessment.logic';
import { AssessmentRecord, createDefaultScheme } from './database';

const scheme = createDefaultScheme(1);

const test: AssessmentRecord = {
  id: 1,
  courseId: 1,
  typeKey: 'test',
  title: 'Test',
  date: '2026-10-05',
  maxPoints: 50,
  releasedAt: null,
  comment: null,
};

describe('gradeFromPercent', () => {
  it('nimmt die Stufe des IHK-Schlüssels, die gerade noch erreicht ist', () => {
    expect(gradeFromPercent(scheme.percentScale, 92)).toBe(1);
    expect(gradeFromPercent(scheme.percentScale, 91.9)).toBe(2);
    expect(gradeFromPercent(scheme.percentScale, 50)).toBe(4);
    expect(gradeFromPercent(scheme.percentScale, 0)).toBe(6);
  });
});

describe('resultGrade', () => {
  const base = { assessmentId: 1, studentId: 1, comment: null };

  it('rechnet Punkte über den Prozentschlüssel um', () => {
    expect(resultGrade({ ...base, points: 40, grade: null, status: 'graded' }, test, scheme)).toBe(
      3,
    );
  });

  it('bevorzugt eine direkt eingetragene Note', () => {
    expect(resultGrade({ ...base, points: 40, grade: 2.3, status: 'graded' }, test, scheme)).toBe(
      2.3,
    );
  });

  it('zählt entschuldigt nicht und verweigert als 6,0', () => {
    expect(
      resultGrade({ ...base, points: null, grade: null, status: 'excused' }, test, scheme),
    ).toBe(null);
    expect(
      resultGrade({ ...base, points: null, grade: null, status: 'refused' }, test, scheme),
    ).toBe(6);
  });

  it('zählt ein fehlendes Ergebnis nicht', () => {
    expect(resultGrade(undefined, test, scheme)).toBeNull();
  });
});

describe('Mitarbeit je Doppelstunde', () => {
  const grades = scheme.participationGrades;

  it('übersetzt ++ + - -- in 1,0 2,0 4,0 5,0', () => {
    expect(lessonGradeFor(grades, 2)).toBe(1);
    expect(lessonGradeFor(grades, 1)).toBe(2);
    expect(lessonGradeFor(grades, -1)).toBe(4);
    expect(lessonGradeFor(grades, -2)).toBe(5);
  });

  it('gibt ohne Bewertung 3,0', () => {
    expect(lessonGradeFor(grades, null)).toBe(3);
  });

  it('addiert die Bewertungen einer Stunde und begrenzt sie', () => {
    expect(clampLessonValue(4)).toBe(2);
    expect(clampLessonValue(-3)).toBe(-2);

    const lessons = participationLessons(
      ['2026-10-05', '2026-10-12'],
      [
        { lessonDate: '2026-10-05', value: 1 },
        { lessonDate: '2026-10-05', value: -1 },
      ],
      [],
      grades,
    );

    expect(lessons[0].value).toBe(0);
    expect(lessons[0].grade).toBe(3);
    expect(lessons[1].value).toBeNull();
    expect(lessons[1].grade).toBe(3);
  });

  it('lässt eine von Hand gesetzte Note gelten - auch "fehlte"', () => {
    const lessons = participationLessons(
      ['2026-10-05', '2026-10-12'],
      [{ lessonDate: '2026-10-05', value: 2 }],
      [
        { courseId: 1, studentId: 1, lessonDate: '2026-10-05', grade: 1.5, reason: null },
        { courseId: 1, studentId: 1, lessonDate: '2026-10-12', grade: null, reason: 'krank' },
      ],
      grades,
    );

    expect(lessons[0].autoGrade).toBe(1);
    expect(lessons[0].grade).toBe(1.5);
    expect(lessons[1].grade).toBeNull();
  });
});

describe('combineGrades', () => {
  it('gewichtet Einzelnoten und Bereiche', () => {
    const result = combineGrades(
      [
        { area: 'written', weight: 2, grade: 2 },
        { area: 'written', weight: 1, grade: 5 },
        { area: 'oral', weight: 1, grade: 1 },
      ],
      60,
    );

    expect(result.written).toBe(3);
    expect(result.oral).toBe(1);
    expect(result.overall).toBeCloseTo(2.2, 10);
    expect(result.partial).toBeFalse();
  });

  it('nimmt nur den vorhandenen Bereich und markiert das Ergebnis als vorläufig', () => {
    const result = combineGrades([{ area: 'oral', weight: 1, grade: 2.5 }], 50);

    expect(result.written).toBeNull();
    expect(result.overall).toBe(2.5);
    expect(result.partial).toBeTrue();
  });

  it('lässt Gewicht 0 und fehlende Noten heraus', () => {
    expect(
      weightedAverage([
        { grade: 1, weight: 0 },
        { grade: null, weight: 3 },
        { grade: 4, weight: 1 },
      ]),
    ).toBe(4);
  });
});

describe('Noten mit Komma', () => {
  it('liest Komma und Punkt', () => {
    expect(parseGrade('2,3')).toBe(2.3);
    expect(parseGrade(' 4.0 ')).toBe(4);
    expect(parseGrade('')).toBeNull();
  });

  it('lehnt Werte außerhalb von 1 bis 6 ab', () => {
    expect(parseGrade('0,7')).toBeNaN();
    expect(parseGrade('6,5')).toBeNaN();
    expect(parseGrade('gut')).toBeNaN();
  });

  it('gibt Noten mit Komma aus', () => {
    expect(formatGrade(2.345)).toBe('2,35');
    expect(formatGrade(2.275)).toBe('2,28');
    expect(formatGrade(3, 1)).toBe('3,0');
    expect(formatGrade(null)).toBe('–');
  });
});
