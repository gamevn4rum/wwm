import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  BackofficeService,
  ScheduleCreate,
  ScheduledMessage,
} from '../../core/services/backoffice.service';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EVERYDAY = -1;
const ON_DEMAND = -2; // never timer-fired; posted only by the "Send now" button
const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Vietnam is a fixed UTC+7 (no DST)

@Component({
  selector: 'app-schedules-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <section class="backoffice">
      <p class="hint">
        The bot posts these to a Discord channel on a weekly schedule. Set <strong>Trigger</strong>
        to <strong>On demand</strong> for a message the timer never sends on its own — only the
        <strong>Send now</strong> button posts it. To get a channel id: Discord → User Settings →
        Advanced → Developer Mode on, then right-click the channel → Copy Channel ID.
      </p>

      <!-- Add / edit form -->
      <form class="sched-form" [formGroup]="form" (ngSubmit)="save()">
        <div class="row">
          <label>Trigger
            <select formControlName="trigger">
              <option value="schedule">On a schedule</option>
              <option value="demand">On demand</option>
            </select>
          </label>
          <!-- An on-demand message has no day and no time: the Send now button is its clock. -->
          @if (scheduled) {
            <label>Day
              <select formControlName="dayOfWeek">
                @for (d of days; track d.value) { <option [value]="d.value">{{ d.label }}</option> }
              </select>
            </label>
            <label>Time
              <input type="time" formControlName="time" />
            </label>
          }
          <label class="grow">Channel ID
            <input type="text" formControlName="channelId" placeholder="e.g. 123456789012345678" inputmode="numeric" />
          </label>
        </div>
        <label>Message
          <textarea formControlName="message" rows="2" maxlength="2000" placeholder="What the bot should post…"></textarea>
        </label>
        <div class="row bottom">
          <label class="chk"><input type="checkbox" formControlName="enabled" /> Enabled</label>
          <span class="spacer"></span>
          @if (editingId() !== null) {
            <button type="button" class="ghost" (click)="resetForm()">Cancel edit</button>
          }
          <button type="submit" [disabled]="saving()">
            {{ saving() ? 'Saving…' : editingId() === null ? 'Add schedule' : 'Save changes' }}
          </button>
        </div>
        @if (formError()) { <p class="error">{{ formError() }}</p> }
      </form>

      @if (loading()) {
        <p>Loading…</p>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else if (schedules().length === 0) {
        <p class="hint">No scheduled messages yet.</p>
      } @else {
        <table class="grid">
          <thead>
            <tr><th>Day</th><th>Time</th><th>Next run</th><th>Channel</th><th>Message</th><th>State</th><th></th></tr>
          </thead>
          <tbody>
            @for (s of schedules(); track s.id) {
              <tr [class.disabled]="!s.enabled">
                <td>{{ dayName(s.dayOfWeek) }}</td>
                <td class="mono">{{ s.dayOfWeek === onDemand ? '—' : s.time }}</td>
                <td class="timing">
                  <div class="next">{{ s.enabled ? nextRun(s) : '—' }}</div>
                  <div class="last">last: {{ lastSent(s) }}</div>
                </td>
                <td class="mono channel">{{ s.channelId }}</td>
                <td class="msg">{{ s.message }}</td>
                <td>
                  <span class="pill" [class.on]="s.enabled" [class.off]="!s.enabled">
                    {{ s.enabled ? 'On' : 'Off' }}
                  </span>
                </td>
                <td class="actions">
                  <button (click)="sendNow(s)" [disabled]="sending() === s.id || busy() === s.id">
                    {{ sending() === s.id ? 'Sending…' : 'Send now' }}
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
              @if (sendResult()[s.id]; as r) {
                <tr class="result-row">
                  <td colspan="7"><span [class.ok]="r.ok" [class.bad]="!r.ok">{{ r.text }}</span></td>
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
    .sched-form .grow { flex: 1; min-width: 200px; }
    .sched-form input, .sched-form select, .sched-form textarea {
      padding: .45rem .6rem; border: 1px solid rgba(128,128,128,.4); border-radius: 6px; font: inherit; }
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
    .msg { max-width: 320px; white-space: pre-wrap; word-break: break-word; }
    .actions { white-space: nowrap; display: flex; gap: .35rem; }
    .pill { padding: .1rem .5rem; border-radius: 999px; font-size: .78rem; }
    .pill.on { background: rgba(40,167,69,.2); color: #28a745; }
    .pill.off { background: rgba(220,53,69,.2); color: #dc3545; }
    .timing .next { font-size: .82rem; }
    .timing .last { font-size: .72rem; opacity: .6; margin-top: .15rem; }
    .result-row td { border-bottom: 1px solid rgba(128,128,128,.25); padding-top: 0; }
    .result-row span { font-size: .8rem; }
    .result-row .ok { color: #28a745; }
    .result-row .bad { color: #dc3545; }
    .error { color: #dc3545; }
  `],
})
export class SchedulesPageComponent {
  private readonly backoffice = inject(BackofficeService);

  // "Everyday" first, then Sunday…Saturday. "On demand" is not a day — it's the Trigger select,
  // which is what hides this whole field.
  readonly days = [
    { label: 'Everyday', value: EVERYDAY },
    ...DAYS.map((label, value) => ({ label, value })),
  ];

  /** Exposed for the table, which shows no time against an on-demand row. */
  readonly onDemand = ON_DEMAND;

  readonly schedules = signal<ScheduledMessage[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly busy = signal<number | null>(null);
  readonly confirmingId = signal<number | null>(null);
  readonly sending = signal<number | null>(null);
  readonly sendResult = signal<Record<number, { ok: boolean; text: string }>>({});

  readonly editingId = signal<number | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly form = new FormGroup({
    trigger: new FormControl<'schedule' | 'demand'>('schedule', { nonNullable: true }),
    dayOfWeek: new FormControl(1, { nonNullable: true }),
    // Not required: it is hidden for an on-demand message, and a hidden control that blocks submit
    // is a form with no visible reason not to save. save() reports an empty one when it matters.
    time: new FormControl('20:00', { nonNullable: true }),
    channelId: new FormControl('', { validators: [Validators.required, Validators.pattern(/^\d{1,24}$/)], nonNullable: true }),
    message: new FormControl('', { validators: Validators.required, nonNullable: true }),
    enabled: new FormControl(true, { nonNullable: true }),
  });

  /** Whether the timer sends this one — the Day and Time fields only exist when it does. */
  get scheduled(): boolean {
    return this.form.controls.trigger.value === 'schedule';
  }

  ngOnInit(): void {
    this.backoffice.getSchedules().subscribe({
      next: (s) => { this.schedules.set(s); this.loading.set(false); },
      error: () => { this.error.set('Failed to load schedules.'); this.loading.set(false); },
    });
  }

  dayName(d: number): string {
    if (d === EVERYDAY) return 'Everyday';
    if (d === ON_DEMAND) return 'On demand';
    return DAYS[d] ?? String(d);
  }

  startEdit(s: ScheduledMessage): void {
    this.editingId.set(s.id);
    this.formError.set(null);
    const onDemand = s.dayOfWeek === ON_DEMAND;
    this.form.setValue({
      trigger: onDemand ? 'demand' : 'schedule',
      dayOfWeek: onDemand ? 1 : s.dayOfWeek,
      time: s.time, channelId: s.channelId, message: s.message, enabled: s.enabled,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  resetForm(): void {
    this.editingId.set(null);
    this.formError.set(null);
    this.form.reset({
      trigger: 'schedule', dayOfWeek: 1, time: '20:00', channelId: '', message: '', enabled: true,
    });
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const raw = this.form.getRawValue();
    const onDemand = raw.trigger === 'demand';
    if (!onDemand && raw.time === '') {
      this.formError.set('Enter a time.');
      return;
    }

    this.saving.set(true);
    this.formError.set(null);
    // On demand is stored as a day the timer skips, so the API still sees one field. Its time is
    // never read, but the column is not nullable.
    const body: ScheduleCreate = {
      dayOfWeek: onDemand ? ON_DEMAND : Number(raw.dayOfWeek),
      time: raw.time === '' ? '00:00' : raw.time,
      channelId: raw.channelId,
      message: raw.message,
      enabled: raw.enabled,
    };
    const id = this.editingId();
    const req = id === null ? this.backoffice.createSchedule(body) : this.backoffice.patchSchedule(id, body);
    req.subscribe({
      next: (saved) => {
        this.schedules.update((list) =>
          id === null ? [...list, saved] : list.map((s) => (s.id === saved.id ? saved : s)));
        this.sort();
        this.saving.set(false);
        this.resetForm();
      },
      error: (err) => {
        this.saving.set(false);
        this.formError.set(this.describe(err));
      },
    });
  }

  toggle(s: ScheduledMessage): void {
    this.busy.set(s.id);
    this.backoffice.patchSchedule(s.id, { enabled: !s.enabled }).subscribe({
      next: (u) => { this.schedules.update((l) => l.map((x) => (x.id === u.id ? u : x))); this.busy.set(null); },
      error: () => this.busy.set(null),
    });
  }

  remove(s: ScheduledMessage): void {
    this.busy.set(s.id);
    this.backoffice.deleteSchedule(s.id).subscribe({
      next: () => {
        this.schedules.update((l) => l.filter((x) => x.id !== s.id));
        this.confirmingId.set(null);
        this.busy.set(null);
        if (this.editingId() === s.id) this.resetForm();
      },
      error: () => this.busy.set(null),
    });
  }

  /** Post this schedule's message to its channel immediately, and surface the exact result
   *  (success, or the Discord permission/channel error) inline. Doesn't affect the timer. */
  sendNow(s: ScheduledMessage): void {
    this.sending.set(s.id);
    this.backoffice.sendScheduleNow(s.id).subscribe({
      next: (r) => {
        this.setResult(s.id, r.ok, r.ok ? 'Sent ✓' : r.error ?? 'Send failed.');
        this.sending.set(null);
      },
      error: () => { this.setResult(s.id, false, 'Request failed. Try again.'); this.sending.set(null); },
    });
  }

  private setResult(id: number, ok: boolean, text: string): void {
    this.sendResult.update((m) => ({ ...m, [id]: { ok, text } }));
  }

  /** The next time this schedule will fire, as a short VN-local label ("Today 20:00",
   *  "Tomorrow 20:00", "Mon 20:00"). Fires at the next 15-min poll after this time. */
  nextRun(s: ScheduledMessage): string {
    if (s.dayOfWeek === ON_DEMAND) return 'on demand';
    const [hh, mm] = s.time.split(':').map(Number);
    const nowVn = SchedulesPageComponent.vnNow();
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

  /** When it last fired, in VN local time — or "never". */
  lastSent(s: ScheduledMessage): string {
    if (!s.lastSentUtc) return 'never';
    const d = new Date(new Date(s.lastSentUtc).getTime() + VN_OFFSET_MS);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${WEEKDAYS[d.getUTCDay()]} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} · ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  }

  /** "Now" as a Date whose UTC getters read Vietnam wall-clock (fixed UTC+7, no DST). */
  private static vnNow(): Date {
    return new Date(Date.now() + VN_OFFSET_MS);
  }

  private sort(): void {
    this.schedules.update((l) =>
      [...l].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.time.localeCompare(b.time)));
  }

  private describe(err: unknown): string {
    const code = (err as { error?: { error?: string } })?.error?.error;
    switch (code) {
      case 'invalid_day': return 'Pick a valid day.';
      case 'invalid_time': return 'Enter a valid time.';
      case 'invalid_channel': return 'Channel ID must be the numeric id (Developer Mode → Copy Channel ID).';
      case 'message_required': return 'A message is required.';
      case 'message_too_long': return 'That message is too long (2000 characters max).';
      default: return 'Save failed. Please try again.';
    }
  }
}
