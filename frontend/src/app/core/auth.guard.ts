import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { AuthService } from './auth.service';

/**
 * Lässt nur angemeldete Besucher auf eine Seite. Beim ersten Aufruf wird einmal
 * beim Server nachgefragt, danach genügt der gemerkte Zustand.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const toLogin = () => router.createUrlTree(['/anmelden'], { queryParams: { weiter: state.url } });

  if (auth.checked()) {
    return auth.isSignedIn() ? true : toLogin();
  }

  return auth.loadUser().pipe(map((user) => (user ? true : toLogin())));
};
