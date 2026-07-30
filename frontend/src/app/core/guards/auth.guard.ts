import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { DiscordAuthService } from '../services/discord-auth.service';

/** Requires a logged-in member. Cosmetic only — the gated data sits behind the server's
 * JWT boundary, which re-checks regardless of what the router lets through. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(DiscordAuthService);
  const router = inject(Router);
  return auth.initializeAuthState().pipe(
    map((user) => (user?.isAuthorized ? true : router.createUrlTree(['/'])))
  );
};
