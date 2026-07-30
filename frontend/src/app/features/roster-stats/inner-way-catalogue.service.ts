import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';
import { apiUrl } from '../../core/api';
import { InnerWayCatalogueEntry } from './inner-way-catalogue.model';

@Injectable({ providedIn: 'root' })
export class InnerWayCatalogueService {
  private readonly http = inject(HttpClient);

  // Member-gated. Fails closed to an empty list: an inner way then shows its name and tier
  // from the player's own record, just without catalogue detail.
  private readonly entries$: Observable<InnerWayCatalogueEntry[]> = this.http
    .get<InnerWayCatalogueEntry[]>(apiUrl('/member/inner-ways'))
    .pipe(
      catchError(() => of<InnerWayCatalogueEntry[]>([])),
      shareReplay(1),
    );

  getAll(): Observable<InnerWayCatalogueEntry[]> {
    return this.entries$;
  }
}
