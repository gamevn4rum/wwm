// What the profile modal renders. This is the SPA's own contract — the live
// achievements/profile API is adapted into it by PlayerProfileService, so a
// change in the upstream payload shape stops at that one file.

import { PlayerDetail } from './player-stats.model';

/** One achievement row. Everything past `id`/`name` is optional: the sections
 *  that have no data simply don't render. */
export interface PlayerAchievement {
  id: string;
  name: string;
  description?: string;
  /** Grouping shown as a section heading, e.g. "Combat", "Exploration". */
  category?: string;
  /** Unix seconds when it was earned. Absent/null = not earned yet. */
  earnedAt?: number | null;
  /** Progress toward the goal, for achievements that report one. */
  progress?: { current: number; target: number } | null;
  /** Game-side score/points awarded, when reported. */
  points?: number | null;
  /** Flag for the rarer tiers, so they can be highlighted. */
  rare?: boolean;
}

/** Everything the modal shows for one member. */
export interface PlayerProfile {
  ign: string;
  /** In-game data + build. Null when the member has no resolved game profile. */
  detail: PlayerDetail | null;
  achievements: PlayerAchievement[];
  /** True when no achievements source is wired up yet — the section then says
   *  so instead of claiming the member has earned none. */
  achievementsUnavailable: boolean;
}
