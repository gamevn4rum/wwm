import { Component, ElementRef, HostListener, OnInit, inject, signal, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { toBlob } from 'html-to-image';
import { ProfilePopupService } from '../../../core/services/profile-popup.service';
import { DiscordAuthService, DiscordUserSession } from '../../../core/services/discord-auth.service';
import { PlayerProfileService } from '../../../features/roster-stats/player-profile.service';
import { PlayerProfile } from '../../../features/roster-stats/player-profile.model';
import { PlayerDetail, PlayerInnerWay } from '../../../features/roster-stats/player-stats.model';
import { InnerWayCatalogueService } from '../../../features/roster-stats/inner-way-catalogue.service';
import { InnerWayCatalogueEntry } from '../../../features/roster-stats/inner-way-catalogue.model';
import { SetCatalogueService } from '../../../features/roster-stats/set-catalogue.service';
import { SetCatalogueEntry } from '../../../features/roster-stats/set-catalogue.model';
import {
  ActiveSetEffect, computeActiveSetEffects, isEffectAffix, schoolColor, tierClass,
} from '../../../features/roster-stats/build.utils';
import { compactNumber, formatUnixDate, playtimeLabel, relativeTime } from '../../../features/guild/guild-format';

/** Where the screenshot ended up. Clipboard first; a download is the fallback
 *  for browsers that refuse image writes (Firefox, older Safari). */
type ShotState = 'idle' | 'working' | 'copied' | 'downloaded' | 'failed';

/** Locale codes the game reports for this region (`oversea_language_choose`). */
const LANGUAGES: Record<string, string> = {
  en: 'English', vi: 'Tiếng Việt', zh: '中文', ko: '한국어',
  ja: '日本語', th: 'ไทย', id: 'Bahasa Indonesia',
};

@Component({
  selector: 'app-profile-modal',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './profile-modal.component.html',
  styleUrls: ['./profile-modal.component.scss'],
})
export class ProfileModalComponent implements OnInit {
  private readonly popupService = inject(ProfilePopupService);
  private readonly authService = inject(DiscordAuthService);
  private readonly profileService = inject(PlayerProfileService);
  private readonly innerWayCatalogue = inject(InnerWayCatalogueService);
  private readonly setCatalogue = inject(SetCatalogueService);

  /** The element rasterized by the screenshot button. */
  private readonly card = viewChild.required<ElementRef<HTMLElement>>('shotTarget');

  readonly session = signal<DiscordUserSession | null>(null);
  readonly profile = signal<PlayerProfile | null>(null);
  readonly loading = signal(true);
  readonly shot = signal<ShotState>('idle');

  private readonly innerWaysById = signal<Map<number, InnerWayCatalogueEntry>>(new Map());
  private readonly setsById = signal<Map<number, SetCatalogueEntry>>(new Map());

  // Shared presentation helpers, exposed to the template.
  readonly tierClass = tierClass;
  readonly isEffectAffix = isEffectAffix;
  readonly schoolColor = schoolColor;
  readonly compact = compactNumber;
  readonly formatDate = formatUnixDate;
  readonly playtime = playtimeLabel;

  ngOnInit(): void {
    this.authService.currentUser$.subscribe((user) => {
      this.session.set(user);
      const ign = user?.ign;
      if (!ign) {
        // Logged in but not resolved to a roster row — nothing to look up.
        this.profile.set(null);
        this.loading.set(false);
        return;
      }
      this.profileService.getProfile(ign).subscribe((profile) => {
        this.profile.set(profile);
        this.loading.set(false);
      });
    });

    this.innerWayCatalogue.getAll().subscribe((entries) => {
      const map = new Map<number, InnerWayCatalogueEntry>();
      for (const e of entries) if (e.id != null) map.set(e.id, e);
      this.innerWaysById.set(map);
    });
    this.setCatalogue.getAll().subscribe((entries) => {
      const map = new Map<number, SetCatalogueEntry>();
      for (const e of entries) if (e.id != null) map.set(e.id, e);
      this.setsById.set(map);
    });
  }

  close(): void {
    this.popupService.hide();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  // ── Derived view data ─────────────────────────────────────────────────────
  /** Role accent for the identity header, matching the login badge's ranks. */
  rankClass(): string {
    return `rank-${(this.session()?.role ?? '').toLowerCase()}`;
  }

  activeSetEffects(p: PlayerDetail): ActiveSetEffect[] {
    return computeActiveSetEffects(p, this.setsById());
  }

  innerWayInfo(id: number | null): InnerWayCatalogueEntry | undefined {
    if (id == null) return undefined;
    return this.innerWaysById().get(id);
  }

  /** "Online" / "4h ago" / "—" when the sync predates activity data. */
  lastSeenLabel(p: PlayerDetail): string {
    if (p.isOnline) return 'Online';
    const seen = Math.max(p.loginTime ?? 0, p.logoutTime ?? 0);
    return seen ? relativeTime(seen) : '—';
  }

  /** The game's own locale choice ("vi", "en"), spelled out. Unknown codes show
   *  as-is rather than being hidden — an unmapped locale is still information. */
  languageLabel(code: string | null): string {
    if (!code) return '—';
    return LANGUAGES[code.toLowerCase()] ?? code.toUpperCase();
  }

  innerWayLabel(iw: PlayerInnerWay): string {
    const path = this.innerWayInfo(iw.id)?.path?.name?.trim();
    return path ? `${iw.name} · ${path}` : iw.name;
  }

  // ── Screenshot ────────────────────────────────────────────────────────────
  /**
   * Rasterize the card and put the PNG on the clipboard. The buttons themselves
   * are excluded from the capture (`.pm-noshot`) so the shared image is just the
   * profile. Clipboard image writes are Chromium/Safari-only and must stay in the
   * click's task, so a rejected write falls back to downloading the same blob.
   */
  async screenshot(): Promise<void> {
    if (this.shot() === 'working') return;
    this.shot.set('working');
    try {
      const blob = await toBlob(this.card().nativeElement, {
        pixelRatio: 2,
        backgroundColor: getComputedStyle(document.documentElement)
          .getPropertyValue('--color-surface').trim() || '#ffffff',
        filter: (node) =>
          !(node instanceof HTMLElement && node.classList.contains('pm-noshot')),
      });
      if (!blob) { this.shot.set('failed'); return; }

      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        this.shot.set('copied');
      } catch {
        this.download(blob);
        this.shot.set('downloaded');
      }
    } catch {
      this.shot.set('failed');
    } finally {
      setTimeout(() => this.shot.set('idle'), 3200);
    }
  }

  private download(blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const name = (this.profile()?.ign || this.session()?.username || 'profile')
      .replace(/[^\w.-]+/g, '-');
    a.href = url;
    a.download = `${name}-profile.png`;
    a.click();
    URL.revokeObjectURL(url);
  }

  shotLabel(): string {
    switch (this.shot()) {
      case 'working':    return 'CAPTURING…';
      case 'copied':     return 'COPIED TO CLIPBOARD';
      case 'downloaded': return 'IMAGE DOWNLOADED';
      case 'failed':     return 'CAPTURE FAILED';
      default:           return 'SCREENSHOT';
    }
  }
}
