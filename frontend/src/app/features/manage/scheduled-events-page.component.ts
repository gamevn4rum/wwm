import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  BackofficeService,
  ScheduledEvent,
  ScheduledEventCreate,
  ScheduledEventType,
  USE_TYPE_DEFAULT_ROLE,
} from '../../core/services/backoffice.service';

/**
 * Which role a template's post calls out. Stored as one nullable column, but the three states it
 * holds — the type's own role, nobody, this specific one — are a choice, not a text field: a blank
 * box cannot distinguish "whatever the type pings" from "ping nobody".
 */
type RoleMode = 'default' | 'none' | 'custom';

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
        A recurring <strong>/gvg</strong>: the bot posts an RSVP event on this weekly schedule, with
        the same buttons as the slash command — e.g. post Saturday 10:00, event starts 18:00, RSVPs
        close at start. A start time earlier than the post means the following morning. Set
        <strong>Trigger</strong> to <strong>On demand</strong> for an event the timer never posts on
        its own: only the <strong>Post now</strong> button posts it, and it then starts at the next
        <em>Starts at</em> after you press.
      </p>

      <form class="sched-form" [formGroup]="form" (ngSubmit)="save()">
        <div class="row">
          <label>Type
            <select formControlName="eventType">
              @for (t of eventTypes; track t) { <option [value]="t">{{ t }}</option> }
            </select>
          </label>
          <label>Trigger
            <select formControlName="trigger">
              <option value="schedule">On a schedule</option>
              <option value="demand">On demand</option>
            </select>
          </label>
          <!-- An on-demand event has no day and no post time: the Post now button is its clock. -->
          @if (scheduled) {
            <label>Day
              <select formControlName="dayOfWeek">
                @for (d of days; track d.value) { <option [value]="d.value">{{ d.label }}</option> }
              </select>
            </label>
            <label>Post time
              <input type="time" formControlName="time" />
            </label>
          }
          <label class="grow">Channel ID
            <input type="text" formControlName="channelId" placeholder="e.g. 123456789012345678" inputmode="numeric" />
          </label>
        </div>
        <label>Title
          <input type="text" formControlName="title" maxlength="200" placeholder="Heading of the event post…" />
        </label>
        <div class="row">
          <!-- Clock times for both triggers: an on-demand event resolves its start against the
               moment the button is pressed, so it needs no post time to count from. -->
          <label>Starts at
            <input type="time" formControlName="startTime" />
          </label>
          <label>RSVP closes at (blank = at start)
            <input type="time" formControlName="closeTime" />
          </label>
          <label>Capacity
            <input type="number" formControlName="capacity" min="1" placeholder="blank = unlimited" />
          </label>
        </div>
        <div class="row">
          <!-- Three states, because "use the type's role" and "ping nobody" are different answers
               and a blank text box can only mean one of them. -->
          <label>Mention role
            <select formControlName="roleMode">
              <option value="default">Default for this type</option>
              <option value="none">Ping nobody</option>
              <option value="custom">A specific role…</option>
            </select>
          </label>
          @if (customRole) {
            <label class="grow">Role ID
              <input type="text" formControlName="mentionRoleId" placeholder="e.g. 123456789012345678" inputmode="numeric" />
            </label>
          } @else {
            <p class="side-note">
              {{ roleMode === 'default'
                ? 'Whatever this event type pings — set below, under Event ping roles.'
                : 'This template posts with no mention, whatever its type pings.' }}
            </p>
          }
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
            <tr><th>Type</th><th>When</th><th>Event</th><th>Channel</th><th>State</th><th></th></tr>
          </thead>
          <tbody>
            @for (s of events(); track s.id) {
              <tr [class.disabled]="!s.enabled">
                <td><span class="type">{{ s.eventType }}</span></td>
                <td class="timing">
                  <div>{{ whenLabel(s) }}</div>
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
    .side-note { font-size: .74rem; opacity: .65; margin: 0 0 .45rem; flex: 1; min-width: 180px; }
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

  // "On demand" is not a day — it's the Trigger select, which is what hides this whole field.
  readonly days = [
    { label: 'Everyday', value: EVERYDAY },
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

  /**
   * Start and RSVP-close are clock times, for both triggers: the API resolves the start to the
   * first such time at or after the post, which is the only form that works for an on-demand
   * template — a duration has nothing to count from until someone presses Post now.
   */
  readonly form = new FormGroup({
    eventType: new FormControl<ScheduledEventType>('GvG', { nonNullable: true }),
    trigger: new FormControl<'schedule' | 'demand'>('schedule', { nonNullable: true }),
    dayOfWeek: new FormControl(6, { nonNullable: true }),
    // The times aren't `Validators.required`: the post time is hidden for an on-demand event, and a
    // hidden control that blocks submit is a form with no visible reason not to save. normalize()
    // reports an empty one where it matters and substitutes midnight where it doesn't.
    time: new FormControl('10:00', { nonNullable: true }),
    channelId: new FormControl('', { validators: [Validators.required, Validators.pattern(/^\d{1,24}$/)], nonNullable: true }),
    title: new FormControl('', { validators: Validators.required, nonNullable: true }),
    startTime: new FormControl('18:00', { nonNullable: true }),
    closeTime: new FormControl('', { nonNullable: true }),
    capacity: new FormControl<number | null>(null),
    roleMode: new FormControl<RoleMode>('default', { nonNullable: true }),
    // Only read when roleMode is 'custom'; the other two modes say what they mean on their own.
    mentionRoleId: new FormControl('', { validators: Validators.pattern(/^\d{1,24}$/), nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
    enabled: new FormControl(true, { nonNullable: true }),
  });

  /** Whether the timer posts this one — which is also what decides clock times vs. durations. */
  get scheduled(): boolean {
    return this.form.controls.trigger.value === 'schedule';
  }

  get roleMode(): RoleMode {
    return this.form.controls.roleMode.value;
  }

  /** Whether a role id is being typed — the other two modes need no field. */
  get customRole(): boolean {
    return this.roleMode === 'custom';
  }

  ngOnInit(): void {
    // Leaving "A specific role" takes the field away, so anything half-typed in it goes too —
    // otherwise a stray character left behind blocks submit from a field nobody can see.
    this.form.controls.roleMode.valueChanges.subscribe((mode) => {
      if (mode !== 'custom') this.form.controls.mentionRoleId.setValue('');
    });

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

  /** The "When (VN)" cell: an on-demand row has no post time worth showing. */
  whenLabel(s: ScheduledEvent): string {
    return s.dayOfWeek === ON_DEMAND ? 'On demand' : `${this.dayName(s.dayOfWeek)} ${s.time}`;
  }

  /** Compact "starts 18:00 · closes at start · cap 20" line under the title. */
  detail(s: ScheduledEvent): string {
    const parts = [`starts ${s.startTime ?? 'not set'}`];
    parts.push(s.closeTime === null ? 'closes at start' : `closes ${s.closeTime}`);
    if (s.capacity !== null) parts.push(`cap ${s.capacity}`);
    // Only when it differs from the type's role: saying "pings the usual role" on every row would
    // be noise, and this line exists to flag the ones that don't.
    const mode = ScheduledEventsPageComponent.roleModeOf(s.mentionRoleId);
    if (mode === 'none') parts.push('no ping');
    if (mode === 'custom') parts.push(`pings @${s.mentionRoleId}`);
    return parts.join(' · ');
  }

  /** Which of the three answers a stored override is: null took the type's role, empty chose
   *  nobody, a value overrides. */
  private static roleModeOf(mentionRoleId: string | null): RoleMode {
    if (mentionRoleId === null) return 'default';
    return mentionRoleId.trim() === '' ? 'none' : 'custom';
  }

  startEdit(s: ScheduledEvent): void {
    this.editingId.set(s.id);
    const onDemand = s.dayOfWeek === ON_DEMAND;
    this.form.setValue({
      eventType: s.eventType,
      trigger: onDemand ? 'demand' : 'schedule',
      dayOfWeek: onDemand ? 6 : s.dayOfWeek,
      time: s.time,
      channelId: s.channelId,
      title: s.title,
      startTime: s.startTime ?? '',
      closeTime: s.closeTime ?? '',
      roleMode: ScheduledEventsPageComponent.roleModeOf(s.mentionRoleId),
      mentionRoleId: s.mentionRoleId ?? '',
      capacity: s.capacity, notes: s.notes, enabled: s.enabled,
    });

    // An on-demand template saved before start times were clock times has none to show — its old
    // duration still posts correctly, but there is nothing to put in the field, so say so rather
    // than inventing a time nobody chose.
    this.formError.set(
      s.startTime === null
        ? 'This template still uses the older “minutes after posting” start. Set a start time to ' +
          'convert it; until then it keeps posting as it does now.'
        : null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  resetForm(): void {
    this.editingId.set(null);
    this.formError.set(null);
    this.form.reset({
      eventType: 'GvG', trigger: 'schedule', dayOfWeek: 6, time: '10:00', channelId: '', title: '',
      startTime: '18:00', closeTime: '', roleMode: 'default', mentionRoleId: '', capacity: null,
      notes: '', enabled: true,
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      // Say which field, or a bad id reads as a Save button that simply doesn't work.
      this.formError.set(
        this.form.controls.channelId.invalid
          ? 'Channel ID must be the numeric id (Developer Mode → Copy Channel ID).'
          : this.form.controls.mentionRoleId.invalid
            ? 'Role ID must be the numeric role id (right-click the role → Copy Role ID).'
            : 'A title is required.');
      return;
    }
    const body = this.normalize(this.form.getRawValue());
    if (body === null) return; // normalize() has put the reason in formError
    this.saving.set(true);
    this.formError.set(null);
    const id = this.editingId();
    // A create has no stored value to leave alone, so null says "use the type's role" there all by
    // itself. The "default" word is only needed to overwrite an override that already exists.
    const req = id === null
      ? this.backoffice.createScheduledEvent({
          ...body,
          mentionRoleId: body.mentionRoleId === USE_TYPE_DEFAULT_ROLE ? null : body.mentionRoleId,
        })
      : this.backoffice.patchScheduledEvent(id, body);
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

  /**
   * Form values → the API's shape. Returns null and fills `formError` for the two things a clock
   * time can be blank about; everything else the API validates and `describe()` translates.
   */
  private normalize(raw: {
    eventType: ScheduledEventType; trigger: 'schedule' | 'demand'; dayOfWeek: number; time: string;
    channelId: string; title: string; startTime: string; closeTime: string; roleMode: RoleMode;
    mentionRoleId: string; capacity: number | null; notes: string; enabled: boolean;
  }): ScheduledEventCreate | null {
    const onDemand = raw.trigger === 'demand';
    if (raw.startTime === '') {
      this.formError.set('Enter the time the event starts.');
      return null;
    }
    if (!onDemand && raw.time === '') {
      this.formError.set('Enter the time the form is posted.');
      return null;
    }
    const role = raw.mentionRoleId.trim();
    if (raw.roleMode === 'custom' && role === '') {
      this.formError.set('Enter the role id to mention, or pick another Mention role option.');
      return null;
    }

    const num = (v: unknown): number | null =>
      v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v);

    return {
      eventType: raw.eventType,
      // On demand is stored as a day the timer skips, so it stays one field to the API.
      dayOfWeek: onDemand ? ON_DEMAND : Number(raw.dayOfWeek),
      // The timer never reads an on-demand template's post time, but the column is not nullable.
      time: raw.time === '' ? '00:00' : raw.time,
      channelId: raw.channelId,
      title: raw.title,
      startTime: raw.startTime,
      closeTime: raw.closeTime === '' ? null : raw.closeTime,
      // Never null: on an edit that would mean "leave it as it was", so dropping an override back
      // to the type's role has to be said out loud.
      mentionRoleId: raw.roleMode === 'default' ? USE_TYPE_DEFAULT_ROLE
        : raw.roleMode === 'none' ? '' : role,
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
      case 'invalid_role': return 'Role ID must be the numeric role id (right-click the role → Copy Role ID).';
      case 'notes_too_long': return 'Notes are too long (1000 characters max).';
      case 'invalid_capacity': return 'Capacity must be between 1 and 10000.';
      case 'invalid_start_time': return 'Enter a valid start time.';
      case 'invalid_close_time': return 'Enter a valid RSVP-close time — or leave it blank to close at the start.';
      case 'close_after_start': return 'RSVPs must close no later than the event starts.';
      case 'close_before_post':
        return 'RSVPs would close before the form is even posted. Pick a close time between the ' +
          'post time and the start.';
      default: return 'Save failed. Please try again.';
    }
  }
}
