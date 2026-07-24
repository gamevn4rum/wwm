import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { apiUrl } from '../../core/api';
import { SetCatalogueEntry } from './set-catalogue.model';

@Injectable({ providedIn: 'root' })
export class SetCatalogueService {
  private readonly http = inject(HttpClient);

  // Backend mode: member-gated catalogue; static mode: prebuilt data/sets.json.
  // Either way fail closed to an empty list on any fetch error.
  private readonly entries$: Observable<SetCatalogueEntry[]> = this.http
    .get<SetCatalogueEntry[]>(
      environment.useBackend ? apiUrl('/member/sets') : `data/sets.json?t=${Date.now()}`
    )
    .pipe(
      catchError(() => of<SetCatalogueEntry[]>([])),
      shareReplay(1),
    );

  getAll(): Observable<SetCatalogueEntry[]> {
    return this.entries$;
  }
}
