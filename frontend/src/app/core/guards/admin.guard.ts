import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { DiscordAuthService, isAdminRole, isCommanderRole } from '../services/discord-auth.service';

/** Requires role Admin (mirrors the server policy; the server re-checks). The
 * back-office is backend-only, so it's unreachable while the static path is live. */
export const adminGuard: CanActivateFn = () => {
  const router = inject(Router);
  if (!environment.useBackend) return router.createUrlTree(['/']);
  const auth = inject(DiscordAuthService);
  return auth.initializeAuthState().pipe(
    map((user) => (isAdminRole(user?.role) ? true : router.createUrlTree(['/'])))
  );
};

/** Requires role Commander or above (backend-only). */
export const commanderGuard: CanActivateFn = () => {
  const router = inject(Router);
  if (!environment.useBackend) return router.createUrlTree(['/']);
  const auth = inject(DiscordAuthService);
  return auth.initializeAuthState().pipe(
    map((user) => (isCommanderRole(user?.role) ? true : router.createUrlTree(['/'])))
  );
};
