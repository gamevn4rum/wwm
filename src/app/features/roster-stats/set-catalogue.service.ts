import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';
import { SetCatalogueEntry } from './set-catalogue.model';

@Injectable({ providedIn: 'root' })
export class SetCatalogueService {
  private readonly http = inject(HttpClient);

  // Static-only, same model as the other data/*.json files: no in-browser
  // upstream fallback, fail closed to an empty list on any fetch error.
  private readonly entries$: Observable<SetCatalogueEntry[]> = this.http
    .get<SetCatalogueEntry[]>(`data/sets.json?t=${Date.now()}`)
    .pipe(
      catchError(() => of<SetCatalogueEntry[]>([])),
      shareReplay(1),
    );

  getAll(): Observable<SetCatalogueEntry[]> {
    return this.entries$;
  }
}
