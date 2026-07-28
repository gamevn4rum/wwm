// Fonts for the card screenshots — the profile modal's, and the Formation
// member card's share button.
//
// html-to-image renders into an SVG <foreignObject>, which is an isolated
// context: web fonts only apply if their @font-face rules travel with it. Left
// to itself the library embeds every face it can see — for this app that is
// Cormorant Garamond, Inter, Noto Serif SC, Noto Sans SC across ~450 unicode
// ranges, plus five decorative .otf/.ttf files in public/fonts — and capture
// took ~12s.
//
// So we hand it exactly what the card uses: the two families it renders in, in
// the Latin/Vietnamese subsets its content actually needs. Built once per
// session and cached; on failure we return '' and the PNG falls back to system
// faces rather than the button erroring.

const FONT_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700'
  + '&family=Inter:wght@400;500;600;700&display=swap';

/** Google's CSS labels each block with a `/* subset *\/` comment. Roster IGNs are
 *  Latin and Vietnamese; CJK, Cyrillic and Greek would be dead weight. */
const KEEP_SUBSET = /latin|vietnamese/;

let cached: Promise<string> | null = null;

export function cardFontCss(): Promise<string> {
  cached ??= build();
  return cached;
}

async function build(): Promise<string> {
  try {
    const res = await fetch(FONT_CSS_URL);
    if (!res.ok) return '';
    const css = await res.text();

    const blocks = css.split('/*').slice(1).map((b) => `/*${b}`);
    const wanted = blocks.filter((b) => KEEP_SUBSET.test(b.slice(0, b.indexOf('*/'))));
    const inlined = await Promise.all(wanted.map(inlineFontUrl));
    return inlined.filter(Boolean).join('\n');
  } catch {
    return '';
  }
}

/** Replace the remote woff2 URL in one @font-face block with a data: URI. */
async function inlineFontUrl(block: string): Promise<string> {
  const match = block.match(/url\((https:\/\/[^)]+)\)/);
  if (!match) return block;
  try {
    const res = await fetch(match[1]);
    if (!res.ok) return '';
    return block.replace(match[1], `data:font/woff2;base64,${toBase64(await res.arrayBuffer())}`);
  } catch {
    return '';
  }
}

/** Chunked so a font file can't blow the argument limit of String.fromCharCode. */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}
