import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  BackofficeService,
  CommanderMember,
  MemberPatch,
} from '../../core/services/backoffice.service';
import { UserRole } from '../../core/services/discord-auth.service';

/** The three seats, matching the API's `CombatRole` ids and the RSVP role menu. */
const COMBAT_ROLES: readonly { value: string; label: string }[] = [
  { value: '', label: '—' },
  { value: 'tank', label: 'Tank' },
  { value: 'dps', label: 'DPS' },
  { value: 'healer', label: 'Healer' },
];

/** One row's pending edits, held apart from the saved member until Save is pressed. */
type Draft = {
  role: UserRole;
  canLogin: boolean;
  fp: boolean;
  ftp: boolean;
  discord: string;
  combatRole: string;
  team: string;
  saturday: string;
  sunday: string;
  notes: string;
};

/**
 * Member administration: permissions, and the roster details the app owns.
 *
 * **Edits are staged and committed with Save**, one row at a time. Every control used to patch on
 * change, which made a four-field correction into four writes, four audit entries and four chances
 * to half-apply — and gave no way to abandon a change once a checkbox had been touched.
 *
 * **IGN, UID and PID are read-only here**, and that is not an oversight: the roster sweep owns them
 * and rewrites them on every pass, following in-game renames. A box for them would accept an edit
 * and lose it within the hour, which is worse than not offering one.
 *
 * **People who have left are not listed.** Leaving stamps a leave date and clears their login
 * server-side; the row survives so a rejoin restores everything, and the sweep un-stamps it the
 * moment they are back in the guild. Until then they are not a member, and this is the screen for
 * granting members access.
 */
@Component({
  selector: 'app-manage-members-page',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="backoffice">
      <h1>Members</h1>
      <p class="hint">
        Edit a member's details and permissions, then press <strong>Save</strong> on that row.
        Changes are audited server-side, and role changes are policy-bounded. IGN and UID come from
        the roster sync and cannot be edited here. Members who have left are hidden until they
        rejoin.
      </p>

      @if (loading()) {
        <p>Loading…</p>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else {
        <table class="grid">
          <thead>
            <tr>
              <th>IGN</th>
              <th>UID</th>
              <th>Discord</th>
              <th>Status</th>
              <th>Rank</th>
              <th>Combat role</th>
              <th>Team</th>
              <th>Sat</th>
              <th>Sun</th>
              <th>Login</th>
              <th>FP</th>
              <th>FTP</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (m of members(); track m.id) {
              <tr [class.saving]="busy() === m.id" [class.dirty]="isDirty(m)">
                <td>{{ m.ign }}</td>
                <td class="mono">{{ m.uid || '—' }}</td>
                <td>
                  <input class="mono" [ngModel]="draftOf(m).discord"
                         (ngModelChange)="edit(m, { discord: $event })"
                         [ngModelOptions]="{ standalone: true }" placeholder="—" />
                </td>
                <td>
                  @if (m.registered) {
                    <span class="tag tag-on">Registered</span>
                  } @else {
                    <span class="tag">Unregistered</span>
                  }
                </td>
                <td>
                  <select [ngModel]="draftOf(m).role" (ngModelChange)="edit(m, { role: $event })"
                          [ngModelOptions]="{ standalone: true }">
                    <option value="Warrior">Warrior</option>
                    <option value="Commander">Commander</option>
                    <option value="Admin">Admin</option>
                  </select>
                </td>
                <td>
                  <select [ngModel]="draftOf(m).combatRole"
                          (ngModelChange)="edit(m, { combatRole: $event })"
                          [ngModelOptions]="{ standalone: true }">
                    @for (r of combatRoles; track r.value) {
                      <option [value]="r.value">{{ r.label }}</option>
                    }
                  </select>
                </td>
                <td>
                  <input class="short" [ngModel]="draftOf(m).team"
                         (ngModelChange)="edit(m, { team: $event })"
                         [ngModelOptions]="{ standalone: true }" placeholder="—" />
                </td>
                <td>
                  <input class="short" [ngModel]="draftOf(m).saturday"
                         (ngModelChange)="edit(m, { saturday: $event })"
                         [ngModelOptions]="{ standalone: true }" placeholder="—" />
                </td>
                <td>
                  <input class="short" [ngModel]="draftOf(m).sunday"
                         (ngModelChange)="edit(m, { sunday: $event })"
                         [ngModelOptions]="{ standalone: true }" placeholder="—" />
                </td>
                <td class="mid">
                  <input type="checkbox" [ngModel]="draftOf(m).canLogin"
                         (ngModelChange)="edit(m, { canLogin: $event })"
                         [ngModelOptions]="{ standalone: true }" />
                </td>
                <td class="mid">
                  <input type="checkbox" [ngModel]="draftOf(m).fp"
                         (ngModelChange)="edit(m, { fp: $event })"
                         [ngModelOptions]="{ standalone: true }" />
                </td>
                <td class="mid">
                  <input type="checkbox" [ngModel]="draftOf(m).ftp"
                         (ngModelChange)="edit(m, { ftp: $event })"
                         [ngModelOptions]="{ standalone: true }" />
                </td>
                <td>
                  <input [ngModel]="draftOf(m).notes" (ngModelChange)="edit(m, { notes: $event })"
                         [ngModelOptions]="{ standalone: true }" placeholder="—" />
                </td>
                <td class="row-actions">
                  <button type="button" (click)="save(m)" [disabled]="!isDirty(m) || busy() === m.id">
                    {{ busy() === m.id ? '…' : 'Save' }}
                  </button>
                  @if (isDirty(m)) {
                    <button type="button" class="link" (click)="revert(m)">Revert</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
        @if (notice()) { <p class="notice">{{ notice() }}</p> }
      }
    </section>
  `,
  styles: [`
    .backoffice { max-width: 1400px; margin: 0 auto; padding: 1.5rem; }
    h1 { margin-bottom: .25rem; }
    .hint { opacity: .7; margin-bottom: 1rem; max-width: 70rem; }
    .grid { width: 100%; border-collapse: collapse; }
    .grid th, .grid td { text-align: left; padding: .45rem .6rem; border-bottom: 1px solid rgba(128,128,128,.25); vertical-align: middle; }
    .grid th { font-size: .75rem; text-transform: uppercase; opacity: .6; font-weight: 600; }
    .grid input, .grid select { padding: .3rem .45rem; border: 1px solid rgba(128,128,128,.4);
      border-radius: 6px; font: inherit; width: 100%; box-sizing: border-box; min-width: 0; }
    .grid input[type=checkbox] { width: auto; }
    .grid td.mid { text-align: center; }
    .mono { font-family: monospace; opacity: .8; }
    .short { max-width: 7ch; }
    .tag { font-size: .72rem; padding: .1rem .4rem; border: 1px solid rgba(128,128,128,.45); border-radius: 999px; opacity: .75; white-space: nowrap; }
    .tag-on { border-color: rgba(124,148,115,.75); color: #5f7757; opacity: 1; }
    tr.saving { opacity: .5; }
    /* An unsaved row is marked, because a table full of inputs otherwise gives no sign that a Save
       is still owed on a row that has scrolled out of view. */
    tr.dirty { background: rgba(173,122,76,.08); }
    .row-actions { display: flex; gap: .35rem; align-items: center; white-space: nowrap; }
    button { padding: .35rem .9rem; border: 1px solid rgba(128,128,128,.4); border-radius: 6px;
      font: inherit; cursor: pointer; background: transparent; color: inherit; }
    button:disabled { cursor: default; opacity: .5; }
    button.link { border: none; padding: .35rem .2rem; text-decoration: underline; opacity: .7; }
    .error { color: #dc3545; }
    .notice { margin-top: .75rem; opacity: .8; }
  `],
})
export class ManageMembersPageComponent {
  private readonly backoffice = inject(BackofficeService);

  readonly members = signal<CommanderMember[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly busy = signal<number | null>(null);
  readonly notice = signal<string | null>(null);

  protected readonly combatRoles = COMBAT_ROLES;

  /** Pending edits by member id. A row absent from here has not been touched. */
  private readonly drafts = signal<Record<number, Draft>>({});

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.backoffice.getMembers().subscribe({
      next: (m) => {
        this.members.set(m);
        this.drafts.set({});
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load members.');
        this.loading.set(false);
      },
    });
  }

  /** The saved state of a row, as a draft — nulls flattened to '' so the inputs have something to
   *  bind and a cleared field compares equal to an empty one. */
  private baseline(m: CommanderMember): Draft {
    return {
      role: m.role,
      canLogin: m.canLogin,
      fp: m.fp,
      ftp: m.ftp,
      discord: m.discord ?? '',
      combatRole: m.combatRole ?? '',
      team: m.team ?? '',
      saturday: m.saturday ?? '',
      sunday: m.sunday ?? '',
      notes: m.notes ?? '',
    };
  }

  protected draftOf(m: CommanderMember): Draft {
    return this.drafts()[m.id] ?? this.baseline(m);
  }

  protected edit(m: CommanderMember, change: Partial<Draft>): void {
    this.drafts.update((all) => ({ ...all, [m.id]: { ...this.draftOf(m), ...change } }));
  }

  /** Compared field by field rather than by whether a draft exists: typing a character and undoing
   *  it should leave the row clean, and Save disabled. */
  protected isDirty(m: CommanderMember): boolean {
    const draft = this.drafts()[m.id];
    if (!draft) return false;
    const base = this.baseline(m);
    return (Object.keys(base) as (keyof Draft)[]).some((k) => draft[k] !== base[k]);
  }

  protected revert(m: CommanderMember): void {
    this.drafts.update((all) => {
      const { [m.id]: _dropped, ...rest } = all;
      return rest;
    });
  }

  /**
   * Sends only what actually changed.
   *
   * Not the whole draft: the API reads an absent field as "leave alone" and an empty string as
   * "clear", so posting everything would rewrite values the officer never touched — and would turn
   * one corrected checkbox into an audit entry naming ten fields.
   */
  protected save(m: CommanderMember): void {
    const draft = this.drafts()[m.id];
    if (!draft) return;
    const base = this.baseline(m);

    const patch: MemberPatch = {};
    if (draft.role !== base.role) patch.role = draft.role;
    if (draft.canLogin !== base.canLogin) patch.canLogin = draft.canLogin;
    if (draft.fp !== base.fp) patch.fp = draft.fp;
    if (draft.ftp !== base.ftp) patch.ftp = draft.ftp;
    if (draft.discord !== base.discord) patch.discord = draft.discord;
    if (draft.combatRole !== base.combatRole) patch.combatRole = draft.combatRole;
    if (draft.team !== base.team) patch.team = draft.team;
    if (draft.saturday !== base.saturday) patch.saturday = draft.saturday;
    if (draft.sunday !== base.sunday) patch.sunday = draft.sunday;
    if (draft.notes !== base.notes) patch.notes = draft.notes;

    this.busy.set(m.id);
    this.notice.set(null);
    this.backoffice.patchMember(m.id, patch).subscribe({
      next: (updated) => {
        this.members.update((list) => list.map((x) => (x.id === updated.id ? updated : x)));
        this.revert(m);
        this.busy.set(null);
        this.notice.set(`Saved ${updated.ign}.`);
      },
      error: (err) => {
        this.busy.set(null);
        // The draft is kept on failure. Losing somebody's typing because the server said no is the
        // one thing worse than the rejection itself.
        this.notice.set(
          err?.status === 403
            ? 'Not permitted (role-grant policy).'
            : err?.error?.error === 'discord_taken'
              ? 'That Discord handle belongs to another member.'
              : err?.error?.error === 'field_too_long'
                ? 'One of those values is too long.'
                : err?.error?.error === 'invalid_combat_role'
                  ? 'That is not a valid combat role.'
                  : 'Update failed.');
      },
    });
  }
}
