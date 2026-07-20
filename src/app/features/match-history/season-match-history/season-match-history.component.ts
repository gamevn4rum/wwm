import { Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NgxTimelineComponent, NgxTimelineEventGroup, NgxTimelineOrientation } from '@frxjs/ngx-timeline';
import { map } from 'rxjs/operators';
import { MatchRecord, MatchType, TimelineNode } from '../match-record.model';
import { FootagePopupService } from '../../../core/services/footage-popup.service';
import { DiscordAuthService } from '../../../core/services/discord-auth.service';

const MONTH_LABELS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

/** "2026-05-19" → { label: "19 MAY", timestamp: Date } */
function dateToTimeline(iso: string): { label: string; timestamp: Date } {
  const d = new Date(iso);
  const label = `${String(d.getUTCDate()).padStart(2, '0')} ${MONTH_LABELS[d.getUTCMonth()]}`;
  return { label, timestamp: d };
}

/** Build a slug id from date + opponent */
function slugId(date: string, opponent: string): string {
  return `${date}-${opponent}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * Renders one season's timeline + League/Ranked/Scrim card grid. Used twice
 * by the page: unwrapped for the latest season, and once per collapsed panel
 * for every earlier season — `matches` is always pre-filtered (season +
 * opponent) by the parent before it gets here.
 */
@Component({
  selector: 'app-season-match-history',
  standalone: true,
  imports: [NgxTimelineComponent],
  templateUrl: './season-match-history.component.html',
  styleUrls: ['./season-match-history.component.scss'],
})
export class SeasonMatchHistoryComponent {
  private readonly popup = inject(FootagePopupService);
  private readonly authService = inject(DiscordAuthService);

  readonly matches = input<MatchRecord[]>([]);
  /**
   * Historical (closed) seasons plot every match with no recency window;
   * the live/current season keeps the "last two calendar months, with a
   * phantom anchor for any month with no matches" behaviour so its timeline
   * always shows exactly two month columns even when quiet.
   */
  readonly historical = input(false);

  /** True when the logged-in user has Footage Permission (FTP). */
  readonly ftpPermission = toSignal(
    this.authService.currentUser$.pipe(map((user) => user?.ftp ?? false)),
    { initialValue: false }
  );

  readonly horizontalOrientation = NgxTimelineOrientation.HORIZONTAL;
  readonly monthYearGroup = NgxTimelineEventGroup.MONTH_YEAR;

  readonly leagueMatches = computed(() => this.matches().filter((m) => m.type === 'league'));
  readonly rankedMatches = computed(() => this.matches().filter((m) => m.type === 'ranked'));
  readonly scrimMatches  = computed(() => this.matches().filter((m) => m.type === 'scrim'));

  readonly timelineEvents = computed<TimelineNode[]>(() => {
    if (this.historical()) {
      return [...this.matches()]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((m) => this.toNode(m));
    }

    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const sorted = [...this.matches()]
      .filter((m) => new Date(m.date) >= cutoff)
      .sort((a, b) => a.date.localeCompare(b.date));

    const nodes: TimelineNode[] = sorted.map((m) => this.toNode(m));

    // Inject a hidden phantom anchor for any month that has no real events,
    // so the library still renders its period separator for that month.
    const months = [
      new Date(now.getFullYear(), now.getMonth() - 1, 1),
      new Date(now.getFullYear(), now.getMonth(), 1),
    ];
    for (const anchor of months) {
      const y = anchor.getFullYear();
      const mo = anchor.getMonth();
      const covered = nodes.some((n) => !n.phantom &&
        n.timestamp.getFullYear() === y && n.timestamp.getMonth() === mo);
      if (!covered) {
        nodes.push({
          id:        `phantom-${y}-${mo}`,
          timestamp: anchor,
          label:     '',
          opponent:  '',
          matchType: 'scrim',
          status:    '➕',
          phantom:   true,
        } satisfies TimelineNode);
      }
    }

    return nodes.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  });

  /** Highlight the most recent match node in the timeline. */
  readonly activeNodeId = computed<string>(() => {
    const nodes = this.timelineEvents();
    return nodes.length ? (nodes[nodes.length - 1].id as string) : '';
  });

  private toNode(m: MatchRecord): TimelineNode {
    const { label, timestamp } = dateToTimeline(m.date);
    return {
      id:        slugId(m.date, m.opponent),
      timestamp,
      label,
      opponent:  m.opponent,
      matchType: m.type,
      status:    m.status,
      phantom:   false,
    } satisfies TimelineNode;
  }

  resolveStatus(status: MatchRecord['status']): 'victory' | 'failure' | 'draw' {
    if (status === '✅') return 'victory';
    if (status === '❌') return 'failure';
    return 'draw';
  }

  getResultIconClass(status: MatchRecord['status']): string {
    if (status === '✅') return 'icon-trophy';
    if (status === '❌') return 'icon-cross';
    return 'icon-shield';
  }

  getTypeIconSrc(type: MatchType): string {
    if (type === 'league') return 'icons/icon-swords.png';
    if (type === 'ranked') return 'icons/icon-mountain.png';
    return 'icons/icon-target.png';
  }

  getResultIconSrc(status: MatchRecord['status']): string {
    if (status === '✅') return 'icons/icon-trophy.png';
    if (status === '❌') return 'icons/icon-cross.png';
    return 'icons/icon-shield.png';
  }

  getPeriodLabel(periodInfo: { month: number; year: number } | null): string {
    const m = periodInfo?.month;
    const y = periodInfo?.year;
    if (m == null || y == null) return '';
    return `${MONTH_LABELS[m]} ${y}`;
  }

  openPopup(match: MatchRecord): void {
    this.popup.open(match);
  }

  formatDate(isoDate: string): string {
    const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const d = new Date(isoDate);
    const day = String(d.getUTCDate()).padStart(2, '0');
    const mon = MONTH_ABBR[d.getUTCMonth()];
    const year = d.getUTCFullYear();
    return `${day}/${mon}/${year}`;
  }
}
