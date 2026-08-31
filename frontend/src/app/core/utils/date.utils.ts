/**
 * The one `dd/Mon/yyyy` the site writes dates in.
 *
 * Everything below reads UTC deliberately. A match dated `2026-05-19` is a calendar day,
 * not an instant, and `new Date('2026-05-19')` parses as UTC midnight — so a reader east
 * of Greenwich rendering it locally sees the 19th while a reader west of it sees the 18th.
 * The unix variants are genuine instants, but they are shown beside those calendar dates
 * and would disagree with them under any other zone.
 *
 * Four components used to declare `MONTH_ABBR` and this same eight-line function
 * privately, plus a fifth uppercase variant for the timeline. They never drifted, but
 * they also could not have been kept in step by anything but memory.
 */
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Uppercase, for the match-history timeline's period headings. */
export const MONTH_LABELS = MONTH_ABBR.map((m) => m.toUpperCase());

/** ISO date or datetime → `19/May/2026`. Returns the input unchanged if it isn't a date,
 *  which is what a half-typed value in an editor field should look like. */
export function formatIsoDate(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return stamp(d);
}

/** Unix *seconds* → `19/May/2026`, or an em dash for absent/unparseable. Seconds, not
 *  milliseconds: every unix value the API sends is in seconds. */
export function formatUnixDate(seconds: number | null | undefined): string {
  if (!seconds) return '—';
  const d = new Date(seconds * 1000);
  return Number.isNaN(d.getTime()) ? '—' : stamp(d);
}

function stamp(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${day}/${MONTH_ABBR[d.getUTCMonth()]}/${d.getUTCFullYear()}`;
}
