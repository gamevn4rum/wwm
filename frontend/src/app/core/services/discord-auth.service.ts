import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, ReplaySubject, of } from 'rxjs';
import { catchError, finalize, map, shareReplay } from 'rxjs/operators';
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
 * Seniority as a number, for sorting a roster by rank. Lower is more senior, and anything the
 * roster serves that is not one of the four sorts last rather than in the middle — a role nobody
 * here recognises is not evidence of standing.
 *
 * Takes a plain string because the roster projection types `role` as one: this is the sort key for
 * a list of members, not a permission check. Permission goes through the two helpers above.
 */
export function roleRank(role: string | undefined | null): number {
  switch (role) {
    case 'Admin':
    case 'Creator':
      return 0;
    case 'Commander':
      return 1;
    case 'Warrior':
      return 2;
    default:
      return 3;
  }
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

  /** Renew this long before the token expires. The access token lives an hour; the
   *  server will keep renewing it for 30 days from the original Discord login. */
  private readonly refreshMarginMs = 5 * 60 * 1000;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshInFlight: Observable<DiscordUserSession | null> | null = null;

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
    if (this.refreshTimer) { clearTimeout(this.refreshTimer); this.refreshTimer = null; }
    this.currentUserSubject.next(null);
  }

  /**
   * Renew the access token from the one already in storage — including an expired one,
   * which is the whole point: /auth/refresh re-reads the Member row and re-issues, so a
   * session survives a closed browser instead of dying with the hour-long token. A refused
   * renewal (removed from the roster, login disabled, session past its cap) logs out.
   *
   * Concurrent callers share one request: several 401s can land together, and two renewals
   * racing would leave whichever finished second in storage while the first was in flight.
   */
  refresh(): Observable<DiscordUserSession | null> {
    if (this.refreshInFlight) return this.refreshInFlight;
    if (!this.getToken()) { this.logout(); return of(null); }

    // The token rides along in the Authorization header, attached by the auth interceptor.
    this.refreshInFlight = this.http.post<AuthResponse>(apiUrl('/auth/refresh'), {}).pipe(
      map((res) => {
        this.storeAuth(res);
        this.currentUserSubject.next(res.session);
        return res.session;
      }),
      catchError(() => { this.logout(); return of(null); }),
      finalize(() => { this.refreshInFlight = null; }),
      shareReplay(1),
    );
    return this.refreshInFlight;
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

    // No fresh code: restore the cached session.
    const token = localStorage.getItem(this.appTokenKey);
    const raw = localStorage.getItem(this.appSessionKey);
    let cached: DiscordUserSession | null = null;
    try { cached = raw ? (JSON.parse(raw) as DiscordUserSession) : null; } catch { cached = null; }
    if (!token || !cached) { this.logout(); this.finish(null); return; }

    // An expired token is no longer a dead end — reopening the browser the next day used
    // to land here logged out, because the token only lives an hour. Renew instead, and
    // only treat a refusal as a logout.
    if (this.needsRefresh(token)) {
      this.refresh().subscribe((session) => this.finish(session));
      return;
    }

    this.scheduleRefresh(token);
    this.finish(cached);
  }

  private storeAuth(res: AuthResponse): void {
    localStorage.setItem(this.appTokenKey, res.token);
    localStorage.setItem(this.appSessionKey, JSON.stringify(res.session));
    this.scheduleRefresh(res.token);
  }

  /** Renew a few minutes ahead so a tab that stays open past the hour never sends a dead
   *  token. Timers don't fire on schedule in a backgrounded or sleeping tab, which is why
   *  the interceptor retries a 401 through refresh as well — this is the happy path, not
   *  the guarantee. */
  private scheduleRefresh(token: string): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    const expiry = this.expiryOf(token);
    if (expiry === null) return;
    const delay = expiry - Date.now() - this.refreshMarginMs;
    // setTimeout truncates delays past a 32-bit ms count; nothing we issue lasts that long.
    if (delay > 2 ** 31 - 1) return;
    this.refreshTimer = setTimeout(() => this.refresh().subscribe(), Math.max(delay, 1000));
  }

  /** True once the token is expired or close enough that a request would race it.
   *  An unreadable token counts as needing refresh — the server decides from there. */
  private needsRefresh(token: string): boolean {
    const expiry = this.expiryOf(token);
    return expiry === null || expiry - Date.now() <= this.refreshMarginMs;
  }

  /** Local expiry read only — it decides when to renew. The signature is the server's
   *  business, and nothing here is trusted for access. */
  private expiryOf(token: string): number | null {
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
    } catch {
      return null;
    }
  }

  private clearUrlQuery(): void {
    const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
    window.history.replaceState({}, document.title, cleanUrl);
  }
}
