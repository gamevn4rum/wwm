import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { DiscordAuthService } from '../services/discord-auth.service';

/** Attaches the app JWT to our own API requests. The origin check matters: without it the
 * token would ride along to Discord's CDN and Google Fonts too. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.startsWith(environment.apiBaseUrl)) {
    const token = inject(DiscordAuthService).getToken();
    if (token) {
      req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
    }
  }
  return next(req);
};
