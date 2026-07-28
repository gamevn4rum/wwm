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

/** Unix seconds → a coarse "5m / 4h / 3d ago"; falls back to the date once it's
 *  older than ~4 weeks. */
export function relativeTime(unixSeconds: number): string {
  const seconds = Date.now() / 1000 - unixSeconds;
  if (seconds < 60) return 'just now';
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = hours / 24;
  if (days < 28) return `${Math.floor(days)}d ago`;
  return formatUnixDate(unixSeconds);
}

/** Cumulative play seconds → "1,051h" (or "42m" under an hour). */
export function playtimeLabel(seconds: number | null | undefined): string {
  if (!seconds) return '—';
  const hours = seconds / 3600;
  if (hours < 1) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(hours).toLocaleString('en-GB')}h`;
}
