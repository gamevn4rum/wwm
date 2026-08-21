import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { apiUrl } from '../../core/api';
import { EventRecord } from './event-record.model';

const MONTH_MAP_EV: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parse an event date into a timestamp for sorting. The API sends DD/MMM/YYYY
 * ("04/Jun/2026"); the numeric-month branch is kept as a cheap fallback so a format
 * change degrades to mis-sorted events rather than every event sorting as epoch 0.
 */
function parseDMY(date: string): number {
  if (!date) return 0;
  const parts = date.split('/');
  if (parts.length !== 3) return 0;
  const [d, mon, y] = parts;
  const namedMonth = MONTH_MAP_EV[mon.toLowerCase()];
  if (namedMonth !== undefined) {
    const ts = Date.UTC(+y, namedMonth, +d);
    return isNaN(ts) ? 0 : ts;
  }
  const numericMonth = parseInt(mon, 10);
  if (!isNaN(numericMonth) && numericMonth >= 1 && numericMonth <= 12) {
    const fullYear = y.length === 2 ? 2000 + parseInt(y, 10) : +y;
    const ts = Date.UTC(fullYear, numericMonth - 1, +d);
    return isNaN(ts) ? 0 : ts;
  }
  return 0;
}

@Injectable({ providedIn: 'root' })
export class EventsDataService {
  private readonly http = inject(HttpClient);

  private readonly records$: Observable<EventRecord[]> = this.load().pipe(shareReplay(1));

  getEvents(): Observable<EventRecord[]> {
    return this.records$;
  }

  private load(): Observable<EventRecord[]> {
    return this.http.get<EventRecord[]>(apiUrl('/public/events')).pipe(
      catchError(() => of<EventRecord[]>([])),
      map((records) =>
        // Pinned first, then newest — the same order the API returns. Re-sorted here anyway
        // because this sort is what the list actually renders from, so an order that only the
        // server knew about would be silently undone on arrival.
        [...records].sort(
          (a, b) => Number(b.pin) - Number(a.pin) || parseDMY(b.date) - parseDMY(a.date),
        ),
      ),
    );
  }
}
