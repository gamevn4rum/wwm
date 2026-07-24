import { UploaderKey } from '../match-history/match-record.model';

export type { UploaderKey };
export type MatchType = 'League' | 'Ranked' | 'Scrim';

/** A single footage clip, flattened out of its parent Match History row for display. */
export interface FootageRecord {
  date: string;
  matchType: MatchType;
  opponent: string;
  uploader: UploaderKey;
  videoId: string;
  season: string;
}
