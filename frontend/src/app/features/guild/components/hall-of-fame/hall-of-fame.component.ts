import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { GuildDataService } from '../../guild-data.service';
import { HallOfFame, HallOfFameEntry } from '../../guild.model';

/**
 * Leaderboard placements earned by guild members — the Hall of Fame. Lives on the
 * homepage; renders nothing at all when no member places on any board, so it can be
 * dropped into a page without reserving space for an empty section.
 */
@Component({
  selector: 'app-hall-of-fame',
  standalone: true,
  imports: [],
  templateUrl: './hall-of-fame.component.html',
  styleUrls: ['./hall-of-fame.component.scss'],
})
export class HallOfFameComponent implements OnInit {
  private readonly dataService = inject(GuildDataService);

  readonly hallOfFame = signal<HallOfFame | null>(null);

  /**
   * Rows grouped by member, members ordered by their single best rank.
   *
   * So a member who placed #2 *and* #250 has both rows at the very top — the #250
   * rides along on the strength of the #2 — rather than the #250 being buried
   * hundreds of rows below among unrelated boards. Within a member, their own rows
   * still run best-first.
   *
   * A row can name several members (raid/Endless boards rank a whole party). Such a
   * row is filed under the strongest member on it, so it appears exactly once and
   * sits with that member's other placements.
   */
  readonly entries = computed<HallOfFameEntry[]>(() => {
    const rows = this.hallOfFame()?.entries ?? [];

    const bestByMember = new Map<string, number>();
    for (const row of rows) {
      if (row.rank == null) continue;
      for (const member of row.members) {
        bestByMember.set(member, Math.min(bestByMember.get(member) ?? Infinity, row.rank));
      }
    }

    /** The member on this row with the best overall rank — the row's group. */
    const anchorOf = (row: HallOfFameEntry) => {
      let name = '';
      let best = Infinity;
      for (const member of row.members) {
        const memberBest = bestByMember.get(member) ?? Infinity;
        if (memberBest < best || (memberBest === best && (name === '' || member < name))) {
          best = memberBest;
          name = member;
        }
      }
      return { name, best };
    };

    return rows
      .map((row) => ({ row, anchor: anchorOf(row) }))
      .sort((a, b) =>
        a.anchor.best - b.anchor.best                       // strongest member first
        || a.anchor.name.localeCompare(b.anchor.name)       // keep a member's rows together
        || (a.row.rank ?? Infinity) - (b.row.rank ?? Infinity))
      .map((x) => x.row);
  });

  ngOnInit(): void {
    this.dataService.getHallOfFame().subscribe({
      next: (h) => this.hallOfFame.set(h),
      error: () => this.hallOfFame.set(null),
    });
  }

  /**
   * The board's group name, when it adds anything. Upstream leaves some groups
   * unnamed and returns a placeholder ("Group #0"), and others just repeat the
   * board's own name — neither is worth showing.
   */
  groupLabel(entry: HallOfFameEntry): string | null {
    const group = entry.group?.trim();
    if (!group || group === entry.board?.trim()) return null;
    return /^Group #\d+$/.test(group) ? null : group;
  }

  /** "#4 of 200" → also a percentile, which makes small boards comparable. */
  percentile(entry: HallOfFameEntry): string | null {
    if (entry.rank == null || !entry.of) return null;
    const top = Math.max(1, Math.round((entry.rank / entry.of) * 100));
    return `top ${top}%`;
  }

  /** Board scores are occasionally negative (time-based raid boards) — keep the
   *  sign but shorten the magnitude. */
  score(value: number | null): string {
    if (value == null) return '—';
    const abs = Math.abs(value);
    const shown = abs >= 1000 ? `${(abs / 1000).toFixed(1)}k` : String(Math.round(abs * 10) / 10);
    return value < 0 ? `−${shown}` : shown;
  }
}
