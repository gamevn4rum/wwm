import { Component, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Player } from '../../models/player.model';
import { HomeDataService } from '../../services/home-data.service';
import { PlayerStatsDataService } from '../../../roster-stats/player-stats-data.service';
import { MatchedPlayerStats, PlayerDetail } from '../../../roster-stats/player-stats.model';
import { InnerWayCatalogueService } from '../../../roster-stats/inner-way-catalogue.service';
import { InnerWayCatalogueEntry } from '../../../roster-stats/inner-way-catalogue.model';
import { SetCatalogueService } from '../../../roster-stats/set-catalogue.service';
import { SetCatalogueEntry } from '../../../roster-stats/set-catalogue.model';

/** A gear set with enough matching pieces equipped to have an active bonus. */
export interface ActiveSetEffect {
  set: SetCatalogueEntry;
  count: number;
  bonus2Active: boolean;
  bonus4Active: boolean;
  /** bonus2's level-scaled attribute(s), resolved to the player's actual level. */
  resolvedBonus2: { attrName: string; value: number }[];
}

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
  private setCatalogueService = inject(SetCatalogueService);

  readonly players = signal<Player[]>([]);
  private readonly statsByIgn = signal<Map<string, MatchedPlayerStats>>(new Map());
  private readonly innerWaysById = signal<Map<number, InnerWayCatalogueEntry>>(new Map());
  private readonly setsById = signal<Map<number, SetCatalogueEntry>>(new Map());
  readonly expandedId = signal<string | null>(null);
  // Only one member card is ever expanded at a time, so keying by inner-way id
  // alone (no player id) is safe — no cross-card collisions.
  private readonly activeUprankTab = signal<Map<number, number>>(new Map());

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
    this.setCatalogueService.getAll().subscribe((entries) => {
      const map = new Map<number, SetCatalogueEntry>();
      for (const e of entries) if (e.id != null) map.set(e.id, e);
      this.setsById.set(map);
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

  /**
   * Best-effort default tab: the highest advancement rank whose world-level
   * requirement the player's own level clears. This is an approximation, not
   * a fact — a player's actual uprank purchases aren't exposed by the live
   * Player() call, only their character level, which the ranks' worldLevel
   * gate loosely tracks.
   */
  defaultUprankTab(entry: InnerWayCatalogueEntry, playerLevel: number | null): number {
    let idx = 0;
    for (let i = 0; i < entry.upranks.length; i++) {
      const wl = entry.upranks[i].worldLevel;
      if (wl != null && playerLevel != null && wl <= playerLevel) idx = i;
    }
    return idx;
  }

  activeUprankIndex(innerWayId: number | null, entry: InnerWayCatalogueEntry, playerLevel: number | null): number {
    if (innerWayId == null) return 0;
    return this.activeUprankTab().get(innerWayId) ?? this.defaultUprankTab(entry, playerLevel);
  }

  setActiveUprank(innerWayId: number | null, index: number, event: Event): void {
    event.stopPropagation();
    if (innerWayId == null) return;
    const next = new Map(this.activeUprankTab());
    next.set(innerWayId, index);
    this.activeUprankTab.set(next);
  }

  /**
   * Gear sets with 2+ matching pieces equipped (game convention: bonuses
   * unlock at 2 and 4 pieces). Multiple sets can be active simultaneously.
   */
  activeSetEffects(p: PlayerDetail): ActiveSetEffect[] {
    const counts = new Map<number, number>();
    for (const slot of p.gear) {
      if (slot.set?.id == null) continue;
      counts.set(slot.set.id, (counts.get(slot.set.id) ?? 0) + 1);
    }

    const results: ActiveSetEffect[] = [];
    for (const [setId, count] of counts) {
      if (count < 2) continue;
      const set = this.setsById().get(setId);
      if (!set) continue;
      results.push({
        set,
        count,
        bonus2Active: count >= 2,
        bonus4Active: count >= 4,
        resolvedBonus2: set.bonuses2.map((b) => ({
          attrName: b.attrName,
          value: this.resolveScaledValue(b.values, p.level),
        })),
      });
    }
    return results;
  }

  /** Pick the highest level-gated value the player's level actually qualifies for. */
  private resolveScaledValue(values: { level: number | null; value: number | null }[], level: number | null): number {
    let best = 0;
    for (const v of values) {
      if (v.level == null || v.value == null) continue;
      if (level != null && v.level > level) continue;
      best = v.value;
    }
    return best;
  }
}
