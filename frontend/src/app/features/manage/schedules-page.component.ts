import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  BackofficeService,
  ScheduleCreate,
  ScheduledMessage,
} from '../../core/services/backoffice.service';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

@Component({
  selector: 'app-schedules-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <section class="backoffice">
      <h1>Scheduled messages</h1>
      <p class="hint">
        The bot posts these to a Discord channel on a weekly schedule. Times are
        <strong>Vietnam time (UTC+7)</strong>. To get a channel id: Discord → User Settings →
        Advanced → Developer Mode on, then right-click the channel → Copy Channel ID.
      </p>

      <!-- Add / edit form -->
      <form class="sched-form" [formGroup]="form" (ngSubmit)="save()">
        <div class="row">
          <label>Day
            <select formControlName="dayOfWeek">
              @for (d of days; track d.value) { <option [value]="d.value">{{ d.label }}</option> }
            </select>
          </label>
          <label>Time (VN)
            <input type="time" formControlName="time" />
          </label>
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
            <tr><th>Day</th><th>Time</th><th>Channel</th><th>Message</th><th>State</th><th></th></tr>
          </thead>
          <tbody>
            @for (s of schedules(); track s.id) {
              <tr [class.disabled]="!s.enabled">
                <td>{{ dayName(s.dayOfWeek) }}</td>
                <td class="mono">{{ s.time }}</td>
                <td class="mono channel">{{ s.channelId }}</td>
                <td class="msg">{{ s.message }}</td>
                <td>
                  <span class="pill" [class.on]="s.enabled" [class.off]="!s.enabled">
                    {{ s.enabled ? 'On' : 'Off' }}
                  </span>
                </td>
                <td class="actions">
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
            }
          </tbody>
        </table>
      }
    </section>
  `,
  styles: [`
    .backoffice { max-width: 960px; margin: 0 auto; padding: 1.5rem; }
    h1 { margin-bottom: .25rem; }
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
    .error { color: #dc3545; }
  `],
})
export class SchedulesPageComponent {
  private readonly backoffice = inject(BackofficeService);

  readonly days = DAYS.map((label, value) => ({ label, value }));

  readonly schedules = signal<ScheduledMessage[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly busy = signal<number | null>(null);
  readonly confirmingId = signal<number | null>(null);

  readonly editingId = signal<number | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly form = new FormGroup({
    dayOfWeek: new FormControl(1, { nonNullable: true }),
    time: new FormControl('20:00', { validators: Validators.required, nonNullable: true }),
    channelId: new FormControl('', { validators: [Validators.required, Validators.pattern(/^\d{1,24}$/)], nonNullable: true }),
    message: new FormControl('', { validators: Validators.required, nonNullable: true }),
    enabled: new FormControl(true, { nonNullable: true }),
  });

  ngOnInit(): void {
    this.backoffice.getSchedules().subscribe({
      next: (s) => { this.schedules.set(s); this.loading.set(false); },
      error: () => { this.error.set('Failed to load schedules.'); this.loading.set(false); },
    });
  }

  dayName(d: number): string {
    return DAYS[d] ?? String(d);
  }

  startEdit(s: ScheduledMessage): void {
    this.editingId.set(s.id);
    this.formError.set(null);
    this.form.setValue({
      dayOfWeek: s.dayOfWeek, time: s.time, channelId: s.channelId, message: s.message, enabled: s.enabled,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  resetForm(): void {
    this.editingId.set(null);
    this.formError.set(null);
    this.form.reset({ dayOfWeek: 1, time: '20:00', channelId: '', message: '', enabled: true });
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.formError.set(null);
    const body = this.form.getRawValue() as ScheduleCreate;
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
