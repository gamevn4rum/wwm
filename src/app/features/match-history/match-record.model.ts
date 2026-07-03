import { NgxTimelineEvent } from '@frxjs/ngx-timeline';

export type MatchType = 'league' | 'ranked' | 'scrim';

/** Guild members who upload match footage — one sheet column per uploader. */
export type UploaderKey = 'Kam' | 'Necro' | 'Ruby' | 'VK' | 'Yuenshin' | 'canoc' | 'Sniper' | 'LVH' | 'choxu';

export const UPLOADERS: UploaderKey[] = ['Kam', 'Necro', 'Ruby', 'VK', 'Yuenshin', 'canoc', 'Sniper', 'LVH', 'choxu'];

export interface FootageEntry {
  uploader: UploaderKey;
  videoId: string;
}

export interface MatchRecord {
  date: string;
  opponent: string;
  type: MatchType;
  status: '✅' | '❌' | '➕';
  /** Footage clips uploaded for this match, keyed by uploader — one row now covers both. */
  footages: FootageEntry[];
}

export interface TimelineNode extends NgxTimelineEvent {
  opponent: string;
  matchType: MatchType;
  label: string;
  status: MatchRecord['status'];
  phantom: boolean;
}
