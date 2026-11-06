import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ActiveCourseService } from './core/active-course.service';
import { ApiService } from './core/api.service';
import { ModeService } from './core/mode.service';
import { Course, CurrentLesson } from './core/models';
import { FilePickerCancelled, SaveConflictError } from './core/store/file-system';
import { LocalStore } from './core/store/local-store';
import { VaultService } from './core/store/vault.service';
import { ToastHost } from './core/toast-host';
import { ToastService } from './core/toast.service';
import { ConfirmHost } from './core/ui/confirm-host';
import { ConfirmService } from './core/ui/confirm.service';
import { Icon } from './core/ui/icon';
import { IconName } from './core/ui/icons';
import { subjectHue } from './core/ui/subject-hue';
import { PwaService } from './core/ui/pwa.service';
import { ThemeChoice, ThemeService } from './core/ui/theme.service';
import { ChangePasswordDialog } from './vault/change-password-dialog';
import { VaultGate } from './vault/vault-gate';

const THEME_LABELS: Record<ThemeChoice, string> = {
  system: 'Wie im System',
  light: 'Hell',
  dark: 'Dunkel',
};

/** Titel der Seiten in der Kopfleiste. */
const PAGE_TITLES: Record<string, string> = {
  '': 'Wochenplan',
  noten: 'Noten',
  stundenplan: 'Stundenplan',
  verwaltung: 'Klassen, Fächer & Schüler',
  auswertung: 'Auswertung & Einstellungen',
};

function courseTitle(course: Course): string {
  return `${course.subjectName} · ${course.schoolClassName}`;
}

const THEME_ICONS: Record<ThemeChoice, IconName> = {
  system: 'monitor',
  light: 'sun',
  dark: 'moon',
};

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ToastHost,
    ConfirmHost,
    VaultGate,
    ChangePasswordDialog,
    Icon,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: {
    '(document:keydown.escape)': 'closeMenu()',
    '(document:keydown)': 'onKeydown($event)',
  },
})
export class App implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly store = inject(LocalStore);
  private readonly vault = inject(VaultService);
  private readonly toasts = inject(ToastService);
  private readonly theme = inject(ThemeService);
  private readonly pwa = inject(PwaService);
  private readonly confirm = inject(ConfirmService);
  private readonly mode = inject(ModeService);
  private readonly active = inject(ActiveCourseService);

  readonly canInstall = this.pwa.canInstall;
  readonly isOpen = this.store.isOpen;
  readonly hasUnsavedChanges = this.store.hasUnsavedChanges;
  readonly fileName = this.vault.fileName;
  readonly isInOneDrive = this.vault.isInOneDrive;
  readonly isSaving = this.vault.isSaving;
  readonly isEdit = this.mode.isEdit;

  readonly lesson = signal<CurrentLesson | null>(null);

  /** Das im Wochenplan gewählte Fach - ohne es bleibt das Menü im Unterricht zu. */
  readonly activeCourse = this.active.course;
  readonly activeCourseHue = computed(() => {
    const course = this.activeCourse();
    return course ? subjectHue(course.subjectName) : 0;
  });
  /** Im Bearbeitungsmodus ist das Menü immer offen, im Unterricht erst mit Fach. */
  readonly menuLocked = computed(() => !this.isEdit() && !this.activeCourse());

  /** Der Pfad der aktuellen Seite, in Teile zerlegt. */
  private readonly path = signal<string[]>([]);

  /** Der Titel der aktuellen Seite in der Kopfleiste. */
  readonly title = computed(() => {
    const [page = '', , sub] = this.path();
    const course = this.activeCourse();
    if (page === 'kurs') {
      return course ? courseTitle(course) + (sub === 'noten' ? ' – Noten' : '') : '';
    }
    return PAGE_TITLES[page] ?? '';
  });
  readonly menuOpen = signal(false);
  /** Die Titelleiste ist verborgen und erscheint erst mit dem Menüknopf. */
  readonly chromeOpen = signal(false);
  readonly passwordDialogOpen = signal(false);

  readonly saveState = computed<'saving' | 'dirty' | 'saved'>(() =>
    this.isSaving() ? 'saving' : this.hasUnsavedChanges() ? 'dirty' : 'saved',
  );

  readonly saveStateText = computed(
    () =>
      ({ saving: 'Speichert …', dirty: 'Nicht gespeichert', saved: 'Gespeichert' })[
        this.saveState()
      ],
  );

  /** Schreibt die App gerade von selbst in die Datei? */
  readonly autoSaveActive = computed(
    () => this.vault.autoSaveToFile() && this.vault.hasFileHandle(),
  );

  readonly themeLabel = computed(() => THEME_LABELS[this.theme.choice()]);
  readonly themeIcon = computed(() => THEME_ICONS[this.theme.choice()]);

  /** Die Anzeige der laufenden Stunde aktualisiert sich selbst. */
  private readonly timer = setInterval(() => this.refreshLesson(), 60_000);

  constructor() {
    // Jede Änderung am Bestand kann die laufende Stunde betreffen.
    effect(() => {
      this.store.revision();
      this.store.isOpen();
      untracked(() => this.refreshLesson());
    });

    // Fällt das Fach weg (andere Datei, Kurs gelöscht), schließt das Menü im Unterricht.
    effect(() => {
      if (this.menuLocked()) {
        untracked(() => this.menuOpen.set(false));
      }
    });

    // Schlägt das automatische Speichern fehl, soll das niemand übersehen.
    effect(() => {
      const error = this.vault.autoSaveError();
      if (error) {
        untracked(() =>
          this.toasts.error(
            error,
            'Automatisches Speichern fehlgeschlagen. Bitte von Hand speichern.',
          ),
        );
      }
    });

    // Hat ein anderes Gerät inzwischen gespeichert, entscheidet die Lehrkraft.
    effect(() => {
      if (this.vault.saveConflict()) {
        untracked(() => void this.resolveConflict());
      }
    });

    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((e) => {
      this.closeMenu();
      this.readUrl(e.urlAfterRedirects);
      this.refreshLesson();
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  /** Öffnet das Menü - im Unterricht nur, wenn ein Fach gewählt ist. */
  openMenu(): void {
    this.chromeOpen.set(true);
    if (this.menuLocked()) {
      this.toasts.show('Bitte zuerst im Wochenplan eine Stunde wählen.', 'info');
      return;
    }
    this.menuOpen.set(true);
  }

  /** Schließt Menü und Titelleiste gemeinsam. */
  closeMenu(): void {
    this.menuOpen.set(false);
    this.chromeOpen.set(false);
  }

  install(): void {
    this.closeMenu();
    void this.pwa.install();
  }

  cycleTheme(): void {
    this.theme.cycle();
  }

  /** Strg+S (bzw. Cmd+S) speichert - statt die Seite als HTML zu sichern. */
  onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (this.isOpen() && !this.isSaving()) {
        void this.save();
      }
    }
  }

  /** Schreibt den Datenbestand in die Datei. */
  async save(): Promise<void> {
    this.closeMenu();
    try {
      await this.vault.save();
      this.toasts.success('Gespeichert.');
    } catch (error) {
      if (!(error instanceof FilePickerCancelled || error instanceof SaveConflictError)) {
        this.toasts.error(error, 'Der Datenbestand konnte nicht gespeichert werden.');
      }
    }
  }

  openPasswordDialog(): void {
    this.closeMenu();
    this.passwordDialogOpen.set(true);
  }

  /** Fragt, welcher Stand gilt, wenn zwei Geräte dieselbe Datei geändert haben. */
  private async resolveConflict(): Promise<void> {
    const keepMine = await this.confirm.ask({
      title: 'Auf einem anderen Gerät wurde gespeichert',
      message:
        'Die Datei in OneDrive wurde geändert, seit sie hier geöffnet wurde. ' +
        '„Meinen Stand behalten“ überschreibt die Änderungen des anderen Geräts. ' +
        '„Anderen Stand laden“ verwirft die Änderungen auf diesem Gerät.',
      confirmLabel: 'Meinen Stand behalten',
      cancelLabel: 'Anderen Stand laden',
      danger: true,
    });

    try {
      if (keepMine) {
        await this.vault.keepMineAfterConflict();
        this.toasts.success('Gespeichert. Der Stand dieses Geräts gilt.');
      } else {
        await this.vault.takeTheirsAfterConflict();
        this.toasts.success('Der Stand des anderen Geräts ist geladen.');
      }
    } catch (error) {
      if (!(error instanceof FilePickerCancelled)) {
        this.toasts.error(error, 'Der Konflikt konnte nicht aufgelöst werden.');
      }
    }
  }

  startEdit(): void {
    this.closeMenu();
    void this.mode.requestEdit();
  }

  finishEdit(): void {
    this.closeMenu();
    this.mode.finishEdit();
  }

  /**
   * Merkt sich die Seite; auf einer Kursseite wird deren Fach das aktive.
   * Im Wochenplan ist kein Fach aktiv - dort wird erst eine Stunde gewählt.
   */
  private readUrl(url: string): void {
    const path = url.split('?')[0].split('/').filter(Boolean);
    this.path.set(path);

    if (path.length === 0) {
      this.active.clear();
    } else if (path[0] === 'kurs' && path[1]) {
      this.active.select(Number(path[1]));
    }
  }

  private refreshLesson(): void {
    if (!this.store.isOpen()) {
      this.lesson.set(null);
      return;
    }

    this.api.getCurrentLesson().subscribe({
      next: (lesson) => this.lesson.set(lesson),
      error: () => this.lesson.set(null),
    });
  }
}
