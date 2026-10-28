/**
 * The martial paths a member can be filed under, matching the API's `MemberPath` ids.
 *
 * The eleven real paths are the slugs the artwork is named by (`public/icons/paths/<slug>.png`,
 * with a 54px copy under `small/`). Wings' badge is cut from an in-game screenshot, the official
 * site naming an image it has not published; its two art ids arrived with the official list on
 * 2026-10-28, so the API derives it like any other path now.
 *
 * The three mixes are the guild's own way of filing a member holding arts from two paths of one
 * family, so the game has no badge for them: each wears the badge of a path of that family on a red
 * backdrop (`discord-vault tools/app-emoji/mix.py`), which keeps the family readable and says "not
 * one path" without a second shape to learn. ⚠ They are drawn for a path an officer SET; the API
 * never derives a mix, so nothing the scout reads can land on one.
 *
 * ⚠ `umbra-mix` reads "Bellstrike Mix": it was first named for the path it leans on and then
 * renamed for its family, as its two siblings always were, and the id stayed as it was stored —
 * members are filed under it, its artwork is named by it, and so is the bot's uploaded badge.
 */
export interface MartialPathOption {
  value: string;
  label: string;
  /** Letters for the placeholder chip, used when there is no artwork. */
  initials: string;
  /** Whether `icons/paths/small/<value>.png` is expected to exist. */
  hasIcon: boolean;
}

export const MARTIAL_PATHS: readonly MartialPathOption[] = [
  { value: 'bellstrike-splendor', label: 'Bellstrike - Splendor', initials: 'BS', hasIcon: true },
  { value: 'bellstrike-umbra', label: 'Bellstrike - Umbra', initials: 'BU', hasIcon: true },
  { value: 'stonesplit-might', label: 'Stonesplit - Might', initials: 'SM', hasIcon: true },
  { value: 'stonesplit-strength', label: 'Stonesplit - Strength', initials: 'SS', hasIcon: true },
  { value: 'bamboocut-wind', label: 'Bamboocut - Wind', initials: 'BW', hasIcon: true },
  { value: 'bamboocut-dust', label: 'Bamboocut - Dust', initials: 'BD', hasIcon: true },
  { value: 'bamboocut-kite', label: 'Bamboocut - Kite', initials: 'BK', hasIcon: true },
  { value: 'bamboocut-draught', label: 'Bamboocut - Draught', initials: 'BG', hasIcon: true },
  { value: 'silkbind-jade', label: 'Silkbind - Jade', initials: 'SJ', hasIcon: true },
  { value: 'silkbind-deluge', label: 'Silkbind - Deluge', initials: 'SD', hasIcon: true },
  { value: 'silkbind-wings', label: 'Silkbind - Wings', initials: 'W', hasIcon: true },
  { value: 'umbra-mix', label: 'Bellstrike Mix', initials: 'BeM', hasIcon: true },
  { value: 'bamboocut-mix', label: 'Bamboocut Mix', initials: 'BM', hasIcon: true },
  { value: 'silkbind-mix', label: 'Silkbind Mix', initials: 'SM', hasIcon: true },
];

/** For a `<select>`: "—" first, then every path. */
export const MARTIAL_PATH_CHOICES: readonly { value: string; label: string }[] = [
  { value: '', label: '—' },
  ...MARTIAL_PATHS.map((p) => ({ value: p.value, label: p.label })),
];

export function martialPathOption(slug: string | null | undefined): MartialPathOption | null {
  return slug ? (MARTIAL_PATHS.find((p) => p.value === slug) ?? null) : null;
}

/** The small artwork for a path, or null when it has none. */
export function martialPathIcon(slug: string | null | undefined): string | null {
  const option = martialPathOption(slug);
  return option?.hasIcon ? `icons/paths/small/${option.value}.png` : null;
}
