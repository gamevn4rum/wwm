import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of } from 'rxjs';
import { catchError, shareReplay, switchMap } from 'rxjs/operators';
import { GoogleSheetsApiService } from './google-sheets/google-sheets-api.service';
import { SheetRow } from '../models/sheet.model';
import { environment } from '../../../environments/environment';
import { EncryptedPayload, decryptJson } from '../utils/crypto.utils';

@Injectable({ providedIn: 'root' })
export class MembersDataService {
  private readonly http = inject(HttpClient);
  private readonly sheetsApi = inject(GoogleSheetsApiService);

  private readonly rows$: Observable<SheetRow[]> = this.loadRows().pipe(shareReplay(1));

  getRows(): Observable<SheetRow[]> {
    return this.rows$;
  }

  private loadRows(): Observable<SheetRow[]> {
    const key = environment.dataEncryptionKey;
    const sheets$ = this.sheetsApi.getRows(environment.defaultSpreadsheetId, 'Members!A:Z', environment.googleApiKey);

    if (!key) {
      // Dev: fetch plaintext, fall back to Sheets API.
      return this.http.get<SheetRow[]>(`data/members.json?t=${Date.now()}`).pipe(
        switchMap((rows) => (rows?.length ? of(rows) : sheets$)),
        catchError(() => sheets$),
      );
    }

    // Prod: fetch encrypted file and decrypt; fall back to Sheets API on any error.
    return this.http.get<EncryptedPayload>(`data/members.enc?t=${Date.now()}`).pipe(
      switchMap((payload) => from(decryptJson<SheetRow[]>(payload, key))),
      catchError(() => sheets$),
    );
  }
}
