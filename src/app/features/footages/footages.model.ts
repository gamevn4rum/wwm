import { SheetRow } from '../../core/models/sheet.model';
import { findVal } from '../../core/utils/sheet.utils';

export type MatchType = 'League' | 'Ranked' | 'Scrim';
export type UploaderKey = 'Kam' | 'Necro' | 'VK' | 'Ruby' | 'Yuenshin' | 'Sniper' | 'canoc';

export interface FootageRecord {
  date: string;
  matchType: MatchType;
  opponent: string;
  uploader: UploaderKey;
  videoId: string;
}

const uploaders: UploaderKey[] = ['Kam', 'Necro', 'VK', 'Ruby', 'Yuenshin', 'Sniper', 'canoc'];

function normalizeMatchType(raw: string): MatchType {
  const lowered = raw.trim().toLowerCase();
  if (lowered === 'league') return 'League';
  if (lowered === 'scrim') return 'Scrim';
  return 'Ranked';
}

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseDateParts(raw: string): Date {
  const trimmed = raw.trim();
  if (!trimmed) return new Date(0);

  // ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  const slashParts = trimmed.split('/').map((p) => p.trim());
  if (slashParts.length === 3) {
    const [dd, mon, yy] = slashParts;
    // DD/MMM/YYYY (named month)
    const namedMonth = MONTH_MAP[mon.toLowerCase()];
    if (namedMonth !== undefined) {
      const year = yy.length === 2 ? Number(`20${yy}`) : Number(yy);
      return new Date(Date.UTC(year, namedMonth, Number(dd)));
    }
    // DD/MM/YYYY (numeric month fallback)
    const year = yy.length === 2 ? Number(`20${yy}`) : Number(yy);
    return new Date(Date.UTC(year, Number(mon) - 1, Number(dd)));
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

export function toSortableDateValue(raw: string): number {
  return parseDateParts(raw).getTime();
}

export function toIsoDate(raw: string): string {
  const parsed = parseDateParts(raw);
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() === 0) return raw.trim();

  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function extractYouTubeVideoId(raw: string): string {
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

export function rowToFootages(row: SheetRow): FootageRecord[] {
  const opponent = findVal(row, 'Opponent');
  if (!opponent) return [];

  const date = toIsoDate(findVal(row, 'Date'));
  const matchType = normalizeMatchType(findVal(row, 'Match Type') || findVal(row, 'Type'));

  return uploaders
    .map((uploader) => {
      const videoId = extractYouTubeVideoId(findVal(row, uploader));
      if (!videoId) return null;

      return {
        date,
        matchType,
        opponent,
        uploader,
        videoId,
      } satisfies FootageRecord;
    })
    .filter((record): record is FootageRecord => record !== null);
}
