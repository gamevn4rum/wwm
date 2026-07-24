import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { ConfigService } from '../services/config.service';

/** Blocks a route whose page feature-flag is disabled (cosmetic; the backend
 * also returns 404 for disabled pages). Enabled-by-default in static mode. */
export function featureGuard(key: string): CanActivateFn {
  return () => {
    const config = inject(ConfigService);
    const router = inject(Router);
    return config.isEnabled(key).pipe(
      map((enabled) => (enabled ? true : router.createUrlTree(['/'])))
    );
  };
}
