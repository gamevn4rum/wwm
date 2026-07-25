import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { apiUrl } from '../../core/api';
import { EncryptedPayload, decryptJson } from '../../core/utils/crypto.utils';
import { Guild } from './guild.model';

const EMPTY_GUILD: Guild = {
  id: '', numberId: null, name: '', level: null, createTime: null,
  hostnum: null, memberCount: 0, members: [],
};

@Injectable({ providedIn: 'root' })
export class GuildDataService {
  private readonly http = inject(HttpClient);

  private readonly guild$: Observable<Guild> = this.load().pipe(shareReplay(1));

  getGuild(): Observable<Guild> {
    return this.guild$;
  }

  /** Fill in defaults + a member-count fallback so the template can trust the shape. */
  private normalize(g: Guild | null): Guild {
    if (!g) return EMPTY_GUILD;
    const members = Array.isArray(g.members) ? g.members : [];
    return { ...EMPTY_GUILD, ...g, members, memberCount: g.memberCount ?? members.length };
  }

  private load(): Observable<Guild> {
    // Backend mode: gated guild data (member-only), same class as the roster.
    if (environment.useBackend) {
      return this.http.get<Guild>(apiUrl('/member/guild')).pipe(
        map((g) => this.normalize(g)),
        catchError(() => of(EMPTY_GUILD)),
      );
    }

    const key = environment.dataEncryptionKey;

    // Dev: plaintext file. Fail closed to an empty guild rather than erroring.
    if (!key) {
      return this.http.get<Guild>(`data/guild.json?t=${Date.now()}`).pipe(
        map((g) => this.normalize(g)),
        catchError(() => of(EMPTY_GUILD)),
      );
    }

    // Prod: fetch the encrypted file and decrypt it (carries the member roster).
    return this.http.get<EncryptedPayload>(`data/guild.enc?t=${Date.now()}`).pipe(
      switchMap((payload) => from(decryptJson<Guild>(payload, key))),
      map((g) => this.normalize(g)),
      catchError(() => of(EMPTY_GUILD)),
    );
  }
}
