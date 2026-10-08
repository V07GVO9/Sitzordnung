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
import { ApiService } from './core/api.service';
import { Course, CurrentLesson, SchoolClass, TimetableEntry, WEEKDAY_NAMES } from './core/models';
import { FilePickerCancelled } from './core/store/file-system';
import { LocalStore } from './core/store/local-store';
import { VaultService } from './core/store/vault.service';
import { ToastHost } from './core/toast-host';
import { ToastService } from './core/toast.service';
import { ConfirmHost } from './core/ui/confirm-host';
import { ConfirmService } from './core/ui/confirm.service';
import { Icon } from './core/ui/icon';
import { IconName } from './core/ui/icons';
import { PwaService } from './core/ui/pwa.service';
import { subjectHue } from './core/ui/subject-hue';
import { ThemeChoice, ThemeService } from './core/ui/theme.service';
import { VaultGate } from './vault/vault-gate';

/** Ein Reiter der Leiste unten - wie die Bereiche der Klassenmappe. */
interface ClassTab {
  key: 'uebersicht' | 'schueler' | 'mitarbeit' | 'noten';
  label: string;
  icon: IconName;
}

/** Was die Seitenleiste zeigt: die Klassen oder den Unterricht eines Tages. */
type SidebarView = 'klassen' | 'tag';

const THEME_LABELS: Record<ThemeChoice, string> = {
  system: 'Wie im System',
  light: 'Hell',
  dark: 'Dunkel',
};

const THEME_ICONS: Record<ThemeChoice, IconName> = {
  system: 'monitor',
  light: 'sun',
  dark: 'moon',
};

/** Seiten außerhalb einer Klasse und ihre Titel in der Kopfleiste. */
const PAGE_TITLES: Record<string, string> = {
  stundenplan: 'Stundenplan',
  verwaltung: 'Klassen, Fächer & Schüler',
  auswertung: 'Auswertung & Einstellungen',
};

/** Ab dieser Breite steht die Seitenleiste neben dem Inhalt statt darüber. */
const WIDE_QUERY = '(min-width: 56rem)';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastHost, ConfirmHost, VaultGate, Icon],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: {
    '(document:keydown.escape)': 'menuOpen.set(false)',
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

  readonly canInstall = this.pwa.canInstall;
  readonly isOpen = this.store.isOpen;
  readonly hasUnsavedChanges = this.store.hasUnsavedChanges;
  readonly fileName = this.vault.fileName;
  readonly isSaving = this.vault.isSaving;

  readonly lesson = signal<CurrentLesson | null>(null);
  readonly classes = signal<SchoolClass[]>([]);
  readonly courses = signal<Course[]>([]);
  readonly timetable = signal<TimetableEntry[]>([]);

  /** Die Klasse, in der man sich gerade bewegt - aus der Adresse abgeleitet. */
  readonly activeClassId = signal<number | null>(null);
  /** Der zuletzt geöffnete Kurs je Klasse, damit „Mitarbeit“ dorthin zurückführt. */
  private readonly lastCourseByClass = new Map<number, number>();
  /** Die aktuelle Adresse ohne Abfrageteil - für die aktiven Reiter. */
  private readonly currentPath = signal('/');
  /** Der Titel für Seiten außerhalb einer Klasse. */
  readonly pageTitle = signal('');

  readonly sidebarView = signal<SidebarView>('klassen');
  /** Auf breiten Bildschirmen: steht die Seitenleiste? Auf schmalen: ist sie aufgeklappt? */
  readonly sidebarOpen = signal(this.isWide());
  readonly menuOpen = signal(false);

  /** Der Tag, den die Tagesansicht zeigt. */
  readonly dayOffset = signal(0);

  readonly tabs: ClassTab[] = [
    { key: 'uebersicht', label: 'Übersicht', icon: 'house' },
    { key: 'schueler', label: 'Schüler', icon: 'users' },
    { key: 'mitarbeit', label: 'Mitarbeit', icon: 'notebook-pen' },
    { key: 'noten', label: 'Noten', icon: 'graduation-cap' },
  ];

  readonly activeClass = computed(
    () => this.classes().find((c) => c.id === this.activeClassId()) ?? null,
  );

  readonly title = computed(() => this.activeClass()?.name ?? this.pageTitle());

  /** Fächer je Klasse für die zweite Zeile in der Klassenliste. */
  readonly subjectsByClass = computed(() => {
    const map = new Map<number, string>();
    for (const course of this.courses()) {
      const short = course.subjectShortName || course.subjectName;
      map.set(
        course.schoolClassId,
        [map.get(course.schoolClassId), short].filter(Boolean).join(', '),
      );
    }
    return map;
  });

  readonly day = computed(() => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + this.dayOffset());
    return date;
  });

  readonly dayLabel = computed(() => {
    const offset = this.dayOffset();
    if (offset === 0) {
      return 'Heute';
    }
    if (offset === 1) {
      return 'Morgen';
    }
    if (offset === -1) {
      return 'Gestern';
    }
    return this.day().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  });

  readonly dayLong = computed(() => {
    const date = this.day();
    return `${WEEKDAY_NAMES[date.getDay()]}, ${date.toLocaleDateString('de-DE')}`;
  });

  /** Der Unterricht des gewählten Tages laut Stundenplan. */
  readonly dayLessons = computed(() => {
    const weekday = this.day().getDay();
    return this.timetable()
      .filter((e) => e.dayOfWeek === weekday)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  });

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

  readonly hue = subjectHue;

  /** Die Anzeige der laufenden Stunde aktualisiert sich selbst. */
  private readonly timer = setInterval(() => this.refreshLesson(), 60_000);

  constructor() {
    // Jede Änderung am Bestand kann Klassenliste, Stundenplan und die
    // laufende Stunde betreffen.
    effect(() => {
      this.store.revision();
      this.store.isOpen();
      untracked(() => this.refresh());
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

    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((e) => {
      this.menuOpen.set(false);
      // Auf schmalen Geräten verschwindet die Seitenleiste nach der Auswahl.
      if (!this.isWide()) {
        this.sidebarOpen.set(false);
      }
      this.currentPath.set(e.urlAfterRedirects.split('?')[0]);
      this.readUrl(e.urlAfterRedirects);
      this.refreshLesson();
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  /** Wohin ein Reiter der Leiste unten führt. */
  tabLink(tab: ClassTab['key']): unknown[] {
    const classId = this.activeClassId();
    if (tab === 'mitarbeit') {
      const courseId = classId === null ? undefined : this.courseForClass(classId);
      if (courseId !== undefined) {
        return ['/kurs', courseId];
      }
    }
    return ['/klasse', classId, tab];
  }

  /** Ist der Reiter gerade offen? Die Kursseite gehört zu „Mitarbeit“. */
  isTabActive(tab: ClassTab['key']): boolean {
    const url = this.currentPath();
    if (tab === 'mitarbeit') {
      return url.startsWith('/kurs/') || url.endsWith('/mitarbeit');
    }
    return url.endsWith(`/${tab}`);
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  shiftDay(step: number): void {
    this.dayOffset.update((offset) => offset + step);
  }

  isRunning(entry: TimetableEntry): boolean {
    const lesson = this.lesson();
    return (
      this.dayOffset() === 0 &&
      !!lesson?.hasLesson &&
      lesson.courseId === entry.courseId &&
      lesson.startTime === entry.startTime
    );
  }

  install(): void {
    this.menuOpen.set(false);
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
    this.menuOpen.set(false);
    try {
      await this.vault.save();
      this.toasts.success('Gespeichert.');
    } catch (error) {
      if (!(error instanceof FilePickerCancelled)) {
        this.toasts.error(error, 'Der Datenbestand konnte nicht gespeichert werden.');
      }
    }
  }

  /** Schließt den Bestand - danach fragt die App wieder nach der Datei. */
  async closeVault(): Promise<void> {
    this.menuOpen.set(false);

    if (this.hasUnsavedChanges()) {
      const confirmed = await this.confirm.ask({
        title: 'Ungespeicherte Änderungen verwerfen?',
        message:
          'Seit dem letzten Speichern wurde etwas geändert. Beim Schließen gehen diese Änderungen verloren.',
        confirmLabel: 'Ohne Speichern schließen',
        danger: true,
      });
      if (!confirmed) {
        return;
      }
    }

    await this.vault.closeVault();
    await this.router.navigateByUrl('/');
  }

  /** Erster Kurs einer Klasse - oder der, der dort zuletzt offen war. */
  private courseForClass(classId: number): number | undefined {
    const last = this.lastCourseByClass.get(classId);
    if (last !== undefined && this.courses().some((c) => c.id === last)) {
      return last;
    }
    return this.courses().find((c) => c.schoolClassId === classId)?.id;
  }

  /** Leitet aus der Adresse ab, welche Klasse und welcher Titel gelten. */
  private readUrl(url: string): void {
    const path = url.split('?')[0].split('/').filter(Boolean);

    if (path[0] === 'klasse' && path[1]) {
      this.activeClassId.set(Number(path[1]));
      this.pageTitle.set('');
      return;
    }

    if (path[0] === 'kurs' && path[1]) {
      const courseId = Number(path[1]);
      const known = this.courses().find((c) => c.id === courseId);
      this.pageTitle.set('');
      if (known) {
        this.activeClassId.set(known.schoolClassId);
        this.lastCourseByClass.set(known.schoolClassId, courseId);
      } else {
        this.api.getCourse(courseId).subscribe({
          next: (course) => {
            this.activeClassId.set(course.schoolClassId);
            this.lastCourseByClass.set(course.schoolClassId, courseId);
          },
          error: () => this.activeClassId.set(null),
        });
      }
      return;
    }

    this.activeClassId.set(null);
    this.pageTitle.set(PAGE_TITLES[path[0] ?? ''] ?? '');
  }

  private refresh(): void {
    if (!this.store.isOpen()) {
      this.lesson.set(null);
      this.classes.set([]);
      this.courses.set([]);
      this.timetable.set([]);
      return;
    }

    this.api.getClasses().subscribe({ next: (classes) => this.classes.set(classes) });
    this.api.getCourses().subscribe({ next: (courses) => this.courses.set(courses) });
    this.api.getTimetable().subscribe({ next: (entries) => this.timetable.set(entries) });
    this.refreshLesson();
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

  private isWide(): boolean {
    return typeof matchMedia === 'function' ? matchMedia(WIDE_QUERY).matches : true;
  }
}
