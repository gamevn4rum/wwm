import { Injectable, Signal, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { apiUrl } from '../api';

type FeatureMap = Record<string, boolean>;

/** Reads the public feature-flag config so the SPA can hide disabled nav/routes
 * (cosmetic — the backend re-checks every request). All-enabled in static mode. */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly http = inject(HttpClient);

  private readonly features$: Observable<FeatureMap> = environment.useBackend
    ? this.http.get<{ features: FeatureMap }>(apiUrl('/public/config')).pipe(
        map((r) => r.features ?? {}),
        catchError(() => of<FeatureMap>({})),
        shareReplay(1),
      )
    : of<FeatureMap>({});

  private readonly featuresSignal: Signal<FeatureMap> =
    toSignal(this.features$, { initialValue: {} as FeatureMap });

  getFeatures(): Observable<FeatureMap> {
    return this.features$;
  }

  /** A flag is enabled unless explicitly set to false. */
  isEnabled(key: string): Observable<boolean> {
    return this.features$.pipe(map((f) => f[key] !== false));
  }

  /** Synchronous flag read for templates (reactive via signal). */
  isOn(key: string): boolean {
    return this.featuresSignal()[key] !== false;
  }
}
