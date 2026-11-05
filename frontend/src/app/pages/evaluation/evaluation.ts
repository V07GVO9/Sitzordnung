import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService, DateRange } from '../../core/api.service';
import { ModeService } from '../../core/mode.service';
import {
  AppSettings,
  Course,
  CourseScoreboard,
  formatAverage,
} from '../../core/models';
import { FilePickerCancelled, isNativeApp } from '../../core/store/file-system';
import { schoolQuarters } from '../../core/store/school-calendar';
import { formatDateGerman, toDateKey } from '../../core/store/time';
import { OneDriveService } from '../../core/store/onedrive.service';
import { isStrongPassword } from '../../core/store/password-policy';
import { VaultService } from '../../core/store/vault.service';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../core/ui/icon';
import { PasswordRules } from '../../vault/password-rules';

export type EvaluationTab = 'punkte' | 'einstellungen' | 'datei';
const TABS: EvaluationTab[] = ['punkte', 'einstellungen', 'datei'];

@Component({
  selector: 'app-evaluation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Icon, PasswordRules],
  templateUrl: './evaluation.html',
  styleUrl: './evaluation.scss',
})
export class EvaluationPage {
  private readonly api = inject(ApiService);
  private readonly toasts = inject(ToastService);
  private readonly vault = inject(VaultService);
  private readonly router = inject(Router);

  /** Der Reiter steht in der Adresse (?tab=datei), damit Links direkt dorthin führen. */
  readonly tab = input<string>();
  /** Einstellungen und Datei gibt es nur im Bearbeitungsmodus. */
  readonly isEdit = inject(ModeService).isEdit;
  readonly activeTab = computed<EvaluationTab>(() => {
    const tab = this.tab() as EvaluationTab;
    return TABS.includes(tab) && (tab === 'punkte' || this.isEdit()) ? tab : 'punkte';
  });

  readonly formatAverage = formatAverage;
  readonly fileName = this.vault.fileName;
  readonly canWriteInPlace = this.vault.canWriteInPlace;
  readonly autoSaveToFile = this.vault.autoSaveToFile;
  readonly isInOneDrive = this.vault.isInOneDrive;
  readonly rememberedFile = this.vault.rememberedFile;
  readonly showOneDrive = inject(OneDriveService).isConfigured && !isNativeApp();
  readonly oneDriveName = signal('sitzordnung');
  readonly currentPassword = signal('');
  readonly newPassword = signal('');
  readonly isStrongPassword = isStrongPassword;

  readonly courses = signal<Course[]>([]);
  readonly selectedCourseId = signal<number | null>(null);
  readonly scoreboard = signal<CourseScoreboard | null>(null);
  /** Gewähltes Quartal (1–4) des laufenden Schuljahres; null = gesamter Zeitraum. */
  readonly quarter = signal<number | null>(null);
  readonly quarters = [1, 2, 3, 4];

  readonly settings = signal<AppSettings | null>(null);

  readonly selectedCourse = computed(
    () => this.courses().find((c) => c.id === this.selectedCourseId()) ?? null,
  );

  /** Die Quartale des laufenden Schuljahres (nach den Ferien Niedersachsens). */
  readonly schoolQuarters = schoolQuarters(toDateKey(new Date()));

  private get range(): DateRange {
    const q = this.schoolQuarters?.find((s) => s.quarter === this.quarter());
    return q ? { from: q.from, to: q.to } : { from: null, to: null };
  }

  quarterLabel(q: number): string {
    const range = this.schoolQuarters?.find((s) => s.quarter === q);
    return range
      ? `Q${q} (${formatDateGerman(range.from)} – ${formatDateGerman(range.to)})`
      : `Q${q}`;
  }

  constructor() {
    forkJoin({
      courses: this.api.getCourses(),
      settings: this.api.getSettings().pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ courses, settings }) => {
        this.courses.set(courses);
        this.settings.set(settings);

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
      error: (err) => this.toasts.error(err, 'Die Mitarbeitsnoten konnten nicht geladen werden.'),
    });
  }

  refreshScoreboard(): void {
    this.selectCourse(this.selectedCourseId());
  }

  selectQuarter(q: number | null): void {
    this.quarter.set(q);
    this.refreshScoreboard();
  }

  setTab(tab: EvaluationTab): void {
    void this.router.navigate([], { queryParams: { tab }, replaceUrl: true });
  }

  saveSettings(partial: Partial<AppSettings>): void {
    const current = this.settings() || { toleranceMinutes: 0, allowRatingOutsideLesson: false };
    const updated = { ...current, ...partial };

    this.api.saveSettings(updated).subscribe({
      next: (settings) => {
        this.settings.set(settings);
        this.toasts.success('Einstellungen gespeichert.');
      },
      error: (err) => this.toasts.error(err, 'Einstellungen konnten nicht gespeichert werden.'),
    });
  }

  // --- Export ---

  // --- Datenbestand ---

  setAutoSave(enabled: boolean): void {
    this.vault.setAutoSaveToFile(enabled);
    this.toasts.success(
      enabled ? 'Automatisches Speichern ist eingeschaltet.' : 'Automatisches Speichern ist aus.',
    );
  }

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

  isRemembered(): boolean {
    return this.vault.isRemembered();
  }

  /** Datei und Passwort auf diesem Gerät merken oder vergessen. */
  async setRemember(enabled: boolean): Promise<void> {
    try {
      if (enabled) {
        await this.vault.rememberOnDevice();
        this.toasts.success('Dieses Gerät öffnet den Bestand ab jetzt ohne Passwort.');
      } else {
        await this.vault.forgetOnDevice();
        this.toasts.success('Datei und Passwort sind auf diesem Gerät vergessen.');
      }
    } catch (error) {
      this.toasts.error(error, 'Die Einstellung konnte nicht gespeichert werden.');
    }
  }

  /** Legt den Bestand in OneDrive ab - ab dann arbeiten alle Geräte mit dieser Datei. */
  async moveToOneDrive(): Promise<void> {
    try {
      await this.vault.moveToOneDrive(this.oneDriveName().trim());
      this.toasts.success('Der Datenbestand liegt jetzt in OneDrive.');
    } catch (error) {
      if (!(error instanceof FilePickerCancelled)) {
        this.toasts.error(error, 'Der Datenbestand konnte nicht in OneDrive abgelegt werden.');
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
