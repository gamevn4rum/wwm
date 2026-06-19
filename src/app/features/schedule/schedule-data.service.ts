import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';
import { GoogleSheetsApiService } from '../../core/services/google-sheets/google-sheets-api.service';
import { SheetRow } from '../../core/models/sheet.model';
import { findVal } from '../../core/utils/sheet.utils';
import { environment } from '../../../environments/environment';
import { ScheduleRecord } from './schedule-record.model';

function rowToScheduleRecord(row: SheetRow): ScheduleRecord | null {
  const activity = findVal(row, 'activity');
  if (!activity) return null;

  return {
    dateTime: findVal(row, 'datetime'),
    type:     findVal(row, 'type'),
    activity,
  };
}

@Injectable({ providedIn: 'root' })
export class ScheduleDataService {
  private readonly http      = inject(HttpClient);
  private readonly sheetsApi = inject(GoogleSheetsApiService);

  private readonly records$: Observable<ScheduleRecord[]> = this.http
    .get<SheetRow[]>(`data/schedule.json?t=${Date.now()}`)
    .pipe(
      switchMap((rows) =>
        rows && rows.length > 0
          ? of(rows)
          : this.sheetsApi.getRows(environment.defaultSpreadsheetId, 'Schedule!A:Z', environment.googleApiKey)
      ),
      catchError(() =>
        this.sheetsApi.getRows(environment.defaultSpreadsheetId, 'Schedule!A:Z', environment.googleApiKey)
      ),
      map((rows) =>
        rows
          .map(rowToScheduleRecord)
          .filter((r): r is ScheduleRecord => r !== null)
      ),
      shareReplay(1)
    );

  getSchedule(): Observable<ScheduleRecord[]> {
    return this.records$;
  }
}
