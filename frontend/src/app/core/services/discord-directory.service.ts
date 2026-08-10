import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, of, shareReplay, tap } from 'rxjs';
import {
  BackofficeService,
  DiscordChannel,
  DiscordDirectory,
  DiscordRole,
} from './backoffice.service';

const EMPTY: DiscordDirectory = { channels: [], roles: [], syncedUtc: null };

/**
 * One copy of the Discord channel/role lists for the whole admin area.
 *
 * The manage screen renders several panels at once and three of them want these lists; without a
 * shared cache that is three identical requests every time the page opens. `shareReplay` makes the
 * first caller fetch and everyone after that reuse, and `refresh()` replaces it for all of them at
 * once — a Refresh button on one panel updates the pickers on the others, which is what somebody
 * who just made a channel expects.
 *
 * A failed load resolves to an empty directory rather than erroring: a picker with nothing in it
 * falls back to accepting a pasted id, so the form still works. The pages surface the staleness via
 * `syncedUtc` instead.
 */
@Injectable({ providedIn: 'root' })
export class DiscordDirectoryService {
  private readonly backoffice = inject(BackofficeService);

  private readonly state = signal<DiscordDirectory>(EMPTY);
  private request: Observable<DiscordDirectory> | null = null;

  readonly channels = computed<DiscordChannel[]>(() => this.state().channels);
  readonly roles = computed<DiscordRole[]>(() => this.state().roles);
  readonly syncedUtc = computed<string | null>(() => this.state().syncedUtc);

  /** True once a load has finished and found nothing — the pickers say so rather than looking broken. */
  readonly empty = computed(() => this.loaded() && this.channels().length === 0 && this.roles().length === 0);

  private readonly loadedSignal = signal(false);
  readonly loaded = this.loadedSignal.asReadonly();

  readonly refreshing = signal(false);
  readonly refreshError = signal<string | null>(null);

  /** Loads once per session; later callers get the cached copy. */
  load(): Observable<DiscordDirectory> {
    this.request ??= this.backoffice.getDiscordDirectory().pipe(
      tap((directory) => {
        this.state.set(directory);
        this.loadedSignal.set(true);
      }),
      catchError(() => {
        this.loadedSignal.set(true);
        return of(EMPTY);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.request;
  }

  /** Re-reads from Discord. Leaves the current lists in place if it fails — a failed refresh must
   *  not empty a picker somebody is halfway through using. */
  refresh(): void {
    if (this.refreshing()) return;
    this.refreshing.set(true);
    this.refreshError.set(null);

    this.backoffice.refreshDiscordDirectory().subscribe({
      next: (directory) => {
        this.state.set(directory);
        this.loadedSignal.set(true);
        // Replaces the shared observable too, so a panel loading later gets the fresh copy rather
        // than the one the first caller cached.
        this.request = of(directory).pipe(shareReplay({ bufferSize: 1, refCount: false }));
        this.refreshing.set(false);
      },
      error: (err: { error?: { error?: string; detail?: string } }) => {
        this.refreshError.set(
          err?.error?.detail ??
            (err?.error?.error === 'no_bot_token'
              ? 'The API has no Discord bot token configured.'
              : 'Could not reach Discord. The list below is unchanged.'),
        );
        this.refreshing.set(false);
      },
    });
  }
}
