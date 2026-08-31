import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { FootagePopupService } from '../../../../core/services/footage-popup.service';
import { OpponentGuildsService } from '../../../../core/services/opponent-guilds.service';
import { DiscordAuthService } from '../../../../core/services/discord-auth.service';
import { FootageVideoCardComponent } from '../../../footages/components/footage-video-card.component';
import { OpponentGuildMember } from '../../opponent-guild.model';
import { formatUnixDate } from '../../../../core/utils/date.utils';

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
