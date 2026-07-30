import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';
import { apiUrl } from '../../core/api';
import { SetCatalogueEntry } from './set-catalogue.model';

@Injectable({ providedIn: 'root' })
export class SetCatalogueService {
  private readonly http = inject(HttpClient);

  // Member-gated. Fails closed to an empty list, which renders as "no set bonus" rather
  // than breaking the gear card.
  private readonly entries$: Observable<SetCatalogueEntry[]> = this.http
    .get<SetCatalogueEntry[]>(apiUrl('/member/sets'))
    .pipe(
      catchError(() => of<SetCatalogueEntry[]>([])),
      shareReplay(1),
    );

  getAll(): Observable<SetCatalogueEntry[]> {
    return this.entries$;
  }
}
