import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { GoogleSheetsApiService } from './google-sheets-api.service';
import { SheetRow } from '../../models/sheet.model';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SheetDataService {
  private readonly api = inject(GoogleSheetsApiService);
  private readonly http = inject(HttpClient);

  readonly rows = signal<SheetRow[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  loadSheet(spreadsheetId: string, range: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getRows(spreadsheetId, range, environment.googleApiKey).subscribe({
      next: (data) => {
        this.rows.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.message ?? 'Failed to load sheet data.');
        this.loading.set(false);
      },
    });
  }

  loadSheetWithFallback(jsonFile: string, range: string): void {
    this.loading.set(true);
    this.error.set(null);
    const fromApi$ = this.api.getRows(
      environment.defaultSpreadsheetId,
      range,
      environment.googleApiKey
    );
    this.http.get<SheetRow[]>(`data/${jsonFile}`).pipe(
      switchMap((rows) => (rows && rows.length > 0 ? of(rows) : fromApi$)),
      catchError(() => fromApi$),
    ).subscribe({
      next: (data) => {
        this.rows.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.message ?? 'Failed to load sheet data.');
        this.loading.set(false);
      },
    });
  }
}
