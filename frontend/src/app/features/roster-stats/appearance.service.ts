import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, ReplaySubject, Subject, of } from 'rxjs';
import { catchError, mergeMap, tap } from 'rxjs/operators';
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

  /** At most this many lookups in flight: a roster scrolled quickly must not fan out into dozens
   *  of simultaneous game reads. */
  private static readonly CONCURRENCY = 3;

  /** One answer per IGN for the page's lifetime, shared by every card that asks. */
  private readonly memo = new Map<string, Observable<Appearance | null>>();

  /** Lookups waiting their turn: each is a live game read on the API's side. */
  private readonly queue = new Subject<{ ign: string; out: ReplaySubject<Appearance | null> }>();

  constructor() {
    this.queue
      .pipe(mergeMap(({ ign, out }) => this.get(ign).pipe(tap((a) => { out.next(a); out.complete(); })),
        AppearanceService.CONCURRENCY))
      .subscribe();
  }

  /**
   * {@link get}, queued and remembered, for surfaces that ask for many members at once (the Guild
   * page's roster). Each IGN is fetched at most once; a failure is remembered as "no appearance"
   * too, so a card never retries in a loop.
   */
  cached(ign: string): Observable<Appearance | null> {
    const key = ign.toLowerCase();
    let held = this.memo.get(key);
    if (!held) {
      const out = new ReplaySubject<Appearance | null>(1);
      this.memo.set(key, (held = out));
      this.queue.next({ ign, out });
    }
    return held;
  }

  get(ign: string): Observable<Appearance | null> {
    return this.http.get<Appearance>(apiUrl(`/member/appearance/${encodeURIComponent(ign)}`)).pipe(
      catchError(() => of(null)),
    );
  }

  /**
   * The name card's background, CORS-readable for the screenshot; null without art. Always drawn
   * with `crossorigin="anonymous"`.
   *
   * ⚠ The `?cors` is a separate cache entry, not decoration. This used to be a CSS background,
   * requested without an Origin, and the API's answer has no CORS header and no `Vary: Origin` and
   * is cached a day — so a browser still holding that copy would hand it to a CORS request, which
   * then fails to load at all. A new URL can only ever have been fetched the CORS way.
   */
  nameCardSrc(a: Appearance | null): string | null {
    return a?.nameCardUrl && a.nameCardId != null
      ? apiUrl(`/public/official-art/name-card/${a.nameCardId}.png?cors`)
      : null;
  }

  /** The in-game portrait, same-origin for the screenshot; null without art. */
  portraitSrc(a: Appearance | null): string | null {
    return a?.portraitUrl && a.portraitId != null
      ? apiUrl(`/public/official-art/portrait/${a.portraitId}.png`)
      : null;
  }
}
