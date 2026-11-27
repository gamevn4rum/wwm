import { Injectable } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, of } from 'rxjs';

/**
 * Preloads every lazy route in the background, like `PreloadAllModules`, except the ones marked
 * `data: { preload: false }` — the Commander/Admin pages and the bare formation window. Most visitors
 * can never open those, so fetching them for everyone was pure download; the few who can pay one
 * chunk fetch on first navigation instead.
 */
@Injectable({ providedIn: 'root' })
export class PreloadPublicRoutes implements PreloadingStrategy {
  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    return route.data?.['preload'] === false ? of(null) : load();
  }
}
