import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { apiUrl } from '../../core/api';
import { InnerWayCatalogueEntry } from './inner-way-catalogue.model';

@Injectable({ providedIn: 'root' })
export class InnerWayCatalogueService {
  private readonly http = inject(HttpClient);

  // Backend mode: member-gated catalogue; static mode: prebuilt data/inner-ways.json.
  // Either way fail closed to an empty list on any fetch error.
  private readonly entries$: Observable<InnerWayCatalogueEntry[]> = this.http
    .get<InnerWayCatalogueEntry[]>(
      environment.useBackend ? apiUrl('/member/inner-ways') : `data/inner-ways.json?t=${Date.now()}`
    )
    .pipe(
      catchError(() => of<InnerWayCatalogueEntry[]>([])),
      shareReplay(1),
    );

  getAll(): Observable<InnerWayCatalogueEntry[]> {
    return this.entries$;
  }
}
