import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';
import { GoogleSheetsApiService } from '../../core/services/google-sheets/google-sheets-api.service';
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
    footages: rowToFootages(row),
  };
}

@Injectable({ providedIn: 'root' })
export class MatchHistoryDataService {
  private readonly http      = inject(HttpClient);
  private readonly sheetsApi = inject(GoogleSheetsApiService);

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
    const key     = environment.dataEncryptionKey;
    const sheets$ = this.sheetsApi.getRows(environment.defaultSpreadsheetId, 'Match History!A:Z', environment.googleApiKey);

    if (!key) {
      // Dev: fetch plaintext, fall back to Sheets API.
      return this.http.get<SheetRow[]>(`data/match-history.json?t=${Date.now()}`).pipe(
        switchMap((rows) => (rows?.length ? of(rows) : sheets$)),
        catchError(() => sheets$),
      );
    }

    // Prod: fetch encrypted file and decrypt; fall back to Sheets API on any error.
    return this.http.get<EncryptedPayload>(`data/match-history.enc?t=${Date.now()}`).pipe(
      switchMap((payload) => from(decryptJson<SheetRow[]>(payload, key))),
      catchError(() => sheets$),
    );
  }
}
