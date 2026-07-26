// Formatting shared by the Guild page and the header's overview tiles, so the two
// can't drift (they show the same numbers in different places).

/** Large point totals → "31.7k" so they fit a tile / roster row. */
export function compactNumber(value: number | null | undefined): string {
  if (value == null) return '—';
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value));
}

/** Unix seconds → "05 Sep 2024" (— when absent). */
export function formatUnixDate(unixSeconds: number | null | undefined): string {
  if (!unixSeconds) return '—';
  return new Date(unixSeconds * 1000).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}
