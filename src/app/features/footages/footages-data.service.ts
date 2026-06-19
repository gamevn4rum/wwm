import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';
import { GoogleSheetsApiService } from '../../core/services/google-sheets/google-sheets-api.service';
import { environment } from '../../../environments/environment';
import { SheetRow } from '../../core/models/sheet.model';
import { FootageRecord, rowToFootages, toSortableDateValue } from './footages.model';

@Injectable({ providedIn: 'root' })
export class FootagesDataService {
  private readonly http      = inject(HttpClient);
  private readonly sheetsApi = inject(GoogleSheetsApiService);

  private readonly records$: Observable<FootageRecord[]> = this.http
    .get<SheetRow[]>(`data/footages.json?t=${Date.now()}`)
    .pipe(
      switchMap((rows) =>
        rows && rows.length > 0
          ? of(rows)
          : this.sheetsApi.getRows(environment.defaultSpreadsheetId, 'Footages!A:Z', environment.googleApiKey)
      ),
      catchError(() =>
        this.sheetsApi.getRows(environment.defaultSpreadsheetId, 'Footages!A:Z', environment.googleApiKey)
      ),
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
}
