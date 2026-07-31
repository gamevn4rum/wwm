import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';
import { apiUrl } from '../../core/api';
import { DiscordAuthService } from '../../core/services/discord-auth.service';
import { Guild, GuildRank, HallOfFame } from './guild.model';

const EMPTY_GUILD: Guild = {
  id: '', numberId: null, name: '', level: null, createTime: null,
  hostnum: null, memberCount: 0, members: [],
};

@Injectable({ providedIn: 'root' })
export class GuildDataService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(DiscordAuthService);

  // Member-gated, so it must not fire until the app JWT is settled (restored from
  // storage, or landed from a just-completed Discord exchange). This widget lives in
  // the page header — mounted on every route, including the one Discord redirects
  // back to — so without this gate it raced the OAuth exchange, got a 401, and
  // (via shareReplay below) stayed cached empty for the rest of the session.
  private readonly guild$: Observable<Guild> = this.auth.initializeAuthState().pipe(
    switchMap(() => this.load()),
    shareReplay(1),
  );

  /**
   * Leaderboard standing — our own rank and score only, so it is public rather than
   * member-gated. Fails closed to null so the tiles simply don't render.
   */
  private readonly rank$: Observable<GuildRank | null> = this.http
    .get<GuildRank>(apiUrl('/public/guild/rank'))
    .pipe(catchError(() => of(null)), shareReplay(1));

  getGuild(): Observable<Guild> {
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

  private load(): Observable<Guild> {
    // Member-gated, unlike the two above: this one carries the in-game roster.
    return this.http.get<Guild>(apiUrl('/member/guild')).pipe(
      map((g) => this.normalize(g)),
      catchError(() => of(EMPTY_GUILD)),
    );
  }
}
