// Presentation helpers for a player's build (gear + set bonuses), shared by the
// roster's member cards and the profile modal so the two can never disagree on
// what counts as an active set or how a tier is coloured.

import { GearSlot, PlayerDetail } from './player-stats.model';
import { SetCatalogueEntry } from './set-catalogue.model';

/**
 * How gear is laid out wherever a build is shown: four slots that can share a
 * set bonus, then the odd one out. The separator between them is structural —
 * the four armour pieces are typically one set, while the bow and the ring
 * stand alone. Weapons read primary-first.
 */
const GEAR_ROWS: { main: string[]; tail: string[] }[] = [
  { main: ['2', '1', '10', '11'], tail: ['21'] },
  { main: ['3', '4', '5', '8'],   tail: ['9'] },
];

export interface GearRow {
  main: GearSlot[];
  tail: GearSlot[];
}

/**
 * Gear arranged per GEAR_ROWS. Slots the player hasn't filled are skipped, and
 * anything outside the known layout (a fishing rod, a slot added by a patch)
 * lands in a final row of its own rather than vanishing.
 */
export function gearRows(p: PlayerDetail): GearRow[] {
  const bySlot = new Map(p.gear.map((g) => [String(g.slot), g]));
  const pick = (slots: string[]) =>
    slots.map((s) => bySlot.get(s)).filter((g): g is GearSlot => !!g);

  const rows = GEAR_ROWS
    .map((row) => ({ main: pick(row.main), tail: pick(row.tail) }))
    .filter((row) => row.main.length || row.tail.length);

  const placed = new Set(GEAR_ROWS.flatMap((r) => [...r.main, ...r.tail]));
  const leftover = p.gear.filter((g) => !placed.has(String(g.slot)));
  if (leftover.length) rows.push({ main: leftover, tail: [] });
  return rows;
}

/** A gear set with enough matching pieces equipped to have an active bonus. */
export interface ActiveSetEffect {
  set: SetCatalogueEntry;
  count: number;
  bonus2Active: boolean;
  bonus4Active: boolean;
  /** bonus2's level-scaled attribute(s), resolved to the player's actual level. */
  resolvedBonus2: { attrName: string; value: number }[];
}

/** Ordinal gear-rarity ramp (game convention): 1 grey → 5 gold. */
export function tierClass(tier: number | null | undefined): string {
  return `tier-${tier ?? 0}`;
}

// Schools get a fixed categorical palette (assigned by stable index, never a
// cycled/generated hue). Colour is never the sole cue — the school name is always
// shown beside it — so unknown schools safely fall back to a neutral slot.
const SCHOOL_PALETTE = [
  '#ad7a4c', // bronze  (--color-primary)
  '#7c9473', // sage    (--color-secondary)
  '#6e88a8', // blue    (--color-accent-blue)
  '#8b6f94', // plum    (--color-accent-plum)
  '#b5533d', // vermilion (--color-danger)
  '#a9822f', // gold
  '#5f8f86', // teal
  '#9c6b5a', // clay
];

/** Stable colour for a school name — the same school is the same colour everywhere. */
export function schoolColor(school: string | null): string {
  if (!school) return 'var(--color-ink-faint)';
  return SCHOOL_PALETTE[paletteIndex(school, SCHOOL_PALETTE.length)];
}

/**
 * Stable colour for a martial art, keyed on its raw id.
 *
 * Same palette and same hash as `schoolColor`, so an art has one colour across the whole site.
 * ⚠ The Discord bot mirrors this: `StatsPresenter.MartialArtChip` hashes the id's decimal text
 * through the identical `h * 31 + c` and picks the same palette slot, so an art that is teal here
 * is the teal square there. Change the hash or the palette order in one place and the two drift.
 *
 * Colour is never the only cue — the label is always drawn beside the chip — so a collision
 * between two arts costs nothing but a repeated hue.
 */
export function martialArtColor(id: number | null | undefined): string {
  if (id == null) return 'var(--color-ink-faint)';
  return SCHOOL_PALETTE[paletteIndex(String(id), SCHOOL_PALETTE.length)];
}

/** `h = h * 31 + c` over the key's text. Shared so every caller lands on the same slot. */
function paletteIndex(key: string, slots: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % slots;
}

/** Whole affix names that are really set-effect prose (long sentences). */
export function isEffectAffix(name: string): boolean {
  return name.trim().length > 40 || name.includes('.');
}

/**
 * Gear sets with 2+ matching pieces equipped (game convention: bonuses unlock at
 * 2 and 4 pieces). Multiple sets can be active simultaneously. Sets missing from
 * the catalogue are skipped — there is nothing to show for them.
 */
export function computeActiveSetEffects(
  p: PlayerDetail,
  setsById: Map<number, SetCatalogueEntry>,
): ActiveSetEffect[] {
  const counts = new Map<number, number>();
  for (const slot of p.gear) {
    if (slot.set?.id == null) continue;
    counts.set(slot.set.id, (counts.get(slot.set.id) ?? 0) + 1);
  }

  const results: ActiveSetEffect[] = [];
  for (const [setId, count] of counts) {
    if (count < 2) continue;
    const set = setsById.get(setId);
    if (!set) continue;
    results.push({
      set,
      count,
      bonus2Active: count >= 2,
      bonus4Active: count >= 4,
      resolvedBonus2: set.bonuses2.map((b) => ({
        attrName: b.attrName,
        value: resolveScaledValue(b.values, p.level),
      })),
    });
  }
  return results;
}

/** Pick the highest level-gated value the player's level actually qualifies for. */
function resolveScaledValue(
  values: { level: number | null; value: number | null }[],
  level: number | null,
): number {
  let best = 0;
  for (const v of values) {
    if (v.level == null || v.value == null) continue;
    if (level != null && v.level > level) continue;
    best = v.value;
  }
  return best;
}
