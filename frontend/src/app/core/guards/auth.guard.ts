import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { DiscordAuthService } from '../services/discord-auth.service';

/** Requires a logged-in member. No-op in static mode (unchanged public access);
 * enforced once the backend trust boundary is live. */
export const authGuard: CanActivateFn = () => {
  if (!environment.useBackend) return true;

  const auth = inject(DiscordAuthService);
  const router = inject(Router);
  return auth.initializeAuthState().pipe(
    map((user) => (user?.isAuthorized ? true : router.createUrlTree(['/'])))
  );
};
