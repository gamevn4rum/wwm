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
}
