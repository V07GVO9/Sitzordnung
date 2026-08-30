import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

/**
 * Läuft die Anmeldung während der Nutzung ab (Cookie abgelaufen, Server neu
 * gestartet), schickt jede fehlgeschlagene Anfrage direkt zum Login zurück.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !req.url.includes('/api/auth/')
      ) {
        router.navigateByUrl('/anmeldung');
      }
      return throwError(() => error);
    }),
  );
};
