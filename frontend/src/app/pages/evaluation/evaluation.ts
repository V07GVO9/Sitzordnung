import { PasswordField } from '../../core/ui/password-field';
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
import { ActiveCourseService } from '../../core/active-course.service';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ModeService } from '../../core/mode.service';
import {
  AppSettings,
  CourseScoreboard,
  DateRange,
  ExportFile,
  GradeScale,
  GradeScaleEntry,
} from '../../core/models';
import { formatGrade } from '../../core/logic/assessment.logic';
import {
  FilePickerCancelled,
  downloadExport,
  isNativeApp,
} from '../../core/persistence/file-system';
import { OneDriveService } from '../../core/persistence/onedrive.service';
import { isStrongPassword } from '../../core/persistence/password-policy';
import { VaultService } from '../../core/persistence/vault.service';
import { LocalStore } from '../../core/store/local-store';
import { ToastService } from '../../core/ui/toast.service';
import { Icon } from '../../core/ui/icon';
import { ConfirmService } from '../../core/ui/confirm.service';
import { PasswordRules } from '../../vault/password-rules';

export type EvaluationTab = 'punkte' | 'noten' | 'einstellungen' | 'datei';
const TABS: EvaluationTab[] = ['punkte', 'noten', 'einstellungen', 'datei'];

@Component({
  selector: 'app-evaluation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, Icon, PasswordRules, PasswordField],
  templateUrl: './evaluation.html',
  styleUrl: './evaluation.scss',
})
export class EvaluationPage {
  private readonly store = inject(LocalStore);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly vault = inject(VaultService);
  private readonly router = inject(Router);

  /** Der Reiter steht in der Adresse (?tab=noten), damit Links direkt dorthin führen. */
  readonly tab = input<string>();
  /** Notenschlüssel, Einstellungen und Datei gibt es nur im Bearbeitungsmodus. */
  readonly isEdit = inject(ModeService).isEdit;
  readonly activeTab = computed<EvaluationTab>(() => {
    const tab = this.tab() as EvaluationTab;
    return TABS.includes(tab) && (tab === 'punkte' || this.isEdit()) ? tab : 'punkte';
  });

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

  /** Ausgewertet wird immer das Fach, das im Wochenplan gewählt ist. */
  private readonly active = inject(ActiveCourseService);
  readonly selectedCourse = this.active.course;
  readonly selectedCourseId = this.active.courseId;
  readonly scoreboard = signal<CourseScoreboard | null>(null);
  readonly from = signal('');
  readonly to = signal('');

  /** Der Schlüssel, der gerade bearbeitet wird. */
  readonly scaleName = signal('Standard-Notenschlüssel');
  readonly scaleEntries = signal<GradeScaleEntry[]>([]);
  readonly scaleIsCourseSpecific = signal(false);
  readonly loadedScale = signal<GradeScale | null>(null);
  readonly settings = signal(this.store.settings.getSettings());

  /** Die Stufen absteigend - so liest sich ein Notenschlüssel. */
  readonly sortedEntries = computed(() =>
    [...this.scaleEntries()].sort((a, b) => b.minPoints - a.minPoints),
  );

  private get range(): DateRange {
    return { from: this.from() || null, to: this.to() || null };
  }

  constructor() {
    this.applyScale(this.readScale(false));

    effect(() => {
      const courseId = this.selectedCourseId();
      untracked(() => this.loadScoreboard(courseId));
    });
  }

  private loadScoreboard(courseId: number | null): void {
    this.scoreboard.set(null);

    if (courseId === null) {
      return;
    }

    try {
      this.scoreboard.set(this.store.ratings.getScoreboard(courseId, this.range));
    } catch (err) {
      this.toasts.error(err, 'Der Punktestand konnte nicht geladen werden.');
    }
  }

  /** Mittelwert mit einer Nachkommastelle, etwa 0,7 - ohne Unterricht ein Strich. */
  formatAverage(value: number | null): string {
    return formatGrade(value, 1);
  }

  refreshScoreboard(): void {
    this.loadScoreboard(this.selectedCourseId());
  }

  clearRange(): void {
    this.from.set('');
    this.to.set('');
    this.refreshScoreboard();
  }

  setTab(tab: EvaluationTab): void {
    void this.router.navigate([], { queryParams: { tab }, replaceUrl: true });
  }

  // --- Notenschlüssel ---

  private applyScale(scale: GradeScale | null): void {
    this.loadedScale.set(scale);
    this.scaleName.set(scale?.name ?? 'Notenschlüssel');
    this.scaleEntries.set(scale ? scale.entries.map((e) => ({ ...e })) : []);
  }

  /** Der Schlüssel des Kurses oder der allgemeine - null, wenn keiner hinterlegt ist. */
  private readScale(courseSpecific: boolean): GradeScale | null {
    const courseId = this.selectedCourseId();
    try {
      return courseSpecific && courseId
        ? this.store.gradeScales.getCourseGradeScale(courseId)
        : this.store.gradeScales.getGlobalGradeScale();
    } catch {
      return null;
    }
  }

  switchScaleTarget(courseSpecific: boolean): void {
    this.scaleIsCourseSpecific.set(courseSpecific);
    this.applyScale(this.readScale(courseSpecific));
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

    try {
      // Ohne Kurs (null) gilt der Schlüssel für alle Kurse.
      const target = this.scaleIsCourseSpecific() && courseId ? courseId : null;
      this.applyScale(this.store.gradeScales.saveGradeScale(target, input));
      this.toasts.success('Der Notenschlüssel wurde gespeichert.');
      this.refreshScoreboard();
    } catch (err) {
      this.toasts.error(err, 'Der Notenschlüssel konnte nicht gespeichert werden.');
    }
  }

  async deleteCourseScale(): Promise<void> {
    const courseId = this.selectedCourseId();
    if (
      !courseId ||
      !(await this.confirm.ask({
        title: 'Eigenen Notenschlüssel entfernen?',
        message: 'Für diesen Kurs gilt danach wieder der allgemeine Notenschlüssel.',
        confirmLabel: 'Entfernen',
        danger: true,
      }))
    ) {
      return;
    }

    try {
      this.store.gradeScales.deleteCourseGradeScale(courseId);
      this.toasts.success('Für diesen Kurs gilt wieder der allgemeine Notenschlüssel.');
      this.switchScaleTarget(false);
      this.refreshScoreboard();
    } catch (err) {
      this.toasts.error(err, 'Der Notenschlüssel konnte nicht entfernt werden.');
    }
  }

  saveSettings(partial: Partial<AppSettings>): void {
    try {
      this.settings.set(this.store.settings.saveSettings({ ...this.settings(), ...partial }));
      this.toasts.success('Einstellungen gespeichert.');
    } catch (err) {
      this.toasts.error(err, 'Einstellungen konnten nicht gespeichert werden.');
    }
  }

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
  exportCsv(allCourses: boolean): Promise<void> {
    return this.export('Die CSV-Datei wurde erzeugt.', () =>
      this.store.exports.exportSummary(allCourses ? null : this.selectedCourseId(), this.range),
    );
  }

  /** Einzelbewertungen im Querformat: Schüler in Zeilen, Bewertungstage in Spalten. */
  exportRatings(): Promise<void> {
    return this.export('Die Einzelbewertungen wurden erzeugt.', () =>
      this.store.exports.exportRatings(this.selectedCourseId(), this.range),
    );
  }

  /** Je Kurs eine Seite mit der Note jedes Schülers an jedem Unterrichtstag. */
  exportLessonSheets(allCourses: boolean): Promise<void> {
    return this.export('Die Übersicht wurde erzeugt.', () =>
      this.store.exports.exportLessonSheets(
        allCourses ? null : this.selectedCourseId(),
        this.range,
      ),
    );
  }

  /** Erzeugt eine Exportdatei, bietet sie an und meldet Erfolg oder Fehler. */
  private async export(done: string, create: () => ExportFile): Promise<void> {
    try {
      await downloadExport(create());
      this.toasts.success(done);
    } catch (err) {
      this.toasts.error(err, 'Der Export ist fehlgeschlagen.');
    }
  }
}
