import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { DiscordAuthService } from '../services/discord-auth.service';

export const footageGuard: CanActivateFn = () => {
  const auth = inject(DiscordAuthService);
  const router = inject(Router);

  // Wait for the session to be verified against Discord + the Members
  // sheet — fp/ftp are never trusted from a synchronous/cached snapshot.
  return auth.initializeAuthState().pipe(
    map((user) => (user?.ftp === true ? true : router.createUrlTree(['/'])))
  );
};
