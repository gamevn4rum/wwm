import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { EncryptedPayload, decryptJson } from '../../core/utils/crypto.utils';
import { MatchedPlayerStats, PlayerStatsRecord } from './player-stats.model';

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
    const key = environment.dataEncryptionKey;

    // Static-only, same model as the roster it derives from: fail closed with
    // an empty list rather than calling any API from the browser.
    if (!key) {
      // Dev: plaintext file.
      return this.http.get<PlayerStatsRecord[]>(`data/player-stats.json?t=${Date.now()}`).pipe(
        catchError(() => of<PlayerStatsRecord[]>([])),
      );
    }

    // Prod: fetch the encrypted file and decrypt it.
    return this.http.get<EncryptedPayload>(`data/player-stats.enc?t=${Date.now()}`).pipe(
      switchMap((payload) => from(decryptJson<PlayerStatsRecord[]>(payload, key))),
      catchError(() => of<PlayerStatsRecord[]>([])),
    );
  }
}
