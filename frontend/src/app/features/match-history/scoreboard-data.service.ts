import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';
import { apiUrl } from '../../core/api';
import { Scoreboard } from './scoreboard.model';

/**
 * Fetches one match's scoreboard, on demand.
 *
 * Deliberately not folded into `MatchHistoryDataService`: the match list is ~150 rows and a
 * scoreboard is ~60 players, so joining them would make opening the page sixty times heavier to
 * serve a panel most visits never open. This fires when a card is actually clicked.
 *
 * Responses are cached per match id for the session. A scoreboard never changes once the match is
 * over — the game's record is immutable — so there is nothing to invalidate, and reopening the same
 * card costs no request.
 */
@Injectable({ providedIn: 'root' })
export class ScoreboardDataService {
  private readonly http = inject(HttpClient);

  private readonly cache = new Map<number, Observable<Scoreboard | null>>();

  /**
   * @returns the scoreboard, or null when this match has none — which is the normal state for
   * anything the nightly sync has not tied to a game record, not an error.
   */
  get(matchId: number): Observable<Scoreboard | null> {
    const hit = this.cache.get(matchId);
    if (hit) return hit;

    const request = this.http
      .get<Scoreboard | null>(apiUrl(`/member/matches/${matchId}/scoreboard`))
      .pipe(
        // A failure and an absent scoreboard land in the same place on purpose: the panel says
        // "no scoreboard" either way, and there is nothing a member could do about the difference.
        catchError(() => of(null)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

    this.cache.set(matchId, request);
    return request;
  }
}
