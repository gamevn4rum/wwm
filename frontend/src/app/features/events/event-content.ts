import { SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

/**
 * How an article's body becomes HTML.
 *
 * An article is authored as HTML with the literal tokens `[P1]`..`[P5]` standing in for images. Each
 * token is replaced by an `<img>` pointing at the matching image URL, and the whole result is then
 * sanitized.
 *
 * This lives apart from either component because **two** places render it: the public feed on
 * `/schedule`, and the preview in the Manage editor. A preview that substituted or sanitized even
 * slightly differently from the page would be worse than no preview at all — it would show an author
 * something other than what they are about to publish.
 */

/** The image slots an article can carry, in token order. Five, matching the `P1`..`P5` columns. */
export const IMAGE_SLOTS = ['p1', 'p2', 'p3', 'p4', 'p5'] as const;

export type ImageSlot = (typeof IMAGE_SLOTS)[number];

/** `'p1'` → `'[P1]'`. Tokens are exact-match and uppercase — `[p1]` is left as text. */
export function tokenFor(slot: ImageSlot): string {
  return `[${slot.toUpperCase()}]`;
}

/** The class every substituted image carries. The feed's stylesheet sizes it, and its click
 *  delegation looks for it to open the lightbox. */
export const CONTENT_IMG_CLASS = 'event-content-img';

/**
 * Substitute the image tokens, then sanitize.
 *
 * A slot with no URL is left alone rather than removed: it reads as an unfinished draft, which is
 * exactly what it is, instead of silently vanishing. A token that appears twice yields the image
 * twice — `split`/`join` replaces every occurrence.
 */
export function buildEventHtml(
  description: string,
  images: Partial<Record<ImageSlot, string | null>>,
  sanitizer: DomSanitizer,
): string {
  // Angular's sanitizer rather than bypassSecurityTrustHtml. Safe markup — <img>, basic
  // formatting, the content-image class — survives; <script>, onerror/onclick and the rest are
  // stripped. That is what stops an author, or anything that reaches the description column,
  // from running JS in every visitor's browser.
  return sanitizer.sanitize(SecurityContext.HTML, substituteImages(description, images)) ?? '';
}

/**
 * The substitution step alone, before anything is sanitized.
 *
 * Exported because the editor needs both halves separately: it compares this against the sanitized
 * result to tell an author when the sanitizer dropped one of their tags. Re-implementing it there
 * would mean the comparison drifted from the substitution it is meant to be measuring.
 */
export function substituteImages(
  description: string,
  images: Partial<Record<ImageSlot, string | null>>,
): string {
  let html = description ?? '';

  for (const slot of IMAGE_SLOTS) {
    const url = images[slot];
    if (!url) continue;
    // Escape the URL before it lands in an attribute value, so it cannot break out of src=""
    // with something like  x" onerror="…  . The API only stores absolute http(s) URLs, but this
    // renders whatever it is handed — including a half-typed one in the editor's preview.
    const safeUrl = escapeAttr(url);
    html = html
      .split(tokenFor(slot))
      .join(`<img src="${safeUrl}" class="${CONTENT_IMG_CLASS}" alt="" />`);
  }

  return html;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
