import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

export interface AuthStatus {
  isSetUp: boolean;
  isAuthenticated: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/auth';

  /** Wird vom Guard und der Kopfzeile gelesen, ohne jedes Mal neu abzufragen. */
  readonly isAuthenticated = signal(false);

  status(): Observable<AuthStatus> {
    return this.http
      .get<AuthStatus>(`${this.base}/status`)
      .pipe(tap((status) => this.isAuthenticated.set(status.isAuthenticated)));
  }

  setup(password: string): Observable<void> {
    return this.http
      .post<void>(`${this.base}/setup`, { password })
      .pipe(tap(() => this.isAuthenticated.set(true)));
  }

  login(password: string): Observable<void> {
    return this.http
      .post<void>(`${this.base}/login`, { password })
      .pipe(tap(() => this.isAuthenticated.set(true)));
  }

  logout(): Observable<void> {
    return this.http
      .post<void>(`${this.base}/logout`, {})
      .pipe(tap(() => this.isAuthenticated.set(false)));
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.base}/change-password`, {
      currentPassword,
      newPassword,
    });
  }
}
