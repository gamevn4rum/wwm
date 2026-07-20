// Shape of data/inner-ways.json, produced by scripts/fetch-player-stats.js
// (static game-data catalogue, not player-specific).

export interface InnerWayEffectType {
  id: number | null;
  name: string;
}

export interface InnerWayAttribute {
  name: string;
  value: number;
}

/** One of wwmdb's own "Tier 1..N" advancement tabs — further account-bound upgrades beyond the base tier. */
export interface InnerWayUprank {
  id: number | null;
  worldLevel: number | null;
  /** What's new at this rank specifically. */
  desc: string;
  /** Cumulative effect through this rank (reads as the full stacked effect, not a delta). */
  briefDesc: string;
  passiveSkill: { id: number | null; name: string; description: string } | null;
  fixedAttributes: InnerWayAttribute[];
  dynamicAttributes: InnerWayAttribute[];
}

export interface InnerWayCatalogueEntry {
  id: number | null;
  name: string;
  tier: number | null;
  path: { id: number | null; name: string } | null;
  weapon: { id: number | null; name: string } | null;
  effectTypes: InnerWayEffectType[];
  /** Flavour/lore text — not a mechanical effect. */
  lore: string;
  /** Base passive's mechanical effect, matching a player's live `tier`. */
  effect: string;
  maxAdvancedLevel: number | null;
  /** One entry per advancement rank — NOT necessarily reflecting this player's actual progress (that isn't exposed by the live Player() call). */
  upranks: InnerWayUprank[];
}
