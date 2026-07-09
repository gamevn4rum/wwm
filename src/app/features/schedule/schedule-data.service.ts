import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { SheetRow } from '../../core/models/sheet.model';
import { findVal } from '../../core/utils/sheet.utils';
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
  private readonly http = inject(HttpClient);

  // Static-only: prebuilt data/schedule.json is the single source of truth.
  // No in-browser Sheets API fallback (that would require shipping the API key).
  private readonly records$: Observable<ScheduleRecord[]> = this.http
    .get<SheetRow[]>(`data/schedule.json?t=${Date.now()}`)
    .pipe(
      catchError(() => of<SheetRow[]>([])),
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
