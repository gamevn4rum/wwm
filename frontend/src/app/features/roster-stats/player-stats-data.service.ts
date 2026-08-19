import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { apiUrl } from '../../core/api';
import { DiscordAuthService } from '../../core/services/discord-auth.service';
import { whileSignedIn } from '../../core/services/member-gated';
import { MatchedPlayerStats, PlayerStatsRecord } from './player-stats.model';

/**
 * Member-gated player stats.
 *
 * The 30-minute live overlay used to be folded into the hourly snapshot here, in the
 * browser. It now happens server-side in `GameDataMappers.ToPlayerStatsDto`, under the same
 * rules: live gear wins outright when the sweep has any (never a mix — a half-swept loadout
 * would show items nobody is wearing together), volatile stats win per field, and names,
 * school and elegance are snapshot-only because the live API doesn't carry them. Inner ways are
 * no longer in that list: the live sweep reads the equipped loadout and resolves each id's tier off
 * the catalogue, so innerWays is live data with tiers unless the member has never been swept.
 * So what arrives here is already merged.
 */
@Injectable({ providedIn: 'root' })
export class PlayerStatsDataService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(DiscordAuthService);

  // Member-gated, and reached from the home grid and the site header — see whileSignedIn.
  private readonly records$: Observable<PlayerStatsRecord[]> =
    whileSignedIn(this.auth, () => this.load(), []);

  /** All records, matched and unmatched, in IGN order. */
  getRecords(): Observable<PlayerStatsRecord[]> {
    return this.records$;
  }

  /** Only members whose in-game profile was resolved. */
  getMatched(): Observable<MatchedPlayerStats[]> {
    return this.records$.pipe(
      map((records) => records.filter((r): r is MatchedPlayerStats => r.matched)),
    );
  }

  private load(): Observable<PlayerStatsRecord[]> {
    return this.http.get<PlayerStatsRecord[]>(apiUrl('/member/player-stats')).pipe(
      catchError(() => of<PlayerStatsRecord[]>([])),
    );
  }
}
