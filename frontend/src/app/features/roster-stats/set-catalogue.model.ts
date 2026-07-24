// Shape of data/sets.json, produced by scripts/fetch-player-stats.js
// (static game-data catalogue, not player-specific).

export interface SetBonus2Value {
  level: number | null;
  value: number | null;
}

/** A player-level-scaled stat bonus, active once 2+ pieces of the set are equipped. */
export interface SetBonus2 {
  attrId: number | null;
  attrName: string;
  values: SetBonus2Value[];
}

/** A named proc/passive effect, active once all 4 pieces of the set are equipped. */
export interface SetBonus4 {
  id: number | null;
  name: string;
  description: string;
}

export interface SetCatalogueEntry {
  id: number | null;
  name: string;
  shortName: string;
  bonuses2: SetBonus2[];
  bonuses4: SetBonus4[];
}
