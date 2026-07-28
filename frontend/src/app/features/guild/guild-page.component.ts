import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { GuildDataService } from './guild-data.service';
import { PlayerStatsDataService } from '../roster-stats/player-stats-data.service';
import { MatchedPlayerStats, PlayerDetail } from '../roster-stats/player-stats.model';
import { Guild, GuildMember } from './guild.model';
import { compactNumber, formatUnixDate, playtimeLabel, relativeTime } from './guild-format';


/** A roster member joined with their in-game profile (absent until stats load,
 *  or permanently for a member the relay couldn't resolve). */
interface RosterEntry {
  member: GuildMember;
  player: PlayerDetail | null;
  /** Sort key for "last seen": most recent activity, unix seconds (0 = unknown). */
  lastSeen: number;
  online: boolean;
}

type SortKey = 'ign' | 'level' | 'mastery' | 'elegance' | 'playtime' | 'lastSeen' | 'joined';

@Component({
  selector: 'app-guild-page',
  standalone: true,
  imports: [],
  templateUrl: './guild-page.component.html',
  styleUrls: ['./guild-page.component.scss'],
})
export class GuildPageComponent implements OnInit {
  private readonly dataService = inject(GuildDataService);
  private readonly statsService = inject(PlayerStatsDataService);

  readonly guild = signal<Guild | null>(null);
  readonly stats = signal<MatchedPlayerStats[]>([]);
  readonly loading = signal(true);
  readonly query = signal('');
  readonly sort = signal<SortKey>('ign');

  readonly sortOptions: ReadonlyArray<{ key: SortKey; label: string }> = [
    { key: 'ign', label: 'Name' },
    { key: 'level', label: 'Level' },
    { key: 'mastery', label: 'Mastery' },
    { key: 'elegance', label: 'Elegance' },
    { key: 'playtime', label: 'Playtime' },
    { key: 'lastSeen', label: 'Last online' },
    { key: 'joined', label: 'Join date' },
  ];

  /** In-game profile per member, keyed by IGN. fetch-player-stats.js drives off
   *  the same guild roster, so `record.ign` is exactly the member's IGN — but
   *  match case-insensitively so a rename mid-sync can't silently drop stats. */
  private readonly playersByIgn = computed(() => {
    const map = new Map<string, PlayerDetail>();
    for (const rec of this.stats()) map.set(rec.ign.toLowerCase(), rec.player);
    return map;
  });


  /** How many members are online right now (null until stats load). */
  readonly onlineCount = computed<number | null>(() => {
    const matched = this.stats();
    if (!matched.length) return null;
    return matched.filter((m) => m.player.isOnline).length;
  });

  /** Members joined with their stats, filtered by the search box and sorted. */
  readonly roster = computed<RosterEntry[]>(() => {
    const g = this.guild();
    if (!g) return [];
    const byIgn = this.playersByIgn();
    const q = this.query().trim().toLowerCase();

    const entries: RosterEntry[] = g.members
      .filter((m) => !q || m.ign.toLowerCase().includes(q))
      .map((member) => {
        const player = byIgn.get(member.ign.toLowerCase()) ?? null;
        return {
          member,
          player,
          lastSeen: this.lastSeenAt(player),
          online: player?.isOnline === true,
        };
      });

    const key = this.sort();
    // Descending for the numeric/recency sorts (biggest and most recent first),
    // ascending by name as the tie-break and default.
    const byName = (a: RosterEntry, b: RosterEntry) => a.member.ign.localeCompare(b.member.ign);
    const desc = (pick: (e: RosterEntry) => number) => (a: RosterEntry, b: RosterEntry) =>
      pick(b) - pick(a) || byName(a, b);

    switch (key) {
      case 'level':
        return entries.sort(desc((e) => e.player?.level ?? -1));
      case 'mastery':
        return entries.sort(desc((e) => e.player?.weaponMasteryMax ?? -1));
      case 'elegance':
        return entries.sort(desc((e) => e.player?.eleganceScore ?? -1));
      case 'playtime':
        // Cumulative seconds played; -1 so members with no stats sink to the end.
        return entries.sort(desc((e) => e.player?.onlineTime ?? -1));
      case 'lastSeen':
        // Online first, then most-recently-seen.
        return entries.sort(desc((e) => (e.online ? Number.MAX_SAFE_INTEGER : e.lastSeen)));
      case 'joined':
        return entries.sort(desc((e) => e.member.joinTime ?? 0));
      default:
        return entries.sort(byName);
    }
  });

  ngOnInit(): void {
    this.dataService.getGuild().subscribe({
      // Empty name = no data available (fetch failed / not synced yet).
      next: (g) => { this.guild.set(g && g.name ? g : null); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
    this.statsService.getMatched().subscribe({
      next: (s) => this.stats.set(s),
      error: () => this.stats.set([]),
    });
  }

  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  onSort(event: Event): void {
    this.sort.set((event.target as HTMLSelectElement).value as SortKey);
  }

  /** Most recent sign of life. `logoutTime` can be newer than `loginTime`
   *  (it's the end of the last session), so take whichever is later. */
  private lastSeenAt(player: PlayerDetail | null): number {
    if (!player) return 0;
    return Math.max(player.loginTime ?? 0, player.logoutTime ?? 0);
  }

  /** "Online" / "4h ago" / "3d ago", or "—" when the sync predates activity data. */
  lastSeenLabel(entry: RosterEntry): string {
    if (entry.online) return 'Online';
    if (!entry.lastSeen) return '—';
    return this.relativeTime(entry.lastSeen);
  }

  /** Template hooks for the shared formatters (see guild-format.ts). */
  readonly relativeTime = relativeTime;
  readonly playtime = playtimeLabel;

  compact(value: number | null | undefined): string {
    return compactNumber(value);
  }

  formatDate(unixSeconds: number | null | undefined): string {
    return formatUnixDate(unixSeconds);
  }

  initial(ign: string): string {
    return ign.charAt(0).toUpperCase() || '?';
  }
}
