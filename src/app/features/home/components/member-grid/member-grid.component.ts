import { Component, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Player } from '../../models/player.model';
import { HomeDataService } from '../../services/home-data.service';
import { PlayerStatsDataService } from '../../../roster-stats/player-stats-data.service';
import { MatchedPlayerStats } from '../../../roster-stats/player-stats.model';
import { InnerWayCatalogueService } from '../../../roster-stats/inner-way-catalogue.service';
import { InnerWayCatalogueEntry } from '../../../roster-stats/inner-way-catalogue.model';

// Schools get a fixed categorical palette (assigned by stable index, never a
// cycled/generated hue). Colour is never the sole cue — the school name is always
// shown beside it — so unknown schools safely fall back to a neutral slot.
const SCHOOL_PALETTE = [
  '#ad7a4c', // bronze  (--color-primary)
  '#7c9473', // sage    (--color-secondary)
  '#6e88a8', // blue    (--color-accent-blue)
  '#8b6f94', // plum    (--color-accent-plum)
  '#b5533d', // vermilion (--color-danger)
  '#a9822f', // gold
  '#5f8f86', // teal
  '#9c6b5a', // clay
];

@Component({
  selector: 'app-member-grid',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './member-grid.component.html',
  styleUrls: ['./member-grid.component.scss'],
})
export class MemberGridComponent implements OnInit {
  private homeDataService = inject(HomeDataService);
  private playerStatsService = inject(PlayerStatsDataService);
  private innerWayCatalogueService = inject(InnerWayCatalogueService);

  readonly players = signal<Player[]>([]);
  private readonly statsByIgn = signal<Map<string, MatchedPlayerStats>>(new Map());
  private readonly innerWaysById = signal<Map<number, InnerWayCatalogueEntry>>(new Map());
  readonly expandedId = signal<string | null>(null);

  ngOnInit(): void {
    this.homeDataService.getPlayers().subscribe((data: Player[]) => {
      this.players.set(data);
    });
    this.playerStatsService.getMatched().subscribe((list) => {
      const map = new Map<string, MatchedPlayerStats>();
      for (const rec of list) map.set(rec.ign.toLowerCase(), rec);
      this.statsByIgn.set(map);
    });
    this.innerWayCatalogueService.getAll().subscribe((entries) => {
      const map = new Map<number, InnerWayCatalogueEntry>();
      for (const e of entries) if (e.id != null) map.set(e.id, e);
      this.innerWaysById.set(map);
    });
  }

  getRankClass(rank: string): string {
    return rank.toLowerCase().replace(/\s+/g, '-').replace(/\//g, '-');
  }

  statsFor(player: Player): MatchedPlayerStats | undefined {
    return this.statsByIgn().get(player.name.toLowerCase());
  }

  isExpanded(player: Player): boolean {
    return this.expandedId() === player.id;
  }

  toggle(player: Player, event: Event): void {
    if (!this.statsFor(player)) return; // only cards with resolved stats expand
    const next = this.isExpanded(player) ? null : player.id;
    const card = (event.currentTarget as HTMLElement)?.closest('.member-badge');

    const apply = () => this.expandedId.set(next);
    // View Transitions morph the reflow (cards sliding to make room) for free.
    const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
    if (doc.startViewTransition) {
      doc.startViewTransition(apply);
    } else {
      apply();
    }

    if (next && card) {
      setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
    }
  }

  /** Ordinal gear-rarity ramp (game convention): 1 grey → 5 gold. */
  tierClass(tier: number | null | undefined): string {
    return `tier-${tier ?? 0}`;
  }

  schoolColor(school: string | null): string {
    if (!school) return 'var(--color-ink-faint)';
    let h = 0;
    for (let i = 0; i < school.length; i++) h = (h * 31 + school.charCodeAt(i)) >>> 0;
    return SCHOOL_PALETTE[h % SCHOOL_PALETTE.length];
  }

  /** Account creation → "Since Dec 2025". */
  joinedLabel(createTime: number | null): string {
    if (!createTime) return '';
    const d = new Date(createTime * 1000);
    if (isNaN(d.getTime())) return '';
    return `Since ${d.toLocaleString('en-US', { month: 'short', year: 'numeric' })}`;
  }

  /** Whole affix names that are really set-effect prose (long sentences). */
  isEffectAffix(name: string): boolean {
    return name.trim().length > 40 || name.includes('.');
  }

  /** Static catalogue entry (path/weapon/effect tags) for a player's inner way, if known. */
  innerWayInfo(id: number | null): InnerWayCatalogueEntry | undefined {
    if (id == null) return undefined;
    return this.innerWaysById().get(id);
  }
}
