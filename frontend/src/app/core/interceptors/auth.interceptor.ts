import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { DiscordAuthService } from '../services/discord-auth.service';

/** Attaches the app JWT to backend API requests (backend mode only). */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (environment.useBackend && req.url.startsWith(environment.apiBaseUrl)) {
    const token = inject(DiscordAuthService).getToken();
    if (token) {
      req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
    }
  }
  return next(req);
};
