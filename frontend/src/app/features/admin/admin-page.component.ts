import { Component, computed, inject, signal, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  BackofficeService,
  FeatureFlag,
  SyncRunResult,
  SyncStatus,
} from '../../core/services/backoffice.service';

/** Wording for the flags we know. An unknown key still shows, under its own label or key. */
const FLAG_TEXT: Record<string, { label: string; description: string }> = {
  'bot.show-stale-data': {
    label: 'Show stale data',
    description:
      "Let the bot show game figures and leaderboards whose source hasn't refreshed in over a week.",
  },
  'page.guild': { label: 'Guild page', description: 'Roster and guild info, for members.' },
  'page.formation': { label: 'Formation page', description: 'GvG lineups and the Form GvG Team modal.' },
  'page.match-history': { label: 'Match History page', description: 'Past GvG matches and scoreboards.' },
  'page.footages': { label: 'Footages page', description: 'Match recordings and highlights.' },
  'page.roster-stats': { label: 'Roster Stats', description: 'Member stats and builds.' },
  'feature.login': { label: 'Discord login', description: 'Let members sign in to the site with Discord.' },
  'rsvp.path-badges': {
    label: 'RSVP martial-path badges',
    description: 'Event posts list sign-ups by martial path instead of combat role (also on Manage).',
  },
};

interface SyncSource {
  key: string;
  label: string;
  description: string;
}

const SYNC_SOURCES: SyncSource[] = [
  { key: 'guild', label: 'Guild', description: 'The usual guild sweep: our roster and the unsigned boards.' },
  { key: 'our-guild', label: 'Our guild', description: 'GameVN and GVN2 identity and roster only.' },
  { key: 'opponent-guilds', label: 'Opponent guilds', description: 'Every tracked opponent guild.' },
  { key: 'opponent-names', label: 'Opponent names', description: 'Resolve opponent guild names to UIDs.' },
  { key: 'guild-honors', label: 'Guild honors', description: "This week's honor holders (homepage, /gvn)." },
  { key: 'guild-prosperity', label: 'Prosperity board', description: 'Our prosperity standing.' },
  { key: 'guild-war-ranked', label: 'Guild War — Ranked', description: 'Our ranked Guild War standing.' },
  { key: 'guild-war-league', label: 'Guild War — League', description: 'The league table.' },
  { key: 'guild-boards', label: 'Guild boards', description: 'Every guild leaderboard at once.' },
  { key: 'gvg-member-stats', label: 'GvG member stats', description: 'Rebuild the /gvgstats rollup from recorded matches.' },
  { key: 'all', label: 'Everything', description: 'Every source above in one run. Slow — use sparingly.' },
];

interface RunOutcome {
  ok: boolean;
  text: string;
  result: SyncRunResult | null;
  at: Date;
}

/**
 * Admin: what the bot and the website do (stored as feature flags — `bot.*` is the bot's), and
 * buttons to run a sync now.
 */
@Component({
  selector: 'app-admin-page',
  standalone: true,
  imports: [DatePipe, NgTemplateOutlet],
  template: `
    <section class="wrap">
      <header class="page-head">
        <h1>Admin</h1>
        <p class="intro">Bot and website configuration, and on-demand syncs.</p>
      </header>

      @if (loading()) {
        <p class="note">Loading…</p>
      } @else if (error()) {
        <p class="note error">{{ error() }}</p>
      } @else {
        <div class="cols">
          <section class="card" aria-labelledby="bot-head">
            <h2 id="bot-head">Bot configuration</h2>
            <p class="sub">Read by the Discord bot within a minute of a change.</p>
            <ul class="toggles">
              @for (flag of botFlags(); track flag.key) {
                <ng-container *ngTemplateOutlet="toggle; context: { $implicit: flag }" />
              } @empty {
                <li class="note">No bot settings yet.</li>
              }
            </ul>
          </section>

          <section class="card" aria-labelledby="web-head">
            <h2 id="web-head">Web configuration</h2>
            <p class="sub">Turning a page off stops the server serving its data, not just the link.</p>
            <ul class="toggles">
              @for (flag of webFlags(); track flag.key) {
                <ng-container *ngTemplateOutlet="toggle; context: { $implicit: flag }" />
              }
            </ul>
          </section>
        </div>
      }

      <section class="card sync" aria-labelledby="sync-head">
        <div class="sync-head">
          <div>
            <h2 id="sync-head">Sync triggers</h2>
            <p class="sub">Run a sync now instead of waiting for its timer. "Last change" is when it last wrote new data.</p>
          </div>
          <button type="button" class="btn ghost" (click)="loadStatus()" [disabled]="statusLoading()">
            {{ statusLoading() ? 'Refreshing…' : 'Refresh' }}
          </button>
        </div>

        <ul class="sources">
          @for (s of sources; track s.key) {
            @let out = outcomes()[s.key];
            <li class="source" [class.everything]="s.key === 'all'">
              <div class="source-main">
                <div class="source-text">
                  <span class="source-name">{{ s.label }} <code>{{ s.key }}</code></span>
                  <span class="source-desc">{{ s.description }}</span>
                  <span class="source-when">
                    @if (lastChange(s.key); as at) {
                      Last change {{ at | date: 'dd/MM HH:mm' }}
                    } @else if (status()) {
                      No recorded change
                    }
                  </span>
                </div>
                <button
                  type="button"
                  class="btn"
                  [class.danger]="s.key === 'all'"
                  [disabled]="running().has(s.key)"
                  (click)="run(s)"
                >
                  {{ running().has(s.key) ? 'Running…' : 'Run' }}
                </button>
              </div>
              @if (out) {
                <div class="outcome" [class.ok]="out.ok" [class.bad]="!out.ok" role="status">
                  <strong>{{ out.text }}</strong>
                  <span class="at">{{ out.at | date: 'HH:mm:ss' }}</span>
                  @if (out.result?.details?.length) {
                    <ul class="details">
                      @for (d of out.result!.details; track $index) {
                        <li><span class="tag">{{ d.outcome }}</span> {{ d.message }}</li>
                      }
                    </ul>
                  }
                  @if (out.result?.itemWarnings?.length) {
                    <details class="warnings">
                      <summary>{{ out.result!.itemWarningCount }} item warning(s)</summary>
                      <ul>
                        @for (w of out.result!.itemWarnings; track $index) {
                          <li>{{ w }}</li>
                        }
                      </ul>
                    </details>
                  }
                </div>
              }
            </li>
          }
        </ul>
      </section>
    </section>

    <ng-template #toggle let-flag>
      <li class="toggle-row">
        <div class="toggle-text">
          <span class="toggle-name">{{ text(flag).label }}</span>
          @if (text(flag).description) {
            <span class="toggle-desc">{{ text(flag).description }}</span>
          }
          <code class="toggle-key">{{ flag.key }}</code>
        </div>
        <button
          type="button"
          role="switch"
          class="switch"
          [attr.aria-checked]="flag.enabled"
          [attr.aria-label]="text(flag).label"
          [disabled]="busy() === flag.key"
          (click)="toggleFlag(flag)"
        >
          <span class="knob"></span>
        </button>
      </li>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      .wrap {
        max-width: 1100px;
        margin: 0 auto;
        padding: var(--space-5) var(--space-4) var(--space-7);
      }
      .page-head h1 {
        font-family: var(--font-heading);
        font-size: 2rem;
        margin: 0;
      }
      .intro,
      .sub,
      .note {
        color: var(--color-ink-soft);
      }
      .intro {
        margin: var(--space-1) 0 var(--space-5);
      }
      .sub {
        font-size: 0.85rem;
        margin: 0 0 var(--space-3);
      }
      .error {
        color: var(--color-danger);
      }
      .cols {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: var(--space-4);
        margin-bottom: var(--space-4);
      }
      .card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-sm);
        padding: var(--space-4) var(--space-5);
      }
      .card h2 {
        font-family: var(--font-heading);
        font-size: 1.35rem;
        margin: 0 0 var(--space-1);
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        padding: var(--space-3) 0;
        border-top: 1px solid var(--color-border);
      }
      .toggle-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .toggle-name {
        font-weight: 600;
      }
      .toggle-desc {
        font-size: 0.85rem;
        color: var(--color-ink-soft);
      }
      .toggle-key,
      code {
        font-size: 0.72rem;
        color: var(--color-ink-faint);
      }
      .switch {
        flex: none;
        position: relative;
        width: 44px;
        height: 24px;
        border-radius: var(--radius-pill);
        border: 1px solid var(--color-border-strong);
        background: var(--color-bg-alt);
        cursor: pointer;
        transition: background var(--transition-fast);
        padding: 0;
      }
      .switch .knob {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--color-surface);
        box-shadow: var(--shadow-sm);
        transition: transform var(--transition-fast);
      }
      .switch[aria-checked='true'] {
        background: var(--color-secondary);
        border-color: var(--color-secondary-dark);
      }
      .switch[aria-checked='true'] .knob {
        transform: translateX(20px);
      }
      .switch:disabled {
        opacity: 0.55;
        cursor: progress;
      }
      .switch:focus-visible,
      .btn:focus-visible {
        outline: 2px solid var(--color-primary);
        outline-offset: 2px;
      }
      .sync-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: var(--space-3);
      }
      .sources {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: var(--space-3);
        margin-top: var(--space-2);
      }
      .source {
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        background: var(--color-surface-alt);
        padding: var(--space-3);
      }
      .source.everything {
        border-color: var(--color-danger-tint);
      }
      .source-main {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--space-3);
      }
      .source-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .source-name {
        font-weight: 600;
      }
      .source-desc {
        font-size: 0.85rem;
        color: var(--color-ink-soft);
      }
      .source-when {
        font-size: 0.75rem;
        color: var(--color-ink-faint);
      }
      .btn {
        flex: none;
        font: inherit;
        font-weight: 600;
        font-size: 0.85rem;
        padding: 0.4rem 0.95rem;
        border-radius: var(--radius-pill);
        border: 1px solid var(--color-primary-dark);
        background: var(--color-primary);
        color: #fff;
        cursor: pointer;
      }
      .btn:hover:not(:disabled) {
        background: var(--color-primary-dark);
      }
      .btn.ghost {
        background: transparent;
        color: var(--color-primary-dark);
      }
      .btn.ghost:hover:not(:disabled) {
        background: var(--color-primary-tint);
      }
      .btn.danger {
        background: var(--color-danger);
        border-color: var(--color-danger);
      }
      .btn:disabled {
        opacity: 0.6;
        cursor: progress;
      }
      .outcome {
        margin-top: var(--space-2);
        padding: var(--space-2) var(--space-3);
        border-radius: var(--radius-sm);
        font-size: 0.85rem;
      }
      .outcome.ok {
        background: var(--color-secondary-tint);
      }
      .outcome.bad {
        background: var(--color-danger-tint);
      }
      .outcome .at {
        margin-left: var(--space-2);
        color: var(--color-ink-faint);
        font-size: 0.75rem;
      }
      .details,
      .warnings ul {
        margin-top: var(--space-1);
      }
      .details li,
      .warnings li {
        padding: 1px 0;
        word-break: break-word;
      }
      .tag {
        display: inline-block;
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: var(--tracking-wide);
        color: var(--color-ink-soft);
        margin-right: var(--space-1);
      }
      .warnings summary {
        cursor: pointer;
        margin-top: var(--space-1);
      }
      @media (max-width: 600px) {
        .wrap {
          padding: var(--space-4) var(--space-3) var(--space-6);
        }
        .card {
          padding: var(--space-3) var(--space-3);
        }
        .sources {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class AdminPageComponent implements OnInit {
  private readonly backoffice = inject(BackofficeService);

  readonly sources = SYNC_SOURCES;

  readonly flags = signal<FeatureFlag[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly busy = signal<string | null>(null);

  readonly botFlags = computed(() => this.flags().filter((f) => f.key.startsWith('bot.')));
  readonly webFlags = computed(() => this.flags().filter((f) => !f.key.startsWith('bot.')));

  readonly status = signal<SyncStatus | null>(null);
  readonly statusLoading = signal(false);
  readonly running = signal<ReadonlySet<string>>(new Set());
  readonly outcomes = signal<Record<string, RunOutcome>>({});

  ngOnInit(): void {
    this.backoffice.getFeatures().subscribe({
      next: (f) => {
        this.flags.set(this.withDefaults(f));
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load the configuration.');
        this.loading.set(false);
      },
    });
    this.loadStatus();
  }

  text(flag: FeatureFlag): { label: string; description: string } {
    return FLAG_TEXT[flag.key] ?? { label: flag.label || flag.key, description: '' };
  }

  toggleFlag(flag: FeatureFlag): void {
    this.busy.set(flag.key);
    this.backoffice.setFeature(flag.key, !flag.enabled).subscribe({
      next: (updated) => {
        this.flags.update((list) => list.map((f) => (f.key === updated.key ? updated : f)));
        this.busy.set(null);
      },
      error: () => this.busy.set(null),
    });
  }

  loadStatus(): void {
    this.statusLoading.set(true);
    this.backoffice.getSyncStatus().subscribe({
      next: (s) => {
        this.status.set(s);
        this.statusLoading.set(false);
      },
      error: () => this.statusLoading.set(false),
    });
  }

  lastChange(source: string): string | null {
    return this.status()?.sources.find((s) => s.source === source)?.lastRunUtc ?? null;
  }

  run(s: SyncSource): void {
    if (s.key === 'all' && !confirm('Run every sync source now? This can take a few minutes.')) return;
    this.running.update((set) => new Set(set).add(s.key));
    const done = (outcome: Omit<RunOutcome, 'at'>) => {
      this.outcomes.update((o) => ({ ...o, [s.key]: { ...outcome, at: new Date() } }));
      this.running.update((set) => {
        const next = new Set(set);
        next.delete(s.key);
        return next;
      });
    };
    this.backoffice.runSync(s.key).subscribe({
      next: (result) => {
        done({ ok: !result || !result.status.includes('degraded'), text: this.describe(result), result });
        this.loadStatus();
      },
      error: (err: HttpErrorResponse) => {
        const body = err.error && typeof err.error === 'object' ? err.error : null;
        const text =
          err.status === 501
            ? 'Sync trigger not configured'
            : err.status === 0
              ? 'Could not reach the API'
              : `Failed (HTTP ${err.status})`;
        done({ ok: false, text, result: body && 'status' in body ? (body as SyncRunResult) : null });
      },
    });
  }

  private describe(r: SyncRunResult | null): string {
    if (!r) return 'Done';
    switch (r.status) {
      case 'applied':
        return 'Applied — new data written';
      case 'unchanged':
        return 'Unchanged — nothing new';
      case 'degraded':
        return 'Degraded — upstream failed, kept the last good data';
      case 'applied-degraded':
        return 'Partly applied — some sources failed';
      case 'no-op':
        return 'Nothing to do';
      default:
        return r.status;
    }
  }

  /** A bot setting with no stored row yet still shows, off (its default). */
  private withDefaults(flags: FeatureFlag[]): FeatureFlag[] {
    const known = new Set(flags.map((f) => f.key));
    const missing = Object.keys(FLAG_TEXT)
      .filter((k) => k.startsWith('bot.') && !known.has(k))
      .map((key) => ({ key, enabled: false, label: FLAG_TEXT[key].label }));
    return [...missing, ...flags];
  }
}
