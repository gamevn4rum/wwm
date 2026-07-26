import { SheetRow } from '../models/sheet.model';

/**
 * Case-insensitive column lookup on a sheet row.
 * Returns an empty string when the key is not found or the value is null.
 */
export function findVal(row: SheetRow, key: string): string {
  const match = Object.keys(row).find((k) => k.toLowerCase() === key.toLowerCase());
  const val = match ? row[match] : null;
  return val != null ? String(val).trim() : '';
}

/**
 * A roster row counts as *registered* once it carries a Discord handle; rows seeded
 * from the in-game guild start with an empty Discord and read as "Unregistered".
 *
 * Two shapes to cover: the raw Members sheet (has a Discord column) and the backend's
 * public roster projection, which deliberately withholds Discord and sends the derived
 * `Registered` flag instead — so check the explicit flag first and only then infer.
 */
export function isRegisteredRow(row: SheetRow): boolean {
  const flag = findVal(row, 'registered');
  if (flag !== '') return flag.toLowerCase() === 'true';
  return findVal(row, 'discord') !== '';
}

/**
 * Compare two IGNs for identity: case-insensitive and blind to spacing/hyphens,
 * because the sheet and the game disagree on those for the same person
 * ("Hàn Tiên Tôn" vs "HànTiênTôn"). Diacritics are significant — they distinguish
 * genuinely different names. Mirrors MemberMapper.IgnMatches on the backend.
 */
export function ignMatches(a: string, b: string): boolean {
  const loose = (s: string) => s.replace(/[\s\-_.]/g, '').toLowerCase();
  return loose(a).length > 0 && loose(a) === loose(b);
}

/**
 * In-game UIDs are zero-padded ("0013465584") but a spreadsheet cell that was ever
 * numeric comes back stripped ("13465584"), so every comparison drops leading zeros.
 * Mirrors MemberMapper.NormalizeUid on the backend.
 */
export function normalizeUid(uid: string): string {
  const trimmed = uid.trim().replace(/^0+/, '');
  return trimmed.length === 0 && uid.trim().length > 0 ? '0' : trimmed;
}
