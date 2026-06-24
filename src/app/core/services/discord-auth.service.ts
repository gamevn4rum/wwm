import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { GoogleSheetsApiService } from './google-sheets/google-sheets-api.service';
import { SheetRow } from '../models/sheet.model';
import { environment } from '../../../environments/environment';

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
  /** Formation Permission — saved to localStorage as 'FP' */
  fp: boolean;
  /** Footage Permission — saved to localStorage as 'FTP' */
  ftp: boolean;
}

@Injectable({ providedIn: 'root' })
export class DiscordAuthService {
  private readonly http = inject(HttpClient);
  private readonly sheetsApi = inject(GoogleSheetsApiService);
  private readonly sessionKey = 'gv_user_session';
  private readonly clientId = '1512670533093949570';
  private initialized = false;

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

  initializeAuthState(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    if (window.location.hostname === 'localhost') {
      this.currentUserSubject.next(this.devSession);
      return;
    }

    const storedSession = this.getStoredSession();
    if (storedSession) {
      this.currentUserSubject.next(storedSession);
    }

    const hash = window.location.hash;
    if (!hash || !hash.includes('access_token=')) {
      return;
    }

    const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.substring(1) : hash);
    const accessToken = hashParams.get('access_token');

    this.clearUrlHash();

    if (!accessToken) {
      return;
    }

    this.handleTokenLogin(accessToken).subscribe();
  }

  login(): void {
    window.location.href = this.getAuthorizeUrl();
  }

  logout(): void {
    localStorage.removeItem(this.sessionKey);
    this.currentUserSubject.next(null);
  }

  private handleTokenLogin(accessToken: string): Observable<DiscordUserSession | null> {
    const members$ = this.sheetsApi
      .getRows(environment.defaultSpreadsheetId, 'Members', environment.googleApiKey)
      .pipe(catchError(() => this.http.get<SheetRow[]>('data/members.json')));

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

        localStorage.setItem(this.sessionKey, JSON.stringify(session));
        this.currentUserSubject.next(session);
        return session;
      }),
      catchError(() => {
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

  private getStoredSession(): DiscordUserSession | null {
    const rawSession = localStorage.getItem(this.sessionKey);
    if (!rawSession) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawSession) as Partial<DiscordUserSession>;
      const validRoles: UserRole[] = ['Creator', 'Commander', 'Warrior'];
      if (
        typeof parsed.username === 'string'
        && typeof parsed.avatarUrl === 'string'
        && parsed.isAuthorized === true
        && validRoles.includes(parsed.role as UserRole)
      ) {
        return {
          username: parsed.username,
          avatarUrl: parsed.avatarUrl,
          isAuthorized: true,
          role: parsed.role as UserRole,
          fp:  parsed.fp  === true,
          ftp: parsed.ftp === true,
        };
      }
    } catch {
      // Ignore bad local data and reset below.
    }

    localStorage.removeItem(this.sessionKey);
    return null;
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
