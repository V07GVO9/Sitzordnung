import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Course, CourseScoreboard, Student, fullName, initials } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../core/ui/confirm.service';
import { Icon } from '../../core/ui/icon';
import { subjectHue } from '../../core/ui/subject-hue';

/** Ein Abschnitt der Liste: alle Schüler mit demselben Anfangsbuchstaben. */
interface LetterGroup {
  letter: string;
  students: { student: Student; number: number }[];
}

/**
 * Die Klassenliste: Fotos, Namen, alphabetische Abschnitte mit Register am
 * Rand. Ein Tipp öffnet die Stammdaten als Blatt - mit ‹ › zum Nachbarn.
 */
@Component({
  selector: 'app-class-students',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, Icon],
  templateUrl: './class-students.html',
  styleUrl: './class-pages.scss',
  host: { '(document:keydown.escape)': 'closeSheet()' },
})
export class ClassStudentsPage {
  private readonly api = inject(ApiService);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly classId = input.required<string>();
  private readonly id = computed(() => Number(this.classId()));

  readonly students = signal<Student[]>([]);
  readonly courses = signal<Course[]>([]);
  readonly boards = signal<CourseScoreboard[]>([]);
  readonly loading = signal(true);

  /** Der Schüler im Blatt - oder 'neu' beim Anlegen. */
  readonly openId = signal<number | 'neu' | null>(null);
  readonly editFirst = signal('');
  readonly editLast = signal('');

  readonly fullName = fullName;
  readonly initials = initials;
  readonly hue = subjectHue;

  /** Sortiert nach Vorname wie in der Klassenmappe, nummeriert von 1 an. */
  readonly sorted = computed(() =>
    [...this.students()].sort(
      (a, b) =>
        a.firstName.localeCompare(b.firstName, 'de') || a.lastName.localeCompare(b.lastName, 'de'),
    ),
  );

  readonly groups = computed<LetterGroup[]>(() => {
    const groups: LetterGroup[] = [];
    this.sorted().forEach((student, index) => {
      const letter = (student.firstName.charAt(0) || '#').toUpperCase();
      const last = groups[groups.length - 1];
      const entry = { student, number: index + 1 };
      if (last?.letter === letter) {
        last.students.push(entry);
      } else {
        groups.push({ letter, students: [entry] });
      }
    });
    return groups;
  });

  readonly openStudent = computed(() => {
    const id = this.openId();
    return typeof id === 'number' ? (this.students().find((s) => s.id === id) ?? null) : null;
  });

  /** Punkte und Note des geöffneten Schülers in jedem Fach. */
  readonly openScores = computed(() => {
    const id = this.openId();
    return this.boards().map((board) => ({
      board,
      score: board.students.find((s) => s.studentId === id) ?? null,
    }));
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  private load(classId: number): void {
    this.loading.set(true);
    forkJoin({
      students: this.api.getStudents(classId),
      courses: this.api.getCourses(),
    }).subscribe({
      next: ({ students, courses }) => {
        const own = courses.filter((c) => c.schoolClassId === classId);
        this.students.set(students);
        this.courses.set(own);
        this.loading.set(false);
        const boards = own.map((c) => this.api.getScoreboard(c.id));
        (boards.length ? forkJoin(boards) : of([])).subscribe({
          next: (list) => this.boards.set(list),
        });
      },
      error: (err) => {
        this.loading.set(false);
        this.toasts.error(err, 'Die Schüler konnten nicht geladen werden.');
      },
    });
  }

  /** Kurzform der Punkte je Fach für die zweite Zeile. */
  summary(studentId: number): string {
    return this.boards()
      .map((board) => {
        const score = board.students.find((s) => s.studentId === studentId);
        const course = this.courses().find((c) => c.id === board.courseId);
        if (!score || !course) {
          return '';
        }
        return `${course.subjectShortName || course.subjectName}: ${this.signed(score.points)}`;
      })
      .filter(Boolean)
      .join(' · ');
  }

  signed(points: number): string {
    return points > 0 ? `+${points}` : points < 0 ? `−${Math.abs(points)}` : '0';
  }

  jumpTo(letter: string): void {
    document.getElementById(`buchstabe-${letter}`)?.scrollIntoView({ block: 'start' });
  }

  open(student: Student): void {
    this.openId.set(student.id);
    this.editFirst.set(student.firstName);
    this.editLast.set(student.lastName);
  }

  openNew(): void {
    this.openId.set('neu');
    this.editFirst.set('');
    this.editLast.set('');
  }

  closeSheet(): void {
    this.openId.set(null);
  }

  /** Zum vorigen oder nächsten Schüler blättern, wie mit ‹ › in der App. */
  step(direction: -1 | 1): void {
    const list = this.sorted();
    const index = list.findIndex((s) => s.id === this.openId());
    const next = list[index + direction];
    if (next) {
      this.saveName(false);
      this.open(next);
    }
  }

  canStep(direction: -1 | 1): boolean {
    const list = this.sorted();
    const index = list.findIndex((s) => s.id === this.openId());
    return index >= 0 && !!list[index + direction];
  }

  /** Übernimmt geänderte Namen - beim Verlassen des Feldes oder Blättern. */
  saveName(showToast = true): void {
    const student = this.openStudent();
    const first = this.editFirst().trim();
    const last = this.editLast().trim();
    if (!student || !first || (first === student.firstName && last === student.lastName)) {
      return;
    }

    this.api.updateStudent(student.id, first, last).subscribe({
      next: (updated) => {
        this.students.update((list) => list.map((s) => (s.id === updated.id ? updated : s)));
        if (showToast) {
          this.toasts.success('Gespeichert.');
        }
      },
      error: (err) => this.toasts.error(err, 'Der Name konnte nicht geändert werden.'),
    });
  }

  create(): void {
    const first = this.editFirst().trim();
    const last = this.editLast().trim();
    if (!first) {
      return;
    }

    this.api.createStudent(this.id(), first, last).subscribe({
      next: (student) => {
        this.students.update((list) => [...list, student]);
        this.toasts.success(`${fullName(student)} wurde angelegt.`);
        // Gleich den nächsten anlegen - wie beim Abtippen einer Klassenliste.
        this.editFirst.set('');
        this.editLast.set('');
      },
      error: (err) => this.toasts.error(err, 'Der Schüler konnte nicht angelegt werden.'),
    });
  }

  photoChosen(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    const student = this.openStudent();
    inputEl.value = '';
    if (!file || !student) {
      return;
    }

    this.api.uploadPhoto(student.id, file).subscribe({
      next: (updated) =>
        this.students.update((list) => list.map((s) => (s.id === updated.id ? updated : s))),
      error: (err) => this.toasts.error(err, 'Das Foto konnte nicht übernommen werden.'),
    });
  }

  removePhoto(): void {
    const student = this.openStudent();
    if (!student) {
      return;
    }
    this.api.deletePhoto(student.id).subscribe({
      next: (updated) =>
        this.students.update((list) => list.map((s) => (s.id === updated.id ? updated : s))),
      error: (err) => this.toasts.error(err, 'Das Foto konnte nicht entfernt werden.'),
    });
  }

  async remove(): Promise<void> {
    const student = this.openStudent();
    if (
      !student ||
      !(await this.confirm.ask({
        title: `${fullName(student)} löschen?`,
        message:
          'Der Schüler verschwindet aus allen Sitzordnungen, seine Bewertungen gehen verloren.',
        confirmLabel: 'Löschen',
        danger: true,
      }))
    ) {
      return;
    }

    this.api.deleteStudent(student.id).subscribe({
      next: () => {
        this.students.update((list) => list.filter((s) => s.id !== student.id));
        this.closeSheet();
        this.toasts.success('Der Schüler wurde gelöscht.');
      },
      error: (err) => this.toasts.error(err, 'Der Schüler konnte nicht gelöscht werden.'),
    });
  }
}
