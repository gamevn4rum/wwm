import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { BackofficeService, PvpEvent, PvpEventCreate } from '../../core/services/backoffice.service';
import { DiscordPickerComponent } from './discord-picker.component';

/** Vietnam is a fixed UTC+7 with no DST, so plain arithmetic on the offset is exact. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Admin panel for hosted PvP tournaments — see `PVP-TOURNAMENT.md` in the API repo.
 *
 * Creating one here **posts its registration form to Discord immediately**. That is deliberate and
 * not a "post now" button: a tournament with no post is invisible, and a post with no tournament
 * behind it collects registrations that nothing will ever draw from. Either both exist or neither
 * does, and a Discord failure creates nothing.
 *
 * From there the bot runs it — `/gtourstart` closes registration and draws round one, the bout posts
 * carry the reporting buttons, `/gtourboard` shows the scoreboard. Nothing on this page starts or
 * scores an event, because the person doing that is standing in Discord.
 *
 * The one number worth reading before you commit: **healers must be a third of the field**. A bout
 * seats four Tank/DPS and two healers, so sustaining everyone to the bout cap needs a healer for
 * every two of them. The shortfall column says how far off the registration is, while there is still
 * time to go and ask two people to bring a healer.
 */
@Component({
  selector: 'app-pvp-events-page',
  standalone: true,
  imports: [ReactiveFormsModule, DiscordPickerComponent],
  template: `
    <section class="backoffice">
      <h2>PvP tournaments</h2>

      <p class="hint">
        A self-hosted 3v3 tournament: two registration pools, teams drawn fresh every round, a point
        per win. Creating one posts its registration form to the channel straight away — there is no
        draft state. The bot takes it from there with
        <code>/gtourstart</code>, and the scoreboard is <code>/gtourboard</code>.
      </p>

      @if (loading()) {
        <p>Loading…</p>
      } @else {
        @if (error(); as e) {
          <p class="error">{{ e }}</p>
        }

        <!-- ── new tournament ────────────────────────────────────────────── -->
        <form [formGroup]="form" (ngSubmit)="create()" class="new">
          <h3>New tournament</h3>

          <label>
            <span>Title</span>
            <input formControlName="title" placeholder="Giải PvP 3v3 nội bộ" maxlength="200" />
          </label>

          <label>
            <span>Channel</span>
            <app-discord-picker kind="channel" formControlName="channelId" />
          </label>

          <div class="pair">
            <label>
              <span>Starts (VN)</span>
              <input type="datetime-local" formControlName="startsAt" />
            </label>
            <label>
              <span>Registration closes (VN)</span>
              <input type="datetime-local" formControlName="closesAt" />
              <small>Blank closes it at the start. Must not be after it.</small>
            </label>
          </div>

          <div class="pair">
            <label>
              <span>Bouts per person</span>
              <input type="number" formControlName="boutCap" min="1" max="50" />
            </label>
            <label>
              <span>Points per win</span>
              <input type="number" formControlName="pointsPerWin" min="1" max="100" />
            </label>
            <label>
              <span>Points per loss</span>
              <input type="number" formControlName="pointsPerLoss" min="0" max="99" />
              <small>0 = losers score nothing. Must stay lower than points per win.</small>
            </label>
          </div>

          <label>
            <span>Capacity</span>
            <input type="number" formControlName="capacity" min="1" placeholder="blank = unlimited" />
          </label>

          <label>
            <span>Mention role</span>
            <app-discord-picker
              kind="role"
              blankLabel="— default for Pvp —"
              placeholder="blank = the Pvp type's own role"
              formControlName="mentionRoleId" />
          </label>

          <label class="check">
            <input type="checkbox" formControlName="allowDraftedHealer" />
            <span>
              Let a Tank/DPS fill an empty healer seat
              <small>
                Off means a round is simply shorter when healers run out. On a realistic registration
                this is the difference between most people finishing their bouts and almost nobody
                doing so.
              </small>
            </span>
          </label>

          <label class="check">
            <input type="checkbox" formControlName="avoidRepeatPairings" />
            <span>
              Avoid repeat teammates and opponents
              <small>A preference the draw scores on, never a rule that can fail it.</small>
            </span>
          </label>

          <label>
            <span>Notes</span>
            <textarea formControlName="notes" rows="2" maxlength="1000"></textarea>
          </label>

          <div class="actions">
            <button type="submit" [disabled]="form.invalid || creating()">
              {{ creating() ? 'Creating and posting…' : 'Create and post registration' }}
            </button>
            @if (createError(); as e) {
              <span class="bad">{{ e }}</span>
            }
          </div>
        </form>

        <!-- ── the tournaments ──────────────────────────────────────────── -->
        @if (events().length === 0) {
          <p class="hint">No tournaments yet.</p>
        } @else {
          <table class="rows">
            <thead>
              <tr>
                <th>Tournament</th>
                <th>State</th>
                <th>Pools</th>
                <th>Healers</th>
                <th>Bouts</th>
                <th>Config</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (e of events(); track e.id) {
                <tr [class.done]="e.status === 'finished' || e.status === 'cancelled'">
                  <td>
                    <strong>{{ e.title }}</strong>
                    <small class="slug">{{ e.eventId }}</small>
                    <small>{{ vnLabel(e.startsAt) }}</small>
                  </td>
                  <td>
                    <span class="pill" [class]="e.status">{{ stateLabel(e) }}</span>
                  </td>
                  <td class="num">
                    🛡 {{ e.registeredDamage }}<br />
                    🩹 {{ e.registeredHealer }}
                  </td>
                  <td class="num">
                    @if (e.healerShortfall === 0) {
                      <span class="ok">ratio ok</span>
                    } @else {
                      <span class="warn" [title]="shortfallHelp(e)">
                        {{ e.healerShortfall }} short
                      </span>
                    }
                  </td>
                  <td class="num">{{ e.boutsReported }}/{{ e.boutsDrawn }}</td>
                  <td class="config">
                    @if (editing() === e.id) {
                      <form [formGroup]="editForm" class="edit">
                        <label>
                          <span>Bouts</span>
                          <input type="number" formControlName="boutCap" min="1" max="50" />
                        </label>
                        <label>
                          <span>Points/win</span>
                          <input type="number" formControlName="pointsPerWin" min="1" max="100" />
                        </label>
                        <label>
                          <span>Points/loss</span>
                          <input type="number" formControlName="pointsPerLoss" min="0" max="99" />
                        </label>
                        <label class="check">
                          <input type="checkbox" formControlName="allowDraftedHealer" />
                          <span>Draft a Tank/DPS as healer</span>
                        </label>
                        <label class="check">
                          <input type="checkbox" formControlName="avoidRepeatPairings" />
                          <span>Avoid repeat pairings</span>
                        </label>
                      </form>
                    } @else {
                      {{ e.boutCap }} bouts · +{{ e.pointsPerWin }}/{{ e.pointsPerLoss }}pt
                      @if (e.allowDraftedHealer) {
                        <small>drafting on</small>
                      } @else {
                        <small class="warn">drafting off</small>
                      }
                      @if (!e.avoidRepeatPairings) {
                        <small class="warn">repeats allowed</small>
                      }
                    }
                  </td>
                  <td class="row-actions">
                    @if (editing() === e.id) {
                      <button type="button" (click)="saveEdit(e)" [disabled]="busy() === e.id">
                        {{ busy() === e.id ? '…' : 'Save' }}
                      </button>
                      <button type="button" (click)="cancelEdit()">Cancel</button>
                    } @else if (e.status === 'pending' || e.status === 'running') {
                      <!-- Only while it can still change a draw. A finished event's config is a
                           record of how it was run, not a setting. -->
                      <button type="button" (click)="startEdit(e)">Edit</button>
                      <button type="button" (click)="cancelEvent(e)" [disabled]="busy() === e.id">
                        {{ busy() === e.id ? '…' : 'Cancel event' }}
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      }
    </section>
  `,
  styles: [
    `
      .backoffice {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .hint {
        opacity: 0.8;
        font-size: 0.9rem;
        max-width: 60rem;
      }
      .error,
      .bad {
        color: #e74c3c;
      }
      .new {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        max-width: 40rem;
        padding: 1rem;
        border: 1px solid rgba(128, 128, 128, 0.35);
        border-radius: 6px;
      }
      .new h3 {
        margin: 0;
      }
      label {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        /* Grid and flex children default to min-width:auto, which for a date or number input is its
           intrinsic width — wide enough to overflow a 1fr track and cover the field beside it. */
        min-width: 0;
      }
      label > span {
        font-weight: 600;
        font-size: 0.9rem;
      }
      label small {
        font-weight: 400;
        opacity: 0.75;
        display: block;
      }
      /* Matches the Scheduled events panel: nothing global styles a bare input, so each panel
         dresses its own. font: inherit matters — without it a control renders in the browser's
         default face at a size the rest of the page never uses. */
      .new input,
      .new select,
      .new textarea {
        padding: 0.45rem 0.6rem;
        border: 1px solid rgba(128, 128, 128, 0.4);
        border-radius: 6px;
        font: inherit;
        width: 100%;
        box-sizing: border-box;
        min-width: 0;
      }
      .new textarea {
        resize: vertical;
      }
      /* A checkbox must not be stretched by the rule above. */
      .new input[type='checkbox'] {
        width: auto;
        min-width: auto;
        margin: 0.2rem 0 0;
        flex: 0 0 auto;
      }
      /* auto-fit rather than 1fr 1fr so a narrow window stacks the pair instead of squeezing two
         date inputs into space neither of them fits. */
      .pair {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
        gap: 0.75rem;
      }
      label.check {
        flex-direction: row;
        align-items: flex-start;
        gap: 0.5rem;
      }
      label.check > span {
        font-weight: 600;
        font-size: 0.9rem;
      }
      .actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-wrap: wrap;
      }
      .actions button,
      .row-actions button {
        padding: 0.45rem 0.9rem;
        border: 1px solid rgba(128, 128, 128, 0.4);
        border-radius: 6px;
        font: inherit;
        cursor: pointer;
        background: var(--color-surface, #fff);
        color: inherit;
      }
      .actions button:disabled,
      .row-actions button:disabled {
        cursor: default;
        opacity: 0.5;
      }
      table.rows {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9rem;
      }
      table.rows th {
        text-align: left;
        border-bottom: 1px solid rgba(128, 128, 128, 0.4);
        padding: 0.4rem 0.5rem;
        font-size: 0.8rem;
        text-transform: uppercase;
        opacity: 0.7;
      }
      table.rows td {
        border-bottom: 1px solid rgba(128, 128, 128, 0.18);
        padding: 0.5rem;
        vertical-align: top;
      }
      table.rows tr.done {
        opacity: 0.6;
      }
      td.num,
      td.config {
        white-space: nowrap;
      }
      td small {
        display: block;
        opacity: 0.7;
        font-size: 0.78rem;
      }
      small.slug {
        font-family: ui-monospace, monospace;
      }
      .pill {
        display: inline-block;
        padding: 0.1rem 0.5rem;
        border-radius: 999px;
        font-size: 0.78rem;
        border: 1px solid currentColor;
      }
      .pill.running {
        color: #2ecc71;
      }
      .pill.pending {
        color: #f1c40f;
      }
      .pill.finished,
      .pill.cancelled {
        opacity: 0.7;
      }
      .ok {
        color: #2ecc71;
      }
      .warn {
        color: #e67e22;
      }
      /* The inline row editor. Same control dressing as the create form — nothing global styles a
         bare input, so both places have to say so. */
      form.edit {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        min-width: 12rem;
      }
      form.edit label {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        min-width: 0;
      }
      form.edit label > span {
        font-size: 0.75rem;
        font-weight: 600;
        opacity: 0.8;
      }
      form.edit input {
        padding: 0.3rem 0.45rem;
        border: 1px solid rgba(128, 128, 128, 0.4);
        border-radius: 5px;
        font: inherit;
        width: 100%;
        box-sizing: border-box;
        min-width: 0;
      }
      form.edit label.check {
        flex-direction: row;
        align-items: center;
        gap: 0.4rem;
      }
      form.edit label.check > span {
        font-size: 0.75rem;
      }
      form.edit input[type='checkbox'] {
        width: auto;
        min-width: auto;
        margin: 0;
        flex: 0 0 auto;
      }
      td.row-actions {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        align-items: stretch;
      }
    `,
  ],
})
export class PvpEventsPageComponent {
  private readonly api = inject(BackofficeService);

  protected readonly events = signal<PvpEvent[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly createError = signal<string | null>(null);
  protected readonly busy = signal<number | null>(null);

  /** Which row is being edited, or null. One at a time — a table of open forms is a table nobody
   *  can read, and there is no reason to change two tournaments at once. */
  protected readonly editing = signal<number | null>(null);

  protected readonly editForm = new FormGroup({
    boutCap: new FormControl<number>(5, { nonNullable: true }),
    pointsPerWin: new FormControl<number>(1, { nonNullable: true }),
    pointsPerLoss: new FormControl<number>(0, { nonNullable: true }),
    allowDraftedHealer: new FormControl(true, { nonNullable: true }),
    avoidRepeatPairings: new FormControl(true, { nonNullable: true }),
  });

  protected readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    channelId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    startsAt: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    closesAt: new FormControl('', { nonNullable: true }),
    boutCap: new FormControl<number>(5, { nonNullable: true }),
    pointsPerWin: new FormControl<number>(1, { nonNullable: true }),
    pointsPerLoss: new FormControl<number>(0, { nonNullable: true }),
    capacity: new FormControl<number | null>(null),
    mentionRoleId: new FormControl<string | null>(null),
    allowDraftedHealer: new FormControl(true, { nonNullable: true }),
    avoidRepeatPairings: new FormControl(true, { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.getPvpEvents().subscribe({
      next: (rows) => {
        this.events.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load tournaments.');
        this.loading.set(false);
      },
    });
  }

  protected create(): void {
    const v = this.form.getRawValue();
    const startsAt = this.vnToUtcIso(v.startsAt);
    if (!startsAt) {
      this.createError.set('A start time is required.');
      return;
    }

    const closesAt = v.closesAt ? this.vnToUtcIso(v.closesAt) : null;
    if (closesAt && closesAt > startsAt) {
      // Checked here as well as API-side, because this is the one the admin can see and fix without
      // a round trip. "Closes after it starts" is the single incoherent combination.
      this.createError.set('Registration cannot close after the tournament starts.');
      return;
    }

    if ((v.pointsPerLoss ?? 0) >= (v.pointsPerWin ?? 1)) {
      this.createError.set('Points per loss must be lower than points per win.');
      return;
    }

    const body: PvpEventCreate = {
      title: v.title.trim(),
      channelId: v.channelId,
      startsAt,
      rsvpClosesAt: closesAt,
      capacity: v.capacity ?? null,
      notes: v.notes.trim() || null,
      boutCap: v.boutCap ?? null,
      pointsPerWin: v.pointsPerWin ?? null,
      pointsPerLoss: v.pointsPerLoss ?? null,
      allowDraftedHealer: v.allowDraftedHealer,
      avoidRepeatPairings: v.avoidRepeatPairings,
      mentionRoleId: v.mentionRoleId,
    };

    this.creating.set(true);
    this.createError.set(null);
    this.api.createPvpEvent(body).subscribe({
      next: () => {
        this.creating.set(false);
        this.form.patchValue({ title: '', notes: '' });
        this.load();
      },
      error: (err) => {
        this.creating.set(false);
        // A Discord failure is the interesting one and it creates nothing, so the message has to
        // name it rather than say "save failed".
        this.createError.set(
          err?.error?.error === 'post_failed'
            ? `Discord refused the post: ${err.error.detail ?? 'unknown reason'}. Nothing was created — check the bot can post in that channel.`
            : err?.error?.error === 'no_bot_token'
              ? 'The API has no Discord bot token configured, so it cannot post.'
              : err?.error?.error === 'close_after_start'
                ? 'Registration cannot close after the tournament starts.'
                : err?.error?.error === 'points_per_loss_too_high'
                  ? 'Points per loss must be lower than points per win.'
                  : 'Could not create the tournament.',
        );
      },
    });
  }

  protected startEdit(e: PvpEvent): void {
    this.editing.set(e.id);
    this.editForm.setValue({
      boutCap: e.boutCap,
      pointsPerWin: e.pointsPerWin,
      pointsPerLoss: e.pointsPerLoss,
      allowDraftedHealer: e.allowDraftedHealer,
      avoidRepeatPairings: e.avoidRepeatPairings,
    });
  }

  protected cancelEdit(): void {
    this.editing.set(null);
  }

  /**
   * Saves the four settings that can still change after the post is up.
   *
   * Raising the bout cap mid-event is the useful case: it lets more rounds be drawn from a field that
   * still has people in it. Lowering it below what somebody has already played takes nobody's results
   * away — they simply stop being drawn.
   */
  protected saveEdit(e: PvpEvent): void {
    const v = this.editForm.getRawValue();
    if (v.pointsPerLoss >= v.pointsPerWin) {
      this.error.set('Points per loss must be lower than points per win.');
      return;
    }

    this.busy.set(e.id);
    this.api.patchPvpEvent(e.id, v).subscribe({
      next: () => {
        this.busy.set(null);
        this.editing.set(null);
        this.load();
      },
      error: (err) => {
        this.busy.set(null);
        this.error.set(
          err?.error?.error === 'points_per_loss_too_high'
            ? 'Points per loss must be lower than points per win.'
            : 'Could not save that change.',
        );
      },
    });
  }

  protected cancelEvent(e: PvpEvent): void {
    if (!confirm(`Cancel "${e.title}"? Its registration post stops taking answers. Results are kept.`)) {
      return;
    }
    this.busy.set(e.id);
    this.api.cancelPvpEvent(e.id).subscribe({
      next: () => {
        this.busy.set(null);
        this.load();
      },
      error: () => {
        this.busy.set(null);
        this.error.set('Could not cancel that tournament.');
      },
    });
  }

  protected stateLabel(e: PvpEvent): string {
    switch (e.status) {
      case 'pending':
        return 'registering';
      case 'running':
        return `round ${e.currentRound}`;
      default:
        return e.status;
    }
  }

  protected shortfallHelp(e: PvpEvent): string {
    const base =
      `A bout seats ${e.damageSeatsPerTeam * 2} Tank/DPS and ${e.healerSeatsPerTeam * 2} healers, so ` +
      `every ${e.damageSeatsPerTeam} Tank/DPS need a healer to keep playing. ` +
      `${e.healerShortfall} more healer(s) would let everyone reach ${e.boutCap} bouts.`;
    return e.allowDraftedHealer
      ? `${base} Drafting is on, so Tank/DPS will fill the empty healer seats.`
      : `${base} Drafting is off, so rounds will simply be shorter.`;
  }

  /** Renders an instant in Vietnam time, which is the clock everyone in this guild reads. */
  protected vnLabel(iso: string | null): string {
    if (!iso) return '';
    const vn = new Date(new Date(iso).getTime() + VN_OFFSET_MS);
    return `${vn.toISOString().slice(0, 16).replace('T', ' ')} VN`;
  }

  /**
   * A `datetime-local` value is wall-clock with no zone. The guild's clock is Vietnam's, so it is
   * read as VN and converted — never as the admin's own browser zone, which would silently shift
   * every event for anyone travelling.
   */
  private vnToUtcIso(local: string): string {
    if (!local) return '';
    return new Date(new Date(`${local}:00Z`).getTime() - VN_OFFSET_MS).toISOString();
  }
}
