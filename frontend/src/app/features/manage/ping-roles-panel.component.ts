import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  BackofficeService,
  EventPingRole,
  ScheduledEventType,
} from '../../core/services/backoffice.service';

const EVENT_TYPES: readonly ScheduledEventType[] = ['GvG', 'GvE', 'Event'];
const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Vietnam is a fixed UTC+7 (no DST)
const ROLE_ID = /^\d{1,24}$/;

/** What each type's role is for, so an admin editing one knows what they're about to change. */
const BLURB: Record<ScheduledEventType, string> = {
  GvG: 'Guild-vs-guild war posts — both scheduled and every /gvg someone types.',
  GvE: 'Guild-vs-environment posts, scheduled and from /gve.',
  Event: 'Everything else the bot opens RSVPs for, scheduled and from /event.',
};

/**
 * Admin panel for the role each event type's post calls out — one row per type, the single place
 * these snowflakes live.
 *
 * They were constants in the bot and the API at once until 2026-08-07. A role deleted and recreated
 * in Discord gets a **new id**, at which point the mention renders as plain text and reaches nobody
 * with no error logged anywhere — and fixing it meant editing two repositories and deploying both.
 * If pings have gone quiet, this is the first thing to check.
 *
 * A single template can still override its type here, from the Mention role field on the
 * *Scheduled events* panel.
 */
@Component({
  selector: 'app-ping-roles-panel',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <section class="backoffice">
      <p class="hint">
        Which role gets pinged on each kind of event post. This is the only place these ids live —
        the bot reads them from here rather than keeping a copy. To get a role id: Discord → User
        Settings → Advanced → Developer Mode on, then Server Settings → Roles → right-click a role →
        <strong>Copy Role ID</strong>. Leave one blank for posts of that type to ping nobody.
      </p>

      @if (loading()) {
        <p>Loading…</p>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else {
        <form [formGroup]="form">
          @for (t of eventTypes; track t) {
            <div class="role-row">
              <div class="who">
                <span class="type">{{ t }}</span>
                <span class="blurb">{{ blurb[t] }}</span>
              </div>
              <div class="edit">
                <input
                  type="text"
                  [formControlName]="t"
                  placeholder="blank = ping nobody"
                  inputmode="numeric"
                  (keydown.enter)="save(t); $event.preventDefault()" />
                <button type="button" (click)="save(t)" [disabled]="saving() === t || !changed(t)">
                  {{ saving() === t ? 'Saving…' : 'Save' }}
                </button>
              </div>
              <div class="meta">
                @if (result()[t]; as r) {
                  <span [class.ok]="r.ok" [class.bad]="!r.ok">{{ r.text }}</span>
                } @else {
                  <span class="who-when">{{ lastEdit(t) }}</span>
                }
              </div>
            </div>
          }
        </form>
      }
    </section>
  `,
  styles: [`
    .backoffice { padding: .25rem 0 0; }
    .hint { opacity: .75; margin-bottom: 1rem; line-height: 1.5; }
    .role-row { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;
      padding: .7rem 0; border-bottom: 1px solid rgba(128,128,128,.25); }
    .role-row:last-child { border-bottom: none; }
    .who { display: flex; flex-direction: column; gap: .2rem; min-width: 260px; flex: 1; }
    .type { font-weight: 700; padding: .1rem .5rem; border-radius: 6px; align-self: flex-start;
      background: rgba(31,139,76,.18); color: #1F8B4C; font-size: .8rem; }
    .blurb { font-size: .74rem; opacity: .7; }
    .edit { display: flex; gap: .4rem; align-items: center; }
    input { padding: .45rem .6rem; border: 1px solid rgba(128,128,128,.4); border-radius: 6px;
      font: inherit; font-family: monospace; width: 15rem; }
    button { padding: .4rem .85rem; cursor: pointer; border-radius: 6px;
      border: 1px solid rgba(128,128,128,.4); background: transparent; }
    button:disabled { opacity: .5; cursor: default; }
    .meta { font-size: .74rem; min-width: 190px; }
    .who-when { opacity: .55; }
    .ok { color: #28a745; }
    .bad { color: #dc3545; }
    .error { color: #dc3545; }
  `],
})
export class PingRolesPanelComponent {
  private readonly backoffice = inject(BackofficeService);

  readonly eventTypes = EVENT_TYPES;
  readonly blurb = BLURB;

  readonly roles = signal<EventPingRole[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly saving = signal<ScheduledEventType | null>(null);
  readonly result = signal<Partial<Record<ScheduledEventType, { ok: boolean; text: string }>>>({});

  readonly form = new FormGroup({
    GvG: new FormControl('', { validators: Validators.pattern(ROLE_ID), nonNullable: true }),
    GvE: new FormControl('', { validators: Validators.pattern(ROLE_ID), nonNullable: true }),
    Event: new FormControl('', { validators: Validators.pattern(ROLE_ID), nonNullable: true }),
  });

  ngOnInit(): void {
    this.backoffice.getPingRoles().subscribe({
      next: (rows) => {
        this.roles.set(rows);
        for (const row of rows) this.form.controls[row.eventType].setValue(row.roleId ?? '');
        this.loading.set(false);
      },
      error: () => { this.error.set('Failed to load ping roles.'); this.loading.set(false); },
    });
  }

  /** Whether this row differs from what's stored — a Save that would write the same id back is
   *  a button with nothing to do. */
  changed(type: ScheduledEventType): boolean {
    const stored = this.roles().find((r) => r.eventType === type)?.roleId ?? '';
    return this.form.controls[type].value.trim() !== stored;
  }

  save(type: ScheduledEventType): void {
    const control = this.form.controls[type];
    const value = control.value.trim();
    if (!this.changed(type) || this.saving() !== null) return;
    if (value !== '' && !ROLE_ID.test(value)) {
      this.setResult(type, false, 'That is not a role id — copy it with Copy Role ID.');
      return;
    }

    this.saving.set(type);
    // Blank is sent as null: "ping nobody" is a real setting here, not an unfinished edit.
    this.backoffice.setPingRole(type, value === '' ? null : value).subscribe({
      next: (saved) => {
        this.roles.update((l) => l.map((r) => (r.eventType === saved.eventType ? saved : r)));
        control.setValue(saved.roleId ?? '');
        this.setResult(type, true, saved.roleId ? 'Saved ✓' : 'Saved ✓ — pings nobody');
        this.saving.set(null);
      },
      error: (err) => {
        const code = (err as { error?: { error?: string } })?.error?.error;
        this.setResult(
          type, false,
          code === 'invalid_role' ? 'That is not a role id — copy it with Copy Role ID.'
            : 'Save failed. Please try again.');
        this.saving.set(null);
      },
    });
  }

  /** "by khanh · Sat 14:32 · 9/8", or nothing for a type nobody has set yet. */
  lastEdit(type: ScheduledEventType): string {
    const row = this.roles().find((r) => r.eventType === type);
    if (!row?.updatedUtc) return 'never set';
    const d = new Date(new Date(row.updatedUtc).getTime() + VN_OFFSET_MS);
    const p = (n: number) => String(n).padStart(2, '0');
    const when = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} · ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
    return row.updatedBy ? `by ${row.updatedBy} · ${when}` : when;
  }

  private setResult(type: ScheduledEventType, ok: boolean, text: string): void {
    this.result.update((m) => ({ ...m, [type]: { ok, text } }));
  }
}
