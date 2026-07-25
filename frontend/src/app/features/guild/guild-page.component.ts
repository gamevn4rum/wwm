import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { GuildDataService } from './guild-data.service';
import { PlayerStatsDataService } from '../roster-stats/player-stats-data.service';
import { MatchedPlayerStats } from '../roster-stats/player-stats.model';
import { Guild, GuildMember } from './guild.model';

interface GuildOverview {
  members: number;
  avgLevel: string;
  maxLevel: string;
  avgMastery: string;
}

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

  /** Aggregate roster stats for the overview row under the header. Member count
   *  comes from the guild (authoritative); the averages/max come from whichever
   *  members we have in-game stats for, and read "—" until those load. */
  readonly overview = computed<GuildOverview>(() => {
    const g = this.guild();
    const matched = this.stats();
    const levels = matched.map((m) => m.player.level).filter((l): l is number => l != null);
    const masteries = matched
      .map((m) => m.player.weaponMasteryMax)
      .filter((v): v is number => v != null);
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const avgLevel = mean(levels);
    const avgMastery = mean(masteries);
    return {
      members: g?.memberCount ?? 0,
      avgLevel: avgLevel != null ? String(Math.round(avgLevel)) : '—',
      maxLevel: levels.length ? String(Math.max(...levels)) : '—',
      avgMastery: avgMastery != null ? avgMastery.toFixed(1) : '—',
    };
  });

  /** Members filtered by the search box, always in IGN order. */
  readonly members = computed<GuildMember[]>(() => {
    const g = this.guild();
    if (!g) return [];
    const q = this.query().trim().toLowerCase();
    const list = q ? g.members.filter((m) => m.ign.toLowerCase().includes(q)) : g.members;
    return [...list].sort((a, b) => a.ign.localeCompare(b.ign));
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

  /** Unix seconds → "05 Sep 2024" (— when absent). */
  formatDate(unixSeconds: number | null | undefined): string {
    if (!unixSeconds) return '—';
    return new Date(unixSeconds * 1000).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  initial(ign: string): string {
    return ign.charAt(0).toUpperCase() || '?';
  }
}
