/**
 * Die Quartalsnoten als Excel-Datei: je Kurs (Klasse × Fach/Lernfeld) ein
 * Tabellenblatt, jeder Schüler eine Zeile. Jedes Quartal steht in einem dick
 * umrahmten Block mit der schriftlichen Note, allen mündlichen Noten je
 * Unterrichtstag, der mündlichen Gesamtnote und der Endnote.
 */

import { Quarter } from '../models';
import { formatDateGerman } from '../logic/time';
import { XlsxCell, XlsxMerge, XlsxSheet, XlsxStyle, xlsxBlob } from './xlsx';

/**
 * Die mündliche Note eines Unterrichtstags:
 * - rated: bewertet (oder von Hand gesetzt),
 * - unrated: an dem Tag nicht bewertet - es gilt die Note für „keine Bewertung“,
 * - absent: fehlte,
 * - no-rating-day: im ganzen Kurs gab es an dem Tag keine Bewertung (zählt nicht).
 */
export interface WorkbookLesson {
  grade: number | null;
  kind: 'rated' | 'unrated' | 'absent' | 'no-rating-day';
}

export interface WorkbookQuarter {
  quarter: Quarter;
  from: string;
  to: string;
  dates: string[];
}

export interface WorkbookStudentQuarter {
  writtenPercent: number | null;
  writtenGrade: number | null;
  lessons: WorkbookLesson[];
  oral: number | null;
  final: number | null;
  /** Endnote nur aus einem Bereich - vorläufig. */
  partial: boolean;
}

export interface WorkbookCourse {
  schoolClassName: string;
  subjectName: string;
  writtenPercent: number;
  quarters: WorkbookQuarter[];
  students: { firstName: string; lastName: string; quarters: WorkbookStudentQuarter[] }[];
}

/** Spalten eines Quartalsblocks vor bzw. nach den Unterrichtstagen. */
const BEFORE = 2;
const AFTER = 2;
/** Zeile der Quartalsüberschrift, darunter die Spaltenköpfe, dann die Schüler. */
const HEAD_ROW = 3;
const FIRST_STUDENT_ROW = HEAD_ROW + 2;

const GRADE = '0.0';
const HEAD: XlsxStyle = { bold: true, fill: 'DDE5F0', align: 'center', wrap: true };
const QUARTER_HEAD: XlsxStyle = { bold: true, fill: 'BFD0E6', align: 'center' };

function blockWidth(q: WorkbookQuarter): number {
  return BEFORE + q.dates.length + AFTER;
}

function shortDate(date: string): string {
  return formatDateGerman(date).slice(0, 6);
}

/** Ergänzt einen Zellstil um die Rahmen - außen am Quartalsblock dick, innen dünn. */
function framed(
  style: XlsxStyle,
  edge: { left: boolean; right: boolean; top: boolean; bottom: boolean },
): XlsxStyle {
  return {
    ...style,
    border: {
      left: edge.left ? 'thick' : 'thin',
      right: edge.right ? 'thick' : 'thin',
      top: edge.top ? 'thick' : 'thin',
      bottom: edge.bottom ? 'thick' : 'thin',
    },
  };
}

function lessonCell(lesson: WorkbookLesson): XlsxCell {
  switch (lesson.kind) {
    case 'absent':
      return { value: 'f', style: { align: 'center', color: 'C00000' } };
    case 'no-rating-day':
      return { value: null, style: { fill: 'EEEEEE' } };
    case 'unrated':
      return {
        value: lesson.grade,
        style: { align: 'center', numFmt: GRADE, italic: true, color: '808080' },
      };
    default:
      return { value: lesson.grade, style: { align: 'center', numFmt: GRADE } };
  }
}

/** Das Tabellenblatt eines Kurses. */
export function quarterSheet(course: WorkbookCourse, today: string): XlsxSheet {
  const width = 1 + course.quarters.reduce((sum, q) => sum + blockWidth(q), 0);
  const lastRow = FIRST_STUDENT_ROW + Math.max(course.students.length, 1) - 1;
  const rows: XlsxCell[][] = [];
  const merges: XlsxMerge[] = [];
  const empty = (): XlsxCell[] => Array.from({ length: width }, () => ({ value: null }));

  rows.push([
    {
      value: `${course.schoolClassName} – ${course.subjectName}: Quartalsnoten`,
      style: { bold: true },
    },
  ]);
  rows.push([
    {
      value:
        `Gewichtung schriftlich ${course.writtenPercent} % · mündlich ${100 - course.writtenPercent} %` +
        ` · Stand ${formatDateGerman(today)}`,
      style: { color: '555555' },
    },
  ]);
  rows.push([]);

  const quarterHead = empty();
  const columnHead = empty();
  const studentRows = (course.students.length ? course.students : [null]).map(() => empty());

  const nameStyle = (row: number): XlsxStyle =>
    framed({}, { left: true, right: true, top: row === HEAD_ROW, bottom: row === lastRow });
  quarterHead[0] = {
    value: 'Schüler',
    style: framed(HEAD, { left: true, right: true, top: true, bottom: false }),
  };
  columnHead[0] = {
    value: null,
    style: framed(HEAD, { left: true, right: true, top: false, bottom: true }),
  };
  merges.push({ row1: HEAD_ROW, col1: 0, row2: HEAD_ROW + 1, col2: 0 });

  let col = 1;
  course.quarters.forEach((q, qi) => {
    const first = col;
    const last = col + blockWidth(q) - 1;
    const edge = (c: number, row: number) => ({
      left: c === first,
      right: c === last,
      top: row === HEAD_ROW,
      bottom: row === lastRow,
    });

    for (let c = first; c <= last; c++) {
      quarterHead[c] = {
        value:
          c === first
            ? `${q.quarter}. Quartal · ${formatDateGerman(q.from)} – ${formatDateGerman(q.to)}`
            : null,
        style: framed(QUARTER_HEAD, edge(c, HEAD_ROW)),
      };
    }
    merges.push({ row1: HEAD_ROW, col1: first, row2: HEAD_ROW, col2: last });

    const heads = [
      'Schriftl. %',
      'Schriftl. Note',
      ...q.dates.map(shortDate),
      'Mündl. gesamt',
      'Endnote',
    ];
    heads.forEach((text, i) => {
      columnHead[first + i] = {
        value: text,
        style: framed(
          { ...HEAD, fill: 'E8EEF6' },
          { ...edge(first + i, HEAD_ROW + 1), bottom: false },
        ),
      };
    });

    studentRows.forEach((cells, si) => {
      const row = FIRST_STUDENT_ROW + si;
      const data = course.students[si]?.quarters[qi];
      const values: XlsxCell[] = data
        ? [
            { value: data.writtenPercent, style: { align: 'center', numFmt: GRADE } },
            { value: data.writtenGrade, style: { align: 'center', numFmt: GRADE, bold: true } },
            ...data.lessons.map(lessonCell),
            { value: data.oral, style: { align: 'center', numFmt: GRADE, bold: true } },
            {
              value: data.final,
              style: {
                align: 'center',
                numFmt: GRADE,
                bold: true,
                italic: data.partial,
                fill: 'FFF2CC',
              },
            },
          ]
        : heads.map(() => ({ value: null }));
      values.forEach((cell, i) => {
        cells[first + i] = {
          value: cell.value,
          style: framed(cell.style ?? {}, edge(first + i, row)),
        };
      });
    });

    col = last + 1;
  });

  studentRows.forEach((cells, si) => {
    const student = course.students[si];
    cells[0] = {
      value: student
        ? `${student.lastName}, ${student.firstName}`
        : 'Keine Schüler in dieser Klasse.',
      style: nameStyle(FIRST_STUDENT_ROW + si),
    };
  });

  rows.push(quarterHead, columnHead, ...studentRows, []);
  rows.push([{ value: 'Legende', style: { bold: true } }]);
  rows.push([
    {
      value: 'Grau kursiv: an diesem Tag nicht bewertet - es gilt die Note für „keine Bewertung“.',
    },
  ]);
  rows.push([
    {
      value:
        'f: fehlte (zählt nicht) · grau hinterlegt: an diesem Tag wurde im Kurs niemand bewertet (zählt nicht).',
    },
  ]);
  rows.push([
    {
      value:
        'Mündl. gesamt: eingetragene mündliche Note, sonst der Durchschnitt der Mitarbeit im Quartal.',
    },
  ]);
  rows.push([{ value: 'Endnote kursiv: vorläufig - ein Bereich hat noch keine Note.' }]);

  const colWidths = [28];
  for (const q of course.quarters) {
    colWidths.push(9, 9, ...q.dates.map(() => 6.5), 9, 9);
  }

  return {
    name: `${course.schoolClassName} ${course.subjectName}`,
    rows,
    merges,
    colWidths,
    freeze: { rows: FIRST_STUDENT_ROW, cols: 1 },
    landscape: true,
  };
}

export function renderQuarterWorkbook(courses: WorkbookCourse[], today: string): Blob {
  return xlsxBlob(courses.map((c) => quarterSheet(c, today)));
}
