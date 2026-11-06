/**
 * Erzeugt `demo.sitzordnung`: einen verschlüsselten Datenbestand mit
 * erfundenen Daten (Klassen, Schüler, Stundenplan, Sitzordnungen,
 * Mitarbeitsbewertungen, Leistungsnachweise, Protokoll).
 *
 * Aufruf (Node 20+):  node demo-daten/demo-datenbestand-erzeugen.mjs
 * Passwort der Datei: siehe PASSWORD unten bzw. README.
 *
 * Die Zufallswerte sind fest geseedet - jeder Lauf liefert dieselben Daten
 * (nur Salt und IV der Verschlüsselung ändern sich).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const PASSWORD = 'Demo-Passwort-2026!';
const OUTPUT = join(HERE, 'demo.sitzordnung');

/** Bewertet wird vom Schuljahresbeginn laut Stundenplan bis zu diesem Tag. */
const FIRST_DAY = '2026-09-14';
const LAST_DAY = '2026-11-05';
/** Herbstferien Niedersachsen 2026 - dort findet kein Unterricht statt. */
const HOLIDAYS = [['2026-10-12', '2026-10-24']];

// --- Zufall (fest geseedet) ------------------------------------------------

let seed = 20261106;
function random() {
  // mulberry32
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (list) => list[Math.floor(random() * list.length)];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** Grob normalverteilt um 0 mit Streuung 1. */
const gauss = () => (random() + random() + random() + random() - 2) * 1.7;

// --- Datumshilfen ------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const isHoliday = (key) => HOLIDAYS.some(([from, to]) => key >= from && key <= to);
function* days(from, to) {
  for (let d = parseKey(from); dateKey(d) <= to; d.setDate(d.getDate() + 1)) {
    yield new Date(d);
  }
}
/** Lokale Uhrzeit (Europe/Berlin) als ISO-Zeitpunkt. */
function isoAt(key, time, extraMinutes = 0) {
  const [h, m] = time.split(':').map(Number);
  const d = parseKey(key);
  d.setHours(h, m + extraMinutes, Math.floor(random() * 60));
  return d.toISOString();
}

// --- Stammdaten aus den übrigen Demo-Dateien ---------------------------------

const SHORT_NAMES = {
  Informatik: 'INF',
  Wirtschaft: 'WI',
  Projektmanagement: 'PM',
  Deutsch: 'DE',
  Datenbanken: 'DB',
  Mathematik: 'MA',
  Englisch: 'EN',
};

const ics = readFileSync(join(HERE, 'demo-stundenplan.ics'), 'utf8').replace(/\r\n[ \t]/g, '');
const events = ics
  .split('BEGIN:VEVENT')
  .slice(1)
  .map((block) => {
    const field = (name) => block.match(new RegExp(`^${name}[^:\\n]*:(.*)$`, 'm'))?.[1].trim();
    const start = field('DTSTART');
    const end = field('DTEND');
    const [subject, className] = field('SUMMARY').split(' - ');
    const dayOfWeek = new Date(+start.slice(0, 4), +start.slice(4, 6) - 1, +start.slice(6, 8)).getDay();
    return {
      subject,
      className,
      dayOfWeek,
      startTime: `${start.slice(9, 11)}:${start.slice(11, 13)}`,
      endTime: `${end.slice(9, 11)}:${end.slice(11, 13)}`,
      room: field('LOCATION') ?? null,
    };
  });

const db = {
  schoolClasses: [],
  subjects: [],
  courses: [],
  students: [],
  seatingPlans: [],
  timetableEntries: [],
  ratings: [],
  gradeScales: [
    {
      id: 1,
      courseId: null,
      name: 'Standard-Notenschlüssel',
      entries: [
        { minPoints: 12, grade: '1' },
        { minPoints: 8, grade: '2' },
        { minPoints: 4, grade: '3' },
        { minPoints: 0, grade: '4' },
        { minPoints: -4, grade: '5' },
        { minPoints: -1000, grade: '6' },
      ],
    },
  ],
  gradingPeriods: [
    { id: 1, name: '1. Halbjahr 2026/27', start: '2026-08-13', end: '2027-01-31' },
  ],
  gradingSchemes: [],
  assessments: [],
  assessmentResults: [],
  participationOverrides: [],
  quarterGrades: [],
  gradeChanges: [],
  gradeReports: [],
  settings: { toleranceMinutes: 15, allowRatingOutsideLesson: false },
  nextIds: {},
};

const ids = { schoolClass: 1, subject: 1, course: 1, student: 1, seatingPlan: 1,
  timetableEntry: 1, rating: 1, gradeScale: 2, gradingPeriod: 2, assessment: 1,
  gradeChange: 1, gradeReport: 1 };

const classByName = new Map();
for (const name of ['BFI10A', 'KDM11', 'KDM12']) {
  const record = { id: ids.schoolClass++, name };
  db.schoolClasses.push(record);
  classByName.set(name, record);

  const names = readFileSync(join(HERE, `schueler-${name}.txt`), 'utf8').split(/\r?\n/).filter(Boolean);
  for (const line of names) {
    const [lastName, firstName] = line.split(',').map((s) => s.trim());
    db.students.push({ id: ids.student++, firstName, lastName, schoolClassId: record.id, photo: null });
  }
}

const subjectByName = new Map();
const courseByKey = new Map();
for (const e of events) {
  if (!subjectByName.has(e.subject)) {
    const s = { id: ids.subject++, name: e.subject, shortName: SHORT_NAMES[e.subject] ?? e.subject.slice(0, 3).toUpperCase() };
    db.subjects.push(s);
    subjectByName.set(e.subject, s);
  }
  const key = `${e.className}|${e.subject}`;
  if (!courseByKey.has(key)) {
    const c = { id: ids.course++, schoolClassId: classByName.get(e.className).id, subjectId: subjectByName.get(e.subject).id };
    db.courses.push(c);
    courseByKey.set(key, c);
  }
  db.timetableEntries.push({
    id: ids.timetableEntry++,
    courseId: courseByKey.get(key).id,
    dayOfWeek: e.dayOfWeek,
    startTime: e.startTime,
    endTime: e.endTime,
    room: e.room,
  });
}

const studentsOf = (course) => db.students.filter((s) => s.schoolClassId === course.schoolClassId);
const courseLabel = (course) =>
  `${db.subjects.find((s) => s.id === course.subjectId).name} ${db.schoolClasses.find((c) => c.id === course.schoolClassId).name}`;

/** Jeder Schüler bekommt eine feste "Leistungsneigung" von etwa -1,5 bis +1,5. */
const talent = new Map(db.students.map((s) => [s.id, clamp(gauss() * 0.8, -1.6, 1.6)]));

// --- Sitzordnungen ----------------------------------------------------------

for (const course of db.courses) {
  const students = studentsOf(course);
  const columns = 6;
  const rows = Math.ceil(students.length / 4) + 1; // Tischgruppen mit Lücken
  const free = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      // Mittelgang zwischen Spalte 2 und 3 freilassen wäre zu eng - jede 3. Spalte bleibt Gang
      free.push({ row: r, column: c });
    }
  }
  const shuffled = [...students].sort(() => random() - 0.5);
  db.seatingPlans.push({
    id: ids.seatingPlan++,
    courseId: course.id,
    name: 'Standard',
    rows,
    columns,
    seats: shuffled.map((s, i) => ({ studentId: s.id, ...free[i] })),
  });
}
// Ein Kurs bekommt zusätzlich eine Gruppenarbeits-Ordnung.
{
  const course = courseByKey.get('BFI10A|Informatik');
  const students = studentsOf(course);
  const seats = [];
  const groupCorners = [[0, 0], [0, 4], [3, 0], [3, 4], [6, 0], [6, 4]];
  students.forEach((s, i) => {
    const [r, c] = groupCorners[Math.floor(i / 3) % groupCorners.length];
    const k = i % 3;
    seats.push({ studentId: s.id, row: r + (k === 2 ? 1 : 0), column: c + (k === 1 ? 1 : 0) });
  });
  db.seatingPlans.push({ id: ids.seatingPlan++, courseId: course.id, name: 'Gruppenarbeit', rows: 8, columns: 6, seats });
}

// --- Mitarbeitsbewertungen --------------------------------------------------

const COMMENTS_POS = ['gute Präsentation', 'hilft Mitschülern', 'sehr gute Frage', 'Lösung an der Tafel', 'eigenständig gearbeitet'];
const COMMENTS_NEG = ['Handy', 'Material vergessen', 'stört den Unterricht', 'Hausaufgaben fehlen', 'nicht bei der Sache'];

const lessonsByCourse = new Map(); // courseId -> [{date, startTime, endTime}]
for (const day of days(FIRST_DAY, LAST_DAY)) {
  const key = dateKey(day);
  if (isHoliday(key)) continue;
  for (const entry of db.timetableEntries.filter((e) => e.dayOfWeek === day.getDay())) {
    const list = lessonsByCourse.get(entry.courseId) ?? [];
    // Pro Kurs und Tag gilt eine Unterrichtseinheit.
    if (!list.some((l) => l.date === key)) {
      list.push({ date: key, startTime: entry.startTime });
    }
    lessonsByCourse.set(entry.courseId, list);
  }
}

for (const course of db.courses) {
  const lessons = lessonsByCourse.get(course.id) ?? [];
  const students = studentsOf(course);
  for (const lesson of lessons) {
    // Nicht jede Stunde wird bewertet - etwa 85 %.
    if (random() < 0.15) continue;
    for (const student of students) {
      if (random() > 0.55) continue; // nicht jeder kommt in jeder Stunde dran
      const base = talent.get(student.id) + gauss() * 0.9;
      const value = clamp(Math.round(base), -2, 2);
      let comment = null;
      if (random() < 0.08) comment = value > 0 ? pick(COMMENTS_POS) : value < 0 ? pick(COMMENTS_NEG) : null;
      db.ratings.push({
        id: ids.rating++,
        courseId: course.id,
        studentId: student.id,
        value,
        lessonDate: lesson.date,
        createdAt: isoAt(lesson.date, lesson.startTime, 5 + Math.floor(random() * 80)),
        comment,
      });
      // Gelegentlich eine zweite Bewertung in derselben Stunde.
      if (random() < 0.12) {
        db.ratings.push({
          id: ids.rating++,
          courseId: course.id,
          studentId: student.id,
          value: clamp(Math.round(talent.get(student.id) + gauss()), -2, 2),
          lessonDate: lesson.date,
          createdAt: isoAt(lesson.date, lesson.startTime, 60 + Math.floor(random() * 25)),
          comment: null,
        });
      }
    }
  }
}

// --- Bewertungsschemata -----------------------------------------------------

const IHK_SCALE = [
  { minPercent: 92, grade: 1 },
  { minPercent: 81, grade: 2 },
  { minPercent: 67, grade: 3 },
  { minPercent: 50, grade: 4 },
  { minPercent: 30, grade: 5 },
  { minPercent: 0, grade: 6 },
];
const DEFAULT_TYPES = [
  { key: 'klassenarbeit', label: 'Klassenarbeit', area: 'written', weight: 2 },
  { key: 'test', label: 'Test', area: 'written', weight: 1 },
  { key: 'referat', label: 'Referat / Präsentation', area: 'oral', weight: 1 },
  { key: 'handlungsprodukt', label: 'Handlungsprodukt', area: 'oral', weight: 1 },
];
for (const course of db.courses) {
  const isKdm12Pm = course === courseByKey.get('KDM12|Projektmanagement');
  db.gradingSchemes.push({
    courseId: course.id,
    // Projektmanagement: handlungsorientiert, mehr Gewicht auf mündlich/sonstig.
    writtenPercent: isKdm12Pm ? 40 : 50,
    types: structuredClone(DEFAULT_TYPES),
    percentScale: structuredClone(IHK_SCALE),
    participationWeight: 2,
    participationGrades: { plusPlus: 1, plus: 2, neutral: 3, minus: 4, minusMinus: 5 },
  });
}
// Ein Kurs bekommt einen eigenen Punkte-Notenschlüssel für die Mitarbeit.
db.gradeScales.push({
  id: ids.gradeScale++,
  courseId: courseByKey.get('KDM11|Wirtschaft').id,
  name: 'Schlüssel Wirtschaft KDM11',
  entries: [
    { minPoints: 10, grade: '1' },
    { minPoints: 6, grade: '2' },
    { minPoints: 2, grade: '3' },
    { minPoints: -1, grade: '4' },
    { minPoints: -5, grade: '5' },
    { minPoints: -1000, grade: '6' },
  ],
});

// --- Leistungsnachweise -----------------------------------------------------

const gradeFromPercent = (p) => IHK_SCALE.find((s) => p >= s.minPercent).grade;
const lessonDay = (course, index) => {
  const list = lessonsByCourse.get(course.id) ?? [];
  return list[clamp(index, 0, list.length - 1)]?.date ?? FIRST_DAY;
};

function addAssessment(course, { typeKey, title, lessonIndex, maxPoints, released, comment = null }) {
  const date = lessonDay(course, lessonIndex);
  const a = {
    id: ids.assessment++,
    courseId: course.id,
    typeKey,
    title,
    date,
    maxPoints,
    releasedAt: released ? isoAt(date, '16:00', 60 * 24 * 5) : null,
    comment,
  };
  db.assessments.push(a);

  for (const student of studentsOf(course)) {
    const r = random();
    let status = 'graded';
    if (r < 0.05) status = 'excused';
    else if (r < 0.065) status = 'refused';

    let points = null;
    let grade = null;
    if (status === 'graded') {
      const percent = clamp(68 + talent.get(student.id) * 15 + gauss() * 9, 12, 100);
      if (maxPoints) {
        points = Math.round((percent / 100) * maxPoints * 2) / 2; // halbe Punkte
      } else {
        // Direkt eingetragene Note mit Tendenz, z. B. 2,3 oder 1,7.
        const tendency = pick([0, 0, 0.3, -0.3]);
        grade = Math.round(clamp(gradeFromPercent(percent) + tendency, 1, 6) * 10) / 10;
      }
    }
    db.assessmentResults.push({
      assessmentId: a.id,
      studentId: student.id,
      points,
      grade,
      status,
      comment: status === 'excused' ? 'krank (Attest)' : status === 'refused' ? 'Abgabe verweigert' : null,
    });
  }
  return a;
}

const PLANS = {
  'BFI10A|Informatik': [
    { typeKey: 'test', title: 'Test Zahlensysteme', lessonIndex: 3, maxPoints: 20, released: true },
    { typeKey: 'klassenarbeit', title: 'Klassenarbeit Hardware & Zahlensysteme', lessonIndex: 9, maxPoints: 50, released: true },
    { typeKey: 'handlungsprodukt', title: 'Steckbrief PC-Komponente', lessonIndex: 6, maxPoints: null, released: true },
    { typeKey: 'test', title: 'Test Netzwerkgrundlagen', lessonIndex: 13, maxPoints: 20, released: false, comment: 'noch nicht fertig korrigiert' },
  ],
  'KDM11|Wirtschaft': [
    { typeKey: 'klassenarbeit', title: 'Klassenarbeit Kaufvertrag', lessonIndex: 8, maxPoints: 100, released: true },
    { typeKey: 'referat', title: 'Kurzreferat Rechtsformen', lessonIndex: 5, maxPoints: null, released: true },
  ],
  'KDM11|Informatik': [
    { typeKey: 'test', title: 'Test Datenformate', lessonIndex: 4, maxPoints: 30, released: true },
  ],
  'KDM12|Projektmanagement': [
    { typeKey: 'klassenarbeit', title: 'Klassenarbeit Projektplanung', lessonIndex: 10, maxPoints: 60, released: true },
    { typeKey: 'handlungsprodukt', title: 'Projektstrukturplan (Gruppe)', lessonIndex: 7, maxPoints: null, released: true },
    { typeKey: 'referat', title: 'Präsentation Projektabschluss', lessonIndex: 13, maxPoints: null, released: false },
  ],
  'KDM12|Datenbanken': [
    { typeKey: 'test', title: 'Test ER-Modell', lessonIndex: 3, maxPoints: 25, released: true },
    { typeKey: 'klassenarbeit', title: 'Klassenarbeit SQL-Grundlagen', lessonIndex: 6, maxPoints: 50, released: true },
  ],
};
for (const [key, plans] of Object.entries(PLANS)) {
  for (const plan of plans) addAssessment(courseByKey.get(key), plan);
}

// --- Von Hand gesetzte Mitarbeitsnoten + Protokoll ---------------------------

const ratedDates = (courseId) => [...new Set(db.ratings.filter((r) => r.courseId === courseId).map((r) => r.lessonDate))].sort();
const studentName = (s) => `${s.firstName} ${s.lastName}`;

for (const key of ['BFI10A|Informatik', 'KDM11|Wirtschaft', 'KDM12|Projektmanagement']) {
  const course = courseByKey.get(key);
  const dates = ratedDates(course.id);
  const students = studentsOf(course);
  for (let i = 0; i < 3; i++) {
    const student = students[Math.floor(random() * students.length)];
    const lessonDate = dates[Math.floor(random() * dates.length)];
    if (db.participationOverrides.some((o) => o.courseId === course.id && o.studentId === student.id && o.lessonDate === lessonDate)) continue;
    const absent = i < 2;
    const reason = absent ? 'krank gemeldet' : 'Nachgereichte Ausarbeitung berücksichtigt';
    db.participationOverrides.push({ courseId: course.id, studentId: student.id, lessonDate, grade: absent ? null : 2, reason });
    const [y, m, d] = lessonDate.split('-');
    db.gradeChanges.push({
      id: ids.gradeChange++,
      courseId: course.id,
      studentId: student.id,
      what: `Mitarbeit ${d}.${m}.${y}`,
      oldValue: '3,0',
      newValue: absent ? 'fehlte' : '2,0',
      reason,
      changedAt: isoAt(lessonDate, '15:30'),
    });
  }
}

// Eine nachträglich korrigierte Klassenarbeit im Protokoll.
{
  const a = db.assessments.find((x) => x.title === 'Klassenarbeit Kaufvertrag');
  const res = db.assessmentResults.find((r) => r.assessmentId === a.id && r.status === 'graded');
  const student = db.students.find((s) => s.id === res.studentId);
  const old = res.points;
  res.points = Math.min(100, old + 4);
  db.gradeChanges.push({
    id: ids.gradeChange++,
    courseId: a.courseId,
    studentId: student.id,
    what: `${a.title}: Punkte`,
    oldValue: String(old).replace('.', ','),
    newValue: String(res.points).replace('.', ','),
    reason: 'Korrekturfehler in Aufgabe 3',
    changedAt: isoAt(a.date, '14:00', 60 * 24 * 9),
  });
}

db.nextIds = ids;

// --- Verschlüsseln (gleiches Format wie vault-crypto.ts) ---------------------

const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const iterations = 310_000;
const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(PASSWORD), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
  material,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt'],
);
const packed = gzipSync(Buffer.from(JSON.stringify(db), 'utf8'));
const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, packed));

writeFileSync(
  OUTPUT,
  JSON.stringify({
    format: 'sitzordnung-vault',
    version: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: b64(salt) },
    cipher: { name: 'AES-GCM', iv: b64(iv) },
    compression: 'gzip',
    data: b64(encrypted),
  }),
);

console.log(`${OUTPUT} geschrieben (Passwort: ${PASSWORD})`);
console.log(
  `${db.schoolClasses.length} Klassen, ${db.students.length} Schüler, ${db.courses.length} Kurse, ` +
    `${db.seatingPlans.length} Sitzordnungen, ${db.ratings.length} Bewertungen, ` +
    `${db.assessments.length} Leistungsnachweise, ${db.gradeChanges.length} Protokolleinträge`,
);
