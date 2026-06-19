import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { DiscordAuthService } from '../services/discord-auth.service';

export const formationGuard: CanActivateFn = () => {
  const auth = inject(DiscordAuthService);
  const router = inject(Router);

  // Ensure auth state (and FP key) is initialised synchronously before checking
  auth.initializeAuthState();

  return localStorage.getItem('FP') === 'true'
    ? true
    : router.createUrlTree(['/']);
};
