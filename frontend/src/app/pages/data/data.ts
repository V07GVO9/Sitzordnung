import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Course, SchoolClass, Student, Subject, fullName, initials } from '../../core/models';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-data',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  templateUrl: './data.html',
  styleUrl: './data.scss',
})
export class DataPage {
  private readonly api = inject(ApiService);
  private readonly toasts = inject(ToastService);

  readonly classes = signal<SchoolClass[]>([]);
  readonly subjects = signal<Subject[]>([]);
  readonly courses = signal<Course[]>([]);
  readonly students = signal<Student[]>([]);
  readonly selectedClassId = signal<number | null>(null);

  readonly newClassName = signal('');
  readonly newSubjectName = signal('');
  readonly newSubjectShort = signal('');
  readonly newFirstName = signal('');
  readonly newLastName = signal('');
  readonly courseClassId = signal<number | null>(null);
  readonly courseSubjectId = signal<number | null>(null);

  readonly importText = signal('');
  readonly showImport = signal(false);

  readonly fullName = fullName;
  readonly initials = initials;

  readonly selectedClass = computed(
    () => this.classes().find((c) => c.id === this.selectedClassId()) ?? null,
  );

  /** Die Kurse der gewählten Klasse - also ihre Fächer. */
  readonly classCourses = computed(() =>
    this.courses().filter((c) => c.schoolClassId === this.selectedClassId()),
  );

  constructor() {
    this.loadAll();
  }

  private loadAll(keepClassId = true): void {
    const previous = this.selectedClassId();

    forkJoin({
      classes: this.api.getClasses(),
      subjects: this.api.getSubjects(),
      courses: this.api.getCourses(),
    }).subscribe({
      next: ({ classes, subjects, courses }) => {
        this.classes.set(classes);
        this.subjects.set(subjects);
        this.courses.set(courses);

        const stillThere = keepClassId && classes.some((c) => c.id === previous);
        this.selectClass(stillThere ? previous : (classes[0]?.id ?? null));
      },
      error: (err) => this.toasts.error(err, 'Die Stammdaten konnten nicht geladen werden.'),
    });
  }

  selectClass(id: number | null): void {
    this.selectedClassId.set(id);
    this.students.set([]);

    if (id === null) {
      return;
    }

    this.api.getStudents(id).subscribe({
      next: (students) => this.students.set(students),
      error: (err) => this.toasts.error(err, 'Die Schüler konnten nicht geladen werden.'),
    });
  }

  private reloadStudents(): void {
    const id = this.selectedClassId();
    if (id !== null) {
      this.api.getStudents(id).subscribe({
        next: (students) => {
          this.students.set(students);
          this.classes.update((list) =>
            list.map((c) => (c.id === id ? { ...c, studentCount: students.length } : c)),
          );
        },
      });
    }
  }

  // --- Klassen ---

  addClass(): void {
    const name = this.newClassName().trim();
    if (!name) {
      return;
    }

    this.api.createClass(name).subscribe({
      next: (created) => {
        this.newClassName.set('');
        this.classes.update((list) => [...list, created].sort((a, b) => a.name.localeCompare(b.name)));
        this.selectClass(created.id);
        this.toasts.success(`Klasse „${created.name}" angelegt.`);
      },
      error: (err) => this.toasts.error(err, 'Die Klasse konnte nicht angelegt werden.'),
    });
  }

  deleteClass(schoolClass: SchoolClass): void {
    const confirmed = confirm(
      `Klasse „${schoolClass.name}" mit allen Schülern, Sitzordnungen und Bewertungen löschen?`,
    );
    if (!confirmed) {
      return;
    }

    this.api.deleteClass(schoolClass.id).subscribe({
      next: () => {
        this.toasts.success('Die Klasse wurde gelöscht.');
        this.selectedClassId.set(null);
        this.loadAll(false);
      },
      error: (err) => this.toasts.error(err, 'Die Klasse konnte nicht gelöscht werden.'),
    });
  }

  // --- Fächer ---

  addSubject(): void {
    const name = this.newSubjectName().trim();
    if (!name) {
      return;
    }

    const short = this.newSubjectShort().trim() || name.slice(0, 2).toUpperCase();

    this.api.createSubject(name, short).subscribe({
      next: (created) => {
        this.newSubjectName.set('');
        this.newSubjectShort.set('');
        this.subjects.update((list) => [...list, created].sort((a, b) => a.name.localeCompare(b.name)));
        this.toasts.success(`Fach „${created.name}" angelegt.`);
      },
      error: (err) => this.toasts.error(err, 'Das Fach konnte nicht angelegt werden.'),
    });
  }

  deleteSubject(subject: Subject): void {
    if (!confirm(`Fach „${subject.name}" mit allen zugehörigen Kursen löschen?`)) {
      return;
    }

    this.api.deleteSubject(subject.id).subscribe({
      next: () => {
        this.toasts.success('Das Fach wurde gelöscht.');
        this.loadAll();
      },
      error: (err) => this.toasts.error(err, 'Das Fach konnte nicht gelöscht werden.'),
    });
  }

  // --- Kurse ---

  addCourse(): void {
    const classId = this.courseClassId() ?? this.selectedClassId();
    const subjectId = this.courseSubjectId();

    if (!classId || !subjectId) {
      this.toasts.show('Bitte Klasse und Fach auswählen.', 'error');
      return;
    }

    this.api.createCourse(classId, subjectId).subscribe({
      next: (created) => {
        this.courses.update((list) => [...list, created]);
        this.courseSubjectId.set(null);
        this.toasts.success(`${created.subjectName} in ${created.schoolClassName} angelegt.`);
      },
      error: (err) => this.toasts.error(err, 'Der Kurs konnte nicht angelegt werden.'),
    });
  }

  deleteCourse(course: Course): void {
    const confirmed = confirm(
      `${course.subjectName} in ${course.schoolClassName} löschen? Sitzordnungen und Bewertungen dieses Kurses gehen verloren.`,
    );
    if (!confirmed) {
      return;
    }

    this.api.deleteCourse(course.id).subscribe({
      next: () => {
        this.courses.update((list) => list.filter((c) => c.id !== course.id));
        this.toasts.success('Der Kurs wurde gelöscht.');
      },
      error: (err) => this.toasts.error(err, 'Der Kurs konnte nicht gelöscht werden.'),
    });
  }

  // --- Schüler ---

  addStudent(): void {
    const classId = this.selectedClassId();
    const first = this.newFirstName().trim();
    const last = this.newLastName().trim();

    if (!classId || (!first && !last)) {
      return;
    }

    this.api.createStudent(classId, first, last).subscribe({
      next: () => {
        this.newFirstName.set('');
        this.newLastName.set('');
        this.reloadStudents();
      },
      error: (err) => this.toasts.error(err, 'Der Schüler konnte nicht angelegt werden.'),
    });
  }

  /**
   * Übernimmt eine eingefügte Namensliste. Erkannt werden "Nachname, Vorname"
   * sowie "Vorname Nachname" - eine Zeile je Schüler.
   */
  importStudents(): void {
    const classId = this.selectedClassId();
    if (!classId) {
      return;
    }

    const parsed = this.importText()
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        if (line.includes(',')) {
          const [last, first] = line.split(',');
          return { firstName: (first ?? '').trim(), lastName: (last ?? '').trim() };
        }

        const parts = line.split(/\s+/);
        const lastName = parts.length > 1 ? parts.pop()! : '';
        return { firstName: parts.join(' '), lastName };
      });

    if (parsed.length === 0) {
      this.toasts.show('Es wurden keine Namen erkannt.', 'error');
      return;
    }

    this.api.importStudents(classId, parsed).subscribe({
      next: (created) => {
        this.importText.set('');
        this.showImport.set(false);
        this.reloadStudents();
        this.toasts.success(`${created.length} Schüler übernommen.`);
      },
      error: (err) => this.toasts.error(err, 'Die Liste konnte nicht übernommen werden.'),
    });
  }

  renameStudent(student: Student, firstName: string, lastName: string): void {
    if (firstName === student.firstName && lastName === student.lastName) {
      return;
    }

    this.api.updateStudent(student.id, firstName, lastName).subscribe({
      next: (updated) => {
        this.students.update((list) => list.map((s) => (s.id === updated.id ? updated : s)));
      },
      error: (err) => this.toasts.error(err, 'Der Name konnte nicht geändert werden.'),
    });
  }

  deleteStudent(student: Student): void {
    if (!confirm(`${fullName(student)} wirklich löschen?`)) {
      return;
    }

    this.api.deleteStudent(student.id).subscribe({
      next: () => this.reloadStudents(),
      error: (err) => this.toasts.error(err, 'Der Schüler konnte nicht gelöscht werden.'),
    });
  }

  uploadPhoto(student: Student, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    this.api.uploadPhoto(student.id, file).subscribe({
      next: (updated) => {
        // Der Zeitstempel erzwingt, dass der Browser das neue Foto lädt.
        const fresh = { ...updated, photoUrl: `${updated.photoUrl}?v=${Date.now()}` };
        this.students.update((list) => list.map((s) => (s.id === fresh.id ? fresh : s)));
        input.value = '';
      },
      error: (err) => {
        this.toasts.error(err, 'Das Foto konnte nicht hochgeladen werden.');
        input.value = '';
      },
    });
  }

  deletePhoto(student: Student): void {
    this.api.deletePhoto(student.id).subscribe({
      next: (updated) => {
        this.students.update((list) => list.map((s) => (s.id === updated.id ? updated : s)));
      },
      error: (err) => this.toasts.error(err, 'Das Foto konnte nicht entfernt werden.'),
    });
  }
}
