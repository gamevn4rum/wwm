// Presentation helpers for a player's build (gear + set bonuses), shared by the
// roster's member cards and the profile modal so the two can never disagree on
// what counts as an active set or how a tier is coloured.

import { PlayerDetail } from './player-stats.model';
import { SetCatalogueEntry } from './set-catalogue.model';

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
  let h = 0;
  for (let i = 0; i < school.length; i++) h = (h * 31 + school.charCodeAt(i)) >>> 0;
  return SCHOOL_PALETTE[h % SCHOOL_PALETTE.length];
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
