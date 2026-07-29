import { NgxTimelineEvent } from '@frxjs/ngx-timeline';

export type MatchType = 'league' | 'ranked' | 'scrim';

/**
 * A guild member who uploads match footage, identified by IGN — one Match History column
 * per uploader.
 *
 * Not a union of literals any more: the sheet names these columns by Discord username and
 * `scripts/fetch-data.js` rewrites the headers to IGNs at sync time, so the set is whatever
 * the roster currently says and cannot be known at compile time.
 */
export type UploaderKey = string;

/**
 * Match History columns that are match metadata. Every *other* column on a row is an
 * uploader's footage URL, which is what makes adding an uploader a sheet-only change.
 *
 * Kept in step with MATCH_HISTORY_METADATA_COLUMNS in `scripts/fetch-data.js`. UID/PID are
 * listed for completeness — the sync omits them from published data — so that they are
 * never mistaken for an uploader if a path ever does deliver them.
 *
 * A new *metadata* column on the sheet must be added here. Detection works by exclusion, so
 * an unlisted column is read as an uploader, and `extractYouTubeVideoId` accepts any bare
 * 11-character alphanumeric string as a video ID — enough for such a column to surface a
 * phantom clip rather than being ignored.
 */
export const NON_UPLOADER_COLUMNS: readonly string[] = [
  'Season', 'Date', 'Type', 'PID', 'UID', 'Opponent', 'Win',
];

const NON_UPLOADER_LOOKUP = new Set(NON_UPLOADER_COLUMNS.map((c) => c.toLowerCase()));

/** True when a Match History column holds an uploader's footage URL. */
export function isUploaderColumn(column: string): boolean {
  return !NON_UPLOADER_LOOKUP.has(column.trim().toLowerCase());
}

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
