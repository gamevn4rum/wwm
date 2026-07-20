// Shape of data/inner-ways.json, produced by scripts/fetch-player-stats.js
// (static game-data catalogue, not player-specific).

export interface InnerWayEffectType {
  id: number | null;
  name: string;
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
  /** Cumulative effect text at full advancement — NOT necessarily this player's current state (uprank progress isn't exposed by the live Player() call). */
  maxEffect: string | null;
}
