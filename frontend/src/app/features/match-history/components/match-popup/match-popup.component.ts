import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { FootagePopupService } from '../../../../core/services/footage-popup.service';
import { OpponentGuildsService } from '../../../../core/services/opponent-guilds.service';
import { DiscordAuthService } from '../../../../core/services/discord-auth.service';
import { FootageVideoCardComponent } from '../../../footages/components/footage-video-card.component';
import { OpponentGuildMember } from '../../opponent-guild.model';
import { formatUnixDate } from '../../../../core/utils/date.utils';
import { ScoreboardDataService } from '../../scoreboard-data.service';
import {
  Scoreboard,
  ScoreboardPlayer,
  ScoreboardSide,
  ScoreboardSortKey,
  compactNumber,
  formatDuration,
} from '../../scoreboard.model';

/**
 * Roster sort keys. Deliberately a subset of the Guild page's — an opponent's
 * members come from the guild endpoint alone (name + join date), with no
 * per-player stats behind them, so Level/Mastery/Playtime have nothing to sort on.
 */
type MemberSortKey = 'name' | 'joined';

/**
 * The dialog behind a Match History card. Was footage-only; now it leads with the
 * opponent guild's details (GET /api/public/guild/opponents) and puts the roster
 * and the clips in two collapsible groups.
 *
 * Collapsing uses native <details>/<summary> — free keyboard/AT behaviour and
 * open state, no component state to keep in sync.
 *
 * Gating: the page itself is already login-gated (authGuard), so guild details
 * and the roster show to anyone who can see a card. Footage stays behind Footage
 * Permission (FTP) exactly as before — without it the group is not rendered.
 */
@Component({
  selector: 'app-match-popup',
  standalone: true,
  imports: [FootageVideoCardComponent],
  templateUrl: './match-popup.component.html',
  styleUrls: ['./match-popup.component.scss'],
})
export class MatchPopupComponent {
  readonly popup = inject(FootagePopupService);
  private readonly opponentGuilds = inject(OpponentGuildsService);
  private readonly authService = inject(DiscordAuthService);

  /** True when the logged-in user has Footage Permission (FTP). */
  readonly ftpPermission = toSignal(
    this.authService.currentUser$.pipe(map((user) => user?.ftp ?? false)),
    { initialValue: false },
  );

  readonly guild = computed(() => this.opponentGuilds.find(this.popup.popupMatch()?.opponent));

  /** True once the directory has resolved — until then we say "loading", not "missing". */
  readonly directoryLoaded = this.opponentGuilds.loaded;

  /**
   * Names this guild has also been recorded under — i.e. the Match History
   * spellings that aren't just the current name. Empty when nothing renamed.
   */
  readonly formerNames = computed(() => {
    const guild = this.guild();
    if (!guild) return [];
    const current = normalize(guild.name);
    return (guild.aliases ?? []).filter((alias) => normalize(alias) !== current);
  });

  // ── Roster controls (mirrors the Guild page's roster toolbar) ──────────────
  readonly memberSort = signal<MemberSortKey>('name');
  readonly memberQuery = signal('');

  readonly memberSortOptions: ReadonlyArray<{ key: MemberSortKey; label: string }> = [
    { key: 'name', label: 'Name' },
    { key: 'joined', label: 'Join date' },
  ];

  /** Roster after search + sort. Name ascending; join date newest first — same
   *  direction convention as the Guild page. */
  readonly members = computed<OpponentGuildMember[]>(() => {
    const q = this.memberQuery().trim().toLowerCase();
    const list = (this.guild()?.members ?? [])
      .filter((m) => !q || (m.name ?? '').toLowerCase().includes(q));

    const byName = (a: OpponentGuildMember, b: OpponentGuildMember) =>
      (a.name ?? '').localeCompare(b.name ?? '');

    return this.memberSort() === 'joined'
      ? [...list].sort((a, b) => (b.joinTime ?? 0) - (a.joinTime ?? 0) || byName(a, b))
      : [...list].sort(byName);
  });

  readonly footages = this.popup.popupFootages;

  // ── Scoreboard ────────────────────────────────────────────────────────────
  private readonly scoreboards = inject(ScoreboardDataService);

  readonly scoreboard = signal<Scoreboard | null>(null);
  readonly scoreboardLoading = signal(false);

  /** Which side's table is showing. Ours first — it is what the guild opens this for. */
  readonly scoreboardSide = signal<'us' | 'them'>('us');

  readonly scoreboardSort = signal<ScoreboardSortKey>('mvp');

  readonly scoreboardColumns: ReadonlyArray<{ key: ScoreboardSortKey; label: string; title: string }> = [
    { key: 'mvp', label: '★', title: 'Match score' },
    { key: 'kills', label: 'K', title: 'Kills' },
    { key: 'deaths', label: 'D', title: 'Deaths' },
    { key: 'assists', label: 'A', title: 'Assists' },
    { key: 'damageDealt', label: 'DMG', title: 'Damage dealt' },
    { key: 'damageTaken', label: 'TKN', title: 'Damage taken' },
    { key: 'healingDone', label: 'HEAL', title: 'Healing done' },
    { key: 'funCoins', label: 'COIN', title: 'Fun Coins' },
    { key: 'treeMetres', label: 'TREE', title: 'Fortune Tree metres carried' },
  ];

  constructor() {
    // Fetch when a different card is opened, and clear immediately so the panel never shows the
    // previous match's players while the new ones are in flight.
    effect(() => {
      const match = this.popup.popupMatch();
      this.scoreboard.set(null);
      this.scoreboardSide.set('us');
      if (!match) return;

      this.scoreboardLoading.set(true);
      this.scoreboards.get(match.id).subscribe((board) => {
        this.scoreboard.set(board);
        this.scoreboardLoading.set(false);
      });
    });
  }

  readonly activeSide = computed<ScoreboardSide | null>(() => {
    const board = this.scoreboard();
    if (!board) return null;
    return this.scoreboardSide() === 'us' ? board.us : board.them;
  });

  /** The active side's players, ordered by the chosen column, biggest first. */
  readonly scoreboardPlayers = computed<ScoreboardPlayer[]>(() => {
    const side = this.activeSide();
    if (!side) return [];
    const key = this.scoreboardSort();
    // Deaths are the one column where fewer is better, so it alone sorts ascending.
    const ascending = key === 'deaths';
    return [...side.players].sort((a, b) => {
      const left = key === 'mvp' ? a.mvpScore : a[key];
      const right = key === 'mvp' ? b.mvpScore : b[key];
      if (left === right) return (a.ign ?? '').localeCompare(b.ign ?? '');
      return ascending ? left - right : right - left;
    });
  });

  /**
   * Who carried the Fortune Tree farther — the win condition for a match that runs the full
   * thirty minutes.
   *
   * ⚠ Explains a TIMEOUT win only. A match ended by killing the enemy goose is decided long before
   * the tree matters, so this can legitimately disagree with the recorded result; the template says
   * so rather than presenting it as the reason we won.
   */
  readonly treeLead = computed<'us' | 'them' | null>(() => {
    const board = this.scoreboard();
    const ours = board?.us.treeMetres;
    const theirs = board?.them.treeMetres;
    if (ours == null || theirs == null || ours === theirs) return null;
    return ours > theirs ? 'us' : 'them';
  });

  /** True when the tree lead and the recorded result point at different guilds. */
  readonly treeDisagrees = computed(() => {
    const board = this.scoreboard();
    const lead = this.treeLead();
    if (!board || lead === null || board.won === null) return false;
    return (lead === 'us') !== board.won;
  });

  onScoreboardSort(key: ScoreboardSortKey): void {
    this.scoreboardSort.set(key);
  }

  showSide(side: 'us' | 'them'): void {
    this.scoreboardSide.set(side);
  }

  /** 1,234,567 → "1.2M". Damage numbers are too wide to print in full on a phone. */
  compact(value: number | null | undefined): string {
    return compactNumber(value);
  }

  /** 1759 → "29m 19s". */
  duration(seconds: number | null | undefined): string {
    return formatDuration(seconds);
  }

  /** 330.75 → "331 m". Em dash when the record carried none. */
  metres(value: number | null | undefined): string {
    return value == null ? '—' : `${Math.round(value)} m`;
  }

  /** 97.4 → "97%". */
  percent(value: number | null | undefined): string {
    return value == null ? '—' : `${Math.round(value)}%`;
  }

  onMemberSort(event: Event): void {
    this.memberSort.set((event.target as HTMLSelectElement).value as MemberSortKey);
  }

  onMemberSearch(event: Event): void {
    this.memberQuery.set((event.target as HTMLInputElement).value);
  }

  /** 269829 → "269,829". Em dash for anything missing. */
  formatScore(score: number | null | undefined): string {
    return score == null ? '—' : score.toLocaleString('en-US');
  }

  /** Unix seconds → "19/May/2026". Blank for missing/zero timestamps. */
  formatUnix(seconds: number | null | undefined): string {
    return formatUnixDate(seconds);
  }

  close(): void {
    this.popup.close();
  }
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}
