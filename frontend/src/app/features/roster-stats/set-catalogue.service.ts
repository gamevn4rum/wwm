import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { apiUrl } from '../../core/api';
import { DiscordAuthService } from '../../core/services/discord-auth.service';
import { whileSignedIn } from '../../core/services/member-gated';
import { SetCatalogueEntry } from './set-catalogue.model';

@Injectable({ providedIn: 'root' })
export class SetCatalogueService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(DiscordAuthService);

  // Member-gated, so it waits for a session (see whileSignedIn) and then fails closed to
  // an empty list, which renders as "no set bonus" rather than breaking the gear card.
  private readonly entries$: Observable<SetCatalogueEntry[]> = whileSignedIn(
    this.auth,
    () => this.http.get<SetCatalogueEntry[]>(apiUrl('/member/sets'))
      .pipe(catchError(() => of<SetCatalogueEntry[]>([]))),
    [],
  );

  getAll(): Observable<SetCatalogueEntry[]> {
    return this.entries$;
  }
}
