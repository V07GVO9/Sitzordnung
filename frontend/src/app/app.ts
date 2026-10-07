import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ApiService } from './core/api.service';
import { CurrentLesson } from './core/models';
import { FilePickerCancelled } from './core/store/file-system';
import { LocalStore } from './core/store/local-store';
import { VaultService } from './core/store/vault.service';
import { ToastHost } from './core/toast-host';
import { ToastService } from './core/toast.service';
import { Icon } from './core/ui/icon';
import { IconName } from './core/ui/icons';
import { ThemeChoice, ThemeService } from './core/ui/theme.service';
import { VaultGate } from './vault/vault-gate';

interface NavItem {
  path: string;
  label: string;
  short: string;
  icon: IconName;
  exact: boolean;
}

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

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastHost, VaultGate, Icon],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'menuOpen.set(false)',
  },
})
export class App implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly store = inject(LocalStore);
  private readonly vault = inject(VaultService);
  private readonly toasts = inject(ToastService);
  private readonly theme = inject(ThemeService);

  readonly lesson = signal<CurrentLesson | null>(null);

  readonly isOpen = this.store.isOpen;
  readonly hasUnsavedChanges = this.store.hasUnsavedChanges;
  readonly fileName = this.vault.fileName;
  readonly isSaving = this.vault.isSaving;

  /** Der Stundenplan ist die Startseite - er wird täglich gebraucht. */
  readonly nav: NavItem[] = [
    { path: '/', label: 'Stundenplan', short: 'Plan', icon: 'calendar-days', exact: true },
    {
      path: '/unterricht',
      label: 'Unterricht',
      short: 'Unterricht',
      icon: 'presentation',
      exact: false,
    },
    {
      path: '/verwaltung',
      label: 'Klassen & Schüler',
      short: 'Klassen',
      icon: 'users',
      exact: false,
    },
    {
      path: '/auswertung',
      label: 'Auswertung',
      short: 'Auswertung',
      icon: 'chart-column',
      exact: false,
    },
  ];

  /** Das Menü oben rechts auf Handy und Tablet. */
  readonly menuOpen = signal(false);
  private readonly menuRef = viewChild<ElementRef<HTMLElement>>('menu');

  readonly saveState = computed<'saving' | 'dirty' | 'saved'>(() =>
    this.isSaving() ? 'saving' : this.hasUnsavedChanges() ? 'dirty' : 'saved',
  );

  readonly saveStateText = computed(
    () =>
      ({ saving: 'Speichert …', dirty: 'Nicht gespeichert', saved: 'Gespeichert' })[
        this.saveState()
      ],
  );

  readonly themeLabel = computed(() => THEME_LABELS[this.theme.choice()]);
  readonly themeIcon = computed(() => THEME_ICONS[this.theme.choice()]);

  /** Die Anzeige der laufenden Stunde aktualisiert sich selbst. */
  private readonly timer = setInterval(() => this.refresh(), 60_000);

  constructor() {
    // Jede Änderung am Bestand - etwa ein neuer Stundenplaneintrag - kann die
    // laufende Stunde betreffen. Das Signal wird gelesen, damit der Effekt
    // bei jeder Änderung erneut läuft.
    effect(() => {
      this.store.revision();
      this.store.isOpen();
      untracked(() => this.refresh());
    });

    // Nach dem Bearbeiten des Stundenplans soll die Anzeige sofort stimmen,
    // nicht erst beim nächsten Takt.
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
      this.menuOpen.set(false);
      this.refresh();
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  cycleTheme(): void {
    this.theme.cycle();
  }

  toggleMenu(event: Event): void {
    event.stopPropagation();
    this.menuOpen.update((open) => !open);
  }

  /** Ein Klick neben das Menü schließt es. */
  onDocumentClick(event: MouseEvent): void {
    const menu = this.menuRef()?.nativeElement;
    if (this.menuOpen() && menu && !menu.contains(event.target as Node)) {
      this.menuOpen.set(false);
    }
  }

  /** Schreibt den Datenbestand in die Datei. */
  async save(): Promise<void> {
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
      const confirmed = confirm(
        'Es gibt ungespeicherte Änderungen. Wirklich schließen? Sie gehen dabei verloren.',
      );
      if (!confirmed) {
        return;
      }
    }

    await this.vault.closeVault();
    await this.router.navigateByUrl('/');
  }

  private refresh(): void {
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
