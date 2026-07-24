import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, ReplaySubject, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { MembersDataService } from './members-data.service';
import { SheetRow } from '../models/sheet.model';
import { environment } from '../../../environments/environment';
import { apiUrl } from '../api';

interface DiscordApiUser {
  id: string;
  username: string;
  avatar: string | null;
}

export type UserRole = 'Admin' | 'Creator' | 'Commander' | 'Warrior';

export interface DiscordUserSession {
  username: string;
  avatarUrl: string;
  isAuthorized: boolean;
  role: UserRole;
  /** Formation Permission */
  fp: boolean;
  /** Footage Permission */
  ftp: boolean;
  /** Whether the account may log in at all (backend mode). */
  canLogin?: boolean;
}

interface AuthResponse {
  token: string;
  session: DiscordUserSession;
}

/** Admin ⊇ Commander ⊇ Warrior. Admin === the legacy 'Creator'. */
export function isAdminRole(role: UserRole | undefined): boolean {
  return role === 'Admin' || role === 'Creator';
}
export function isCommanderRole(role: UserRole | undefined): boolean {
  return isAdminRole(role) || role === 'Commander';
}

@Injectable({ providedIn: 'root' })
export class DiscordAuthService {
  private readonly http = inject(HttpClient);
  private readonly membersData = inject(MembersDataService);
  private readonly tokenKey = 'gv_access_token';      // static path: raw Discord token
  private readonly appTokenKey = 'gv_app_token';       // backend path: app JWT
  private readonly appSessionKey = 'gv_app_session';   // backend path: cached session (UX only)
  private readonly stateKey = 'gv_oauth_state';
  private readonly clientId = '1512670533093949570';
  private initialized = false;

  private readonly ready$ = new ReplaySubject<DiscordUserSession | null>(1);

  private readonly currentUserSubject = new BehaviorSubject<DiscordUserSession | null>(null);
  readonly currentUser$ = this.currentUserSubject.asObservable();
  get currentUser(): DiscordUserSession | null { return this.currentUserSubject.value; }

  private readonly authResolvedSubject = new BehaviorSubject<boolean>(false);
  readonly authResolved$ = this.authResolvedSubject.asObservable();

  private readonly devSession: DiscordUserSession = {
    username: 'Shinigamae',
    avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
    isAuthorized: true,
    role: 'Creator',
    fp: true,
    ftp: true,
  };

  /** The app JWT for backend calls (attached by the auth interceptor). */
  getToken(): string | null {
    return environment.useBackend ? localStorage.getItem(this.appTokenKey) : null;
  }

  initializeAuthState(): Observable<DiscordUserSession | null> {
    if (this.initialized) return this.ready$;
    this.initialized = true;

    if (environment.useBackend) this.initBackend();
    else this.initStatic();

    return this.ready$;
  }

  login(): void {
    const redirectUri = document.baseURI;
    if (environment.useBackend) {
      const state = crypto.randomUUID();
      sessionStorage.setItem(this.stateKey, state);
      const params = new URLSearchParams({
        client_id: this.clientId,
        response_type: 'code',
        scope: 'identify',
        redirect_uri: redirectUri,
        state,
      });
      window.location.href = `https://discord.com/oauth2/authorize?${params.toString()}`;
      return;
    }
    // Static path: implicit token flow.
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'token',
      scope: 'identify',
      redirect_uri: redirectUri,
    });
    window.location.href = `https://discord.com/oauth2/authorize?${params.toString()}`;
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.appTokenKey);
    localStorage.removeItem(this.appSessionKey);
    this.currentUserSubject.next(null);
  }

  private finish(session: DiscordUserSession | null): void {
    this.currentUserSubject.next(session);
    this.ready$.next(session);
    this.ready$.complete();
    this.authResolvedSubject.next(true);
  }

  // ── Backend mode (Authorization Code → app JWT) ─────────────────────────
  private initBackend(): void {
    if (window.location.hostname === 'localhost') {
      // Dev bypass: ask the backend for an Admin session (needs DEV_AUTH_ENABLED).
      this.http.post<AuthResponse>(apiUrl('/auth/dev'), {}).pipe(
        catchError(() => of(null)),
      ).subscribe((res) => {
        if (res) this.storeBackendAuth(res);
        this.finish(res?.session ?? null);
      });
      return;
    }

    const query = new URLSearchParams(window.location.search);
    const code = query.get('code');
    if (code) {
      const expected = sessionStorage.getItem(this.stateKey);
      const state = query.get('state');
      sessionStorage.removeItem(this.stateKey);
      this.clearUrlQuery();
      if (expected && state !== expected) { this.finish(null); return; }

      this.http.post<AuthResponse>(apiUrl('/auth/discord/exchange'),
        { code, redirectUri: document.baseURI }).pipe(
        map((res) => { this.storeBackendAuth(res); return res.session; }),
        catchError((err) => {
          if (err?.status === 403) alert('You are not a registered member of GameVN');
          this.logout();
          return of(null);
        }),
      ).subscribe((session) => this.finish(session));
      return;
    }

    // No fresh code: restore a cached session if the JWT is still valid.
    const token = localStorage.getItem(this.appTokenKey);
    const raw = localStorage.getItem(this.appSessionKey);
    if (token && raw && this.isJwtValid(token)) {
      try { this.finish(JSON.parse(raw) as DiscordUserSession); return; } catch { /* fall through */ }
    }
    this.logout();
    this.finish(null);
  }

  private storeBackendAuth(res: AuthResponse): void {
    localStorage.setItem(this.appTokenKey, res.token);
    localStorage.setItem(this.appSessionKey, JSON.stringify(res.session));
  }

  private isJwtValid(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }

  private clearUrlQuery(): void {
    const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
    window.history.replaceState({}, document.title, cleanUrl);
  }

  // ── Static mode (unchanged: Discord implicit token → Members sheet) ─────
  private initStatic(): void {
    if (window.location.hostname === 'localhost') {
      this.finish(this.devSession);
      return;
    }

    const hash = window.location.hash;
    const hasFreshToken = hash.includes('access_token=');
    let token = localStorage.getItem(this.tokenKey);

    if (hasFreshToken) {
      const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.substring(1) : hash);
      this.clearUrlHash();
      token = hashParams.get('access_token');
      if (token) localStorage.setItem(this.tokenKey, token);
    }

    if (!token) { this.finish(null); return; }

    this.resolveSession(token).subscribe((session) => this.finish(session));
  }

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

        const fp = memberRecord['Formation Permission'] === '✅';
        const ftp = memberRecord['Footage Permission'] === '✅';

        return {
          username: fetchedUsername,
          avatarUrl: this.buildAvatarUrl(profile),
          isAuthorized: true,
          role: this.resolveRole(fetchedUsername, memberRecord),
          fp,
          ftp,
        } satisfies DiscordUserSession;
      }),
      catchError(() => {
        this.logout();
        return of(null);
      })
    );
  }

  private resolveRole(username: string, member: SheetRow): UserRole {
    if (username === 'shinigamae') return 'Creator';
    if (member['Role'] === '📳 Caller') return 'Commander';
    return 'Warrior';
  }

  private fetchDiscordProfile(accessToken: string): Observable<DiscordApiUser> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });
    return this.http.get<DiscordApiUser>('https://discord.com/api/users/@me', { headers });
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
