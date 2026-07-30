import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { apiUrl } from '../../core/api';
import { MatchedPlayerStats, PlayerStatsRecord } from './player-stats.model';

/**
 * Member-gated player stats.
 *
 * The 30-minute live overlay used to be folded into the hourly snapshot here, in the
 * browser. It now happens server-side in `GameDataMappers.ToPlayerStatsDto`, under the same
 * rules: live gear wins outright when the sweep has any (never a mix — a half-swept loadout
 * would show items nobody is wearing together), volatile stats win per field, and names,
 * school, elegance and inner ways are snapshot-only because the live API doesn't carry them.
 * So what arrives here is already merged.
 */
@Injectable({ providedIn: 'root' })
export class PlayerStatsDataService {
  private readonly http = inject(HttpClient);

  private readonly records$: Observable<PlayerStatsRecord[]> = this.load().pipe(shareReplay(1));

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
