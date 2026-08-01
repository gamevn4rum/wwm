import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { apiUrl } from '../../core/api';
import { DiscordAuthService } from '../../core/services/discord-auth.service';
import { whileSignedIn } from '../../core/services/member-gated';
import { InnerWayCatalogueEntry } from './inner-way-catalogue.model';

@Injectable({ providedIn: 'root' })
export class InnerWayCatalogueService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(DiscordAuthService);

  // Member-gated, so it waits for a session (see whileSignedIn) and then fails closed to an
  // empty list: an inner way still shows its name and tier from the player's own record,
  // just without catalogue detail.
  private readonly entries$: Observable<InnerWayCatalogueEntry[]> = whileSignedIn(
    this.auth,
    () => this.http.get<InnerWayCatalogueEntry[]>(apiUrl('/member/inner-ways'))
      .pipe(catchError(() => of<InnerWayCatalogueEntry[]>([]))),
    [],
  );

  getAll(): Observable<InnerWayCatalogueEntry[]> {
    return this.entries$;
  }
}
