import { Injectable, inject } from '@angular/core';
import { Observable, combineLatest, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { ignMatches } from '../../core/utils/ign.utils';
import { PlayerStatsDataService } from './player-stats-data.service';
import { PlayerAchievement, PlayerProfile } from './player-profile.model';

/**
 * The single seam between the profile modal and wherever a member's live game
 * data comes from.
 *
 * Today the in-game data and build come from the member-gated `/member/player-stats`
 * endpoint, and achievements have no source at all. When an achievements API lands, swap
 * the loader below — the modal consumes `PlayerProfile` and needs no change.
 */
@Injectable({ providedIn: 'root' })
export class PlayerProfileService {
  private readonly playerStats = inject(PlayerStatsDataService);

  getProfile(ign: string): Observable<PlayerProfile> {
    return combineLatest([this.loadDetail(ign), this.loadAchievements(ign)]).pipe(
      map(([detail, achievements]) => ({ ign, detail, achievements })),
    );
  }

  /** In-game data + build. Matched loosely on IGN, the same way the roster does
   *  it — the sheet and the game disagree about spacing for the same person. */
  private loadDetail(ign: string) {
    return this.playerStats.getMatched().pipe(
      map((records) => records.find((r) => ignMatches(r.ign, ign))?.player ?? null),
    );
  }

  /**
   * LIVE API — not wired yet. When the endpoint is available, replace this with
   * the call and map the payload into PlayerAchievement[]; keep the catchError
   * so a failing achievements call never blanks the rest of the profile:
   *
   *   return this.http.get<UpstreamAchievement[]>(apiUrl(`/member/achievements/${ign}`)).pipe(
   *     map((rows) => rows.map(toPlayerAchievement)),
   *     catchError(() => of<PlayerAchievement[]>([])),
   *   );
   */
  private loadAchievements(_ign: string): Observable<PlayerAchievement[]> {
    return of<PlayerAchievement[]>([]);
  }
}
