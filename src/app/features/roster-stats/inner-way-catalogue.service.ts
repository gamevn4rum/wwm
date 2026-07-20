import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';
import { InnerWayCatalogueEntry } from './inner-way-catalogue.model';

@Injectable({ providedIn: 'root' })
export class InnerWayCatalogueService {
  private readonly http = inject(HttpClient);

  // Static-only, same model as the other data/*.json files: no in-browser
  // upstream fallback, fail closed to an empty list on any fetch error.
  private readonly entries$: Observable<InnerWayCatalogueEntry[]> = this.http
    .get<InnerWayCatalogueEntry[]>(`data/inner-ways.json?t=${Date.now()}`)
    .pipe(
      catchError(() => of<InnerWayCatalogueEntry[]>([])),
      shareReplay(1),
    );

  getAll(): Observable<InnerWayCatalogueEntry[]> {
    return this.entries$;
  }
}
