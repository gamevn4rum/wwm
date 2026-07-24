import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';
import { SheetRow } from '../models/sheet.model';
import { environment } from '../../../environments/environment';
import { apiUrl } from '../api';
import { EncryptedPayload, decryptJson } from '../utils/crypto.utils';

interface PublicMemberDto { ign: string; role: string; notes: string; }

@Injectable({ providedIn: 'root' })
export class MembersDataService {
  private readonly http = inject(HttpClient);

  private readonly rows$: Observable<SheetRow[]> = this.loadRows().pipe(shareReplay(1));

  getRows(): Observable<SheetRow[]> {
    return this.rows$;
  }

  private loadRows(): Observable<SheetRow[]> {
    // Backend mode: the safe public roster projection, adapted back to the
    // SheetRow shape so downstream consumers (HomeDataService) stay unchanged.
    if (environment.useBackend) {
      return this.http.get<PublicMemberDto[]>(apiUrl('/public/roster')).pipe(
        map((rows) => rows.map((r) => ({ IGN: r.ign, Role: r.role, Notes: r.notes }) as SheetRow)),
        catchError(() => of<SheetRow[]>([])),
      );
    }

    const key = environment.dataEncryptionKey;

    // Static-only: no in-browser Sheets API fallback (that would require the
    // API key in the bundle). On any failure, fail closed with an empty roster
    // rather than calling Google from the client — which, for auth, means
    // "no one is recognised as a member" instead of a silent live lookup.
    if (!key) {
      // Dev: plaintext file.
      return this.http.get<SheetRow[]>(`data/members.json?t=${Date.now()}`).pipe(
        catchError(() => of<SheetRow[]>([])),
      );
    }

    // Prod: fetch the encrypted file and decrypt it.
    return this.http.get<EncryptedPayload>(`data/members.enc?t=${Date.now()}`).pipe(
      switchMap((payload) => from(decryptJson<SheetRow[]>(payload, key))),
      catchError(() => of<SheetRow[]>([])),
    );
  }
}
