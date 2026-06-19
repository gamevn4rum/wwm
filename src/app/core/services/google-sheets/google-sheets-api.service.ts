import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SheetRange, SheetRow } from '../../models/sheet.model';

@Injectable({ providedIn: 'root' })
export class GoogleSheetsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets';

  getRange(spreadsheetId: string, range: string, apiKey: string): Observable<SheetRange> {
    const params = new HttpParams().set('key', apiKey);
    return this.http.get<SheetRange>(
      `${this.baseUrl}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
      { params }
    );
  }

  getRows(spreadsheetId: string, range: string, apiKey: string): Observable<SheetRow[]> {
    return this.getRange(spreadsheetId, range, apiKey).pipe(
      map(({ values }) => {
        if (!values || values.length < 2) return [];
        const [headers, ...rows] = values;
        return rows.map((row) =>
          headers.reduce<SheetRow>((acc, key, i) => {
            acc[key] = row[i] ?? null;
            return acc;
          }, {})
        );
      })
    );
  }
}

