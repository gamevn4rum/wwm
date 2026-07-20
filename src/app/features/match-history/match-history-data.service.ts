import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';
import { SheetRow } from '../../core/models/sheet.model';
import { findVal } from '../../core/utils/sheet.utils';
import { extractYouTubeVideoId } from '../../core/utils/youtube.utils';
import { environment } from '../../../environments/environment';
import { EncryptedPayload, decryptJson } from '../../core/utils/crypto.utils';
import { FootageEntry, MatchRecord, MatchType, UPLOADERS } from './match-record.model';

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Convert DD/MMM/YYYY (e.g. "19/May/2026") or DD/MM/YYYY → "2026-05-19" */
function parseDate(raw: string): string {
  const parts = raw.split('/');
  if (parts.length !== 3) return raw;
  const [dd, mon, yyyy] = parts;
  // Named month: DD/MMM/YYYY
  const namedIndex = MONTH_MAP[mon.toLowerCase()];
  if (namedIndex !== undefined) {
    const mm = String(namedIndex + 1).padStart(2, '0');
    return `${yyyy}-${mm}-${dd.padStart(2, '0')}`;
  }
  // Numeric month fallback: DD/MM/YYYY or DD/MM/YY
  const numericMonth = parseInt(mon, 10);
  if (!isNaN(numericMonth) && numericMonth >= 1 && numericMonth <= 12) {
    const fullYear = yyyy.length === 2 ? `20${yyyy}` : yyyy;
    const mm = String(numericMonth).padStart(2, '0');
    return `${fullYear}-${mm}-${dd.padStart(2, '0')}`;
  }
  return raw;
}

function rowToFootages(row: SheetRow): FootageEntry[] {
  return UPLOADERS
    .map((uploader) => {
      const videoId = extractYouTubeVideoId(findVal(row, uploader));
      return videoId ? ({ uploader, videoId } satisfies FootageEntry) : null;
    })
    .filter((entry): entry is FootageEntry => entry !== null);
}

function rowToMatchRecord(row: SheetRow): MatchRecord | null {
  const opponent = findVal(row, 'opponent');
  if (!opponent) return null;

  const rawType = findVal(row, 'type').toLowerCase();
  const type: MatchType =
    rawType === 'league' ? 'league' :
    rawType === 'scrim'  ? 'scrim'  :
    'ranked';

  const win = findVal(row, 'win');
  const status: MatchRecord['status'] =
    win === '✅' ? '✅' :
    win === '❌' ? '❌' :
    '➕';

  return {
    date:     parseDate(findVal(row, 'date')),
    opponent,
    type,
    status,
    season:   findVal(row, 'season'),
    footages: rowToFootages(row),
  };
}

@Injectable({ providedIn: 'root' })
export class MatchHistoryDataService {
  private readonly http = inject(HttpClient);

  private readonly records$: Observable<MatchRecord[]> = this.loadRows().pipe(
    map((rows) =>
      rows
        .map(rowToMatchRecord)
        .filter((r): r is MatchRecord => r !== null)
        .sort((a, b) => b.date.localeCompare(a.date))
    ),
    shareReplay(1)
  );

  getMatches(): Observable<MatchRecord[]> {
    return this.records$;
  }

  private loadRows(): Observable<SheetRow[]> {
    const key = environment.dataEncryptionKey;

    // Static-only: no in-browser Sheets API fallback (that would require the
    // API key in the bundle). Fail closed with an empty list on any error.
    if (!key) {
      // Dev: plaintext file.
      return this.http.get<SheetRow[]>(`data/match-history.json?t=${Date.now()}`).pipe(
        catchError(() => of<SheetRow[]>([])),
      );
    }

    // Prod: fetch the encrypted file and decrypt it.
    return this.http.get<EncryptedPayload>(`data/match-history.enc?t=${Date.now()}`).pipe(
      switchMap((payload) => from(decryptJson<SheetRow[]>(payload, key))),
      catchError(() => of<SheetRow[]>([])),
    );
  }
}
