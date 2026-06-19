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
