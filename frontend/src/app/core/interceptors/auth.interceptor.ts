import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { apiUrl } from '../api';
import { environment } from '../../../environments/environment';
import { DiscordAuthService } from '../services/discord-auth.service';

/** Attaches the app JWT to our own API requests. The origin check matters: without it the
 * token would ride along to Discord's CDN and Google Fonts too. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBaseUrl)) return next(req);

  const auth = inject(DiscordAuthService);
  const token = auth.getToken();
  const authed = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  // Under /auth a 401 is the answer, not a problem to fix — sending it back through
  // refresh (which is itself an /auth call) would recurse.
  if (!token || req.url.startsWith(apiUrl('/auth/'))) return next(authed);

  return next(authed).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401) return throwError(() => err);
      // The token died between being attached and being read — a sleeping tab misses its
      // refresh timer, so the first request after waking is what discovers it. Renew once
      // and replay; if the renewal is refused the user is now logged out and the original
      // 401 stands.
      return auth.refresh().pipe(
        switchMap((session) => {
          const fresh = auth.getToken();
          if (!session || !fresh) return throwError(() => err);
          return next(req.clone({ setHeaders: { Authorization: `Bearer ${fresh}` } }));
        }),
      );
    }),
  );
};
