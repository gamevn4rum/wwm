import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { DiscordAuthService, isAdminRole, isCommanderRole } from '../services/discord-auth.service';

/** Requires role Admin. Mirrors the server policy — the server re-checks every request,
 * so this only saves a wasted navigation. */
export const adminGuard: CanActivateFn = () => {
  const router = inject(Router);
  const auth = inject(DiscordAuthService);
  return auth.initializeAuthState().pipe(
    map((user) => (isAdminRole(user?.role) ? true : router.createUrlTree(['/'])))
  );
};

/** Requires role Commander or above. */
export const commanderGuard: CanActivateFn = () => {
  const router = inject(Router);
  const auth = inject(DiscordAuthService);
  return auth.initializeAuthState().pipe(
    map((user) => (isCommanderRole(user?.role) ? true : router.createUrlTree(['/'])))
  );
};
