// Presentation helpers for a player's build (gear + set bonuses), shared by the
// roster's member cards and the profile modal so the two can never disagree on
// what counts as an active set or how a tier is coloured.

import { signal } from '@angular/core';

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
 * Slots deliberately not shown.
 *
 * `105` is the Fishing Rod: half the roster has one, it carries no set and nothing anyone compares
 * builds on, so it only ever appeared as a lone tile in the leftover row and made every card taller
 * for no information. Hidden rather than deleted upstream — the API still sends it, and it goes back
 * on display by removing it from this set the moment it means something.
 */
const HIDDEN_GEAR_SLOTS = new Set(['105']);

/**
 * The gear worth showing — everything except {@link HIDDEN_GEAR_SLOTS}.
 *
 * The one place the hiding happens, so a count, a layout and a set bonus can never disagree about
 * what a player is wearing. Read this instead of `p.gear` anywhere gear is displayed or tallied.
 */
export function visibleGear(p: PlayerDetail): GearSlot[] {
  return p.gear.filter((g) => !HIDDEN_GEAR_SLOTS.has(String(g.slot)));
}

/**
 * Gear arranged per GEAR_ROWS. Slots the player hasn't filled are skipped, and
 * anything outside the known layout (a slot added by a patch) lands in a final
 * row of its own rather than vanishing.
 */
export function gearRows(p: PlayerDetail): GearRow[] {
  const gear = visibleGear(p);
  const bySlot = new Map(gear.map((g) => [String(g.slot), g]));
  const pick = (slots: string[]) =>
    slots.map((s) => bySlot.get(s)).filter((g): g is GearSlot => !!g);

  const rows = GEAR_ROWS
    .map((row) => ({ main: pick(row.main), tail: pick(row.tail) }))
    .filter((row) => row.main.length || row.tail.length);

  const placed = new Set(GEAR_ROWS.flatMap((r) => [...r.main, ...r.tail]));
  const leftover = gear.filter((g) => !placed.has(String(g.slot)));
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
 * Colour for a martial art — its path's, so both arts of a path share one.
 *
 * The backend's colour is authoritative and now always present for an art that has a path. ⚠ It is a
 * **family** colour: the two paths of a family are the same hue, deliberately, because the game's own
 * badge artwork colours them that way. What separates two paths of a family is the icon, so never draw
 * this colour as the only cue — the label is always beside it here.
 *
 * The hashed fallback survives for an art with **no** path (a discipline the backend's table has not
 * placed yet), keyed on the art id so it at least stays stable. ⚠ The bot mirrors that fallback in
 * `StatsPresenter.MartialArtChip` through the identical `h * 31 + c` into the same palette order;
 * change the hash, the key or the palette order in one place and the two drift.
 */
export function martialArtColor(
  pathColor: string | null | undefined,
  pathSlug: string | null | undefined,
  id: number | null | undefined,
): string {
  if (pathColor) return pathColor;
  const key = pathSlug ?? (id == null ? null : String(id));
  if (key == null) return 'var(--color-ink-faint)';
  return SCHOOL_PALETTE[paletteIndex(key, SCHOOL_PALETTE.length)];
}

/**
 * The path's icon, hosted by us, or null for an art with no path.
 *
 * Built from the slug rather than sent by the API: the artwork lives in this repo under
 * `public/icons/paths/`, so the backend has no business knowing which files we shipped. It came off a
 * community wiki, and pointing live at that wiki made every profile depend on a host nobody here
 * controls.
 *
 * ⚠ Returning a path is **not** a promise the file exists — three of the nine were never archived and
 * have no artwork. Callers must handle a load failure (see the profile modal's `onIconError`); the
 * colour and the label already carry the meaning without it.
 */
export function martialArtIcon(pathSlug: string | null | undefined): string | null {
  return pathSlug ? `icons/paths/${pathSlug}.png` : null;
}

/**
 * Path icons the browser could not load, shared by every surface that draws them.
 *
 * Three of the nine paths have no artwork, so a miss is expected rather than exceptional. Module
 * scope rather than per-component state on purpose: the member grid and the profile modal draw the
 * same icons, and a failure one of them already discovered should not have to be rediscovered — and
 * re-requested — by the other. A signal so reading it in a template makes the component redraw when
 * one drops out.
 */
const deadMartialArtIcons = signal<ReadonlySet<string>>(new Set());

/** Records an icon as unloadable. Idempotent: a repeated failure allocates nothing. */
export function noteMartialArtIconFailed(url: string): void {
  deadMartialArtIcons.update((dead) => (dead.has(url) ? dead : new Set(dead).add(url)));
}

/** One of a member's martial arts, ready to draw. */
export interface MartialArtChip {
  id: number;
  label: string;
  color: string;
  /** The path's display name, or null for an art no path covers. For a tooltip. */
  path: string | null;
  /** Withheld once the browser has failed to load it — see {@link noteMartialArtIconFailed}. */
  iconUrl: string | null;
}

/**
 * A member's martial arts, in slot order, ready to draw as chips.
 *
 * Deliberately unlabelled as "1" and "2": which slot an art sits in is a storage detail, not
 * something a reader is asking. The order still carries it (primary first). Absent slots are dropped
 * rather than drawn empty — most members have both, and a lone chip is a truer statement than a chip
 * beside a dash.
 *
 * Colour and icon are resolved here rather than in a template so a chip's colour and its label are
 * read off one slot together; a template calling helpers per chip can pair a colour with the wrong
 * art's label the moment the slots are reordered.
 */
export function martialArts(p: PlayerDetail): MartialArtChip[] {
  const dead = deadMartialArtIcons();
  const slots = [
    {
      id: p.martialArt1,
      label: p.martialArt1Label,
      slug: p.martialArt1Path,
      color: p.martialArt1PathColor,
      path: p.martialArt1PathLabel,
    },
    {
      id: p.martialArt2,
      label: p.martialArt2Label,
      slug: p.martialArt2Path,
      color: p.martialArt2PathColor,
      path: p.martialArt2PathLabel,
    },
  ];

  return slots
    .filter((s) => s.id != null)
    .map((s) => {
      const icon = martialArtIcon(s.slug);
      return {
        id: s.id as number,
        label: s.label || `#${s.id}`,
        color: martialArtColor(s.color, s.slug, s.id),
        path: s.path ?? null,
        iconUrl: icon && !dead.has(icon) ? icon : null,
      };
    });
}

/**
 * The build in the words a card shows: the path's name, or that the two arts cross paths.
 *
 * ⚠ Null for anything the backend left unclassified — one art on file, or an art its path table has
 * not placed. Showing "Mixed" there would report a gap in that table as a choice the member made, and
 * each art's own path label is still drawn either way.
 */
export function martialArtBuild(p: PlayerDetail): string | null {
  if (p.martialArtBuild === 'Path') return p.martialArtPathLabel || 'Path';
  return p.martialArtBuild === 'Mixed' ? 'Mixed' : null;
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
  // visibleGear, not p.gear: a hidden piece must not be able to complete a set the card then cannot
  // account for. The Fishing Rod carries no set today, so this changes nothing — it is here so that
  // hiding a piece which *does* carry one stays consistent instead of quietly inflating a bonus.
  for (const slot of visibleGear(p)) {
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
