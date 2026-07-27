import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { FootagePopupService } from '../../../../core/services/footage-popup.service';
import { OpponentGuildsService } from '../../../../core/services/opponent-guilds.service';
import { DiscordAuthService } from '../../../../core/services/discord-auth.service';
import { FootageVideoCardComponent } from '../../../footages/components/footage-video-card.component';
import { OpponentGuildMember } from '../../opponent-guild.model';

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * The dialog behind a Match History card. Was footage-only; now it leads with the
 * opponent guild's details (from data/guild-opponents.json) and puts the roster
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

  /** Roster, oldest member first — the sync already sorts it, this just guards the shape. */
  readonly members = computed<OpponentGuildMember[]>(() => {
    const members = this.guild()?.members ?? [];
    return [...members].sort((a, b) => (a.joinTime ?? 0) - (b.joinTime ?? 0));
  });

  readonly footages = this.popup.popupFootages;

  /** Unix seconds → "19/May/2026". Blank for missing/zero timestamps. */
  formatUnix(seconds: number | null | undefined): string {
    if (!seconds) return '—';
    const d = new Date(seconds * 1000);
    if (Number.isNaN(d.getTime())) return '—';
    return `${String(d.getUTCDate()).padStart(2, '0')}/${MONTH_ABBR[d.getUTCMonth()]}/${d.getUTCFullYear()}`;
  }

  close(): void {
    this.popup.close();
  }
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}
