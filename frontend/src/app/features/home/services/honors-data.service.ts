import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';
import { HonorGroup } from '../models/honor.model';
import { apiUrl } from '../../../core/api';

@Injectable({ providedIn: 'root' })
export class HonorsDataService {
  private readonly http = inject(HttpClient);

  /** The honors held right now. Null when the API did not answer — distinct from `[]`, which is
   *  a real answer: nobody holds anything. */
  //
  // ⚠ The `v` is part of the contract, not decoration: the API tells browsers to keep this list an
  // hour, so a change to its shape must come with a new URL or a returning visitor's browser keeps
  // handing the new page the old shape. Bump it whenever the response changes.
  private readonly honors$: Observable<HonorGroup[] | null> = this.http
    .get<HonorGroup[]>(apiUrl('/public/honors?v=2'))
    .pipe(
      catchError(() => of(null)),
      shareReplay(1),
    );

  getHonors(): Observable<HonorGroup[] | null> {
    return this.honors$;
  }
}
