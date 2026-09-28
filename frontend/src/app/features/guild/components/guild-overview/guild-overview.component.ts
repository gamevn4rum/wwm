import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { GuildDataService } from '../../guild-data.service';
import { PlayerStatsDataService } from '../../../roster-stats/player-stats-data.service';
import { MatchedPlayerStats } from '../../../roster-stats/player-stats.model';
import { Guild, GuildRank, GuildRankEntry } from '../../guild.model';
import { compactNumber, formatUnixDate } from '../../guild-format';

/**
 * Whether the Guild War tiles render.
 *
 * Off from 2026-08-11 to 2026-09-25, while both boards were frozen at the last sweep of the
 * dead wwmdb relay. Back on now that the backend reads them from the game itself (client
 * captures, 2026-09-25): Ranked from the SEA Ranked board, the League from each guild's own
 * placement. The backend removes a stale row rather than keeping it, so a tile only renders
 * for a standing that is current.
 */
const SHOW_GUILD_WAR = true;

/** One header tile. `sub` and `small` are optional presentation hints. */
export interface OverviewTile {
  key: string;
  label: string;
  value: string;
  /** Secondary line, e.g. "of 426" under a rank. */
  sub?: string;
  /** Step the value down a size (dates don't fit the numeric tile size). */
  small?: boolean;
}

/**
 * The guild's headline numbers, rendered inside the site header (under
 * `.header-center`) rather than on the Guild page — it's guild-level identity, so it
 * belongs to the page header on every route.
 *
 * Renders nothing at all until the guild file resolves, so a page never shows a row
 * of zeros/dashes while data is in flight.
 */
@Component({
  selector: 'app-guild-overview',
  standalone: true,
  imports: [],
  templateUrl: './guild-overview.component.html',
  styleUrls: ['./guild-overview.component.scss'],
})
export class GuildOverviewComponent implements OnInit {
  private readonly dataService = inject(GuildDataService);
  private readonly statsService = inject(PlayerStatsDataService);

  readonly guild = signal<Guild | null>(null);
  readonly rank = signal<GuildRank | null>(null);
  readonly stats = signal<MatchedPlayerStats[]>([]);

  /**
   * Member count comes from the guild (authoritative); founded and server are guild
   * identity; avg mastery is aggregated over whichever members we have in-game stats
   * for and reads "—" until those load.
   *
   * Prosperity and Guild War come from the leaderboard file and read "—" when that
   * board doesn't list us (the Guild War *league* table is empty between seasons).
   */
  readonly tiles = computed<OverviewTile[]>(() => {
    const g = this.guild();
    const masteries = this.stats()
      .map((m) => m.player.weaponMasteryMax)
      .filter((v): v is number => v != null);
    const avgMastery = masteries.length
      ? masteries.reduce((a, b) => a + b, 0) / masteries.length
      : null;

    // Average lifetime playtime across the members we have stats for. Cumulative
    // seconds upstream, shown in whole hours.
    const playtimes = this.stats()
      .map((m) => m.player.onlineTime)
      .filter((v): v is number => v != null);
    const avgPlaytimeHours = playtimes.length
      ? Math.round(playtimes.reduce((a, b) => a + b, 0) / playtimes.length / 3600)
      : null;

    // Elegance is live again — it comes from the game API's fashion.score on every
    // sweep, where it used to ride the wwmdb relay and froze when that went away.
    const elegances = this.stats()
      .map((m) => m.player.eleganceScore)
      .filter((v): v is number => v != null);
    const avgElegance = elegances.length
      ? elegances.reduce((a, b) => a + b, 0) / elegances.length
      : null;

    const r = this.rank();
    const prosperity = r?.prosperity?.score != null ? r.prosperity : null;
    // Two fixed rows of four: the guild's standings on top, its members' averages below.
    // A board that doesn't list us still keeps its cell (as "—") so the grid never shifts.
    // The guild's flag is not a tile — the site header draws it beside the title.
    const tiles: OverviewTile[] = [
      { key: 'members', label: 'Members', value: String(g?.memberCount ?? 0) },
      {
        key: 'prosperity', label: 'Prosperity',
        value: prosperity ? compactNumber(prosperity.score!) : '—',
        sub: prosperity?.rank != null ? `#${prosperity.rank} of ${prosperity.total}` : undefined,
      },
      this.guildWarTile('gw-ranked', 'Guild War', SHOW_GUILD_WAR ? r?.guildWar?.ranked : null),
      this.guildWarTile('gw-league', 'Guild League', SHOW_GUILD_WAR ? r?.guildWar?.league : null),
      { key: 'founded', label: 'Founded', value: formatUnixDate(g?.createTime), small: true },
      {
        key: 'playtime', label: 'Avg Playtime',
        value: avgPlaytimeHours != null ? `${avgPlaytimeHours.toLocaleString('en-GB')}h` : '—',
      },
      { key: 'mastery', label: 'Avg Mastery', value: avgMastery != null ? compactNumber(avgMastery) : '—' },
      { key: 'elegance', label: 'Avg Elegance', value: avgElegance != null ? compactNumber(avgElegance) : '—' },
    ];
    return tiles;
  });

  /**
   * Rank is the headline; the sub-line says what the rank is out of. Ranked is a board of
   * 500 and its score is the season's wins. The League has no board — a rank is within a
   * tier and group — so its sub-line names the tier, which is what makes "#1" mean anything,
   * and its score is League points.
   */
  private guildWarTile(key: string, label: string, entry: GuildRankEntry | null | undefined): OverviewTile {
    if (entry?.rank == null) return { key, label, value: '—' };
    const parts = key === 'gw-league'
      ? [entry.board, entry.score != null ? `${entry.score} pts` : null]
      : [
          entry.score != null ? `${entry.score} wins` : null,
          entry.total != null ? `of ${entry.total}` : null,
        ];
    const shown = parts.filter(Boolean);
    return { key, label, value: `#${entry.rank}`, sub: shown.length ? shown.join(' · ') : undefined };
  }

  ngOnInit(): void {
    this.dataService.getGuild().subscribe({
      // Tiles are decoration on someone else's page here, so anything short of real data
      // (signed out, loading, failed) renders as nothing at all rather than as a message.
      next: (load) => this.guild.set(load.status === 'ok' && load.guild.name ? load.guild : null),
      error: () => this.guild.set(null),
    });
    this.dataService.getRank().subscribe({
      next: (r) => this.rank.set(r),
      error: () => this.rank.set(null),
    });
    this.statsService.getMatched().subscribe({
      next: (s) => this.stats.set(s),
      error: () => this.stats.set([]),
    });
  }
}
