import { Component, ChangeDetectionStrategy, effect, inject, signal, untracked, ElementRef, viewChildren } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { ManageMembersPageComponent } from './manage-members-page.component';
import { GuildsPanelComponent } from './guilds-panel.component';
import { RsvpDisplayPanelComponent } from './rsvp-display-panel.component';

type TabKey = 'members' | 'guilds' | 'event-posts';

interface Tab {
  key: TabKey;
  label: string;
  blurb: string;
}

const TABS: Tab[] = [
  { key: 'members', label: 'Members', blurb: 'Permissions and roster details for GameVN and GVN2.' },
  { key: 'guilds', label: 'Guilds', blurb: 'Opponent guilds: UIDs, duplicates and scouting.' },
  { key: 'event-posts', label: 'Event posts', blurb: 'How the RSVP posts list who signed up.' },
];

/**
 * The Manage hub: our members, the opponent guilds we play, and the event-post setting, as tabs.
 * The active tab lives in `?tab=` so a link or a refresh lands on it. A tab is mounted on first
 * visit and then kept (hidden), so unsaved edits survive switching away and back.
 */
@Component({
  selector: 'app-manage-page',
  standalone: true,
  imports: [ManageMembersPageComponent, GuildsPanelComponent, RsvpDisplayPanelComponent],
  template: `
    <section class="wrap">
      <header class="page-head">
        <h1>Manage</h1>
        <p class="intro">The guild's rosters — ours, and everyone we play.</p>
      </header>

      <div class="tabs" role="tablist" aria-label="Manage sections" (keydown)="onKey($event)">
        @for (t of tabs; track t.key) {
          <button
            #tabBtn
            type="button"
            role="tab"
            class="tab"
            [id]="'tab-' + t.key"
            [attr.aria-selected]="active() === t.key"
            [attr.aria-controls]="'panel-' + t.key"
            [tabIndex]="active() === t.key ? 0 : -1"
            (click)="select(t.key)"
          >
            {{ t.label }}
            @if (badge(t.key); as b) {
              <span class="badge" [class.warn]="b.warn" [title]="b.title">{{ b.text }}</span>
            }
          </button>
        }
      </div>

      @for (t of tabs; track t.key) {
        <section
          class="panel"
          role="tabpanel"
          [id]="'panel-' + t.key"
          [attr.aria-labelledby]="'tab-' + t.key"
          [hidden]="active() !== t.key"
        >
          <p class="blurb">{{ t.blurb }}</p>
          @if (visited().has(t.key)) {
            @switch (t.key) {
              @case ('members') {
                <app-manage-members-page (countChange)="memberCount.set($event)" />
              }
              @case ('guilds') {
                <app-guilds-panel (pendingChange)="guildsPending.set($event)" />
              }
              @case ('event-posts') {
                <app-rsvp-display-panel />
              }
            }
          }
        </section>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      .wrap {
        max-width: 1400px;
        margin: 0 auto;
        padding: var(--space-5) var(--space-4) var(--space-7);
      }
      .page-head h1 {
        font-family: var(--font-heading);
        font-size: 2rem;
        margin: 0;
      }
      .intro {
        color: var(--color-ink-soft);
        margin: var(--space-1) 0 var(--space-4);
      }
      .tabs {
        display: flex;
        gap: var(--space-1);
        border-bottom: 1px solid var(--color-border-strong);
        overflow-x: auto;
        scrollbar-width: none;
      }
      .tab {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-4);
        margin-bottom: -1px;
        font: inherit;
        font-weight: 600;
        color: var(--color-ink-soft);
        background: transparent;
        border: 1px solid transparent;
        border-bottom: none;
        border-radius: var(--radius-sm) var(--radius-sm) 0 0;
        cursor: pointer;
        white-space: nowrap;
        transition: color var(--transition-fast), background var(--transition-fast);
      }
      .tab:hover {
        color: var(--color-ink);
        background: var(--color-primary-tint);
      }
      .tab[aria-selected='true'] {
        color: var(--color-primary-dark);
        background: var(--color-surface);
        border-color: var(--color-border-strong);
        box-shadow: inset 0 3px 0 var(--color-primary);
      }
      .tab:focus-visible {
        outline: 2px solid var(--color-primary);
        outline-offset: -2px;
      }
      .badge {
        font-size: 0.72rem;
        font-weight: 600;
        padding: 0.05rem 0.45rem;
        border-radius: var(--radius-pill);
        background: var(--color-bg-alt);
        color: var(--color-ink-soft);
      }
      .badge.warn {
        background: var(--color-primary-tint);
        color: var(--color-primary-dark);
      }
      .panel {
        background: var(--color-surface);
        border: 1px solid var(--color-border-strong);
        border-top: none;
        border-radius: 0 0 var(--radius-md) var(--radius-md);
        padding: var(--space-4) var(--space-5) var(--space-5);
        box-shadow: var(--shadow-sm);
      }
      .blurb {
        color: var(--color-ink-faint);
        font-size: 0.85rem;
        margin: 0 0 var(--space-2);
      }
      @media (max-width: 600px) {
        .wrap {
          padding: var(--space-4) var(--space-2) var(--space-6);
        }
        .panel {
          padding: var(--space-3) var(--space-2) var(--space-4);
        }
        .tab {
          padding: var(--space-2) var(--space-3);
        }
      }
    `,
  ],
})
export class ManagePageComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabBtn');

  readonly tabs = TABS;

  readonly active = toSignal(
    this.route.queryParamMap.pipe(
      map((p) => {
        const tab = p.get('tab');
        return (TABS.some((t) => t.key === tab) ? tab : 'members') as TabKey;
      }),
    ),
    { initialValue: 'members' as TabKey },
  );

  /** Every tab ever shown, so it stays mounted. */
  readonly visited = signal<ReadonlySet<TabKey>>(new Set([this.active()]));

  constructor() {
    effect(() => {
      const tab = this.active();
      untracked(() => this.visited.update((s) => (s.has(tab) ? s : new Set([...s, tab]))));
    });
  }

  readonly memberCount = signal<number | null>(null);
  readonly guildsPending = signal<number | null>(null);

  badge(key: TabKey): { text: string; title: string; warn: boolean } | null {
    if (key === 'members' && this.memberCount() != null) {
      return { text: String(this.memberCount()), title: 'Members listed', warn: false };
    }
    if (key === 'guilds' && this.guildsPending()) {
      return { text: String(this.guildsPending()), title: 'Guilds without a UID', warn: true };
    }
    return null;
  }

  select(key: TabKey): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: key === 'members' ? null : key },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** Arrow keys, Home and End move between tabs, as the ARIA tabs pattern expects. */
  onKey(e: KeyboardEvent): void {
    const i = TABS.findIndex((t) => t.key === this.active());
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else return;
    e.preventDefault();
    this.select(TABS[next].key);
    this.tabButtons()[next]?.nativeElement.focus();
  }
}
