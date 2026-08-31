import { Component, ElementRef, HostListener, OnInit, inject, signal, viewChild } from '@angular/core';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { Router } from '@angular/router';
import { toBlob } from 'html-to-image';
import { cardFontCss } from '../../../core/utils/card-fonts';
import { captureScale } from '../../../core/utils/card-shot';
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
  ActiveSetEffect, computeActiveSetEffects, gearRows, isEffectAffix, martialArtBuild, martialArts,
  noteMartialArtIconFailed, schoolColor, tierClass, visibleGear,
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
  imports: [DecimalPipe, NgTemplateOutlet],
  templateUrl: './profile-modal.component.html',
  styleUrls: ['./profile-modal.component.scss'],
})
export class ProfileModalComponent implements OnInit {
  private readonly popupService = inject(ProfilePopupService);
  private readonly authService = inject(DiscordAuthService);
  private readonly router = inject(Router);
  private readonly profileService = inject(PlayerProfileService);
  private readonly innerWayCatalogue = inject(InnerWayCatalogueService);
  private readonly setCatalogue = inject(SetCatalogueService);

  /** The element rasterized by the screenshot button. */
  private readonly card = viewChild.required<ElementRef<HTMLElement>>('shotTarget');

  readonly session = signal<DiscordUserSession | null>(null);
  readonly profile = signal<PlayerProfile | null>(null);
  readonly loading = signal(true);
  readonly shot = signal<ShotState>('idle');

  // ── Capture options ───────────────────────────────────────────────────────
  // These hide sections from the card itself, not just from the PNG, so the
  // modal doubles as a preview of what you are about to share. All off by
  // default: the full card is the normal thing to post.
  /** Everything identifying the person rather than the character. IGN + level stay. */
  readonly hideInfo = signal(false);
  readonly hideStanding = signal(false);
  readonly hideInnerWays = signal(false);
  /** Set effects and gear together — they're one build block to a reader. */
  readonly hideBuild = signal(false);

  private readonly innerWaysById = signal<Map<number, InnerWayCatalogueEntry>>(new Map());
  private readonly setsById = signal<Map<number, SetCatalogueEntry>>(new Map());

  // Shared presentation helpers, exposed to the template.
  readonly tierClass = tierClass;
  readonly isEffectAffix = isEffectAffix;
  readonly schoolColor = schoolColor;

  /**
   * The member's martial arts, in slot order, ready to draw as chips.
   *
   * Deliberately unlabelled as "1" and "2": which slot an art sits in is a storage detail, not
   * something a reader of a profile is asking. The order still carries it (primary first).
   * Absent slots are dropped rather than drawn empty — most members have both, and a lone chip
   * is a truer statement than a chip beside a dash.
   *
   * The colour is resolved here rather than in the template so the chip and its label are read off
   * one slot together — a template calling a colour helper per chip can pair a colour with the
   * wrong art's label the moment the slots are reordered.
   */
  // Martial arts are drawn the same way on the member grid, so both read one definition in
  // build.utils — including which icons have already failed to load.
  readonly martialArts = martialArts;
  readonly martialArtBuild = martialArtBuild;
  readonly onIconError = noteMartialArtIconFailed;
  readonly visibleGear = visibleGear;
  readonly gearRows = gearRows;
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

  /** Logging out lives here because the login badge now opens this modal
   *  directly — this is the only place the action is reachable. */
  logout(): void {
    this.popupService.hide();
    this.authService.logout();
    this.router.navigate(['/']);
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

  /** Today's date on the card, so a shared screenshot carries its own as-of. */
  readonly capturedOn = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  // ── Screenshot ────────────────────────────────────────────────────────────
  /**
   * Rasterize the card and put the PNG on the clipboard. The buttons themselves
   * are excluded from the capture (`.pm-noshot`) so the shared image is just the
   * profile. Clipboard image writes are Chromium/Safari-only and must stay in the
   * click's task, so a rejected write falls back to downloading the same blob.
   *
   * The card is also the modal's scroll container, and the library sizes its
   * output from `clientHeight` while copying the computed `overflow` onto the
   * clone — so a tall profile would be cut at the fold. Capturing at
   * `scrollHeight` with overflow released gives the whole card in one image.
   */
  async screenshot(): Promise<void> {
    if (this.shot() === 'working') return;
    this.shot.set('working');
    try {
      const card = this.card().nativeElement;
      const fullHeight = card.scrollHeight;
      const blob = await toBlob(card, {
        // Shared with the member card so neither surface can end up sharper than the other; a
        // hard-coded 2 on each is how they diverged.
        pixelRatio: captureScale(card.clientWidth, fullHeight),
        // Width stays at the on-screen value (clientWidth, i.e. scrollbar
        // already discounted) so nothing reflows in the clone.
        height: fullHeight,
        backgroundColor: getComputedStyle(document.documentElement)
          .getPropertyValue('--color-surface').trim() || '#ffffff',
        style: { maxHeight: 'none', height: `${fullHeight}px`, overflow: 'visible' },
        // Curated font set — see card-fonts.ts for why we don't let the library
        // discover them itself.
        fontEmbedCSS: await cardFontCss(),
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
