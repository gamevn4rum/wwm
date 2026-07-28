import { Component, HostListener, computed, inject, input, OnInit, signal } from '@angular/core';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { toBlob } from 'html-to-image';
import { cardFontCss } from '../../../../core/utils/card-fonts';
import { Player } from '../../models/player.model';
import { HomeDataService } from '../../services/home-data.service';
import { PlayerStatsDataService } from '../../../roster-stats/player-stats-data.service';
import { MatchedPlayerStats, PlayerDetail, PlayerInnerWay } from '../../../roster-stats/player-stats.model';
import { InnerWayCatalogueService } from '../../../roster-stats/inner-way-catalogue.service';
import { InnerWayCatalogueEntry } from '../../../roster-stats/inner-way-catalogue.model';
import { SetCatalogueService } from '../../../roster-stats/set-catalogue.service';
import { SetCatalogueEntry } from '../../../roster-stats/set-catalogue.model';
import {
  ActiveSetEffect, computeActiveSetEffects, gearRows, isEffectAffix, schoolColor, tierClass,
} from '../../../roster-stats/build.utils';

export type { ActiveSetEffect };

/** Only fully-upgraded inner ways count for the Formation filter. */
const TIER_FILTERED = 5;

/** Where a share ended up. Clipboard first, download for browsers that refuse
 *  image writes (Firefox, older Safari) — same ladder as the profile modal. */
type ShotState = 'idle' | 'working' | 'copied' | 'downloaded' | 'failed';

@Component({
  selector: 'app-member-grid',
  standalone: true,
  imports: [DecimalPipe, NgTemplateOutlet],
  templateUrl: './member-grid.component.html',
  styleUrls: ['./member-grid.component.scss'],
})
export class MemberGridComponent implements OnInit {
  private homeDataService = inject(HomeDataService);
  private playerStatsService = inject(PlayerStatsDataService);
  private innerWayCatalogueService = inject(InnerWayCatalogueService);
  private setCatalogueService = inject(SetCatalogueService);

  /** Show the inner-way path filter above the grid (Formation page). */
  readonly innerWayFilter = input(false);

  readonly players = signal<Player[]>([]);
  private readonly statsByIgn = signal<Map<string, MatchedPlayerStats>>(new Map());
  private readonly innerWaysById = signal<Map<number, InnerWayCatalogueEntry>>(new Map());
  private readonly setsById = signal<Map<number, SetCatalogueEntry>>(new Map());
  readonly expandedId = signal<string | null>(null);
  // Only one member card is ever expanded at a time, so keying by inner-way id
  // alone (no player id) is safe — no cross-card collisions.
  private readonly activeUprankTab = signal<Map<number, number>>(new Map());
  /** Which inner way's detail card is open (click-to-open, not hover). */
  readonly openInnerWayId = signal<number | null>(null);

  // ── Inner-way path filter ───────────────────────────────────────────────
  /** Selected path.name; '' = no filter. */
  readonly pathFilter = signal('');

  /**
   * Filter options: every distinct `path.name` in the catalogue that has at least
   * one **tier-5** inner way (e.g. "Bamboocut – Kite", "General"). Derived from the
   * data rather than hard-coded, so a catalogue update can't leave a stale list.
   */
  readonly pathOptions = computed<string[]>(() => {
    const names = new Set<string>();
    for (const entry of this.innerWaysById().values()) {
      if (entry.tier !== TIER_FILTERED) continue;
      const name = entry.path?.name?.trim();
      if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  });

  /**
   * Players shown in the grid. With a path selected, only those with a **tier-5**
   * inner way equipped on that path — a member whose only inner way on it is tier 4
   * does not match. Members with no resolved stats can't be checked, so they drop
   * out of a filtered view.
   */
  readonly visiblePlayers = computed<Player[]>(() => {
    const path = this.pathFilter();
    if (!path) return this.players();
    return this.players().filter((p) => this.tier5Paths(p).has(path));
  });

  /** The distinct paths a player has a tier-5 inner way on. */
  private tier5Paths(player: Player): Set<string> {
    const paths = new Set<string>();
    const detail = this.statsFor(player)?.player;
    if (!detail) return paths;
    for (const iw of detail.innerWays) {
      // The player's own tier and the catalogue's agree across the whole roster;
      // the player's is used because it's what they actually have equipped.
      if (iw.tier !== TIER_FILTERED) continue;
      const name = this.innerWayInfo(iw.id)?.path?.name?.trim();
      if (name) paths.add(name);
    }
    return paths;
  }

  onPathFilter(event: Event): void {
    this.pathFilter.set((event.target as HTMLSelectElement).value);
    this.expandedId.set(null);      // a collapsed card may have just been filtered out
    this.openInnerWayId.set(null);
  }

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

  // Template-facing wrappers over the shared build helpers.
  readonly tierClass = tierClass;
  readonly isEffectAffix = isEffectAffix;
  readonly schoolColor = schoolColor;
  readonly gearRows = gearRows;

  /** Account creation → "Since Dec 2025". */
  joinedLabel(createTime: number | null): string {
    if (!createTime) return '';
    const d = new Date(createTime * 1000);
    if (isNaN(d.getTime())) return '';
    return `Since ${d.toLocaleString('en-US', { month: 'short', year: 'numeric' })}`;
  }

  /** Static catalogue entry (path/weapon/effect tags) for a player's inner way, if known. */
  innerWayInfo(id: number | null): InnerWayCatalogueEntry | undefined {
    if (id == null) return undefined;
    return this.innerWaysById().get(id);
  }

  findInnerWay(p: PlayerDetail, id: number | null): PlayerInnerWay | undefined {
    if (id == null) return undefined;
    return p.innerWays.find((iw) => iw.id === id);
  }

  /** Click a chip: opens its detail card, or closes it if it's already open. */
  toggleInnerWayDetail(id: number | null, event: Event): void {
    event.stopPropagation();
    if (id == null) return;
    this.openInnerWayId.set(this.openInnerWayId() === id ? null : id);
  }

  closeInnerWayDetail(): void {
    this.openInnerWayId.set(null);
  }

  /** Click anywhere outside a chip/the detail card closes it — both handlers above stop propagation. */
  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.openInnerWayId() !== null) this.closeInnerWayDetail();
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

  activeSetEffects(p: PlayerDetail): ActiveSetEffect[] {
    return computeActiveSetEffects(p, this.setsById());
  }

  // ── Share (one card → clipboard) ──────────────────────────────────────────
  // Only one card is expanded at a time, so a single state pair is enough; the
  // id is here purely so the label only changes on the card you clicked.
  readonly shotState = signal<ShotState>('idle');
  readonly shotPlayerId = signal<string | null>(null);

  shotLabel(player: Player): string {
    if (this.shotPlayerId() !== player.id) return 'SHARE';
    switch (this.shotState()) {
      case 'working':    return 'CAPTURING…';
      case 'copied':     return 'COPIED';
      case 'downloaded': return 'SAVED';
      case 'failed':     return 'FAILED';
      default:           return 'SHARE';
    }
  }

  /**
   * Rasterize just this member's card and put the PNG on the clipboard.
   *
   * A deliberately leaner card than the profile modal's: identity (name, UID,
   * rank), inner ways and gear, and nothing else. Everything else is marked
   * `.mg-noshot` in the template — stat tiles, set effects, the share and close
   * buttons, the "since" date, the roster note, an open inner-way panel.
   *
   * Those are *removed from an off-screen clone*, not filtered during capture.
   * html-to-image sizes its output from the live element's height, so filtering
   * nodes out of a 1490px card left ~600px of blank space under the gear. A
   * clone re-lays out at its own trimmed height and, being a copy, leaves the
   * card on screen untouched — no flicker while the fonts embed.
   */
  async share(player: Player, event: Event): Promise<void> {
    event.stopPropagation();
    if (this.shotState() === 'working') return;

    // The whole badge, not just `.badge-detail`: the rank class lives here and
    // carries --accent, which the chips and gear borders are coloured from.
    const badge = (event.currentTarget as HTMLElement)?.closest('.member-badge') as HTMLElement | null;
    if (!badge) return;

    this.shotPlayerId.set(player.id);
    this.shotState.set('working');

    const host = document.createElement('div');
    try {
      const clone = badge.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.mg-noshot').forEach((n) => n.remove());
      // The collapsed summary is the click target, not part of the build.
      clone.querySelector('.badge-summary')?.remove();
      // A view-transition-name must be unique in the document, and this one is
      // already claimed by the card we cloned.
      clone.style.removeProperty('view-transition-name');
      // `.badge-detail` has no top padding — on screen the summary above it
      // provides that space, and it has just been removed.
      const detail = clone.querySelector('.badge-detail') as HTMLElement | null;
      if (detail) detail.style.paddingTop = 'var(--space-5)';

      // Off-screen but laid out: display:none would give every child zero size.
      // Pinned to the original's width so the gear grid wraps identically.
      host.style.cssText =
        `position: fixed; left: -10000px; top: 0; width: ${badge.offsetWidth}px; pointer-events: none;`;
      host.appendChild(clone);
      document.body.appendChild(host);

      const blob = await toBlob(clone, {
        pixelRatio: 2,
        backgroundColor: getComputedStyle(document.documentElement)
          .getPropertyValue('--color-surface').trim() || '#ffffff',
        // Curated font set — see card-fonts.ts for why we don't let the library
        // discover them itself.
        fontEmbedCSS: await cardFontCss(),
      });
      if (!blob) { this.shotState.set('failed'); return; }

      // Clipboard image writes must stay in the click's task; a rejection falls
      // back to downloading the same blob.
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        this.shotState.set('copied');
      } catch {
        this.download(blob, player.name);
        this.shotState.set('downloaded');
      }
    } catch {
      this.shotState.set('failed');
    } finally {
      host.remove();
      setTimeout(() => {
        this.shotState.set('idle');
        this.shotPlayerId.set(null);
      }, 3200);
    }
  }

  private download(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(name || 'member').replace(/[^\w.-]+/g, '-')}-build.png`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
