import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, ReplaySubject, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { MembersDataService } from './members-data.service';
import { SheetRow } from '../models/sheet.model';

interface DiscordApiUser {
  id: string;
  username: string;
  avatar: string | null;
}

export type UserRole = 'Creator' | 'Commander' | 'Warrior';

export interface DiscordUserSession {
  username: string;
  avatarUrl: string;
  isAuthorized: boolean;
  role: UserRole;
  /** Formation Permission, from the Members sheet */
  fp: boolean;
  /** Footage Permission, from the Members sheet */
  ftp: boolean;
}

@Injectable({ providedIn: 'root' })
export class DiscordAuthService {
  private readonly http = inject(HttpClient);
  private readonly membersData = inject(MembersDataService);
  private readonly tokenKey = 'gv_access_token';
  private readonly clientId = '1512670533093949570';
  private initialized = false;

  // Emits exactly once per page load, after the session (if any) has been
  // verified against Discord + the Members sheet. Guards await this instead
  // of reading `currentUser` synchronously, since fp/ftp are never trusted
  // from storage — only from a token Discord itself just vouched for.
  private readonly ready$ = new ReplaySubject<DiscordUserSession | null>(1);

  private readonly currentUserSubject = new BehaviorSubject<DiscordUserSession | null>(null);
  readonly currentUser$ = this.currentUserSubject.asObservable();
  get currentUser(): DiscordUserSession | null { return this.currentUserSubject.value; }

  private readonly devSession: DiscordUserSession = {
    username: 'Shinigamae',
    avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
    isAuthorized: true,
    role: 'Creator',
    fp: true,
    ftp: true,
  };

  /**
   * Kicks off session resolution on first call (idempotent) and returns an
   * observable that emits once resolution completes — used by route guards
   * so they never decide access based on a not-yet-verified state.
   */
  initializeAuthState(): Observable<DiscordUserSession | null> {
    if (this.initialized) {
      return this.ready$;
    }
    this.initialized = true;

    if (window.location.hostname === 'localhost') {
      this.currentUserSubject.next(this.devSession);
      this.ready$.next(this.devSession);
      this.ready$.complete();
      return this.ready$;
    }

    const hash = window.location.hash;
    const hasFreshToken = hash.includes('access_token=');
    let token = localStorage.getItem(this.tokenKey);

    if (hasFreshToken) {
      const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.substring(1) : hash);
      this.clearUrlHash();
      token = hashParams.get('access_token');
      if (token) {
        localStorage.setItem(this.tokenKey, token);
      }
    }

    if (!token) {
      this.ready$.next(null);
      this.ready$.complete();
      return this.ready$;
    }

    this.resolveSession(token).subscribe((session) => {
      this.ready$.next(session);
      this.ready$.complete();
    });

    return this.ready$;
  }

  login(): void {
    window.location.href = this.getAuthorizeUrl();
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    this.currentUserSubject.next(null);
  }

  /**
   * Verifies an access token against Discord (authoritative identity — a
   * forged/expired token simply fails here) and recomputes fp/ftp fresh
   * from the Members sheet every time. Nothing about permissions is ever
   * read back out of storage.
   */
  private resolveSession(accessToken: string): Observable<DiscordUserSession | null> {
    const members$ = this.membersData.getRows();

    return this.fetchDiscordProfile(accessToken).pipe(
      switchMap((profile: DiscordApiUser) =>
        members$.pipe(map((members: SheetRow[]) => ({ profile, members })))
      ),
      map(({ profile, members }: { profile: DiscordApiUser; members: SheetRow[] }) => {
        const fetchedUsername = profile.username;
        const memberRecord = members.find((m) => m['Discord'] === fetchedUsername);

        if (!memberRecord) {
          alert('You are not a registered member of GameVN');
          this.logout();
          return null;
        }

        const fp  = memberRecord['Formation Permission'] === '✅';
        const ftp = memberRecord['Footage Permission']   === '✅';

        const session: DiscordUserSession = {
          username: fetchedUsername,
          avatarUrl: this.buildAvatarUrl(profile),
          isAuthorized: true,
          role: this.resolveRole(fetchedUsername, memberRecord),
          fp,
          ftp,
        };

        this.currentUserSubject.next(session);
        return session;
      }),
      catchError(() => {
        // Invalid/expired token, or the lookup failed — don't leave a stale
        // session behind.
        this.logout();
        return of(null);
      })
    );
  }

  private resolveRole(username: string, member: SheetRow): UserRole {
    if (username === 'shinigamae') {
      return 'Creator';
    }
    if (member['Role'] === '📳 Caller') {
      return 'Commander';
    }
    return 'Warrior';
  }

  private fetchDiscordProfile(accessToken: string): Observable<DiscordApiUser> {
    const headers = new HttpHeaders({
      Authorization: `Bearer ${accessToken}`,
    });

    return this.http.get<DiscordApiUser>('https://discord.com/api/users/@me', { headers });
  }

  private getAuthorizeUrl(): string {
    const redirectUri = document.baseURI;
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'token',
      scope: 'identify',
      redirect_uri: redirectUri,
    });

    return `https://discord.com/oauth2/authorize?${params.toString()}`;
  }

  private buildAvatarUrl(profile: DiscordApiUser): string {
    if (!profile.avatar) {
      const fallbackIndex = Number(profile.id) % 5;
      return `https://cdn.discordapp.com/embed/avatars/${fallbackIndex}.png`;
    }

    const extension = profile.avatar.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${extension}?size=128`;
  }

  private clearUrlHash(): void {
    const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;
    window.history.replaceState({}, document.title, cleanUrl);
  }
}
