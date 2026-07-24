import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { SheetRow } from '../../core/models/sheet.model';
import { findVal } from '../../core/utils/sheet.utils';
import { environment } from '../../../environments/environment';
import { apiUrl } from '../../core/api';
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

  private readonly records$: Observable<ScheduleRecord[]> = this.load().pipe(shareReplay(1));

  getSchedule(): Observable<ScheduleRecord[]> {
    return this.records$;
  }

  private load(): Observable<ScheduleRecord[]> {
    // Backend mode: typed ScheduleRecord[] from the public API.
    if (environment.useBackend) {
      return this.http.get<ScheduleRecord[]>(apiUrl('/public/schedule')).pipe(
        catchError(() => of<ScheduleRecord[]>([])),
      );
    }

    // Static: prebuilt data/schedule.json (raw SheetRow[]), reshaped client-side.
    return this.http.get<SheetRow[]>(`data/schedule.json?t=${Date.now()}`).pipe(
      catchError(() => of<SheetRow[]>([])),
      map((rows) => rows.map(rowToScheduleRecord).filter((r): r is ScheduleRecord => r !== null)),
    );
  }
}
