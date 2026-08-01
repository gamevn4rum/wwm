import { Observable, combineLatest, of } from 'rxjs';
import { distinctUntilChanged, map, shareReplay, switchMap } from 'rxjs/operators';
import { DiscordAuthService } from './discord-auth.service';

/**
 * True once auth has resolved *and* resolved to an authorized session. Stays false
 * while it is still resolving, so nothing member-gated fires during startup and then
 * has to be discarded.
 */
export function signedIn$(auth: DiscordAuthService): Observable<boolean> {
  return combineLatest([auth.authResolved$, auth.currentUser$]).pipe(
    map(([resolved, user]) => resolved && user?.isAuthorized === true),
    distinctUntilChanged(),
  );
}

/**
 * A member-gated GET that only goes out while a session is live.
 *
 * These endpoints 401 for anonymous visitors by design, and several of them hang off the
 * site header and the home grid — asking for them signed out put a row of 401s in the
 * console on every single page load. Keying the fetch off the session also means a login
 * fills the data in on the spot, with no reload, and a session that ends drops back to
 * the signed-out value instead of leaving stale member data on screen.
 */
export function whileSignedIn<T>(
  auth: DiscordAuthService,
  fetch: () => Observable<T>,
  signedOut: T,
): Observable<T> {
  return signedIn$(auth).pipe(
    switchMap((signedIn) => (signedIn ? fetch() : of(signedOut))),
    shareReplay(1),
  );
}
