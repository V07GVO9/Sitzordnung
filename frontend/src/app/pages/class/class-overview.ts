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
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { ApiService } from '../../core/api.service';
import {
  Course,
  CurrentLesson,
  Rating,
  Student,
  TimetableEntry,
  fullName,
  ratingSymbol,
} from '../../core/models';
import { toDateKey } from '../../core/store/time';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../core/ui/icon';
import { subjectHue } from '../../core/ui/subject-hue';

/** Ein Schüler mit seinen auffälligen Bewertungen der letzten Tage. */
interface Highlight {
  student: Student;
  count: number;
  summary: string;
}

/** So weit blickt die Übersicht zurück - wie die 14 Tage der Klassenmappe. */
const LOOKBACK_DAYS = 14;

/**
 * Die Übersicht einer Klasse: gruppierte Hinweise wie auf dem Startbildschirm
 * der Klassenmappe - aktueller Unterricht, heutige Stunden, Fächer und wer
 * zuletzt besonders gut oder schwach mitgearbeitet hat.
 */
@Component({
  selector: 'app-class-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  templateUrl: './class-overview.html',
  styleUrl: './class-pages.scss',
})
export class ClassOverviewPage {
  private readonly api = inject(ApiService);
  private readonly toasts = inject(ToastService);

  readonly classId = input.required<string>();

  readonly courses = signal<Course[]>([]);
  readonly students = signal<Student[]>([]);
  readonly timetable = signal<TimetableEntry[]>([]);
  readonly lesson = signal<CurrentLesson | null>(null);
  readonly ratings = signal<Rating[]>([]);

  readonly hue = subjectHue;
  readonly lookback = LOOKBACK_DAYS;

  private readonly id = computed(() => Number(this.classId()));

  /** Läuft gerade Unterricht in dieser Klasse? */
  readonly runningCourse = computed(() => {
    const lesson = this.lesson();
    if (!lesson?.hasLesson) {
      return null;
    }
    return this.courses().find((c) => c.id === lesson.courseId) ?? null;
  });

  readonly today = computed(() => {
    const weekday = new Date().getDay();
    return this.timetable()
      .filter((e) => e.dayOfWeek === weekday && this.courses().some((c) => c.id === e.courseId))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  });

  readonly ratingCount = computed(() => {
    const counts = new Map<number, number>();
    for (const rating of this.ratings()) {
      counts.set(rating.courseId, (counts.get(rating.courseId) ?? 0) + 1);
    }
    return counts;
  });

  readonly good = computed(() => this.highlights((value) => value > 0));
  readonly weak = computed(() => this.highlights((value) => value < 0));

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => this.load(id));
    });
  }

  private load(classId: number): void {
    forkJoin({
      courses: this.api.getCourses(),
      students: this.api.getStudents(classId),
      timetable: this.api.getTimetable(),
      lesson: this.api.getCurrentLesson(),
    }).subscribe({
      next: ({ courses, students, timetable, lesson }) => {
        const own = courses.filter((c) => c.schoolClassId === classId);
        this.courses.set(own);
        this.students.set(students);
        this.timetable.set(timetable);
        this.lesson.set(lesson);
        this.loadRatings(own);
      },
      error: (err) => this.toasts.error(err, 'Die Klasse konnte nicht geladen werden.'),
    });
  }

  private loadRatings(courses: Course[]): void {
    const from = new Date();
    from.setDate(from.getDate() - LOOKBACK_DAYS);
    const range = { from: toDateKey(from) };

    const lists = courses.map((c) => this.api.getRatings(c.id, range));
    (lists.length ? forkJoin(lists) : of([] as Rating[][])).subscribe({
      next: (lists) => this.ratings.set(lists.flat()),
      error: () => this.ratings.set([]),
    });
  }

  /** Schüler mit passenden Bewertungen, die häufigsten zuerst. */
  private highlights(match: (value: number) => boolean): Highlight[] {
    const byStudent = new Map<number, number[]>();
    for (const rating of this.ratings()) {
      if (match(rating.value)) {
        byStudent.set(rating.studentId, [...(byStudent.get(rating.studentId) ?? []), rating.value]);
      }
    }

    const students = new Map(this.students().map((s) => [s.id, s] as const));
    const result: Highlight[] = [];
    for (const [studentId, values] of byStudent) {
      const student = students.get(studentId);
      if (!student) {
        continue;
      }
      const parts = [2, 1, -1, -2]
        .map((v) => ({ v, n: values.filter((x) => x === v).length }))
        .filter((p) => p.n > 0)
        .map((p) => `${p.n}× ${ratingSymbol(p.v)}`);
      result.push({ student, count: values.length, summary: parts.join(' · ') });
    }

    return result.sort((a, b) => b.count - a.count).slice(0, 6);
  }

  readonly fullName = fullName;
}
