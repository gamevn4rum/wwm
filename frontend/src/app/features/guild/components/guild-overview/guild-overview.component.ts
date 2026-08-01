import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { GuildDataService } from '../../guild-data.service';
import { PlayerStatsDataService } from '../../../roster-stats/player-stats-data.service';
import { MatchedPlayerStats } from '../../../roster-stats/player-stats.model';
import { Guild, GuildRank } from '../../guild.model';
import { compactNumber, formatUnixDate } from '../../guild-format';

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
   * Prosperity and Guild War come from the leaderboard file and are appended only
   * when that board actually lists us — the Guild War *league* table is empty between
   * seasons, so its tile must not render as a permanent "—".
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

    const tiles: OverviewTile[] = [
      { key: 'members', label: 'Members', value: String(g?.memberCount ?? 0) },
      { key: 'founded', label: 'Founded', value: formatUnixDate(g?.createTime), small: true },
      {
        key: 'playtime', label: 'Avg Playtime',
        value: avgPlaytimeHours != null ? `${avgPlaytimeHours.toLocaleString('en-GB')}h` : '—',
      },
      { key: 'mastery', label: 'Avg Mastery', value: avgMastery != null ? compactNumber(avgMastery) : '—' },
    ];

    const r = this.rank();
    if (r?.prosperity?.score != null) {
      tiles.push({
        key: 'prosperity',
        label: 'Prosperity',
        value: compactNumber(r.prosperity.score),
        sub: r.prosperity.rank != null ? `#${r.prosperity.rank} of ${r.prosperity.total}` : undefined,
      });
    }
    for (const [key, label, entry] of [
      ['gw-ranked', 'Guild War', r?.guildWar?.ranked],
      ['gw-league', 'GW League', r?.guildWar?.league],
    ] as const) {
      if (entry?.rank == null) continue;
      // Rank is the headline; the board's own metric (war points) rides the sub-line
      // next to the field size, so the tile carries both.
      const parts = [
        entry.score != null ? `${compactNumber(entry.score)} pts` : null,
        entry.total != null ? `of ${entry.total}` : null,
      ].filter(Boolean);
      tiles.push({
        key, label,
        value: `#${entry.rank}`,
        sub: parts.length ? parts.join(' · ') : undefined,
      });
    }
    return tiles;
  });

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
