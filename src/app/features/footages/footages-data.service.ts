import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';
import { GoogleSheetsApiService } from '../../core/services/google-sheets/google-sheets-api.service';
import { environment } from '../../../environments/environment';
import { SheetRow } from '../../core/models/sheet.model';
import { FootageRecord, rowToFootages, toSortableDateValue } from './footages.model';
import { EncryptedPayload, decryptJson } from '../../core/utils/crypto.utils';

@Injectable({ providedIn: 'root' })
export class FootagesDataService {
  private readonly http      = inject(HttpClient);
  private readonly sheetsApi = inject(GoogleSheetsApiService);

  private readonly records$: Observable<FootageRecord[]> = this.loadRows().pipe(
    map((rows) =>
      rows
        .flatMap((row) => rowToFootages(row))
        .sort((a, b) => toSortableDateValue(b.date) - toSortableDateValue(a.date))
    ),
    shareReplay(1)
  );

  getFootages(): Observable<FootageRecord[]> {
    return this.records$;
  }

  private loadRows(): Observable<SheetRow[]> {
    const key     = environment.dataEncryptionKey;
    const sheets$ = this.sheetsApi.getRows(environment.defaultSpreadsheetId, 'Footages!A:Z', environment.googleApiKey);

    if (!key) {
      // Dev: fetch plaintext, fall back to Sheets API.
      return this.http.get<SheetRow[]>(`data/footages.json?t=${Date.now()}`).pipe(
        switchMap((rows) => rows?.length ? of(rows) : sheets$),
        catchError(() => sheets$),
      );
    }

    // Prod: fetch encrypted file and decrypt; fall back to Sheets API on any error.
    return this.http.get<EncryptedPayload>(`data/footages.enc?t=${Date.now()}`).pipe(
      switchMap((payload) => from(decryptJson<SheetRow[]>(payload, key))),
      catchError(() => sheets$),
    );
  }
}
