import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Course, CurrentLesson, TimetableEntry, WEEKDAY_NAMES } from '../../core/models';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardPage {
  private readonly api = inject(ApiService);
  private readonly toasts = inject(ToastService);

  readonly loading = signal(true);
  readonly courses = signal<Course[]>([]);
  readonly lesson = signal<CurrentLesson | null>(null);
  readonly timetable = signal<TimetableEntry[]>([]);

  /** Der Unterricht, der heute noch ansteht - nach Uhrzeit sortiert. */
  readonly today = computed(() => {
    const weekday = new Date().getDay();
    return this.timetable()
      .filter((e) => e.dayOfWeek === weekday)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  });

  readonly weekdayName = computed(() => WEEKDAY_NAMES[new Date().getDay()]);

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    forkJoin({
      courses: this.api.getCourses(),
      lesson: this.api.getCurrentLesson(),
      timetable: this.api.getTimetable(),
    }).subscribe({
      next: ({ courses, lesson, timetable }) => {
        this.courses.set(courses);
        this.lesson.set(lesson);
        this.timetable.set(timetable);
        this.loading.set(false);
      },
      error: (err) => {
        this.toasts.error(err, 'Die Daten konnten nicht geladen werden.');
        this.loading.set(false);
      },
    });
  }

  /** Läuft dieser Stundenplaneintrag gerade? */
  isRunning(entry: TimetableEntry): boolean {
    const lesson = this.lesson();
    return !!lesson?.hasLesson && lesson.courseId === entry.courseId;
  }

  isOver(entry: TimetableEntry): boolean {
    const now = new Date();
    const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return entry.endTime < clock;
  }
}
