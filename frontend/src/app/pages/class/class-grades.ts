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
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api.service';
import {
  Course,
  CourseScoreboard,
  Rating,
  Student,
  StudentScore,
  initials,
  ratingClass,
  ratingSymbol,
} from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../core/ui/icon';

/** Wie oft ein Schüler welche Bewertung bekam - für den Farbbalken. */
interface Distribution {
  value: number;
  symbol: string;
  count: number;
  css: string;
}

const VALUES = [2, 1, -1, -2];

/**
 * Noten einer Klasse je Fach: Foto, Name, Punktestand und Note, dazu ein
 * Balken von Grün bis Rot - angelehnt an die Notenliste der Klassenmappe.
 */
@Component({
  selector: 'app-class-grades',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  templateUrl: './class-grades.html',
  styleUrl: './class-pages.scss',
})
export class ClassGradesPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  readonly classId = input.required<string>();
  /** Das gewählte Fach steht in der Adresse (?fach=12). */
  readonly fach = input<string>();

  readonly courses = signal<Course[]>([]);
  readonly students = signal<Student[]>([]);
  readonly board = signal<CourseScoreboard | null>(null);
  readonly ratings = signal<Rating[]>([]);

  readonly initials = initials;

  private readonly id = computed(() => Number(this.classId()));

  readonly courseId = computed(() => {
    const wanted = Number(this.fach());
    const courses = this.courses();
    return courses.find((c) => c.id === wanted)?.id ?? courses[0]?.id ?? null;
  });

  readonly rows = computed(() => {
    const board = this.board();
    if (!board) {
      return [];
    }
    const photos = new Map(this.students().map((s) => [s.id, s.photoUrl] as const));
    return [...board.students]
      .sort(
        (a, b) =>
          a.firstName.localeCompare(b.firstName, 'de') ||
          a.lastName.localeCompare(b.lastName, 'de'),
      )
      .map((score) => ({
        score,
        photoUrl: photos.get(score.studentId) ?? null,
        distribution: this.distribution(score.studentId),
      }));
  });

  /** Durchschnittliche Punkte der Klasse in diesem Fach. */
  readonly average = computed(() => {
    const list = this.board()?.students ?? [];
    if (!list.length) {
      return 0;
    }
    return list.reduce((sum, s) => sum + s.points, 0) / list.length;
  });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.loadClass(id));
    });

    effect(() => {
      const courseId = this.courseId();
      untracked(() => this.loadCourse(courseId));
    });
  }

  private loadClass(classId: number): void {
    forkJoin({
      courses: this.api.getCourses(),
      students: this.api.getStudents(classId),
    }).subscribe({
      next: ({ courses, students }) => {
        this.courses.set(courses.filter((c) => c.schoolClassId === classId));
        this.students.set(students);
      },
      error: (err) => this.toasts.error(err, 'Die Klasse konnte nicht geladen werden.'),
    });
  }

  private loadCourse(courseId: number | null): void {
    if (courseId === null) {
      this.board.set(null);
      this.ratings.set([]);
      return;
    }

    forkJoin({
      board: this.api.getScoreboard(courseId),
      ratings: this.api.getRatings(courseId),
    }).subscribe({
      next: ({ board, ratings }) => {
        this.board.set(board);
        this.ratings.set(ratings);
      },
      error: (err) => this.toasts.error(err, 'Die Noten konnten nicht geladen werden.'),
    });
  }

  selectCourse(courseId: number): void {
    void this.router.navigate([], { queryParams: { fach: courseId }, replaceUrl: true });
  }

  private distribution(studentId: number): Distribution[] {
    const own = this.ratings().filter((r) => r.studentId === studentId);
    return VALUES.map((value) => ({
      value,
      symbol: ratingSymbol(value),
      count: own.filter((r) => r.value === value).length,
      css: ratingClass(value),
    }));
  }

  signed(points: number): string {
    return points > 0 ? `+${points}` : points < 0 ? `−${Math.abs(points)}` : '0';
  }

  /** Farbe des Punktekastens: grün über, rot unter null. */
  pointsClass(score: StudentScore): string {
    if (score.points >= 3) {
      return 'rate-pp';
    }
    if (score.points > 0) {
      return 'rate-p';
    }
    if (score.points === 0) {
      return '';
    }
    return score.points <= -3 ? 'rate-mm' : 'rate-m';
  }
}
