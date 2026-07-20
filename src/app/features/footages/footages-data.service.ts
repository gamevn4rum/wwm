import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import { MatchHistoryDataService } from '../match-history/match-history-data.service';
import { MatchType as MatchRecordType } from '../match-history/match-record.model';
import { FootageRecord, MatchType } from './footages.model';

function toDisplayMatchType(type: MatchRecordType): MatchType {
  return (type.charAt(0).toUpperCase() + type.slice(1)) as MatchType;
}

@Injectable({ providedIn: 'root' })
export class FootagesDataService {
  private readonly matchHistory = inject(MatchHistoryDataService);

  private readonly records$: Observable<FootageRecord[]> = this.matchHistory.getMatches().pipe(
    map((matches) =>
      matches.flatMap((match) =>
        match.footages.map((footage) => ({
          date: match.date,
          matchType: toDisplayMatchType(match.type),
          opponent: match.opponent,
          uploader: footage.uploader,
          videoId: footage.videoId,
          season: match.season,
        } satisfies FootageRecord))
      )
      // matches are already sorted newest-first by MatchHistoryDataService
    ),
    shareReplay(1)
  );

  getFootages(): Observable<FootageRecord[]> {
    return this.records$;
  }
}
