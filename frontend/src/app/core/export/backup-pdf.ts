/**
 * Die lesbare Sicherung als PDF: alle Kurse (Klasse × Fach/Lernfeld), je Kurs
 * eine Seite im Querformat. Jeder Schüler steht in genau einer Zeile mit allen
 * Leistungsnachweisen, jeder Mitarbeitsnote je Doppelstunde und den
 * Bereichs- und Gesamtnoten. Bei vielen Spalten wird die Schrift kleiner.
 *
 * Die Tabelle entsteht als reine Daten (`backupTable`), damit sie sich ohne
 * PDF-Bibliothek prüfen lässt; jsPDF wird erst beim Erzeugen nachgeladen.
 */

import { Assessment, GradeBook, LessonGrade, ResultStatus } from '../models';
import { formatGrade } from '../logic/assessment.logic';
import { formatDateGerman, toDateKey } from '../logic/time';

/** Das Ergebnis eines Schülers in einem Leistungsnachweis - auch nicht freigegebene. */
export interface BackupResult {
  grade: number | null;
  status: ResultStatus;
}

/** Ein Kurs für die Sicherung: die Notenübersicht plus alle eingetragenen Ergebnisse. */
export interface BackupCourse {
  book: GradeBook;
  /** Schlüssel: `${studentId}:${assessmentId}`. */
  results: Map<string, BackupResult>;
}

export type CellStyle = 'normal' | 'muted' | 'manual' | 'absent' | 'total' | 'draft';

export interface BackupCell {
  text: string;
  style: CellStyle;
}

export interface BackupTable {
  /** Obere Kopfzeile: Gruppen mit ihrer Spaltenzahl. */
  groups: { label: string; span: number }[];
  /** Untere Kopfzeile: je Spalte eine Überschrift. */
  headers: string[];
  rows: BackupCell[][];
}

export const resultKey = (studentId: number, assessmentId: number): string =>
  `${studentId}:${assessmentId}`;

/** Ganze Noten ohne Nachkomma („2“), sonst mit einer Stelle („2,5“) - spart Platz. */
function compactGrade(grade: number): string {
  return Number.isInteger(grade) ? String(grade) : formatGrade(grade, 1);
}

function lessonCell(lesson: LessonGrade): BackupCell {
  if (lesson.override) {
    return lesson.override.grade === null
      ? { text: 'f', style: 'absent' }
      : { text: compactGrade(lesson.override.grade), style: 'manual' };
  }

  return lesson.grade === null
    ? { text: '–', style: 'muted' }
    : { text: compactGrade(lesson.grade), style: 'normal' };
}

function assessmentCell(result: BackupResult | undefined, assessment: Assessment): BackupCell {
  const style: CellStyle = assessment.released ? 'normal' : 'draft';
  if (!result) {
    return { text: '–', style: 'muted' };
  }

  if (result.status === 'excused') {
    return { text: 'e', style: 'muted' };
  }

  if (result.status === 'refused') {
    return { text: '6,0 v', style };
  }

  return { text: formatGrade(result.grade, 1), style: result.grade === null ? 'muted' : style };
}

/** „07.09.“ in zwei Zeilen - so bleibt die Spalte schmal. */
function shortDate(dateKey: string): string {
  const [day, month] = formatDateGerman(dateKey).split('.');
  return `${day}.\n${month}.`;
}

/** Die Tabelle eines Kurses: je Schüler eine Zeile. */
export function backupTable({ book, results }: BackupCourse): BackupTable {
  const assessments = [...book.assessments].sort((a, b) => a.date.localeCompare(b.date));

  const groups: BackupTable['groups'] = [{ label: '', span: 1 }];
  if (assessments.length) {
    groups.push({ label: 'Leistungsnachweise', span: assessments.length });
  }
  if (book.lessonDates.length) {
    groups.push({ label: 'Mitarbeit je Doppelstunde', span: book.lessonDates.length });
  }
  groups.push({ label: 'Noten', span: 4 });

  const headers = [
    'Name',
    ...assessments.map(
      (a) =>
        `${a.title}${a.released ? '' : ' (nicht frei-\ngegeben)'}\n${formatDateGerman(a.date)}`,
    ),
    ...book.lessonDates.map(shortDate),
    'Ø Mit-\narbeit',
    'Schrift-\nlich',
    'Münd-\nlich',
    'Gesamt',
  ];

  const rows = book.students.map((s) => {
    const byDate = new Map(s.lessons.map((l) => [l.date, l]));
    const lessonCells = book.lessonDates.map((date) => {
      const lesson = byDate.get(date);
      return lesson ? lessonCell(lesson) : { text: '–', style: 'muted' as const };
    });

    return [
      { text: `${s.lastName}, ${s.firstName}`, style: 'normal' as const },
      ...assessments.map((a) => assessmentCell(results.get(resultKey(s.studentId, a.id)), a)),
      ...lessonCells,
      { text: formatGrade(s.participation), style: 'normal' as const },
      { text: formatGrade(s.written), style: 'normal' as const },
      { text: formatGrade(s.oral), style: 'normal' as const },
      {
        text: formatGrade(s.overall) + (s.partial && s.overall !== null ? '*' : ''),
        style: 'total' as const,
      },
    ];
  });

  return { groups, headers, rows };
}

/** Spaltenbreiten (mm) und Schrift (pt) einer Kursseite. */
export interface BackupLayout {
  fontSize: number;
  padding: number;
  nameWidth: number;
  assessmentWidth: number;
  lessonWidth: number;
  summaryWidth: number;
}

/** Querformat A4 abzüglich 10 mm Rand links und rechts. */
const TABLE_WIDTH = 277;
const NAME_WIDTH = 38;

/**
 * Die größte Schrift zwischen 9 und 4 pt, bei der alle Spalten nebeneinander
 * passen - so steht jeder Schüler in genau einer Zeile.
 */
export function layoutFor(assessmentCount: number, lessonCount: number): BackupLayout {
  let layout: BackupLayout | null = null;
  for (let fontSize = 9; fontSize >= 4; fontSize -= 0.5) {
    const em = fontSize * 0.3528; // 1 pt = 0,3528 mm
    const padding = Math.round(fontSize * 0.12 * 100) / 100;
    layout = {
      fontSize,
      padding,
      nameWidth: NAME_WIDTH,
      // „Klassenarbeit“ soll ungetrennt in die Zeile passen.
      assessmentWidth: 6 * em + 2 * padding,
      // „13.“ bzw. „1,5“
      lessonWidth: 1.45 * em + 2 * padding,
      // „Gesamt“, „3,00*“
      summaryWidth: 3.4 * em + 2 * padding,
    };
    const total =
      layout.nameWidth +
      assessmentCount * layout.assessmentWidth +
      lessonCount * layout.lessonWidth +
      4 * layout.summaryWidth;
    if (total <= TABLE_WIDTH) {
      break;
    }
  }
  return layout!;
}

const BLUE: [number, number, number] = [47, 93, 138];
const GRAY: [number, number, number] = [107, 118, 133];
const RED: [number, number, number] = [170, 51, 51];
const LEGEND =
  'Mitarbeit: Note der Doppelstunde · fett/blau = von Hand gesetzt · f = fehlte · – = zählt nicht. ' +
  'Leistungsnachweise: e = entschuldigt · v = verweigert · grau = nicht freigegeben (zählt nicht). ' +
  '* = vorläufig, ein Bereich hat noch keine Noten.';

/** Erzeugt die PDF-Datei mit einer Seite je Kurs. */
export async function renderBackupPdf(courses: BackupCourse[], createdAt: Date): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const stand = `${formatDateGerman(toDateKey(createdAt))}, ${createdAt
    .toTimeString()
    .slice(0, 5)} Uhr`;
  const totalPages = '{total}';

  courses.forEach((course, index) => {
    if (index > 0) {
      doc.addPage();
    }

    const { book } = course;
    const table = backupTable(course);
    const layout = layoutFor(book.assessments.length, book.lessonDates.length);
    const { fontSize } = layout;
    const firstLesson = 1 + book.assessments.length;
    const firstSummary = firstLesson + book.lessonDates.length;
    const title = `${book.schoolClassName} · ${book.subjectName}`;
    const info =
      `Schriftlich ${book.scheme.writtenPercent} % · mündlich/sonstig ` +
      `${100 - book.scheme.writtenPercent} % · Mitarbeit aus ${book.lessonDates.length} Doppelstunden ` +
      `· gesamter Zeitraum`;

    const drawHeader = (): void => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...BLUE);
      doc.text('SICHERUNG · ALLE NOTEN', 10, 9);
      doc.setFontSize(13);
      doc.setTextColor(28, 36, 48);
      doc.text(title, 10, 15);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`Stand: ${stand}`, pageWidth - 10, 9, { align: 'right' });
      doc.setTextColor(...GRAY);
      doc.text(info, pageWidth - 10, 15, { align: 'right' });
      doc.setDrawColor(...BLUE);
      doc.setLineWidth(0.5);
      doc.line(10, 17.5, pageWidth - 10, 17.5);
    };

    const drawFooter = (): void => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...GRAY);
      doc.text(doc.splitTextToSize(LEGEND, pageWidth - 50), 10, pageHeight - 8);
      // Links ausgerichtet: die Gesamtzahl wird erst am Ende eingesetzt.
      doc.text(
        `Seite ${doc.getCurrentPageInfo().pageNumber} von ${totalPages}`,
        pageWidth - 32,
        pageHeight - 8,
      );
      doc.text('Vertraulich - enthält personenbezogene Daten.', pageWidth - 10, pageHeight - 5, {
        align: 'right',
      });
    };

    if (table.rows.length === 0) {
      drawHeader();
      drawFooter();
      doc.setFontSize(10);
      doc.setTextColor(...GRAY);
      doc.text('Dieser Klasse sind keine Schüler zugeordnet.', 10, 28);
      return;
    }

    autoTable(doc, {
      startY: 21,
      margin: { top: 21, left: 10, right: 10, bottom: 14 },
      theme: 'grid',
      head: [table.groups.map((g) => ({ content: g.label, colSpan: g.span })), table.headers],
      body: table.rows.map((row) => row.map((c) => c.text)),
      styles: {
        fontSize,
        cellPadding: layout.padding,
        halign: 'center',
        valign: 'middle',
        lineColor: [200, 205, 212],
        lineWidth: 0.1,
        textColor: [28, 36, 48],
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [232, 240, 248],
        textColor: [28, 36, 48],
        fontStyle: 'bold',
        fontSize: Math.max(4, fontSize - 0.5),
      },
      columnStyles: Object.fromEntries(
        table.headers.map((_, i) => [
          i,
          i === 0
            ? {
                halign: 'left' as const,
                cellWidth: layout.nameWidth,
                overflow: 'ellipsize' as const,
              }
            : i < firstLesson
              ? { minCellWidth: layout.assessmentWidth }
              : { cellWidth: i < firstSummary ? layout.lessonWidth : layout.summaryWidth },
        ]),
      ),
      didParseCell: (data) => {
        if (data.section !== 'body') {
          return;
        }
        const cell = table.rows[data.row.index]?.[data.column.index];
        switch (cell?.style) {
          case 'muted':
          case 'draft':
            data.cell.styles.textColor = GRAY;
            if (cell.style === 'draft') {
              data.cell.styles.fontStyle = 'italic';
            }
            break;
          case 'manual':
            data.cell.styles.textColor = BLUE;
            data.cell.styles.fontStyle = 'bold';
            break;
          case 'absent':
            data.cell.styles.textColor = RED;
            data.cell.styles.fontStyle = 'bold';
            break;
          case 'total':
            data.cell.styles.fillColor = [232, 240, 248];
            data.cell.styles.fontStyle = 'bold';
            break;
        }
        if (data.column.index === 0) {
          data.cell.styles.fontStyle = 'bold';
        }
      },
      didDrawPage: () => {
        drawHeader();
        drawFooter();
      },
    });
  });

  doc.putTotalPages(totalPages);
  return doc.output('blob');
}
