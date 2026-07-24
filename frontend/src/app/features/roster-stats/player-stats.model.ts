// Shape of data/player-stats.json, produced by scripts/fetch-player-stats.js.
// One record per roster IGN. The upstream account email is stripped at
// ingestion and never reaches this model.

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
  gear: GearSlot[];
  innerWays: PlayerInnerWay[];
}

export type UnmatchedReason =
  | 'not_found'
  | 'name_mismatch'
  | 'region_mismatch'
  | 'no_detail'
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
