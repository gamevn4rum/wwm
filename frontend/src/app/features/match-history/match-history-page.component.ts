import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { MatchRecord, seasonSortValue } from './match-record.model';
import { MatchHistoryDataService } from './match-history-data.service';
import { SeasonMatchHistoryComponent } from './season-match-history/season-match-history.component';

export interface SeasonGroup {
  season: string;
  matches: MatchRecord[];
}

@Component({
  selector: 'app-match-history-page',
  standalone: true,
  imports: [SeasonMatchHistoryComponent],
  templateUrl: './match-history-page.component.html',
  styleUrls: ['./match-history-page.component.scss'],
})
export class MatchHistoryPageComponent implements OnInit, OnDestroy {
  private readonly matchDataService = inject(MatchHistoryDataService);

  // ── Loaded from service ───────────────────────────────────────────────────
  readonly allMatches = signal<MatchRecord[]>([]);
  readonly loading    = signal(true);

  // ── Opponent filter ───────────────────────────────────────────────────────
  /** Selected opponents; an empty set means "All". Applies across every season. */
  readonly selectedOpponents = signal<ReadonlySet<string>>(new Set());

  readonly opponentOptions = computed(() =>
    Array.from(new Set(this.allMatches().map(m => m.opponent).filter(o => !!o)))
      .sort((a, b) => a.localeCompare(b))
  );

  /** All matches after applying the opponent filter (still every season, unsplit). */
  readonly filteredMatches = computed(() => {
    const selected = this.selectedOpponents();
    return selected.size === 0
      ? this.allMatches()
      : this.allMatches().filter(m => selected.has(m.opponent));
  });

  /** Seasons present in the filtered set, highest (by seasonSortValue) first. */
  private readonly seasonGroups = computed<SeasonGroup[]>(() => {
    const bySeason = new Map<string, MatchRecord[]>();
    for (const m of this.filteredMatches()) {
      const key = m.season || 'Unknown';
      const list = bySeason.get(key);
      if (list) list.push(m);
      else bySeason.set(key, [m]);
    }
    return Array.from(bySeason, ([season, matches]) => ({ season, matches }))
      .sort((a, b) => seasonSortValue(b.season) - seasonSortValue(a.season));
  });

  /** The highest-numbered season — shown expanded by default. */
  readonly latestSeason = computed<SeasonGroup | null>(() => this.seasonGroups()[0] ?? null);

  /** Every earlier season — rendered collapsed, one panel each. */
  readonly pastSeasons = computed<SeasonGroup[]>(() => this.seasonGroups().slice(1));

  ngOnInit(): void {
    this.matchDataService.getMatches().subscribe({
      next: (matches) => {
        this.allMatches.set(matches);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
  }

  isOpponentSelected(opponent: string): boolean {
    return this.selectedOpponents().has(opponent);
  }

  toggleOpponent(opponent: string): void {
    const next = new Set(this.selectedOpponents());
    if (next.has(opponent)) {
      next.delete(opponent);
    } else {
      next.add(opponent);
    }
    this.selectedOpponents.set(next);
  }

  clearOpponents(): void {
    this.selectedOpponents.set(new Set());
  }
}
