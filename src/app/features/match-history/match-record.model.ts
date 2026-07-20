import { NgxTimelineEvent } from '@frxjs/ngx-timeline';

export type MatchType = 'league' | 'ranked' | 'scrim';

/** Guild members who upload match footage — one sheet column per uploader. */
export type UploaderKey =
  | 'Kam' | 'Necro' | 'Ruby' | 'VK' | 'Yuenshin' | 'canoc' | 'Sniper' | 'LVH' | 'choxu'
  | 'MADAFAKA' | 'MinhVũ' | 'Initiate';

export const UPLOADERS: UploaderKey[] = [
  'Kam', 'Necro', 'Ruby', 'VK', 'Yuenshin', 'canoc', 'Sniper', 'LVH', 'choxu',
  'MADAFAKA', 'MinhVũ', 'Initiate',
];

export interface FootageEntry {
  uploader: UploaderKey;
  videoId: string;
}

export interface MatchRecord {
  date: string;
  opponent: string;
  type: MatchType;
  status: '✅' | '❌' | '➕';
  /** Raw "Season" column value from the sheet (e.g. "1", "2"). Empty string if blank. */
  season: string;
  /** Footage clips uploaded for this match, keyed by uploader — one row now covers both. */
  footages: FootageEntry[];
}

/** Numeric seasons sort by magnitude; anything non-numeric (or blank) sorts last. */
export function seasonSortValue(season: string): number {
  const n = parseFloat(season);
  return isNaN(n) ? -Infinity : n;
}

export interface TimelineNode extends NgxTimelineEvent {
  opponent: string;
  matchType: MatchType;
  label: string;
  status: MatchRecord['status'];
  phantom: boolean;
}
