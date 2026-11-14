import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { readPhoto } from '../../core/import/photo';
import {
  Course,
  SchoolClass,
  Student,
  Subject,
  byName,
  fullName,
  initials,
} from '../../core/models';
import { LocalStore } from '../../core/store/local-store';
import { ToastService } from '../../core/ui/toast.service';
import { Icon } from '../../core/ui/icon';
import { ConfirmService } from '../../core/ui/confirm.service';

export type DataTab = 'klassen' | 'schueler' | 'faecher';
const TABS: DataTab[] = ['klassen', 'schueler', 'faecher'];

@Component({
  selector: 'app-data',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, Icon],
  templateUrl: './data.html',
  styleUrl: './data.scss',
})
export class DataPage {
  private readonly store = inject(LocalStore);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);

  /** Der Reiter steht in der Adresse (?tab=schueler), damit Links direkt dorthin führen. */
  readonly tab = input<string>();
  /** Optional die Klasse (?klasse=3) - etwa aus dem Einrichtungs-Assistenten. */
  readonly klasse = input<string>();
  readonly activeTab = computed<DataTab>(() => {
    const tab = this.tab() as DataTab;
    return TABS.includes(tab) ? tab : 'klassen';
  });

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
    const classes = this.store.masterData.getClasses();

    this.classes.set(classes);
    this.subjects.set(this.store.masterData.getSubjects());
    this.courses.set(this.store.masterData.getCourses());

    const stillThere = keepClassId && classes.some((c) => c.id === previous);
    const wanted = Number(this.klasse());
    const fromLink = classes.some((c) => c.id === wanted) ? wanted : null;
    this.selectClass(stillThere ? previous : (fromLink ?? classes[0]?.id ?? null));
  }

  setTab(tab: DataTab): void {
    void this.router.navigate([], { queryParams: { tab }, replaceUrl: true });
  }

  selectClass(id: number | null): void {
    this.selectedClassId.set(id);
    this.students.set([]);

    if (id === null) {
      return;
    }

    try {
      this.students.set(this.store.masterData.getStudents(id));
    } catch (err) {
      this.toasts.error(err, 'Die Schüler konnten nicht geladen werden.');
    }
  }

  /** Liest die Schüler der gewählten Klasse neu und zieht deren Anzahl nach. */
  private reloadStudents(): void {
    const id = this.selectedClassId();
    if (id === null) {
      return;
    }

    const students = this.store.masterData.getStudents(id);
    this.students.set(students);
    this.classes.update((list) =>
      list.map((c) => (c.id === id ? { ...c, studentCount: students.length } : c)),
    );
  }

  private replaceStudent(updated: Student): void {
    this.students.update((list) => list.map((s) => (s.id === updated.id ? updated : s)));
  }

  // --- Klassen ---

  addClass(): void {
    const name = this.newClassName().trim();
    if (!name) {
      return;
    }

    try {
      const created = this.store.masterData.createClass(name);
      this.newClassName.set('');
      this.classes.update((list) => [...list, created].sort(byName));
      this.selectClass(created.id);
      this.toasts.success(`Klasse „${created.name}" angelegt.`);
    } catch (err) {
      this.toasts.error(err, 'Die Klasse konnte nicht angelegt werden.');
    }
  }

  async deleteClass(schoolClass: SchoolClass): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: `Klasse „${schoolClass.name}" löschen?`,
      message: 'Alle Schüler, Sitzordnungen und Bewertungen dieser Klasse gehen verloren.',
      confirmLabel: 'Klasse löschen',
      danger: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      this.store.masterData.deleteClass(schoolClass.id);
      this.toasts.success('Die Klasse wurde gelöscht.');
      this.selectedClassId.set(null);
      this.loadAll(false);
    } catch (err) {
      this.toasts.error(err, 'Die Klasse konnte nicht gelöscht werden.');
    }
  }

  // --- Fächer ---

  addSubject(): void {
    const name = this.newSubjectName().trim();
    if (!name) {
      return;
    }

    const short = this.newSubjectShort().trim() || name.slice(0, 2).toUpperCase();

    try {
      const created = this.store.masterData.createSubject(name, short);
      this.newSubjectName.set('');
      this.newSubjectShort.set('');
      this.subjects.update((list) => [...list, created].sort(byName));
      this.toasts.success(`Fach „${created.name}" angelegt.`);
    } catch (err) {
      this.toasts.error(err, 'Das Fach konnte nicht angelegt werden.');
    }
  }

  async deleteSubject(subject: Subject): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: `Fach „${subject.name}" löschen?`,
      message: 'Alle Kurse dieses Fachs werden mit Sitzordnungen und Bewertungen gelöscht.',
      confirmLabel: 'Fach löschen',
      danger: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      this.store.masterData.deleteSubject(subject.id);
      this.toasts.success('Das Fach wurde gelöscht.');
      this.loadAll();
    } catch (err) {
      this.toasts.error(err, 'Das Fach konnte nicht gelöscht werden.');
    }
  }

  // --- Kurse ---

  addCourse(): void {
    const classId = this.courseClassId() ?? this.selectedClassId();
    const subjectId = this.courseSubjectId();

    if (!classId || !subjectId) {
      this.toasts.show('Bitte Klasse und Fach auswählen.', 'error');
      return;
    }

    try {
      const created = this.store.masterData.createCourse(classId, subjectId);
      this.courses.update((list) => [...list, created]);
      this.courseSubjectId.set(null);
      this.toasts.success(`${created.subjectName} in ${created.schoolClassName} angelegt.`);
    } catch (err) {
      this.toasts.error(err, 'Der Kurs konnte nicht angelegt werden.');
    }
  }

  async deleteCourse(course: Course): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: `${course.subjectName} in ${course.schoolClassName} löschen?`,
      message: 'Sitzordnungen und Bewertungen dieses Kurses gehen verloren.',
      confirmLabel: 'Kurs löschen',
      danger: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      this.store.masterData.deleteCourse(course.id);
      this.courses.update((list) => list.filter((c) => c.id !== course.id));
      this.toasts.success('Der Kurs wurde gelöscht.');
    } catch (err) {
      this.toasts.error(err, 'Der Kurs konnte nicht gelöscht werden.');
    }
  }

  // --- Schüler ---

  addStudent(): void {
    const classId = this.selectedClassId();
    const first = this.newFirstName().trim();
    const last = this.newLastName().trim();

    if (!classId || (!first && !last)) {
      return;
    }

    try {
      this.store.masterData.createStudent(classId, first, last);
      this.newFirstName.set('');
      this.newLastName.set('');
      this.reloadStudents();
    } catch (err) {
      this.toasts.error(err, 'Der Schüler konnte nicht angelegt werden.');
    }
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

    try {
      const created = this.store.masterData.importStudents(classId, parsed);
      this.importText.set('');
      this.showImport.set(false);
      this.reloadStudents();
      this.toasts.success(`${created.length} Schüler übernommen.`);
    } catch (err) {
      this.toasts.error(err, 'Die Liste konnte nicht übernommen werden.');
    }
  }

  renameStudent(student: Student, firstName: string, lastName: string): void {
    if (firstName === student.firstName && lastName === student.lastName) {
      return;
    }

    try {
      this.replaceStudent(this.store.masterData.updateStudent(student.id, firstName, lastName));
    } catch (err) {
      this.toasts.error(err, 'Der Name konnte nicht geändert werden.');
    }
  }

  /** Tauscht Vor- und Nachname aller Schüler der Klasse - z. B. nach einem Import „Nachname Vorname“. */
  async swapNames(): Promise<void> {
    const list = this.students();
    if (list.length === 0) {
      return;
    }
    const example = list[0];
    const confirmed = await this.confirm.ask({
      title: 'Vor- und Nachnamen tauschen?',
      message:
        `Betrifft alle ${list.length} Schüler dieser Klasse. ` +
        `Aus „${fullName(example)}“ wird „${example.lastName} ${example.firstName}“.`,
      confirmLabel: 'Tauschen',
    });
    if (!confirmed) {
      return;
    }

    try {
      for (const s of list) {
        this.store.masterData.updateStudent(s.id, s.lastName, s.firstName);
      }
      this.reloadStudents();
      this.toasts.success('Vor- und Nachnamen getauscht.');
    } catch (err) {
      this.toasts.error(err, 'Die Namen konnten nicht getauscht werden.');
    }
  }

  async deleteStudent(student: Student): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: `${fullName(student)} löschen?`,
      message: 'Auch alle Bewertungen dieses Schülers gehen verloren.',
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      this.store.masterData.deleteStudent(student.id);
      this.reloadStudents();
    } catch (err) {
      this.toasts.error(err, 'Der Schüler konnte nicht gelöscht werden.');
    }
  }

  /**
   * Nimmt das Foto entgegen. Es wird vorher verkleinert - die Bilder wandern
   * in dieselbe Datei wie alles andere, ein Foto in Kameragröße würde sie
   * unnötig aufblähen.
   */
  async uploadPhoto(student: Student, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      const dataUrl = await readPhoto(file);
      // Das Bild steckt jetzt als Data-URL im Datensatz - es gibt nichts
      // nachzuladen, der neue Wert reicht.
      this.replaceStudent(this.store.masterData.setPhoto(student.id, dataUrl));
    } catch (err) {
      this.toasts.error(err, 'Das Foto konnte nicht hochgeladen werden.');
    } finally {
      input.value = '';
    }
  }

  deletePhoto(student: Student): void {
    try {
      this.replaceStudent(this.store.masterData.deletePhoto(student.id));
    } catch (err) {
      this.toasts.error(err, 'Das Foto konnte nicht entfernt werden.');
    }
  }
}
