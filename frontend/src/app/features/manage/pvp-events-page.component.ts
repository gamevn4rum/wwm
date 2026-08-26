import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { toBlob } from 'html-to-image';
import {
  BackofficeService,
  PvpEvent,
  PvpEventCreate,
  PvpFieldBout,
  PvpFieldRow,
} from '../../core/services/backoffice.service';
import { cardFontCss } from '../../core/utils/card-fonts';
import { captureScale } from '../../core/utils/card-shot';
import { DiscordPickerComponent } from './discord-picker.component';

/** Vietnam is a fixed UTC+7 with no DST, so plain arithmetic on the offset is exact. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Same four states the roster card's share button reports, for the same reason: a capture takes
 *  long enough that a button which does not say so reads as one that did nothing. */
type ShotState = 'idle' | 'working' | 'copied' | 'downloaded' | 'failed';

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
 * What this page adds to that is the **field**, under each event: everyone in it in scoreboard order
 * with their points, and a **grid of rounds** — a column per round, a mark per person, ✅ won, ❌
 * lost, ⌚ not reported yet, – not drawn. Who they were seated with and against hangs off each mark
 * as a tooltip, because a whole evening's pairings written out is a wall of names, while the shape
 * of somebody's evening — three rounds on, one sat out, the last still open — is a thing you should
 * be able to see without reading. Read only, and ranked by the API's own helper rather than
 * re-sorted here, so it says exactly what `/gtourboard` says. Copy image puts the whole board on the
 * clipboard as a PNG, for pasting the standings back into Discord.
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
      <h1>PvP tournaments</h1>
      <p class="hint">
        Self-hosted tournaments: two registration pools, teams drawn fresh every round, a point per
        win. Creating one posts its registration form to the channel straight away — there is no
        draft state. The bot takes it from there with <code>/gtourstart</code>, and the scoreboard is
        <code>/gtourboard</code>. Times are Vietnam (UTC+7).
      </p>

      @if (loading()) {
        <p>Loading…</p>
      } @else {
        @if (error(); as e) {
          <p class="error">{{ e }}</p>
        }

        <!-- ── new tournament ────────────────────────────────────────────── -->
        <form [formGroup]="form" (ngSubmit)="create()" class="new">
          <h2>New tournament</h2>

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
              <span>Team size</span>
              <select formControlName="teamSize" (change)="onTeamSizeChange()">
                @for (n of teamSizes; track n) {
                  <option [value]="n">{{ n }}v{{ n }}</option>
                }
              </select>
            </label>
            <label>
              <span>Healers per team</span>
              <select formControlName="healersPerTeam">
                @for (n of healerChoices(); track n) {
                  <option [value]="n">{{ n }}</option>
                }
              </select>
              <small>{{ formatHint() }}</small>
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
          <table class="grid">
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
                    ➕ {{ e.registeredHealer }}
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
                        @if (e.status === 'pending') {
                          <label>
                            <span>Team size</span>
                            <select formControlName="teamSize" (change)="onEditTeamSizeChange()">
                              @for (n of teamSizes; track n) {
                                <option [value]="n">{{ n }}v{{ n }}</option>
                              }
                            </select>
                          </label>
                          <label>
                            <span>Healers/team</span>
                            <select formControlName="healersPerTeam">
                              @for (n of editHealerChoices(); track n) {
                                <option [value]="n">{{ n }}</option>
                              }
                            </select>
                          </label>
                        } @else {
                          <!-- Running or finished: bouts of two shapes cannot share a scoreboard,
                               so the API refuses it and the form must not offer it. -->
                          <small class="warn">Format locked once it starts</small>
                        }
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
                    <!-- Offered on every event, including a finished one: the results are the whole
                         point of having run it, and a cancelled event still has the bouts that were
                         played before it was called off. -->
                    <button type="button" (click)="toggleField(e)">
                      {{ expanded() === e.id ? 'Hide field' : 'Field' }}
                    </button>
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
                    <!-- A cancelled event gets the other way back instead: not "replay the rounds"
                         but "it is on again after all", which returns it to taking registrations.

                         Two buttons rather than one, because there are two of these and the
                         difference is a field of twenty-odd people. A single "Reopen" that quietly
                         did the second one is what lost a field on 2026-08-26 — a host reaching for
                         "reset, but from cancelled" has no reason to expect the players to go, so
                         the choice is on the buttons instead of inside them. -->
                    @if (e.status === 'cancelled') {
                      <button
                        type="button"
                        (click)="reopenEvent(e, true)"
                        [disabled]="busy() === e.id"
                        title="Back on with the same players. Rounds are cleared; nobody signs up again."
                      >
                        {{ busy() === e.id ? '…' : 'Reopen · same players' }}
                      </button>
                      <button
                        type="button"
                        class="danger"
                        (click)="reopenEvent(e, false)"
                        [disabled]="busy() === e.id"
                        title="Drops the field. The line-up is rebuilt from whoever has answered when you start it."
                      >
                        {{ busy() === e.id ? '…' : 'Reopen · fresh signups' }}
                      </button>
                    }
                    <!-- Offered on a finished event too: "that run should not have counted" is
                         usually said after the scoreboard has been read, and a reset is the only way
                         back from a draw made on the wrong field. Not on a cancelled one — that one
                         is reopened rather than replayed. -->
                    @if (e.status !== 'cancelled' && e.boutsDrawn > 0) {
                      <button
                        type="button"
                        class="danger"
                        (click)="resetEvent(e)"
                        [disabled]="busy() === e.id"
                      >
                        {{ busy() === e.id ? '…' : 'Reset rounds' }}
                      </button>
                    }
                  </td>
                </tr>

                <!-- ── the field, under the event it belongs to ──────────────── -->
                @if (expanded() === e.id) {
                  <tr class="field-row">
                    <td colspan="7">
                      @if (fieldLoading()) {
                        <p class="note">Loading the field…</p>
                      } @else if (fieldError(); as fe) {
                        <p class="error">{{ fe }}</p>
                      } @else if (field().length === 0) {
                        <p class="note">
                          Nobody in the field yet. It is snapshotted from the registration when
                          <code>/gtourstart</code> runs, so a tournament still taking answers has
                          registrations but no field.
                        </p>
                      } @else {
                        <!-- The capture target. The title is inside it, not only on the row above,
                             so the shared image says which tournament it is — and so does the drawer
                             itself once the table is long enough to scroll its own row out of view. -->
                        <div class="field-shot">
                          <div class="field-head">
                            <span>
                              <strong>{{ e.title }}</strong> ·
                              {{ field().length }} in the field ·
                              {{ e.boutsReported }}/{{ e.boutsDrawn }} bouts reported · cap
                              {{ e.boutCap }} · +{{ e.pointsPerWin }}/{{ e.pointsPerLoss }}pt
                            </span>
                            <span class="head-actions pvp-noshot">
                              <!-- The bouts are reported in Discord, so this table goes stale while
                                   it is open. Cheaper to re-ask than to guess when. -->
                              <button type="button" (click)="loadField(e)">Refresh</button>
                              <button type="button" (click)="share(e, $event)" [disabled]="shot() === 'working'">
                                {{ shotLabel() }}
                              </button>
                            </span>
                          </div>

                          <!-- A key, not decoration: the grid is glyphs, and the copied PNG has no
                               tooltips to fall back on. Reads left to right in the order somebody
                               meets them scanning a row. -->
                          <p class="note legend">
                            <span>✅ won</span><span>❌ lost</span><span>⌚ not reported yet</span>
                            <span><span class="idle">–</span> not drawn</span>
                            <span><span class="drafted-key">❌</span> drafted into a healer seat</span>
                          </p>

                          @if (e.pointsPerLoss > 0) {
                            <!-- Only worth saying when losses score: the order is wins first, so a
                                 consolation point can leave somebody ranked above a player with more
                                 points. Said out loud here, because a Pts column that does not fall
                                 all the way down reads as a broken table rather than as a tiebreak. -->
                            <p class="note">
                              Ranked by wins, then win rate, then fewer bouts played — the same order
                              <code>/gtourboard</code> uses. With a point per loss, points can run out
                              of step with that order.
                            </p>
                          }

                          <table class="board">
                            <thead>
                              <tr>
                                <th class="rank">#</th>
                                <th class="player">Player</th>
                                <th class="num">Pts</th>
                                <th class="num">W–L</th>
                                <th class="num">Bouts</th>
                                <th class="num">Rate</th>
                                <!-- One column per round that was actually played. Numbered from the
                                     bouts rather than counted off, so a round the whole field
                                     skipped leaves no empty column and R4 still says R4. -->
                                @for (r of roundColumns(); track r) {
                                  <th class="round" [class.first]="$first" [title]="'Round ' + r">R{{ r }}</th>
                                }
                              </tr>
                            </thead>
                            <tbody>
                              @for (p of rows(); track p.participantId) {
                                <tr>
                                  <td class="rank">{{ medal(p.rank) }}</td>
                                  <td class="who">
                                    <span class="mark" [title]="poolLabel(p)">{{ poolMark(p) }}</span>
                                    {{ p.name }}
                                    @if (p.status !== 'active') {
                                      <span class="pill" [class]="p.status" [title]="statusHelp(p)">
                                        {{ statusLabel(p) }}
                                      </span>
                                    }
                                  </td>
                                  <td class="num pts">{{ p.points }}</td>
                                  <td class="num">{{ p.wins }}–{{ p.losses }}</td>
                                  <td class="num">{{ p.boutsPlayed }}</td>
                                  <td class="num">{{ rateLabel(p) }}</td>
                                  <!-- A cell per round column, in the same order as the headers, so
                                       a row can be read straight across. Normally one bout to a
                                       cell; the loop is there because a re-draw could seat somebody
                                       twice in a round, and two marks side by side say that better
                                       than the last one silently winning. -->
                                  @for (c of p.cells; track c.round) {
                                    <td class="round" [class.first]="$first">
                                      @if (c.bouts.length === 0) {
                                        <span class="idle" [title]="'Not drawn into round ' + c.round">–</span>
                                      } @else {
                                        @for (b of c.bouts; track b.boutId) {
                                          <span
                                            class="outcome"
                                            [class]="b.outcome"
                                            [class.drafted]="b.draftedHealer"
                                            [title]="boutTip(b)"
                                            [attr.aria-label]="boutTip(b)"
                                          >{{ outcomeIcon(b) }}</span>
                                        }
                                      }
                                    </td>
                                  }
                                </tr>
                              }
                            </tbody>
                          </table>
                        </div>
                      }
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        }
      }
    </section>
  `,
  styles: [
    `
      /* Matches the other Manage pages: a centred column, an h1 with a hint under it, 8px cards and
         the same table dressing as Member permissions — which is the widest of them, and the right
         width for a table this many columns wide. */
      .backoffice {
        max-width: 1100px;
        margin: 0 auto;
        padding: 1.5rem;
      }
      h1 {
        margin-bottom: 0.25rem;
      }
      .hint {
        opacity: 0.7;
        margin-bottom: 1rem;
        max-width: 62rem;
      }
      .error,
      .bad {
        color: #dc3545;
      }
      .new {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        max-width: 40rem;
        padding: 1rem;
        border: 1px solid rgba(128, 128, 128, 0.3);
        border-radius: 8px;
        margin-bottom: 1.5rem;
      }
      .new h2 {
        margin: 0;
        font-size: 1.05rem;
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
        font-size: 0.85rem;
      }
      label small {
        font-weight: 400;
        opacity: 0.7;
        display: block;
        font-size: 0.75rem;
      }
      /* Nothing global styles a bare input — each panel dresses its own, as Scheduled events does.
         font: inherit matters: without it a control renders in the browser's default face at a size
         the rest of the page never uses, and stops reading as a field you can type in. */
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
        width: var(--checkbox-size);
        min-width: auto;
        margin: 0.2rem 0 0;
        flex: 0 0 auto;
      }
      /* auto-fit rather than fixed tracks so a narrow window stacks the pair instead of squeezing
         two date inputs into space neither of them fits. */
      .pair {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
        gap: 0.75rem;
      }
      label.check {
        flex-direction: row;
        align-items: flex-start;
        gap: 0.5rem;
      }
      label.check > span {
        font-weight: 600;
        font-size: 0.85rem;
      }
      .actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-wrap: wrap;
      }
      button {
        padding: 0.35rem 0.9rem;
        border: 1px solid rgba(128, 128, 128, 0.4);
        border-radius: 6px;
        font: inherit;
        cursor: pointer;
        background: transparent;
        color: inherit;
      }
      button:disabled {
        cursor: default;
        opacity: 0.5;
      }
      table.grid {
        width: 100%;
        border-collapse: collapse;
      }
      .grid th,
      .grid td {
        text-align: left;
        padding: 0.45rem 0.6rem;
        border-bottom: 1px solid rgba(128, 128, 128, 0.25);
        vertical-align: top;
      }
      .grid th {
        font-size: 0.75rem;
        text-transform: uppercase;
        opacity: 0.6;
        font-weight: 600;
      }
      .grid tr.done {
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
        font-family: monospace;
        opacity: 0.8;
      }
      /* The same pill the roster's tags use. */
      .pill {
        display: inline-block;
        font-size: 0.72rem;
        padding: 0.1rem 0.5rem;
        border: 1px solid rgba(128, 128, 128, 0.45);
        border-radius: 999px;
        opacity: 0.85;
      }
      .pill.running {
        border-color: #7c9473;
        color: #5f7757;
        opacity: 1;
      }
      .pill.pending {
        border-color: #ad7a4c;
        color: #8b5f37;
        opacity: 1;
      }
      .ok {
        color: #5f7757;
      }
      .warn {
        color: #b5533d;
      }
      /* The inline row editor. Same control dressing as the create form — nothing global styles a
         bare input, so both places have to say so. */
      form.edit {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        min-width: 11rem;
      }
      form.edit label {
        gap: 0.15rem;
      }
      form.edit label > span {
        font-size: 0.72rem;
        opacity: 0.75;
      }
      form.edit input,
      form.edit select {
        padding: 0.3rem 0.45rem;
        border: 1px solid rgba(128, 128, 128, 0.4);
        border-radius: 6px;
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
        font-size: 0.72rem;
      }
      form.edit input[type='checkbox'] {
        width: var(--checkbox-size);
        min-width: auto;
        margin: 0;
        flex: 0 0 auto;
      }
      td.row-actions {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
      /* The one button here that deletes something. Same red the other Manage pages use for theirs,
         so "this one is not like the others" reads the same way across the panel. */
      .danger {
        color: #dc3545;
        border-color: #dc3545;
      }

      /* ── the field drawer ─────────────────────────────────────────────────
         Inset and tinted so it reads as belonging to the row above rather than as another event.
         The same 8px/greys as everything else here, one step in from the table's own padding. */
      .field-row > td {
        padding: 0.75rem 0.6rem 1rem;
        background: rgba(128, 128, 128, 0.06);
      }
      .field-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        flex-wrap: wrap;
        font-size: 0.8rem;
        opacity: 0.85;
        margin-bottom: 0.5rem;
      }
      .head-actions {
        display: flex;
        gap: 0.35rem;
        flex-wrap: wrap;
      }
      .note {
        margin: 0 0 0.5rem;
        opacity: 0.7;
        font-size: 0.82rem;
        max-width: 60rem;
      }
      table.board {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.85rem;
        /* Fixed, so the widths below are the widths: the name column is capped and every other
           column takes an equal share of what is left. Left to the auto algorithm, a table of
           mostly two-character cells hands its slack to whichever column has the longest word in
           it, which is how the scores ended up a hand's width from the names they belong to. */
        table-layout: fixed;
      }
      .board th,
      .board td {
        text-align: left;
        padding: 0.35rem 0.5rem;
        border-bottom: 1px solid rgba(128, 128, 128, 0.2);
        vertical-align: middle;
      }
      .board th {
        font-size: 0.7rem;
        text-transform: uppercase;
        opacity: 0.6;
        font-weight: 600;
        white-space: nowrap;
      }
      .board tr:last-child td {
        border-bottom: none;
      }
      .board td.num,
      .board th.num {
        text-align: right;
        white-space: nowrap;
      }
      /* Tabular figures so a column of scores lines up digit over digit. */
      .board td.num {
        font-variant-numeric: tabular-nums;
      }
      .board td.pts {
        font-weight: 600;
      }
      .board .rank {
        text-align: center;
        font-variant-numeric: tabular-nums;
        opacity: 0.75;
      }
      /* 25 characters of the table's own font, which is what a ch unit measures, and an ellipsis
         past it. The only column given a width: an IGN is the one cell here whose length is somebody
         else's decision, and left to size itself it either pushed the scores off to the right or
         swallowed the table's whole slack. */
      .board th.player,
      .board td.who {
        width: 25ch;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .board .mark {
        opacity: 0.85;
      }
      .board .pill {
        margin-left: 0.35rem;
        font-size: 0.66rem;
      }
      .pill.done {
        border-color: #7c9473;
        color: #5f7757;
        opacity: 1;
      }
      .pill.withdrawn,
      .pill.absent {
        border-color: #b5533d;
        color: #b5533d;
        opacity: 1;
      }
      /* ── the round grid ───────────────────────────────────────────────────
         Narrow, centred, fixed width: the point of a grid is that a column reads down as well as a
         row reads across, and marks that shuffle sideways with the header text do neither. */
      .board th.round,
      .board td.round {
        text-align: center;
        white-space: nowrap;
        padding-left: 0.3rem;
        padding-right: 0.3rem;
      }
      /* One rule down the left of the grid, so it reads as a block of rounds rather than as four
         more score columns. Only the first — a line between every round would draw a cage. */
      .board th.round.first,
      .board td.round.first {
        border-left: 1px solid rgba(128, 128, 128, 0.25);
      }
      .board td.round .outcome {
        font-size: 0.95rem;
        line-height: 1;
        /* The tooltip is the only place the teams are named now, so say the mark is worth hovering. */
        cursor: help;
      }
      /* Somebody who was never drawn and somebody whose round is still open are different states, so
         the dash is dimmed well below the ⌚ beside it rather than sitting at the same weight. */
      .idle {
        opacity: 0.35;
      }
      /* A drafted healer sat a role they did not sign up for — worth seeing at a glance and not only
         in the tooltip, because the copied PNG has no tooltips. An underline rather than a second
         glyph: the cell is 2rem wide and a ➕ next to a ✅ in it reads as one smudge. */
      .board td.round .outcome.drafted,
      .drafted-key {
        border-bottom: 2px dotted var(--color-accent-blue, #6e88a8);
        padding-bottom: 1px;
      }
      /* Spaced apart rather than comma-run, so each pair is one thing to take in. */
      .legend {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem 1rem;
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

  /** Which event's field is open, and that field. One at a time, for the same reason as above and
   *  one more: each one is a request that joins every seat of every bout. */
  protected readonly expanded = signal<number | null>(null);
  protected readonly field = signal<PvpFieldRow[]>([]);
  protected readonly fieldLoading = signal(false);
  protected readonly fieldError = signal<string | null>(null);

  /**
   * The field as the table shows it: skipped bouts dropped.
   *
   * A skipped bout is one nobody played — it scores nothing and says nothing about who somebody has
   * been drawn against, so on a history read as a record of an evening it is noise. The API still
   * serves them (they are what explains a bout count short of the cap, and the bot may want them),
   * so this is a view rather than a narrower request.
   *
   * Filtered here rather than in the template so it happens once per load instead of once per change
   * detection pass, on a table that can run to a few hundred lines.
   */
  private readonly played = computed(() =>
    this.field().map((r) => ({ ...r, history: r.history.filter((b) => b.outcome !== 'skipped') })));

  /**
   * The rounds that get a column, ascending.
   *
   * Collected from the bouts rather than counted `1..currentRound`, so the columns match what is
   * actually in the table: a round the whole field skipped leaves no empty stripe of dashes, and
   * because the header is the bout's own round number, dropping one does not renumber the rest.
   */
  protected readonly roundColumns = computed(() => {
    const seen = new Set<number>();
    for (const r of this.played()) for (const b of r.history) seen.add(b.round);
    return [...seen].sort((a, b) => a - b);
  });

  /**
   * A row per participant, with one cell per round column already lined up.
   *
   * Pivoted here and not in the template: a template that filtered the history per round would do it
   * rows × rounds times on every change detection pass, and this table is a few hundred lines long
   * while somebody is holding the mouse over it.
   */
  protected readonly rows = computed(() => {
    const rounds = this.roundColumns();
    return this.played().map((r) => ({
      ...r,
      cells: rounds.map((round) => ({ round, bouts: r.history.filter((b) => b.round === round) })),
    }));
  });

  /** The capture button's state. One at a time, because only one field is open at a time. */
  protected readonly shot = signal<ShotState>('idle');

  protected readonly editForm = new FormGroup({
    teamSize: new FormControl<number>(3, { nonNullable: true }),
    healersPerTeam: new FormControl<number>(1, { nonNullable: true }),
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
    teamSize: new FormControl<number>(3, { nonNullable: true }),
    healersPerTeam: new FormControl<number>(1, { nonNullable: true }),
    boutCap: new FormControl<number>(5, { nonNullable: true }),
    pointsPerWin: new FormControl<number>(1, { nonNullable: true }),
    pointsPerLoss: new FormControl<number>(0, { nonNullable: true }),
    capacity: new FormControl<number | null>(null),
    mentionRoleId: new FormControl<string | null>(null),
    allowDraftedHealer: new FormControl(true, { nonNullable: true }),
    avoidRepeatPairings: new FormControl(true, { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
  });

  /** The sizes the draw is willing to run. Two teams are seated per bout, so an odd size nobody
   *  plays in this game only adds ways for a round to come up short. Mirrors the API's TeamSizes. */
  protected readonly teamSizes = [1, 2, 3, 5];

  /** Healer counts allowed for the size currently chosen: none up to all-but-one, so there is always
   *  somebody to do damage. A 1v1 can only be 0, which is what makes it a role-less duel. */
  protected readonly healerChoices = computed(() =>
    this.choicesFor(Number(this.formTeamSize())));

  protected readonly editHealerChoices = computed(() =>
    this.choicesFor(Number(this.editTeamSize())));

  /** Reads the selects back as numbers — a native select yields strings, and `4 + '1'` is `'41'`. */
  private readonly formTeamSize = signal(3);
  private readonly editTeamSize = signal(3);

  /** What the chosen format costs per bout, which is the number worth knowing before committing:
   *  healers are the scarce pool, so this is what decides whether a round can be fielded at all. */
  protected readonly formatHint = computed(() => {
    const size = Number(this.formTeamSize());
    const healers = Number(this.form.controls.healersPerTeam.value);
    const damage = size - healers;
    return healers === 0
      ? `${damage * 2} players a bout, no healer seat — both pools drawn as one.`
      : `${damage * 2} Tank/DPS + ${healers * 2} healers a bout.`;
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
      teamSize: Number(v.teamSize),
      healersPerTeam: Number(v.healersPerTeam),
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

  private choicesFor(size: number): number[] {
    const max = Math.max(0, (Number.isFinite(size) ? size : 3) - 1);
    return Array.from({ length: max + 1 }, (_, i) => i);
  }

  /** Keeps the healer count inside what the new size allows — dropping 5v5 (2 healers) to a 1v1
   *  must not leave a team asking for more healers than it has seats. */
  protected onTeamSizeChange(): void {
    const size = Number(this.form.controls.teamSize.value);
    this.formTeamSize.set(size);
    const allowed = this.choicesFor(size);
    const current = Number(this.form.controls.healersPerTeam.value);
    if (!allowed.includes(current)) {
      this.form.controls.healersPerTeam.setValue(allowed.includes(1) ? 1 : 0);
    }
  }

  protected onEditTeamSizeChange(): void {
    const size = Number(this.editForm.controls.teamSize.value);
    this.editTeamSize.set(size);
    const allowed = this.choicesFor(size);
    const current = Number(this.editForm.controls.healersPerTeam.value);
    if (!allowed.includes(current)) {
      this.editForm.controls.healersPerTeam.setValue(allowed.includes(1) ? 1 : 0);
    }
  }

  protected startEdit(e: PvpEvent): void {
    this.editing.set(e.id);
    this.editTeamSize.set(e.teamSize);
    this.editForm.setValue({
      teamSize: e.teamSize,
      healersPerTeam: e.healerSeatsPerTeam,
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

  /**
   * Delete every round of a tournament and let it be started again from the same field.
   *
   * ⚠ The only destructive action on this page, so the confirm spells out both halves of it — what
   * goes (rounds, bouts, points, bout counts, for good) and what stays (the people, minus anyone who
   * withdrew). Two counts are named because they are what makes it real: a reset of a tournament
   * with 15 reported bouts is a very different decision from one with none.
   */
  protected resetEvent(e: PvpEvent): void {
    const played = e.boutsReported > 0 ? `, ${e.boutsReported} of them reported` : '';
    if (
      !confirm(
        `Reset "${e.title}"?\n\n` +
          `All ${e.boutsDrawn} bouts drawn so far${played} will be deleted permanently, ` +
          `along with every point and bout count. This cannot be undone.\n\n` +
          `The field stays: ${e.registeredDamage + e.registeredHealer} people keep their places ` +
          `(anyone who withdrew stays out). The tournament goes back to pending, so /gtourstart ` +
          `draws round 1 again.`,
      )
    ) {
      return;
    }
    this.busy.set(e.id);
    this.api.resetPvpEvent(e.id).subscribe({
      next: () => {
        this.busy.set(null);
        // The field drawer, if it is open on this event, is now a table of bouts that no longer
        // exist — so it closes rather than showing them until somebody presses Refresh.
        if (this.expanded() === e.id) this.expanded.set(null);
        this.load();
      },
      error: () => {
        this.busy.set(null);
        this.error.set('Could not reset that tournament.');
      },
    });
  }

  /**
   * Put a cancelled tournament back to taking registrations, one of two ways.
   *
   * `keepField` true is the one a host almost always means: the evening is on again with the people
   * who were already in it, and only the rounds go. False is the harder one — the field goes too,
   * and starting rebuilds it from whoever has answered by then.
   *
   * The RSVP answers survive either way, which is what makes this a reopen rather than a rerun, and
   * what made the lost field of 2026-08-26 recoverable by simply starting the event again. Recovery
   * existing is not a reason to keep offering the destructive one by default, so now it is asked.
   */
  protected reopenEvent(e: PvpEvent, keepField: boolean): void {
    const drawn = e.boutsDrawn > 0
      ? `The ${e.boutsDrawn} bouts drawn before it was called off will be deleted permanently, along with every point. `
      : '';
    const closed = e.rsvpClosesAt !== null && new Date(e.rsvpClosesAt) < new Date()
      ? '\n\nNote: its registration deadline has already passed, so the form will not take new ' +
        'answers — the ones already given still count, and /gtourstart works on them.'
      : '';
    const field = keepField
      ? `Everyone currently in it stays in it, with their wins and bouts cleared. ` +
        `Nobody has to sign up again.`
      : `Its ${e.registeredDamage + e.registeredHealer} players are removed from the event. ` +
        `Their answers are kept, so starting it rebuilds the line-up from whoever has answered ` +
        `by then — including anyone who signs up in the meantime.`;
    if (
      !confirm(
        `Reopen "${e.title}" ${keepField ? 'with the same players' : 'for fresh signups'}?\n\n` +
          `${drawn}${field}` +
          closed,
      )
    ) {
      return;
    }
    this.busy.set(e.id);
    this.api.reopenPvpEvent(e.id, keepField).subscribe({
      next: () => {
        this.busy.set(null);
        if (this.expanded() === e.id) this.expanded.set(null);
        this.load();
      },
      error: (err) => {
        this.busy.set(null);
        this.error.set(
          err?.error?.error === 'not_cancelled'
            ? 'That tournament is not cancelled — use Reset rounds instead.'
            : 'Could not reopen that tournament.',
        );
      },
    });
  }

  // ── the field ───────────────────────────────────────────────────────────────

  protected toggleField(e: PvpEvent): void {
    if (this.expanded() === e.id) {
      this.expanded.set(null);
      return;
    }
    this.expanded.set(e.id);
    this.loadField(e);
  }

  /**
   * Reads one event's field. Also the Refresh button, because the bouts are reported in Discord —
   * this table starts going stale the moment it is open, and there is no push to tell it so.
   */
  protected loadField(e: PvpEvent): void {
    this.fieldLoading.set(true);
    this.fieldError.set(null);
    this.field.set([]);
    this.api.getPvpField(e.id).subscribe({
      next: (rows) => {
        this.field.set(rows);
        this.fieldLoading.set(false);
      },
      error: () => {
        this.fieldError.set('Could not load that field.');
        this.fieldLoading.set(false);
      },
    });
  }

  protected shotLabel(): string {
    switch (this.shot()) {
      case 'working':
        return 'Capturing…';
      case 'copied':
        return 'Copied';
      case 'downloaded':
        return 'Saved';
      case 'failed':
        return 'Failed';
      default:
        return 'Copy image';
    }
  }

  /**
   * Rasterize the open field and put the PNG on the clipboard, so a scoreboard can be pasted into
   * Discord as one image instead of screenshotted by hand.
   *
   * Built the same way the roster card's share button is — `toBlob`, the curated font set, the shared
   * oversampling budget, and a download if the clipboard write is refused — because a second way of
   * doing this is a second way for it to come out soft or unreadable. See `card-shot.ts`.
   *
   * The buttons are removed from an **off-screen clone** rather than hidden during capture: the
   * library sizes its output from the live element, so hiding a node in place leaves its space in the
   * image, and hiding it for real would make the page jump under the cursor that just clicked it.
   */
  protected async share(e: PvpEvent, event: Event): Promise<void> {
    if (this.shot() === 'working') return;

    const panel = (event.currentTarget as HTMLElement)?.closest('.field-shot') as HTMLElement | null;
    if (!panel) return;

    this.shot.set('working');
    const host = document.createElement('div');
    try {
      const clone = panel.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.pvp-noshot').forEach((n) => n.remove());

      // The drawer's own background is a translucent grey over the page, which on its own resolves to
      // near-white in a PNG. Painted explicitly so the image looks like the page it came from.
      const styles = getComputedStyle(document.documentElement);
      const paper = styles.getPropertyValue('--color-bg').trim() || '#f6f0e3';
      const ink = styles.getPropertyValue('--color-ink').trim() || '#3a2f22';
      clone.style.cssText = `background: ${paper}; color: ${ink}; padding: 1rem 1.25rem;`;

      // Off-screen but laid out — display:none would give every child zero size. Pinned to the live
      // width so the history lines wrap exactly where they do on screen.
      host.style.cssText =
        `position: fixed; left: -10000px; top: 0; width: ${panel.offsetWidth}px; pointer-events: none;`;
      host.appendChild(clone);
      document.body.appendChild(host);

      // Measured after it is in the document, so this is the trimmed height rather than the taller
      // panel still on screen. Rounded up: a fractional size makes the library rasterize at one size
      // and draw at another, and that resampling is what reads as a soft image.
      const rect = clone.getBoundingClientRect();
      const width = Math.ceil(rect.width);
      const height = Math.ceil(rect.height);

      const blob = await toBlob(clone, {
        pixelRatio: captureScale(width, height),
        width,
        height,
        backgroundColor: paper,
        fontEmbedCSS: await cardFontCss(),
      });
      if (!blob) {
        this.shot.set('failed');
        return;
      }

      // Clipboard image writes must stay in the click's task; a rejection falls back to saving the
      // same blob rather than losing the capture that was just paid for.
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        this.shot.set('copied');
      } catch {
        this.download(blob, e.eventId);
        this.shot.set('downloaded');
      }
    } catch {
      this.shot.set('failed');
    } finally {
      host.remove();
      setTimeout(() => this.shot.set('idle'), 3200);
    }
  }

  private download(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(name || 'tournament').replace(/[^\w.-]+/g, '-')}-field.png`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** The same medals the bot's scoreboard puts on the podium, so the two read as one thing. */
  protected medal(rank: number): string {
    switch (rank) {
      case 1:
        return '🥇';
      case 2:
        return '🥈';
      case 3:
        return '🥉';
      default:
        return String(rank);
    }
  }

  protected poolMark(p: PvpFieldRow): string {
    return p.pool === 'healer' ? '➕' : '🛡';
  }

  protected poolLabel(p: PvpFieldRow): string {
    return p.pool === 'healer' ? 'Registered healer' : 'Registered Tank/DPS';
  }

  protected statusLabel(p: PvpFieldRow): string {
    return p.status === 'done' ? 'capped' : p.status;
  }

  protected statusHelp(p: PvpFieldRow): string {
    switch (p.status) {
      case 'done':
        return 'Played their full allowance of bouts and left the pool — a finish, not a removal.';
      case 'withdrawn':
        return 'Dropped from the field. Bouts they already played still count.';
      case 'absent':
        return 'Could not play a bout they were drawn into, so they left the pool.';
      default:
        return '';
    }
  }

  /** Blank rather than 0% for anyone who has not played: a win rate off no bouts is not a rate. */
  protected rateLabel(p: PvpFieldRow): string {
    return p.boutsPlayed === 0 ? '—' : `${Math.round(p.winRate * 100)}%`;
  }

  protected outcomeLabel(b: PvpFieldBout): string {
    switch (b.outcome) {
      case 'win':
        return 'won';
      case 'loss':
        return 'lost';
      case 'skipped':
        return 'skipped';
      default:
        return 'pending';
    }
  }

  /** One glyph per bout. The same four the bot's own posts use, so the grid and Discord agree. */
  protected outcomeIcon(b: PvpFieldBout): string {
    switch (b.outcome) {
      case 'win':
        return '✅';
      case 'loss':
        return '❌';
      default:
        return '⌚';
    }
  }

  /**
   * Everything the old written-out history said, hung off the mark instead.
   *
   * `title` rather than a custom popover: it is the one tooltip that works on a table cell without a
   * library, survives being cloned into the PNG capture, and is what a screen reader reads — which is
   * why the same string is the `aria-label` too. Newlines, because four facts on one line is the wall
   * of text this rework exists to get rid of.
   */
  protected boutTip(b: PvpFieldBout): string {
    const lines = [`Trận #${b.number} · round ${b.round} · ${this.outcomeLabel(b)}`];
    if (b.draftedHealer) lines.push('Drafted into a healer seat');
    if (b.teammates.length > 0) lines.push(`With: ${b.teammates.join(', ')}`);
    if (b.opponents.length > 0) lines.push(`Against: ${b.opponents.join(', ')}`);
    return lines.join('\n');
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
