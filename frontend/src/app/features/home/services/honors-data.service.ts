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
  private readonly honors$: Observable<HonorGroup[] | null> = this.http
    .get<HonorGroup[]>(apiUrl('/public/honors'))
    .pipe(
      catchError(() => of(null)),
      shareReplay(1),
    );

  getHonors(): Observable<HonorGroup[] | null> {
    return this.honors$;
  }
}
