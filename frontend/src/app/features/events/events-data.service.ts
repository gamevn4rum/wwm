import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { SheetRow } from '../../core/models/sheet.model';
import { findVal } from '../../core/utils/sheet.utils';
import { environment } from '../../../environments/environment';
import { apiUrl } from '../../core/api';
import { EventRecord } from './event-record.model';

const MONTH_MAP_EV: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Parse a DD/MMM/YYYY or DD/MM/YYYY date string into a numeric timestamp for sorting. Returns 0 for invalid values. */
function parseDMY(date: string): number {
  if (!date) return 0;
  const parts = date.split('/');
  if (parts.length !== 3) return 0;
  const [d, mon, y] = parts;
  // Named month: DD/MMM/YYYY
  const namedMonth = MONTH_MAP_EV[mon.toLowerCase()];
  if (namedMonth !== undefined) {
    const ts = Date.UTC(+y, namedMonth, +d);
    return isNaN(ts) ? 0 : ts;
  }
  // Numeric month fallback: DD/MM/YYYY or DD/MM/YY
  const numericMonth = parseInt(mon, 10);
  if (!isNaN(numericMonth) && numericMonth >= 1 && numericMonth <= 12) {
    const fullYear = y.length === 2 ? 2000 + parseInt(y, 10) : +y;
    const ts = Date.UTC(fullYear, numericMonth - 1, +d);
    return isNaN(ts) ? 0 : ts;
  }
  return 0;
}

function rowToEventRecord(row: SheetRow): EventRecord | null {
  const title = findVal(row, 'title');
  if (!title) return null;

  return {
    title,
    date: findVal(row, 'date'),
    description: findVal(row, 'description'),
    banner: findVal(row, 'banner') || null,
    p1: findVal(row, 'p1') || null,
    p2: findVal(row, 'p2') || null,
    p3: findVal(row, 'p3') || null,
    p4: findVal(row, 'p4') || null,
    p5: findVal(row, 'p5') || null,
    link: findVal(row, 'link') || null,
  };
}

@Injectable({ providedIn: 'root' })
export class EventsDataService {
  private readonly http = inject(HttpClient);

  private readonly records$: Observable<EventRecord[]> = this.load().pipe(shareReplay(1));

  getEvents(): Observable<EventRecord[]> {
    return this.records$;
  }

  private load(): Observable<EventRecord[]> {
    const sortNewestFirst = (records: EventRecord[]) =>
      [...records].sort((a, b) => parseDMY(b.date) - parseDMY(a.date));

    // Backend mode: typed EventRecord[] straight from the public API.
    if (environment.useBackend) {
      return this.http.get<EventRecord[]>(apiUrl('/public/events')).pipe(
        catchError(() => of<EventRecord[]>([])),
        map(sortNewestFirst),
      );
    }

    // Static: the prebuilt data/events.json (raw SheetRow[]), reshaped client-side.
    return this.http.get<SheetRow[]>(`data/events.json?t=${Date.now()}`).pipe(
      catchError(() => of<SheetRow[]>([])),
      map((rows) =>
        sortNewestFirst(
          rows.map(rowToEventRecord).filter((r): r is EventRecord => r !== null)
        )
      ),
    );
  }
}
