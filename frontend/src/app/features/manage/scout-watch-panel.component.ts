import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { BackofficeService, ManagedGuild, ScoutWatchGuild } from '../../core/services/backoffice.service';

const MAX = 20;
const NUMBER = /^\d{4,15}$/;

/**
 * The guilds the GvG panel's Scout button checks every minute (bot: GvgScoutWatch). Edited as a
 * draft and saved as a whole list, because order is what the bot's report follows.
 *
 * A tracked guild is added by name (picked from the identified ones); any other guild by its
 * in-game number, which the backend resolves when it scouts.
 */
@Component({
  selector: 'app-scout-watch-panel',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="backoffice">
      <p class="hint">
        Press <strong>🔭 Scout</strong> on the <code>/gmpanel</code> panel and the bot posts these
        guilds' GvG status every minute (In match ✅ / Not in match ❌), until Stop or 22:00.
        Order here is the order in the report.
      </p>

      @if (loading()) {
        <p>Loading…</p>
      } @else if (loadError()) {
        <p class="bad">{{ loadError() }}</p>
      } @else {
        <ol class="list">
          @for (q of draft(); track q; let i = $index; let last = $last) {
            <li>
              <span class="name">{{ label(q) }}</span>
              <span class="ctl">
                <button type="button" (click)="move(i, -1)" [disabled]="i === 0" aria-label="Move up">↑</button>
                <button type="button" (click)="move(i, 1)" [disabled]="last" aria-label="Move down">↓</button>
                <button type="button" (click)="remove(i)" aria-label="Remove">✕</button>
              </span>
            </li>
          } @empty {
            <li class="empty">No guilds yet.</li>
          }
        </ol>

        <div class="add">
          <select [(ngModel)]="pick" [disabled]="full()" aria-label="Tracked guild">
            <option value="">— tracked guild —</option>
            @for (g of pickable(); track g.id) {
              <option [value]="g.name">{{ g.name }}</option>
            }
          </select>
          <button type="button" (click)="add(pick); pick = ''" [disabled]="!pick || full()">Add</button>
          <span class="or">or</span>
          <input [(ngModel)]="number" placeholder="guild number, e.g. 10005661" inputmode="numeric"
                 [disabled]="full()" (keydown.enter)="addNumber()" />
          <button type="button" (click)="addNumber()" [disabled]="!number.trim() || full()">Add</button>
        </div>

        <div class="save">
          <button type="button" class="primary" (click)="save()" [disabled]="saving() || !dirty()">
            {{ saving() ? 'Saving…' : 'Save' }}
          </button>
          <span class="count">{{ draft().length }}/{{ max }}</span>
          @if (result(); as r) {
            <span [class.ok]="r.ok" [class.bad]="!r.ok">{{ r.text }}</span>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .backoffice { padding: .25rem 0 0; }
    .hint { opacity: .75; margin-bottom: 1rem; line-height: 1.5; }
    .list { margin: 0 0 1rem; padding-left: 1.6rem; }
    .list li { padding: .35rem 0; border-bottom: 1px solid rgba(128,128,128,.2); }
    .list li:not(.empty) { display: flex; align-items: center; gap: .6rem; }
    .list li.empty { list-style: none; margin-left: -1.6rem; opacity: .6; }
    .name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .ctl { display: flex; gap: .25rem; }
    .ctl button { padding: .15rem .5rem; }
    .add, .save { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; margin-bottom: .75rem; }
    .add select { min-width: 12rem; max-width: 100%; }
    .add input { width: 14rem; max-width: 100%; }
    .or { opacity: .6; font-size: .85rem; }
    select, input { padding: .35rem .5rem; border-radius: 6px; border: 1px solid rgba(128,128,128,.4);
      background: transparent; color: inherit; }
    button { padding: .4rem .85rem; cursor: pointer; border-radius: 6px;
      border: 1px solid rgba(128,128,128,.4); background: transparent; color: inherit; }
    button.primary { font-weight: 700; }
    button:disabled { opacity: .5; cursor: default; }
    .count { opacity: .6; font-size: .85rem; }
    .ok { color: #28a745; }
    .bad { color: #dc3545; }
  `],
})
export class ScoutWatchPanelComponent implements OnInit {
  private readonly backoffice = inject(BackofficeService);
  readonly max = MAX;

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly result = signal<{ ok: boolean; text: string } | null>(null);

  readonly stored = signal<ScoutWatchGuild[]>([]);
  readonly draft = signal<string[]>([]);
  readonly guilds = signal<ManagedGuild[]>([]);
  pick = '';
  number = '';

  readonly full = computed(() => this.draft().length >= MAX);
  readonly dirty = computed(() => this.draft().join('\n') !== this.stored().map((s) => s.query).join('\n'));
  readonly pickable = computed(() => {
    const taken = new Set(this.draft().map((q) => q.toLowerCase()));
    return this.guilds()
      .filter((g) => g.identified && !taken.has(g.name.toLowerCase())
        && !(g.numberId != null && taken.has(String(g.numberId))))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  ngOnInit(): void {
    this.backoffice.getScoutWatch().subscribe({
      next: (rows) => { this.apply(rows); this.loading.set(false); },
      error: () => { this.loadError.set('Failed to load the scout list.'); this.loading.set(false); },
    });
    // Only feeds the picker; a failure leaves number entry working.
    this.backoffice.getGuilds().subscribe({ next: (g) => this.guilds.set(g), error: () => {} });
  }

  /** A number shows our name for it when we track that guild. */
  label(q: string): string {
    const known = this.stored().find((s) => s.query === q)?.trackedName
      ?? this.guilds().find((g) => g.numberId != null && String(g.numberId) === q)?.name;
    return known ? `${known} (#${q})` : NUMBER.test(q) ? `#${q}` : q;
  }

  add(q: string): void {
    q = q.trim();
    if (!q || this.full() || this.draft().some((d) => d.toLowerCase() === q.toLowerCase())) return;
    this.draft.update((d) => [...d, q]);
    this.result.set(null);
  }

  addNumber(): void {
    const n = this.number.trim();
    if (!NUMBER.test(n)) {
      this.result.set({ ok: false, text: 'A guild number is digits only, like 10005661.' });
      return;
    }
    this.add(n);
    this.number = '';
  }

  move(i: number, by: number): void {
    this.draft.update((d) => {
      const next = [...d];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });
  }

  remove(i: number): void {
    this.draft.update((d) => d.filter((_, j) => j !== i));
    this.result.set(null);
  }

  save(): void {
    if (this.saving() || !this.dirty()) return;
    this.saving.set(true);
    this.backoffice.setScoutWatch(this.draft()).subscribe({
      next: (rows) => {
        this.apply(rows);
        this.saving.set(false);
        this.result.set({ ok: true, text: 'Saved.' });
      },
      error: (e: HttpErrorResponse) => {
        this.saving.set(false);
        const err = e.error?.error;
        this.result.set({
          ok: false,
          text: err === 'unknown_guild' ? `"${e.error.query}" is not a tracked guild — add it by number instead.`
            : err === 'too_many' ? `At most ${MAX} guilds.`
            : 'Save failed.',
        });
      },
    });
  }

  private apply(rows: ScoutWatchGuild[]): void {
    this.stored.set(rows);
    this.draft.set(rows.map((r) => r.query));
  }
}
