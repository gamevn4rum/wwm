/** Extracts an 11-char YouTube video ID from a raw URL or bare ID string. Returns '' if none found. */
export function extractYouTubeVideoId(raw: string): string {
  const value = raw.trim();
  if (!value) return '';

  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;

  const patterns = [
    /(?:v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:live\/)([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1];
  }

  return '';
}
