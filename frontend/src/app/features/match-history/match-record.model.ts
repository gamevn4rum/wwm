import { NgxTimelineEvent } from '@frxjs/ngx-timeline';

export type MatchType = 'league' | 'ranked' | 'scrim';

/**
 * Whoever uploaded a clip, as the API labels it — a member's IGN.
 *
 * A plain string, not a union: the backend derives these from the Match History header at
 * sync time (`UpsertMatchesAsync` resolves each column's Discord handle to an IGN), so the
 * set is whatever the roster currently says and cannot be known at compile time. A handle
 * belonging to nobody on the roster is passed through as-is, so this can occasionally be a
 * raw Discord handle rather than an IGN.
 */
export type UploaderKey = string;

export interface FootageEntry {
  uploader: UploaderKey;
  videoId: string;
}

export interface MatchRecord {
  /** ISO date (2026-07-25), so it sorts lexicographically. */
  date: string;
  opponent: string;
  type: MatchType;
  status: '✅' | '❌' | '➕';
  /** Season label as recorded (e.g. "1", "2"). Empty string if blank. */
  season: string;
  /** Clips for this match. Empty unless the caller has footage permission. */
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
