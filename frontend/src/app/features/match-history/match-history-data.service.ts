import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { apiUrl } from '../../core/api';
import { MatchRecord } from './match-record.model';

@Injectable({ providedIn: 'root' })
export class MatchHistoryDataService {
  private readonly http = inject(HttpClient);

  private readonly records$: Observable<MatchRecord[]> = this.load().pipe(shareReplay(1));

  getMatches(): Observable<MatchRecord[]> {
    return this.records$;
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
