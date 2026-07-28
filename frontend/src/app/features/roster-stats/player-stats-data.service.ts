import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, combineLatest, from, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { apiUrl } from '../../core/api';
import { EncryptedPayload, decryptJson } from '../../core/utils/crypto.utils';
import {
  LiveStatsRecord, MatchedPlayerStats, PlayerStatsRecord,
} from './player-stats.model';

@Injectable({ providedIn: 'root' })
export class PlayerStatsDataService {
  private readonly http = inject(HttpClient);

  private readonly records$: Observable<PlayerStatsRecord[]> =
    combineLatest([this.load(), this.loadLive()]).pipe(
      map(([records, live]) => this.merge(records, live)),
      shareReplay(1),
    );

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

  /**
   * Fold the 30-minute live overlay into the hourly wwmdb snapshot. Precedence,
   * which is the whole contract between the two sync jobs:
   *
   *  - **gear** — the live copy wins outright whenever there is one. It comes
   *    from the game's own servers, so a snapshot up to an hour old never
   *    overrides it. No per-slot merging: a loadout is a set, and mixing two
   *    reads of it would invent builds nobody is wearing.
   *  - **volatile stats** — per field. A field the game API returned wins; one
   *    it didn't return leaves the wwmdb value untouched.
   *  - **everything else** — school, elegance score, inner ways, and every name
   *    on a gear card. The live API answers in raw ids and has no elegance or
   *    inner ways at all, so these are always wwmdb's, and a brand-new item
   *    stays nameless until the next hourly pass catalogues it.
   *
   * See scripts/fetch-live-stats.js for the other side of this.
   */
  private merge(records: PlayerStatsRecord[], live: LiveStatsRecord[]): PlayerStatsRecord[] {
    if (!live.length) return records;
    const liveByIgn = new Map(live.map((r) => [r.ign, r]));

    return records.map((record) => {
      if (!record.matched) return record;
      const overlay = liveByIgn.get(record.ign);
      if (!overlay) return record;

      return {
        ...record,
        player: {
          ...record.player,
          // Spreading the overlay's stats drops absent fields by construction —
          // fetch-live-stats.js omits rather than nulls what it didn't get.
          ...(overlay.stats ?? {}),
          ...(overlay.gear?.length ? { gear: overlay.gear } : {}),
        },
      };
    });
  }

  private load(): Observable<PlayerStatsRecord[]> {
    // Backend mode: gated player stats (member-only).
    if (environment.useBackend) {
      return this.http.get<PlayerStatsRecord[]>(apiUrl('/member/player-stats')).pipe(
        catchError(() => of<PlayerStatsRecord[]>([])),
      );
    }

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

  /**
   * The live overlay. Same three modes and the same fail-closed handling as
   * load() — an empty list simply means "no overlay", and the merge above is a
   * no-op, so a missing or unreadable file degrades to the wwmdb snapshot rather
   * than to an error.
   *
   * Backend mode has no equivalent endpoint yet, so it stays on the snapshot its
   * own sync produces.
   */
  private loadLive(): Observable<LiveStatsRecord[]> {
    if (environment.useBackend) return of<LiveStatsRecord[]>([]);

    const key = environment.dataEncryptionKey;

    if (!key) {
      return this.http.get<LiveStatsRecord[]>(`data/live-stats.json?t=${Date.now()}`).pipe(
        catchError(() => of<LiveStatsRecord[]>([])),
      );
    }

    return this.http.get<EncryptedPayload>(`data/live-stats.enc?t=${Date.now()}`).pipe(
      switchMap((payload) => from(decryptJson<LiveStatsRecord[]>(payload, key))),
      catchError(() => of<LiveStatsRecord[]>([])),
    );
  }
}
