import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';
import { apiUrl } from '../../core/api';
import { ScheduleRecord } from './schedule-record.model';

@Injectable({ providedIn: 'root' })
export class ScheduleDataService {
  private readonly http = inject(HttpClient);

  private readonly records$: Observable<ScheduleRecord[]> = this.load().pipe(shareReplay(1));

  getSchedule(): Observable<ScheduleRecord[]> {
    return this.records$;
  }

  private load(): Observable<ScheduleRecord[]> {
    return this.http.get<ScheduleRecord[]>(apiUrl('/public/schedule')).pipe(
      catchError(() => of<ScheduleRecord[]>([])),
    );
  }
}
