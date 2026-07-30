/**
 * Compare two IGNs for identity: case-insensitive and blind to spacing/hyphens,
 * because the roster and the game disagree on those for the same person
 * ("Hàn Tiên Tôn" vs "HànTiênTôn"). Diacritics are significant — they distinguish
 * genuinely different names. Mirrors MemberMapper.IgnMatches on the backend.
 */
export function ignMatches(a: string, b: string): boolean {
  const loose = (s: string) => s.replace(/[\s\-_.]/g, '').toLowerCase();
  return loose(a).length > 0 && loose(a) === loose(b);
}
