import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { DiscordAuthService } from '../services/discord-auth.service';

export const footageGuard: CanActivateFn = () => {
  const auth = inject(DiscordAuthService);
  const router = inject(Router);

  // Ensure auth state (and FTP key) is initialised synchronously before checking
  auth.initializeAuthState();

  return localStorage.getItem('FTP') === 'true'
    ? true
    : router.createUrlTree(['/']);
};
