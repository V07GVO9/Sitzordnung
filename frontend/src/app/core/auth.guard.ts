import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, catchError, of } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Fragt den Anmeldestatus beim Backend ab, statt dem zwischengespeicherten
 * Signal zu vertrauen - das Cookie kann auch abgelaufen sein, ohne dass die
 * App das schon mitbekommen hat.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.status().pipe(
    map((status) => {
      if (status.isAuthenticated) {
        return true;
      }
      return router.createUrlTree(['/anmeldung']);
    }),
    catchError(() => of(router.createUrlTree(['/anmeldung']))),
  );
};
