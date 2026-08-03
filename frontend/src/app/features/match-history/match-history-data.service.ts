import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';
import { apiUrl } from '../../core/api';
import { MatchRecord } from './match-record.model';

@Injectable({ providedIn: 'root' })
export class MatchHistoryDataService {
  private readonly http = inject(HttpClient);

  /**
   * Fires once on subscribe and again on every `reload()`. The list used to be a plain
   * `load().pipe(shareReplay(1))`, which fetched exactly once per session and could never
   * be refetched — fine while matches were read-only, wrong now that Commanders can add
   * and edit them from the page.
   */
  private readonly reload$ = new BehaviorSubject<void>(undefined);

  /**
   * `refCount: false` so the cached list survives the last subscriber leaving — navigating
   * away from Match History and back must not re-download it. FootagesDataService derives
   * from this same stream, so a reload refreshes both pages.
   */
  private readonly records$: Observable<MatchRecord[]> = this.reload$.pipe(
    switchMap(() => this.load()),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  getMatches(): Observable<MatchRecord[]> {
    return this.records$;
  }

  /** Re-fetch after a write. Every current subscriber gets the new list. */
  reload(): void {
    this.reload$.next();
  }

  private load(): Observable<MatchRecord[]> {
    // Footages are included only when the caller has ftp — enforced server-side, so an
    // unprivileged member simply gets an empty footages array rather than a 403.
    // `date` arrives as ISO (2026-07-25), which sorts lexicographically.
    return this.http.get<MatchRecord[]>(apiUrl('/member/matches')).pipe(
      catchError(() => of<MatchRecord[]>([])),
      map((records) => [...records].sort((a, b) => b.date.localeCompare(a.date))),
    );
  }
}
