import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService, DateRange } from '../../core/api.service';
import {
  Course,
  CourseScoreboard,
  GradeScale,
  GradeScaleEntry,
} from '../../core/models';
import { FilePickerCancelled } from '../../core/store/file-system';
import { VaultService } from '../../core/store/vault.service';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-evaluation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  templateUrl: './evaluation.html',
  styleUrl: './evaluation.scss',
})
export class EvaluationPage {
  private readonly api = inject(ApiService);
  private readonly toasts = inject(ToastService);
  private readonly vault = inject(VaultService);

  readonly fileName = this.vault.fileName;
  readonly currentPassword = signal('');
  readonly newPassword = signal('');

  readonly courses = signal<Course[]>([]);
  readonly selectedCourseId = signal<number | null>(null);
  readonly scoreboard = signal<CourseScoreboard | null>(null);
  readonly from = signal('');
  readonly to = signal('');

  /** Der Schlüssel, der gerade bearbeitet wird. */
  readonly scaleName = signal('Standard-Notenschlüssel');
  readonly scaleEntries = signal<GradeScaleEntry[]>([]);
  readonly scaleIsCourseSpecific = signal(false);
  readonly loadedScale = signal<GradeScale | null>(null);

  readonly selectedCourse = computed(
    () => this.courses().find((c) => c.id === this.selectedCourseId()) ?? null,
  );

  /** Die Stufen absteigend - so liest sich ein Notenschlüssel. */
  readonly sortedEntries = computed(() =>
    [...this.scaleEntries()].sort((a, b) => b.minPoints - a.minPoints),
  );

  private get range(): DateRange {
    return { from: this.from() || null, to: this.to() || null };
  }

  constructor() {
    forkJoin({
      courses: this.api.getCourses(),
      scale: this.api.getGlobalGradeScale().pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ courses, scale }) => {
        this.courses.set(courses);
        this.applyScale(scale);

        if (courses.length) {
          this.selectCourse(courses[0].id);
        }
      },
      error: (err) => this.toasts.error(err, 'Die Auswertung konnte nicht geladen werden.'),
    });
  }

  selectCourse(courseId: number | null): void {
    this.selectedCourseId.set(courseId);
    this.scoreboard.set(null);

    if (courseId === null) {
      return;
    }

    this.api.getScoreboard(courseId, this.range).subscribe({
      next: (board) => this.scoreboard.set(board),
      error: (err) => this.toasts.error(err, 'Der Punktestand konnte nicht geladen werden.'),
    });
  }

  refreshScoreboard(): void {
    this.selectCourse(this.selectedCourseId());
  }

  // --- Notenschlüssel ---

  private applyScale(scale: GradeScale | null): void {
    this.loadedScale.set(scale);
    this.scaleName.set(scale?.name ?? 'Notenschlüssel');
    this.scaleEntries.set(scale ? scale.entries.map((e) => ({ ...e })) : []);
  }

  switchScaleTarget(courseSpecific: boolean): void {
    this.scaleIsCourseSpecific.set(courseSpecific);

    const courseId = this.selectedCourseId();
    const request =
      courseSpecific && courseId
        ? this.api.getCourseGradeScale(courseId)
        : this.api.getGlobalGradeScale();

    request.pipe(catchError(() => of(null))).subscribe((scale) => this.applyScale(scale));
  }

  addScaleEntry(): void {
    const lowest = this.sortedEntries().at(-1);
    const nextPoints = lowest ? lowest.minPoints - 4 : 0;
    this.scaleEntries.update((list) => [...list, { minPoints: nextPoints, grade: '' }]);
  }

  updateScaleEntry(index: number, patch: Partial<GradeScaleEntry>): void {
    const sorted = this.sortedEntries();
    const target = sorted[index];

    this.scaleEntries.update((list) =>
      list.map((entry) => (entry === target ? { ...entry, ...patch } : entry)),
    );
  }

  removeScaleEntry(index: number): void {
    const target = this.sortedEntries()[index];
    this.scaleEntries.update((list) => list.filter((entry) => entry !== target));
  }

  saveScale(): void {
    const entries = this.scaleEntries()
      .map((e) => ({ minPoints: Math.round(Number(e.minPoints) || 0), grade: e.grade.trim() }))
      .filter((e) => e.grade);

    if (entries.length === 0) {
      this.toasts.show('Bitte mindestens eine Stufe mit einer Note angeben.', 'error');
      return;
    }

    const input = { name: this.scaleName().trim() || 'Notenschlüssel', entries };
    const courseId = this.selectedCourseId();

    const request =
      this.scaleIsCourseSpecific() && courseId
        ? this.api.saveCourseGradeScale(courseId, input)
        : this.api.saveGlobalGradeScale(input);

    request.subscribe({
      next: (scale) => {
        this.applyScale(scale);
        this.toasts.success('Der Notenschlüssel wurde gespeichert.');
        this.refreshScoreboard();
      },
      error: (err) => this.toasts.error(err, 'Der Notenschlüssel konnte nicht gespeichert werden.'),
    });
  }

  deleteCourseScale(): void {
    const courseId = this.selectedCourseId();
    if (!courseId || !confirm('Eigenen Notenschlüssel dieses Kurses entfernen?')) {
      return;
    }

    this.api.deleteCourseGradeScale(courseId).subscribe({
      next: () => {
        this.toasts.success('Für diesen Kurs gilt wieder der allgemeine Notenschlüssel.');
        this.switchScaleTarget(false);
        this.refreshScoreboard();
      },
      error: (err) => this.toasts.error(err, 'Der Notenschlüssel konnte nicht entfernt werden.'),
    });
  }

  // --- Export ---

  // --- Datenbestand ---

  /** Fragt nach einer neuen Datei und speichert dorthin. */
  async saveAs(): Promise<void> {
    try {
      await this.vault.saveAs();
      this.toasts.success('Gespeichert.');
    } catch (error) {
      if (!(error instanceof FilePickerCancelled)) {
        this.toasts.error(error, 'Der Datenbestand konnte nicht gespeichert werden.');
      }
    }
  }

  /** Vergibt ein neues Passwort und schreibt die Datei damit neu. */
  async changePassword(): Promise<void> {
    try {
      await this.vault.changePassword(this.currentPassword(), this.newPassword());
      this.currentPassword.set('');
      this.newPassword.set('');
      this.toasts.success('Das Passwort wurde geändert und der Bestand gespeichert.');
    } catch (error) {
      if (!(error instanceof FilePickerCancelled)) {
        this.toasts.error(error, 'Das Passwort konnte nicht geändert werden.');
      }
    }
  }

  // --- Export ---

  /** Baut die CSV-Datei im Browser und legt sie in den Download-Ordner. */
  exportCsv(kind: 'ratings' | 'summary', allCourses: boolean): void {
    this.api.exportCsv(kind, allCourses ? null : this.selectedCourseId(), this.range).subscribe({
      next: () => this.toasts.success('Die CSV-Datei wurde erzeugt.'),
      error: (err) => this.toasts.error(err, 'Der Export ist fehlgeschlagen.'),
    });
  }
}
