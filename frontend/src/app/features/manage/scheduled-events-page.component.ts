import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  BackofficeService,
  ScheduledEvent,
  ScheduledEventCreate,
  ScheduledEventType,
} from '../../core/services/backoffice.service';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EVERYDAY = -1;
const ON_DEMAND = -2; // never timer-fired; posted only by the "Post now" button
const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Vietnam is a fixed UTC+7 (no DST)
const EVENT_TYPES: readonly ScheduledEventType[] = ['GvG', 'GvE', 'Event'];

@Component({
  selector: 'app-scheduled-events-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <section class="backoffice">
      <p class="hint">
        A recurring <strong>/gvg</strong>: the bot posts an RSVP event on this weekly schedule,
        with the same buttons as the slash command. Times are <strong>Vietnam time (UTC+7)</strong>.
        The event's start and RSVP-close are set as minutes <em>after</em> the form is posted —
        e.g. post Saturday 10:00, start 480 min later (18:00), RSVPs close at start. Pick
        <strong>On demand</strong> for an event the timer never posts on its own — only the
        <strong>Post now</strong> button posts it.
      </p>

      <form class="sched-form" [formGroup]="form" (ngSubmit)="save()">
        <div class="row">
          <label>Type
            <select formControlName="eventType">
              @for (t of eventTypes; track t) { <option [value]="t">{{ t }}</option> }
            </select>
          </label>
          <label>Day
            <select formControlName="dayOfWeek">
              @for (d of days; track d.value) { <option [value]="d.value">{{ d.label }}</option> }
            </select>
          </label>
          <label>Post time (VN)
            <input type="time" formControlName="time" />
          </label>
          <label class="grow">Channel ID
            <input type="text" formControlName="channelId" placeholder="e.g. 123456789012345678" inputmode="numeric" />
          </label>
        </div>
        <label>Title
          <input type="text" formControlName="title" maxlength="200" placeholder="Heading of the event post…" />
        </label>
        <div class="row">
          <label>Starts (min after post)
            <input type="number" formControlName="startOffsetMinutes" min="0" step="15" />
          </label>
          <label>RSVP closes (min after post)
            <input type="number" formControlName="rsvpCloseOffsetMinutes" min="0" step="15" placeholder="blank = at start" />
          </label>
          <label>Capacity
            <input type="number" formControlName="capacity" min="1" placeholder="blank = unlimited" />
          </label>
        </div>
        <label>Notes
          <textarea formControlName="notes" rows="2" maxlength="1000" placeholder="Extra detail shown on the post (optional)…"></textarea>
        </label>

        <div class="row bottom">
          <label class="chk"><input type="checkbox" formControlName="enabled" /> Enabled</label>
          <span class="spacer"></span>
          @if (editingId() !== null) {
            <button type="button" class="ghost" (click)="resetForm()">Cancel edit</button>
          }
          <button type="submit" [disabled]="saving()">
            {{ saving() ? 'Saving…' : editingId() === null ? 'Add event' : 'Save changes' }}
          </button>
        </div>
        @if (formError()) { <p class="error">{{ formError() }}</p> }
      </form>

      @if (loading()) {
        <p>Loading…</p>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else if (events().length === 0) {
        <p class="hint">No scheduled events yet.</p>
      } @else {
        <table class="grid">
          <thead>
            <tr><th>Type</th><th>When (VN)</th><th>Event</th><th>Channel</th><th>State</th><th></th></tr>
          </thead>
          <tbody>
            @for (s of events(); track s.id) {
              <tr [class.disabled]="!s.enabled">
                <td><span class="type">{{ s.eventType }}</span></td>
                <td class="timing">
                  <div>{{ dayName(s.dayOfWeek) }} {{ s.time }}</div>
                  <div class="next">next: {{ s.enabled ? nextRun(s) : '—' }}</div>
                  <div class="last">last: {{ lastFired(s) }}</div>
                </td>
                <td class="msg">
                  <div class="title">{{ s.title }}</div>
                  <div class="detail">{{ detail(s) }}</div>
                </td>
                <td class="mono channel">{{ s.channelId }}</td>
                <td>
                  <span class="pill" [class.on]="s.enabled" [class.off]="!s.enabled">
                    {{ s.enabled ? 'On' : 'Off' }}
                  </span>
                </td>
                <td class="actions">
                  <button (click)="postNow(s)" [disabled]="posting() === s.id || busy() === s.id">
                    {{ posting() === s.id ? 'Posting…' : 'Post now' }}
                  </button>
                  <button (click)="toggle(s)" [disabled]="busy() === s.id">{{ s.enabled ? 'Disable' : 'Enable' }}</button>
                  <button (click)="startEdit(s)" [disabled]="busy() === s.id">Edit</button>
                  @if (confirmingId() === s.id) {
                    <button class="danger" (click)="remove(s)" [disabled]="busy() === s.id">Confirm</button>
                    <button class="ghost" (click)="confirmingId.set(null)">No</button>
                  } @else {
                    <button class="danger" (click)="confirmingId.set(s.id)" [disabled]="busy() === s.id">Delete</button>
                  }
                </td>
              </tr>
              @if (postResult()[s.id]; as r) {
                <tr class="result-row">
                  <td colspan="6"><span [class.ok]="r.ok" [class.bad]="!r.ok">{{ r.text }}</span></td>
                </tr>
              }
            }
          </tbody>
        </table>
      }
    </section>
  `,
  styles: [`
    .backoffice { padding: .25rem 0 0; }
    .hint { opacity: .75; margin-bottom: 1rem; line-height: 1.5; }
    .sched-form { display: flex; flex-direction: column; gap: .6rem; padding: 1rem;
      border: 1px solid rgba(128,128,128,.3); border-radius: 8px; margin-bottom: 1.5rem; }
    .sched-form .row { display: flex; gap: .75rem; flex-wrap: wrap; align-items: flex-end; }
    .sched-form label { display: flex; flex-direction: column; gap: .25rem; font-size: .82rem; font-weight: 600; }
    .sched-form .grow { flex: 1; min-width: 180px; }
    .sched-form input, .sched-form select, .sched-form textarea {
      padding: .45rem .6rem; border: 1px solid rgba(128,128,128,.4); border-radius: 6px; font: inherit; }
    .sched-form input[type=number] { width: 11rem; }
    .sched-form textarea { resize: vertical; }
    .row.bottom { align-items: center; }
    .chk { flex-direction: row; align-items: center; gap: .4rem; font-weight: 600; }
    .spacer { flex: 1; }
    button { padding: .4rem .85rem; cursor: pointer; border-radius: 6px; border: 1px solid rgba(128,128,128,.4); background: transparent; }
    button:disabled { opacity: .5; cursor: default; }
    .danger { color: #dc3545; border-color: #dc3545; }
    .ghost { opacity: .7; }
    .grid { width: 100%; border-collapse: collapse; }
    .grid th, .grid td { text-align: left; padding: .5rem .6rem; border-bottom: 1px solid rgba(128,128,128,.25); vertical-align: top; }
    tr.disabled { opacity: .5; }
    .mono { font-family: monospace; }
    .channel { font-size: .8rem; opacity: .8; }
    .type { font-weight: 700; padding: .1rem .5rem; border-radius: 6px; background: rgba(31,139,76,.18); color: #1F8B4C; font-size: .8rem; }
    .timing { font-size: .82rem; }
    .timing .next { font-size: .74rem; opacity: .75; margin-top: .15rem; }
    .timing .last { font-size: .72rem; opacity: .55; }
    .msg { max-width: 300px; }
    .msg .title { font-weight: 600; }
    .msg .detail { font-size: .74rem; opacity: .7; margin-top: .15rem; }
    .actions { white-space: nowrap; display: flex; gap: .35rem; flex-wrap: wrap; }
    .pill { padding: .1rem .5rem; border-radius: 999px; font-size: .78rem; }
    .pill.on { background: rgba(40,167,69,.2); color: #28a745; }
    .pill.off { background: rgba(220,53,69,.2); color: #dc3545; }
    .result-row td { border-bottom: 1px solid rgba(128,128,128,.25); padding-top: 0; }
    .result-row span { font-size: .8rem; }
    .result-row .ok { color: #28a745; }
    .result-row .bad { color: #dc3545; }
    .error { color: #dc3545; }
  `],
})
export class ScheduledEventsPageComponent {
  private readonly backoffice = inject(BackofficeService);

  readonly eventTypes = EVENT_TYPES;
  readonly days = [
    { label: 'Everyday', value: EVERYDAY },
    { label: 'On demand', value: ON_DEMAND },
    ...DAYS.map((label, value) => ({ label, value })),
  ];

  readonly events = signal<ScheduledEvent[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly busy = signal<number | null>(null);
  readonly confirmingId = signal<number | null>(null);
  readonly posting = signal<number | null>(null);
  readonly postResult = signal<Record<number, { ok: boolean; text: string }>>({});

  readonly editingId = signal<number | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly form = new FormGroup({
    eventType: new FormControl<ScheduledEventType>('GvG', { nonNullable: true }),
    dayOfWeek: new FormControl(6, { nonNullable: true }),
    time: new FormControl('20:00', { validators: Validators.required, nonNullable: true }),
    channelId: new FormControl('', { validators: [Validators.required, Validators.pattern(/^\d{1,24}$/)], nonNullable: true }),
    title: new FormControl('', { validators: Validators.required, nonNullable: true }),
    startOffsetMinutes: new FormControl<number>(480, { validators: [Validators.required, Validators.min(0)], nonNullable: true }),
    rsvpCloseOffsetMinutes: new FormControl<number | null>(null),
    capacity: new FormControl<number | null>(null),
    notes: new FormControl('', { nonNullable: true }),
    enabled: new FormControl(true, { nonNullable: true }),
  });

  ngOnInit(): void {
    this.backoffice.getScheduledEvents().subscribe({
      next: (s) => { this.events.set(s); this.loading.set(false); },
      error: () => { this.error.set('Failed to load scheduled events.'); this.loading.set(false); },
    });
  }

  dayName(d: number): string {
    if (d === EVERYDAY) return 'Everyday';
    if (d === ON_DEMAND) return 'On demand';
    return DAYS[d] ?? String(d);
  }

  /** Compact "starts +8h · closes at start · cap 20" line under the title. */
  detail(s: ScheduledEvent): string {
    const parts = [`starts ${this.offset(s.startOffsetMinutes)}`];
    parts.push(s.rsvpCloseOffsetMinutes === null ? 'closes at start' : `closes ${this.offset(s.rsvpCloseOffsetMinutes)}`);
    if (s.capacity !== null) parts.push(`cap ${s.capacity}`);
    return parts.join(' · ');
  }

  private offset(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return `+${m}m`;
    return m === 0 ? `+${h}h` : `+${h}h${m}m`;
  }

  startEdit(s: ScheduledEvent): void {
    this.editingId.set(s.id);
    this.formError.set(null);
    this.form.setValue({
      eventType: s.eventType, dayOfWeek: s.dayOfWeek, time: s.time, channelId: s.channelId,
      title: s.title, startOffsetMinutes: s.startOffsetMinutes,
      rsvpCloseOffsetMinutes: s.rsvpCloseOffsetMinutes,
      capacity: s.capacity, notes: s.notes, enabled: s.enabled,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  resetForm(): void {
    this.editingId.set(null);
    this.formError.set(null);
    this.form.reset({
      eventType: 'GvG', dayOfWeek: 6, time: '20:00', channelId: '', title: '',
      startOffsetMinutes: 480, rsvpCloseOffsetMinutes: null, capacity: null, notes: '', enabled: true,
    });
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.formError.set(null);
    const body = this.normalize(this.form.getRawValue());
    const id = this.editingId();
    const req = id === null ? this.backoffice.createScheduledEvent(body) : this.backoffice.patchScheduledEvent(id, body);
    req.subscribe({
      next: (saved) => {
        this.events.update((list) =>
          id === null ? [...list, saved] : list.map((s) => (s.id === saved.id ? saved : s)));
        this.sort();
        this.saving.set(false);
        this.resetForm();
      },
      error: (err) => { this.saving.set(false); this.formError.set(this.describe(err)); },
    });
  }

  /** Coerce the number inputs: empty string / NaN → null for the optional ones. */
  private normalize(raw: {
    eventType: ScheduledEventType; dayOfWeek: number; time: string; channelId: string;
    title: string; startOffsetMinutes: number; rsvpCloseOffsetMinutes: number | null;
    capacity: number | null; notes: string; enabled: boolean;
  }): ScheduledEventCreate {
    const num = (v: unknown): number | null =>
      v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v);
    return {
      eventType: raw.eventType,
      dayOfWeek: Number(raw.dayOfWeek),
      time: raw.time,
      channelId: raw.channelId,
      title: raw.title,
      startOffsetMinutes: num(raw.startOffsetMinutes) ?? 0,
      rsvpCloseOffsetMinutes: num(raw.rsvpCloseOffsetMinutes),
      capacity: num(raw.capacity),
      notes: raw.notes ?? '',
      enabled: raw.enabled,
    };
  }

  toggle(s: ScheduledEvent): void {
    this.busy.set(s.id);
    this.backoffice.patchScheduledEvent(s.id, { enabled: !s.enabled }).subscribe({
      next: (u) => { this.events.update((l) => l.map((x) => (x.id === u.id ? u : x))); this.busy.set(null); },
      error: () => this.busy.set(null),
    });
  }

  remove(s: ScheduledEvent): void {
    this.busy.set(s.id);
    this.backoffice.deleteScheduledEvent(s.id).subscribe({
      next: () => {
        this.events.update((l) => l.filter((x) => x.id !== s.id));
        this.confirmingId.set(null);
        this.busy.set(null);
        if (this.editingId() === s.id) this.resetForm();
      },
      error: () => this.busy.set(null),
    });
  }

  /** Create + post the event immediately (a live test — it really does create an event) and
   *  surface the outcome inline. */
  postNow(s: ScheduledEvent): void {
    this.posting.set(s.id);
    this.backoffice.postScheduledEventNow(s.id).subscribe({
      next: (r) => {
        const ok = r.slug ? `Posted ✓ (${r.slug})` : 'Posted ✓';
        this.setResult(s.id, r.ok, r.ok ? ok : r.error ?? 'Post failed.');
        this.posting.set(null);
      },
      error: () => { this.setResult(s.id, false, 'Request failed. Try again.'); this.posting.set(null); },
    });
  }

  private setResult(id: number, ok: boolean, text: string): void {
    this.postResult.update((m) => ({ ...m, [id]: { ok, text } }));
  }

  /** Next post time as a short VN-local label ("Today 20:00", "Tomorrow 20:00", "Sat 20:00"). */
  nextRun(s: ScheduledEvent): string {
    if (s.dayOfWeek === ON_DEMAND) return 'on demand';
    const [hh, mm] = s.time.split(':').map(Number);
    const nowVn = new Date(Date.now() + VN_OFFSET_MS);
    const at = (dayOffset: number): Date => {
      const d = new Date(nowVn);
      d.setUTCDate(d.getUTCDate() + dayOffset);
      d.setUTCHours(hh, mm, 0, 0);
      return d;
    };
    for (let o = 0; o <= 7; o++) {
      const c = at(o);
      if (c.getTime() <= nowVn.getTime()) continue;
      if (s.dayOfWeek !== EVERYDAY && c.getUTCDay() !== s.dayOfWeek) continue;
      const label = o === 0 ? 'Today' : o === 1 ? 'Tomorrow' : WEEKDAYS[c.getUTCDay()];
      return `${label} ${s.time}`;
    }
    return '—';
  }

  lastFired(s: ScheduledEvent): string {
    if (!s.lastFiredUtc) return 'never';
    const d = new Date(new Date(s.lastFiredUtc).getTime() + VN_OFFSET_MS);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${WEEKDAYS[d.getUTCDay()]} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} · ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  }

  private sort(): void {
    this.events.update((l) =>
      [...l].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.time.localeCompare(b.time)));
  }

  private describe(err: unknown): string {
    const code = (err as { error?: { error?: string } })?.error?.error;
    switch (code) {
      case 'invalid_day': return 'Pick a valid day.';
      case 'invalid_time': return 'Enter a valid post time.';
      case 'invalid_type': return 'Pick a valid type.';
      case 'invalid_title': return 'A title is required (max 200 characters).';
      case 'invalid_channel': return 'Channel ID must be the numeric id (Developer Mode → Copy Channel ID).';
      case 'notes_too_long': return 'Notes are too long (1000 characters max).';
      case 'invalid_capacity': return 'Capacity must be between 1 and 10000.';
      case 'invalid_start_offset': return 'Start offset must be between 0 minutes and 14 days.';
      case 'invalid_close_offset': return 'RSVP-close offset must be between 0 minutes and 14 days.';
      case 'close_after_start': return 'RSVPs must close no later than the event starts.';
      default: return 'Save failed. Please try again.';
    }
  }
}
