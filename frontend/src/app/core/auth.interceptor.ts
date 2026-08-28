import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from './auth.service';

/**
 * Läuft die Sitzung während der Arbeit ab, antwortet der Server mit 401.
 * Dann geht es zurück zur Anmeldung, statt leere Seiten zu zeigen.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(request).pipe(
    catchError((error: unknown) => {
      const istAnmeldeAnfrage = request.url.includes('/api/auth/');

      if (error instanceof HttpErrorResponse && error.status === 401 && !istAnmeldeAnfrage) {
        auth.clear();
        router.navigate(['/anmelden'], { queryParams: { weiter: router.url } });
      }

      return throwError(() => error);
    }),
  );
};
