import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, ReplaySubject, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { apiUrl } from '../api';

export type UserRole = 'Admin' | 'Creator' | 'Commander' | 'Warrior';

export interface DiscordUserSession {
  username: string;
  avatarUrl: string;
  isAuthorized: boolean;
  /** Roster IGN this session resolved to — the key the profile modal looks the
   *  member's in-game data up by. */
  ign?: string;
  role: UserRole;
  /** Formation Permission */
  fp: boolean;
  /** Footage Permission */
  ftp: boolean;
  /** Whether the account may log in at all. */
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

/**
 * Discord Authorization Code flow. The browser only ever handles a short-lived `code`;
 * the server holds the client secret, exchanges it, decides who this is against the
 * roster, and returns an app JWT. Nothing here judges membership or role — the token's
 * claims are the server's answer, and every gated endpoint re-checks them.
 */
@Injectable({ providedIn: 'root' })
export class DiscordAuthService {
  private readonly http = inject(HttpClient);
  private readonly appTokenKey = 'gv_app_token';        // the app JWT
  private readonly appSessionKey = 'gv_app_session';    // cached session (UX only)
  private readonly legacyTokenKey = 'gv_access_token';  // see logout()
  private readonly stateKey = 'gv_oauth_state';
  private readonly clientId = '1512670533093949570';
  private initialized = false;

  private readonly ready$ = new ReplaySubject<DiscordUserSession | null>(1);

  private readonly currentUserSubject = new BehaviorSubject<DiscordUserSession | null>(null);
  readonly currentUser$ = this.currentUserSubject.asObservable();
  get currentUser(): DiscordUserSession | null { return this.currentUserSubject.value; }

  private readonly authResolvedSubject = new BehaviorSubject<boolean>(false);
  readonly authResolved$ = this.authResolvedSubject.asObservable();

  /** The app JWT, attached to our API calls by the auth interceptor. */
  getToken(): string | null {
    return localStorage.getItem(this.appTokenKey);
  }

  initializeAuthState(): Observable<DiscordUserSession | null> {
    if (this.initialized) return this.ready$;
    this.initialized = true;
    this.init();
    return this.ready$;
  }

  login(): void {
    const state = crypto.randomUUID();
    sessionStorage.setItem(this.stateKey, state);
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      scope: 'identify',
      // Must match a redirect URI registered on the Discord application, or the consent
      // screen refuses before our code runs. With baseHref /wwm/ this is
      // https://gamevn4rum.github.io/wwm/.
      redirect_uri: document.baseURI,
      state,
    });
    window.location.href = `https://discord.com/oauth2/authorize?${params.toString()}`;
  }

  logout(): void {
    // legacyTokenKey held a raw Discord access token under the old static path. Clearing it
    // costs one line and gets that token out of the browsers of anyone who logged in before
    // the switch; drop it once that is long past.
    localStorage.removeItem(this.legacyTokenKey);
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

  private init(): void {
    if (window.location.hostname === 'localhost') {
      // Dev bypass: ask the backend for an Admin session. Requires DEV_AUTH_ENABLED and a
      // non-Production environment, so this is a 404 against the deployed API.
      this.http.post<AuthResponse>(apiUrl('/auth/dev'), {}).pipe(
        catchError(() => of(null)),
      ).subscribe((res) => {
        if (res) this.storeAuth(res);
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
        map((res) => { this.storeAuth(res); return res.session; }),
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

  private storeAuth(res: AuthResponse): void {
    localStorage.setItem(this.appTokenKey, res.token);
    localStorage.setItem(this.appSessionKey, JSON.stringify(res.session));
  }

  /** Local expiry check only — it decides whether to bother restoring a cached session.
   *  The signature is the server's business. */
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
}
