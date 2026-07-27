import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { DiscordAuthService } from '../services/discord-auth.service';

/** Requires any logged-in member, enforced in BOTH static and backend modes —
 * unlike authGuard, which no-ops on the static path. Waits for the session to
 * resolve against Discord + the Members sheet before deciding, so access is
 * never granted from a stale/synchronous snapshot. */
export const memberGuard: CanActivateFn = () => {
  const auth = inject(DiscordAuthService);
  const router = inject(Router);
  return auth.initializeAuthState().pipe(
    map((user) => (user?.isAuthorized ? true : router.createUrlTree(['/'])))
  );
};
