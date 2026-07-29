// Shape of data/player-stats.json, produced by scripts/fetch-player-stats.js.
// One record per guild member (resolved by pId from data/guild.json). The
// upstream account email is stripped at ingestion and never reaches this model.

export interface GearAttribute {
  name: string;
  value: number | null;
}

export interface GearAffix {
  name: string;
  value: number | null;
  tier: number | null;
}

export interface GearSlot {
  slot: string;
  equipItemId: number | null;
  name: string;
  slotName: string;
  tier: number | null;
  level: number | null;
  set: { id: number | null; name: string } | null;
  attributes: GearAttribute[];
  affixes: GearAffix[];
}

/** A player's own inner way + their current tier (level) in it. */
export interface PlayerInnerWay {
  id: number | null;
  name: string;
  tier: number | null;
}

export interface PlayerDetail {
  name: string;
  numberId: string | null;
  level: number | null;
  weaponMasteryMax: number | null;
  school: string | null;
  region: string | null;
  server: number | null;
  hostTag: string | null;
  gender: number | null;
  language: string | null;
  createTime: number | null;
  /** Online right now. Absent on records synced before activity was captured. */
  isOnline?: boolean;
  /** Last login, unix seconds. */
  loginTime?: number | null;
  /** Last logout, unix seconds — can be *newer* than loginTime. */
  logoutTime?: number | null;
  /** Cumulative seconds played (not a timestamp). */
  onlineTime?: number | null;
  eleganceScore?: number | null;
  gear: GearSlot[];
  innerWays: PlayerInnerWay[];
}

export type UnmatchedReason =
  | 'not_found'
  | 'name_mismatch'
  | 'region_mismatch'
  | 'no_detail'
  /** Backend sync only: the roster row has no PID, so it can't be looked up at all
   *  (wwmdb's IGN resolver is gone — see GUILD-API.md (private backend repo) §7). */
  | 'no_pid'
  | 'error';

export interface MatchedPlayerStats {
  ign: string;
  matched: true;
  player: PlayerDetail;
}

export interface UnmatchedPlayerStats {
  ign: string;
  matched: false;
  reason: UnmatchedReason;
  foundName?: string;
  foundRegion?: string;
}

export type PlayerStatsRecord = MatchedPlayerStats | UnmatchedPlayerStats;

// ── Live overlay (data/live-stats.json, from scripts/fetch-live-stats.js) ──────
// The same member data read straight from the game API every 30 minutes instead
// of hourly via wwmdb. Only the fields that API actually answers; everything
// else — school, elegance, inner ways, and every name — stays with the record
// above. PlayerStatsDataService merges the two before anything else sees them.

/** Volatile stats, all optional: a field the game API didn't return is left out
 *  entirely so the wwmdb value survives the merge. */
export interface LivePlayerStats {
  level?: number | null;
  weaponMasteryMax?: number | null;
  onlineTime?: number | null;
  loginTime?: number | null;
  logoutTime?: number | null;
  createTime?: number | null;
  region?: string | null;
  server?: number | null;
  language?: string | null;
  isOnline?: boolean;
}

export interface LiveStatsRecord {
  ign: string;
  /** Unix seconds — when this member was last swept. */
  fetchedAt: number;
  stats?: LivePlayerStats;
  /** Absent when the sweep got no gear (call failed, or the player hides their
   *  loadout in-game); the wwmdb gear is then left in place. */
  gear?: GearSlot[];
}
