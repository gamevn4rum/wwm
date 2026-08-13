// Shape served by GET /api/member/player-stats.
// One record per roster member, keyed by the roster IGN. The
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
  /**
   * The two martial-art slots, as raw ids over ONE id space — the same id can be one member's
   * primary and another's secondary.
   *
   * ⚠ Not weapons. The hand-entered MainWeapon/SecondaryWeapon on the roster is the item; this
   * is the discipline, and neither follows from the other (one id was found across five
   * different weapons). The `*Label` fields are resolved server-side; all eighteen ids in use are
   * named, and anything outside that arrives as the raw id `#10102` rather than a guess.
   */
  martialArt1?: number | null;
  martialArt2?: number | null;
  martialArt1Label?: string | null;
  martialArt2Label?: string | null;
  /**
   * The path behind each art — a named pair of arts meant to be trained together, nine of them
   * over the eighteen arts.
   *
   * Carried per art rather than once per member so a *mixed* build still draws each half in its own
   * path's colour. ⚠ A path is NOT derivable from the id: the prefix groups by weapon class and the
   * paths cut across it (Stormbreaker Spear `20103` is Stonesplit while every other spear is
   * Bellstrike). The backend's `MartialArtPath` table is the only thing that knows, which is why
   * the slug and its styling arrive resolved.
   */
  martialArt1Path?: string | null;
  martialArt2Path?: string | null;
  martialArt1PathLabel?: string | null;
  martialArt2PathLabel?: string | null;
  /**
   * Each art's colour, inherited from its path. Still null until the backend's path table has them —
   * see `martialArtColor`, which falls back rather than drawing a blank.
   *
   * ⚠ No icon URL arrives. The artwork is hosted here (`public/icons/paths/<slug>.png`) and resolved
   * from the slug by `martialArtIcon`, because the images came off a community wiki and pointing live
   * at it made every profile depend on a host nobody here controls.
   */
  martialArt1PathColor?: string | null;
  martialArt2PathColor?: string | null;
  /**
   * `'Path'` when both arts belong to one path, `'Mixed'` when they cross two.
   *
   * ⚠ Null is not `'Mixed'` — it means unclassified: one art on file, or an art the backend's path
   * table has not placed. Drawing "Mixed" there would report a gap in the table as a deliberate
   * cross-path choice.
   */
  martialArtBuild?: 'Path' | 'Mixed' | null;
  /** The path both arts share, ready to draw. Non-null exactly when `martialArtBuild` is
   *  `'Path'`. */
  martialArtPathLabel?: string | null;
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
