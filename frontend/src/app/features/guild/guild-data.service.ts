import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, startWith, switchMap, shareReplay } from 'rxjs/operators';
import { apiUrl } from '../../core/api';
import { DiscordAuthService } from '../../core/services/discord-auth.service';
import { signedIn$ } from '../../core/services/member-gated';
import { Guild, GuildRank, HallOfFame } from './guild.model';

const EMPTY_GUILD: Guild = {
  id: '', numberId: null, name: '', level: null, createTime: null,
  hostnum: null, memberCount: 0, members: [],
};

/**
 * Why this is a state rather than just a Guild: the roster is member-gated, so "nothing to
 * show" has three different causes that need three different words on screen — still
 * loading, not signed in, or the call failed. Collapsing them into an empty guild left the
 * page blank with the reason only in the console.
 */
export type GuildLoad =
  | { status: 'loading' }
  | { status: 'ok'; guild: Guild }
  | { status: 'signed-out' }
  | { status: 'error' };

@Injectable({ providedIn: 'root' })
export class GuildDataService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(DiscordAuthService);

  // Keyed off the session, not just waiting for it to settle. This widget lives in the
  // page header — mounted on every route, including the one Discord redirects back to —
  // so it must neither race the OAuth exchange (a 401 that shareReplay would then cache
  // empty for the whole session) nor ask at all while signed out, which was a guaranteed
  // 401 on every anonymous page load. Re-runs on login, so the roster fills in with no
  // reload.
  private readonly guild$: Observable<GuildLoad> = signedIn$(this.auth).pipe(
    switchMap((signedIn) => (signedIn ? this.load() : of<GuildLoad>({ status: 'signed-out' }))),
    shareReplay(1),
  );

  /**
   * Leaderboard standing — our own rank and score only, so it is public rather than
   * member-gated. Fails closed to null so the tiles simply don't render.
   */
  private readonly rank$: Observable<GuildRank | null> = this.http
    .get<GuildRank>(apiUrl('/public/guild/rank'))
    .pipe(catchError(() => of(null)), shareReplay(1));

  getGuild(): Observable<GuildLoad> {
    return this.guild$;
  }

  getRank(): Observable<GuildRank | null> {
    return this.rank$;
  }

  /** Leaderboard placements for our members. Public, same as the rank above. */
  private readonly hallOfFame$: Observable<HallOfFame | null> = this.http
    .get<HallOfFame>(apiUrl('/public/guild/hall-of-fame'))
    .pipe(catchError(() => of(null)), shareReplay(1));

  getHallOfFame(): Observable<HallOfFame | null> {
    return this.hallOfFame$;
  }

  /** Fill in defaults + a member-count fallback so the template can trust the shape. */
  private normalize(g: Guild | null): Guild {
    if (!g) return EMPTY_GUILD;
    const members = Array.isArray(g.members) ? g.members : [];
    return { ...EMPTY_GUILD, ...g, members, memberCount: g.memberCount ?? members.length };
  }

  private load(): Observable<GuildLoad> {
    // Member-gated, unlike the two above: this one carries the in-game roster. A 401 here
    // means the session ended after the interceptor already tried to renew it, so it reads
    // as signed out rather than as a failure.
    return this.http.get<Guild>(apiUrl('/member/guild')).pipe(
      map((g) => ({ status: 'ok', guild: this.normalize(g) }) as GuildLoad),
      catchError((err: HttpErrorResponse) => of<GuildLoad>(
        err.status === 401 || err.status === 403 ? { status: 'signed-out' } : { status: 'error' },
      )),
      startWith<GuildLoad>({ status: 'loading' }),
    );
  }
}
