/** Die Stammdaten: Klassen, Fächer, Kurse und Schüler. */

import { AppError } from '../app-error';
import { Course, SchoolClass, Student, Subject, byLastName, byName } from '../models';
import { Database, StudentRecord } from './database';
import {
  allCourses,
  requireClass,
  requireCourse,
  requireStudent,
  studentsOfCourse,
  toCourse,
} from './lookups';
import { StorePart } from './store-part';

function toStudent(record: StudentRecord): Student {
  return {
    id: record.id,
    firstName: record.firstName,
    lastName: record.lastName,
    schoolClassId: record.schoolClassId,
    hasPhoto: record.photo !== null,
    photoUrl: record.photo,
  };
}

/** Räumt alles weg, was an einem Kurs hängt. */
function removeCourseData(db: Database, courseId: number): void {
  db.seatingPlans = db.seatingPlans.filter((p) => p.courseId !== courseId);
  db.timetableEntries = db.timetableEntries.filter((e) => e.courseId !== courseId);
  db.ratings = db.ratings.filter((r) => r.courseId !== courseId);
  db.gradeScales = db.gradeScales.filter((g) => g.courseId !== courseId);

  const assessments = new Set(
    db.assessments.filter((a) => a.courseId === courseId).map((a) => a.id),
  );
  db.assessments = db.assessments.filter((a) => a.courseId !== courseId);
  db.assessmentResults = db.assessmentResults.filter((r) => !assessments.has(r.assessmentId));
  db.gradingSchemes = db.gradingSchemes.filter((g) => g.courseId !== courseId);
  db.participationOverrides = db.participationOverrides.filter((o) => o.courseId !== courseId);
  db.quarterGrades = db.quarterGrades.filter((q) => q.courseId !== courseId);
  db.gradeChanges = db.gradeChanges.filter((c) => c.courseId !== courseId);
  db.gradeReports = db.gradeReports.filter((r) => r.courseId !== courseId);
}

/** Entfernt gelöschte Schüler aus Sitzordnungen, Bewertungen und Noten. */
function removeStudentReferences(db: Database, studentIds: number[]): void {
  if (studentIds.length === 0) {
    return;
  }

  const gone = new Set(studentIds);
  db.ratings = db.ratings.filter((r) => !gone.has(r.studentId));
  db.assessmentResults = db.assessmentResults.filter((r) => !gone.has(r.studentId));
  db.participationOverrides = db.participationOverrides.filter((o) => !gone.has(o.studentId));
  db.quarterGrades = db.quarterGrades.filter((q) => !gone.has(q.studentId));
  db.gradeChanges = db.gradeChanges.filter((c) => !gone.has(c.studentId));
  db.gradeReports = db.gradeReports.filter((r) => !gone.has(r.studentId));
  for (const plan of db.seatingPlans) {
    plan.seats = plan.seats.filter((s) => !gone.has(s.studentId));
  }
}

export class MasterDataStore extends StorePart {
  // --- Klassen ------------------------------------------------------------

  getClasses(): SchoolClass[] {
    return this.db.schoolClasses
      .map((c) => ({
        id: c.id,
        name: c.name,
        studentCount: this.db.students.filter((s) => s.schoolClassId === c.id).length,
      }))
      .sort(byName);
  }

  createClass(rawName: string): SchoolClass {
    const name = rawName.trim();
    if (this.db.schoolClasses.some((c) => c.name === name)) {
      throw new AppError(`Die Klasse '${name}' gibt es bereits.`);
    }

    const record = { id: this.db.nextIds.schoolClass++, name };
    this.db.schoolClasses.push(record);
    this.changed();

    return { id: record.id, name: record.name, studentCount: 0 };
  }

  updateClass(id: number, rawName: string): SchoolClass {
    const record = this.db.schoolClasses.find((c) => c.id === id);
    if (!record) {
      throw new AppError('Die Klasse existiert nicht.');
    }

    const name = rawName.trim();
    if (this.db.schoolClasses.some((c) => c.name === name && c.id !== id)) {
      throw new AppError(`Die Klasse '${name}' gibt es bereits.`);
    }

    record.name = name;
    this.changed();

    return {
      id: record.id,
      name: record.name,
      studentCount: this.db.students.filter((s) => s.schoolClassId === id).length,
    };
  }

  /** Löscht die Klasse samt Schülern, Kursen, Sitzordnungen und Bewertungen. */
  deleteClass(id: number): void {
    requireClass(this.db, id);

    const students = this.db.students.filter((s) => s.schoolClassId === id).map((s) => s.id);
    this.db.courses
      .filter((c) => c.schoolClassId === id)
      .map((c) => c.id)
      .forEach((courseId) => removeCourseData(this.db, courseId));

    this.db.courses = this.db.courses.filter((c) => c.schoolClassId !== id);
    this.db.students = this.db.students.filter((s) => s.schoolClassId !== id);
    this.db.schoolClasses = this.db.schoolClasses.filter((c) => c.id !== id);
    removeStudentReferences(this.db, students);
    this.changed();
  }

  // --- Fächer -------------------------------------------------------------

  getSubjects(): Subject[] {
    return [...this.db.subjects].sort(byName);
  }

  createSubject(rawName: string, rawShort: string): Subject {
    const name = rawName.trim();
    if (this.db.subjects.some((s) => s.name === name)) {
      throw new AppError(`Das Fach '${name}' gibt es bereits.`);
    }

    const record = {
      id: this.db.nextIds.subject++,
      name,
      shortName: rawShort.trim(),
    };
    this.db.subjects.push(record);
    this.changed();

    return { ...record };
  }

  updateSubject(id: number, rawName: string, rawShort: string): Subject {
    const record = this.db.subjects.find((s) => s.id === id);
    if (!record) {
      throw new AppError('Das Fach existiert nicht.');
    }

    const name = rawName.trim();
    if (this.db.subjects.some((s) => s.name === name && s.id !== id)) {
      throw new AppError(`Das Fach '${name}' gibt es bereits.`);
    }

    record.name = name;
    record.shortName = rawShort.trim();
    this.changed();

    return { ...record };
  }

  deleteSubject(id: number): void {
    if (!this.db.subjects.some((s) => s.id === id)) {
      throw new AppError('Das Fach existiert nicht.');
    }

    this.db.courses
      .filter((c) => c.subjectId === id)
      .map((c) => c.id)
      .forEach((courseId) => removeCourseData(this.db, courseId));

    this.db.courses = this.db.courses.filter((c) => c.subjectId !== id);
    this.db.subjects = this.db.subjects.filter((s) => s.id !== id);
    this.changed();
  }

  // --- Kurse --------------------------------------------------------------

  getCourses(): Course[] {
    return allCourses(this.db);
  }

  getCourse(id: number): Course {
    return toCourse(this.db, id);
  }

  createCourse(schoolClassId: number, subjectId: number): Course {
    if (!this.db.schoolClasses.some((c) => c.id === schoolClassId)) {
      throw new AppError('Die angegebene Klasse existiert nicht.');
    }

    if (!this.db.subjects.some((s) => s.id === subjectId)) {
      throw new AppError('Das angegebene Fach existiert nicht.');
    }

    const exists = this.db.courses.some(
      (c) => c.schoolClassId === schoolClassId && c.subjectId === subjectId,
    );
    if (exists) {
      throw new AppError('Diese Klasse ist in diesem Fach bereits angelegt.');
    }

    const record = { id: this.db.nextIds.course++, schoolClassId, subjectId };
    this.db.courses.push(record);
    this.changed();

    return toCourse(this.db, record.id);
  }

  deleteCourse(id: number): void {
    requireCourse(this.db, id);
    removeCourseData(this.db, id);
    this.db.courses = this.db.courses.filter((c) => c.id !== id);
    this.changed();
  }

  getCourseStudents(courseId: number): Student[] {
    return studentsOfCourse(this.db, courseId).map(toStudent);
  }

  // --- Schüler ------------------------------------------------------------

  getStudents(classId: number): Student[] {
    requireClass(this.db, classId);
    return this.db.students
      .filter((s) => s.schoolClassId === classId)
      .sort(byLastName)
      .map(toStudent);
  }

  createStudent(classId: number, firstName: string, lastName: string): Student {
    requireClass(this.db, classId);

    const record: StudentRecord = {
      id: this.db.nextIds.student++,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      schoolClassId: classId,
      photo: null,
    };

    this.db.students.push(record);
    this.changed();

    return toStudent(record);
  }

  /** Legt mehrere Schüler auf einmal an - gedacht für eingefügte Namenslisten. */
  importStudents(classId: number, input: { firstName: string; lastName: string }[]): Student[] {
    requireClass(this.db, classId);

    const records = input
      .filter((i) => i.firstName.trim() !== '' || i.lastName.trim() !== '')
      .map<StudentRecord>((i) => ({
        id: this.db.nextIds.student++,
        firstName: i.firstName.trim(),
        lastName: i.lastName.trim(),
        schoolClassId: classId,
        photo: null,
      }));

    if (records.length === 0) {
      throw new AppError('Die Liste enthält keine verwertbaren Namen.');
    }

    this.db.students.push(...records);
    this.changed();

    return records.map(toStudent);
  }

  updateStudent(id: number, firstName: string, lastName: string): Student {
    const record = requireStudent(this.db, id);
    record.firstName = firstName.trim();
    record.lastName = lastName.trim();
    this.changed();

    return toStudent(record);
  }

  deleteStudent(id: number): void {
    requireStudent(this.db, id);
    this.db.students = this.db.students.filter((s) => s.id !== id);
    removeStudentReferences(this.db, [id]);
    this.changed();
  }

  /** Legt das bereits verkleinerte Foto als Data-URL am Schüler ab. */
  setPhoto(id: number, dataUrl: string): Student {
    const record = requireStudent(this.db, id);
    record.photo = dataUrl;
    this.changed();

    return toStudent(record);
  }

  deletePhoto(id: number): Student {
    const record = requireStudent(this.db, id);
    record.photo = null;
    this.changed();

    return toStudent(record);
  }
}
