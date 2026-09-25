import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { apiUrl } from '../../core/api';

/** A member's in-game portrait and name card, by the game's ids. The `…Url` fields point at the
 *  official site; null means the site has no art for that id yet. */
export interface Appearance {
  ign: string;
  portraitId: number | null;
  portraitUrl: string | null;
  nameCardId: number | null;
  nameCardUrl: string | null;
}

/**
 * How a member presents themselves in game, read live by the API (members only).
 *
 * ⚠ Images are drawn from the API's pass-through (`/public/official-art/…`), not from the official
 * site directly: that site sends no CORS headers, and the profile screenshot has to read the pixels.
 * Any failure is simply no appearance — the header falls back to how it looked before.
 */
@Injectable({ providedIn: 'root' })
export class AppearanceService {
  private readonly http = inject(HttpClient);

  get(ign: string): Observable<Appearance | null> {
    return this.http.get<Appearance>(apiUrl(`/member/appearance/${encodeURIComponent(ign)}`)).pipe(
      catchError(() => of(null)),
    );
  }

  /** The name card's background, same-origin for the screenshot; null without art. */
  nameCardSrc(a: Appearance | null): string | null {
    return a?.nameCardUrl && a.nameCardId != null
      ? apiUrl(`/public/official-art/name-card/${a.nameCardId}.png`)
      : null;
  }

  /** The in-game portrait, same-origin for the screenshot; null without art. */
  portraitSrc(a: Appearance | null): string | null {
    return a?.portraitUrl && a.portraitId != null
      ? apiUrl(`/public/official-art/portrait/${a.portraitId}.png`)
      : null;
  }
}
