import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

export interface CurrentUser {
  username: string;
  mustChangePassword: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/auth';

  readonly user = signal<CurrentUser | null>(null);

  /** Solange null, ist noch nicht geklärt, ob eine Sitzung besteht. */
  readonly checked = signal(false);

  readonly isSignedIn = computed(() => this.user() !== null);

  /**
   * Fragt beim Server nach, ob das Cookie noch gilt. Ein 401 ist hier kein
   * Fehler, sondern die Antwort "nicht angemeldet".
   */
  loadUser(): Observable<CurrentUser | null> {
    return this.http.get<CurrentUser>(`${this.base}/me`).pipe(
      catchError(() => of(null)),
      tap((user) => {
        this.user.set(user);
        this.checked.set(true);
      }),
    );
  }

  login(username: string, password: string, stayLoggedIn: boolean): Observable<CurrentUser> {
    return this.http
      .post<CurrentUser>(`${this.base}/login`, { username, password, stayLoggedIn })
      .pipe(
        tap((user) => {
          this.user.set(user);
          this.checked.set(true);
        }),
      );
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.base}/logout`, {}).pipe(tap(() => this.user.set(null)));
  }

  changePassword(currentPassword: string, newPassword: string): Observable<CurrentUser> {
    return this.http
      .post<CurrentUser>(`${this.base}/change-password`, { currentPassword, newPassword })
      .pipe(tap((user) => this.user.set(user)));
  }

  /** Wird gerufen, wenn die Sitzung serverseitig abgelaufen ist. */
  clear(): void {
    this.user.set(null);
  }
}
