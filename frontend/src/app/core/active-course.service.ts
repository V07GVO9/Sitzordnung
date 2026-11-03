import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ApiService } from './api.service';
import { ModeService } from './mode.service';
import { Course } from './models';
import { LocalStore } from './store/local-store';

/**
 * Das Fach, das zuletzt im Wochenplan gewählt wurde. Menü, Noten und
 * Auswertung beziehen sich immer auf dieses Fach - eine eigene Kurswahl
 * gibt es dort nicht mehr.
 */
@Injectable({ providedIn: 'root' })
export class ActiveCourseService {
  private readonly api = inject(ApiService);
  private readonly store = inject(LocalStore);

  readonly course = signal<Course | null>(null);
  readonly courseId = computed(() => this.course()?.id ?? null);
  readonly hasCourse = computed(() => this.course() !== null);

  constructor() {
    // Ein anderer Bestand oder ein gelöschter Kurs: das Fach neu nachschlagen.
    effect(() => {
      this.store.revision();
      const open = this.store.isOpen();
      untracked(() => {
        const id = this.courseId();
        if (!open) {
          this.course.set(null);
        } else if (id !== null) {
          this.load(id);
        }
      });
    });
  }

  /** Wählt das Fach einer Stunde aus dem Wochenplan. */
  select(courseId: number): void {
    if (this.courseId() !== courseId) {
      this.load(courseId);
    }
  }

  clear(): void {
    this.course.set(null);
  }

  private load(courseId: number): void {
    this.api.getCourse(courseId).subscribe({
      next: (course) => this.course.set(course),
      error: () => this.course.set(null),
    });
  }
}

/** Noten gibt es nur zu einem gewählten Fach. */
export const activeCourseGuard: CanActivateFn = () => {
  const active = inject(ActiveCourseService);
  return active.hasCourse() || inject(Router).createUrlTree(['/']);
};

/** Die Auswertung braucht ein Fach - außer im Bearbeitungsmodus (Einstellungen, Datei). */
export const evaluationGuard: CanActivateFn = () => {
  const active = inject(ActiveCourseService);
  return active.hasCourse() || inject(ModeService).isEdit() || inject(Router).createUrlTree(['/']);
};
