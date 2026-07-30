import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';
import { RosterMember } from '../models/member.model';
import { apiUrl } from '../api';

@Injectable({ providedIn: 'root' })
export class MembersDataService {
  private readonly http = inject(HttpClient);

  private readonly members$: Observable<RosterMember[]> = this.load().pipe(shareReplay(1));

  getMembers(): Observable<RosterMember[]> {
    return this.members$;
  }

  private load(): Observable<RosterMember[]> {
    // Fail closed to an empty roster. For the auth path that means "nobody is recognised
    // as a member", which is the safe direction — the server decides anyway.
    return this.http.get<RosterMember[]>(apiUrl('/public/roster')).pipe(
      catchError(() => of<RosterMember[]>([])),
    );
  }
}
