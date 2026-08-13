// Shared sizing for the card screenshots (member grid, profile modal).
//
// html-to-image rasterizes the card into an SVG <foreignObject>, then draws that raster onto a canvas
// scaled by `pixelRatio`. Text sharpness therefore comes down to how many device pixels the card is
// sampled at — 2× is legible but soft on a dense card, and the two surfaces having their own hard-coded
// value is how one ends up visibly softer than the other.

/**
 * How much to oversample a card of this CSS size.
 *
 * Returns the largest ratio that keeps the output inside {@link PIXEL_BUDGET}, never below
 * {@link MIN_RATIO} and never above {@link MAX_RATIO}.
 *
 * ⚠ The budget is the point, not the ratio. A card's height varies hugely — an expanded member badge
 * with gear runs ~1500px tall — and a flat 3× on a tall card produces a canvas that Safari refuses
 * outright (it caps total area, not dimensions) and that Chrome turns into a multi-megabyte PNG.
 * Scaling by area keeps a short card sharp without letting a long one fail.
 *
 * ⚠ The floor is deliberately today's value: a card so large that even 2× exceeds the budget still
 * gets 2×, because that already works and quietly halving it would be a regression in the name of a
 * limit nothing has hit.
 */
export function captureScale(cssWidth: number, cssHeight: number): number {
  const area = Math.max(1, cssWidth) * Math.max(1, cssHeight);
  const affordable = Math.sqrt(PIXEL_BUDGET / area);
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, affordable));
}

/**
 * Device pixels one capture may produce.
 *
 * 12M sits under Safari's ~16.7M canvas area cap with room for the browser's own overhead, and keeps
 * a PNG in the low megabytes — a size that still pastes into Discord without being re-encoded.
 */
const PIXEL_BUDGET = 12_000_000;

/** Never sharper than this: past ~3× the gain stops being visible and only the file grows. */
const MAX_RATIO = 3;

/** Never softer than this — the value both cards used before, so nothing regresses. */
const MIN_RATIO = 2;
