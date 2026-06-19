import { NgxTimelineEvent } from '@frxjs/ngx-timeline';

export type MatchType = 'league' | 'ranked' | 'scrim';

export interface MatchRecord {
  date: string;
  opponent: string;
  type: MatchType;
  status: '✅' | '❌' | '➕';
}

export interface TimelineNode extends NgxTimelineEvent {
  opponent: string;
  matchType: MatchType;
  label: string;
  status: MatchRecord['status'];
  phantom: boolean;
}
