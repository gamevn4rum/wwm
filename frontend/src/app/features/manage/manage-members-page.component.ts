import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  BackofficeService,
  CommanderMember,
  MemberPatch,
} from '../../core/services/backoffice.service';
import { UserRole } from '../../core/services/discord-auth.service';

/** The three seats, matching the API's `CombatRole` ids and the RSVP role menu. Used for both the
 *  main and the sub role. */
const COMBAT_ROLES: readonly { value: string; label: string }[] = [
  { value: '', label: '—' },
  { value: 'tank', label: 'Tank' },
  { value: 'dps', label: 'DPS' },
  { value: 'healer', label: 'Healer' },
];

/** GvG side, matching the API's `MemberTeam` ids. */
const TEAMS: readonly { value: string; label: string }[] = [
  { value: '', label: '—' },
  { value: 'attack', label: 'Công' },
  { value: 'defense', label: 'Thủ' },
  { value: 'flex', label: 'Flex' },
];

/** How the GameVN table can be ordered. IGN is the order the API sends. */
type SortKey = 'ign' | 'joined' | 'discord' | 'mainRole' | 'team';
const SORTS: readonly { value: SortKey; label: string }[] = [
  { value: 'ign', label: 'IGN' },
  { value: 'joined', label: 'Joined date' },
  { value: 'discord', label: 'Discord' },
  { value: 'mainRole', label: 'Main role' },
  { value: 'team', label: 'Team' },
];

/** One row's pending edits, held apart from the saved member until Save is pressed. */
type Draft = {
  role: UserRole;
  canLogin: boolean;
  fp: boolean;
  ftp: boolean;
  discord: string;
  mainRole: string;
  subRole: string;
  team: string;
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
 * **Joined** is when they joined GameVN in game, read from the guild roster — read-only for the same
 * reason as IGN.
 *
 * **People who have left are not listed.** Leaving stamps a leave date and clears their login
 * server-side; the row survives so a rejoin restores everything, and the sweep un-stamps it the
 * moment they are back in the guild. Until then they are not a member, and this is the screen for
 * granting members access.
 *
 * **Each of our guilds gets its own table** — GameVN, then GVN2. GVN2 rows cannot be raised above
 * Warrior, and have no roles, team or FP/FTP: those columns are not drawn for them, and the API
 * refuses them regardless. Only the GameVN table sorts; it sorts on saved values, so a row does not
 * jump while it is being edited.
 */
@Component({
  selector: 'app-manage-members-page',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="backoffice">
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
        @for (section of sections(); track section.key) {
        @if (section.members.length > 0) {
        <h3 class="section-title">{{ section.title }} <span class="count">{{ section.members.length }}</span></h3>
        @if (section.primary) {
          <div class="sort">
            <label>
              <span>Sort by</span>
              <select [ngModel]="sortKey()" (ngModelChange)="sortKey.set($event)"
                      [ngModelOptions]="{ standalone: true }">
                @for (o of sorts; track o.value) {
                  <option [value]="o.value">{{ o.label }}</option>
                }
              </select>
            </label>
            <button type="button" (click)="sortDesc.set(!sortDesc())"
                    [title]="sortDesc() ? 'Descending' : 'Ascending'">
              {{ sortDesc() ? '↓' : '↑' }}
            </button>
          </div>
        } @else {
          <p class="hint">GVN2 members can use the personal bot commands only. They are never
            Commander/Admin and have no roles, team or FP/FTP.</p>
        }
        <table class="grid">
          <thead>
            <tr>
              <th>IGN</th>
              <th>UID</th>
              <th>Discord</th>
              <th>Status</th>
              @if (section.primary) { <th>Joined</th> }
              <th>Rank</th>
              @if (section.primary) {
                <th>Main role</th>
                <th>Sub role</th>
                <th>Team</th>
              }
              <th>Login</th>
              @if (section.primary) {
                <th>FP</th>
                <th>FTP</th>
              }
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (m of section.members; track m.id) {
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
                @if (section.primary) {
                  <td class="quiet">{{ joinedLabel(m) }}</td>
                }
                <td>
                  <select [ngModel]="draftOf(m).role" (ngModelChange)="edit(m, { role: $event })"
                          [ngModelOptions]="{ standalone: true }">
                    <option value="Warrior">Warrior</option>
                    <option value="Commander" [disabled]="m.secondaryGuild">Commander</option>
                    <option value="Admin" [disabled]="m.secondaryGuild">Admin</option>
                  </select>
                </td>
                @if (section.primary) {
                  <td>
                    <select [ngModel]="draftOf(m).mainRole"
                            (ngModelChange)="edit(m, { mainRole: $event })"
                            [ngModelOptions]="{ standalone: true }">
                      @for (r of combatRoles; track r.value) {
                        <option [value]="r.value">{{ r.label }}</option>
                      }
                    </select>
                  </td>
                  <td>
                    <select [ngModel]="draftOf(m).subRole"
                            (ngModelChange)="edit(m, { subRole: $event })"
                            [ngModelOptions]="{ standalone: true }">
                      @for (r of combatRoles; track r.value) {
                        <option [value]="r.value">{{ r.label }}</option>
                      }
                    </select>
                  </td>
                  <td>
                    <select [ngModel]="draftOf(m).team" (ngModelChange)="edit(m, { team: $event })"
                            [ngModelOptions]="{ standalone: true }">
                      @for (t of teams; track t.value) {
                        <option [value]="t.value">{{ t.label }}</option>
                      }
                      <!-- A free-text team from before the dropdown, kept visible until replaced. -->
                      @if (isLegacyTeam(m.team)) {
                        <option [value]="m.team" disabled>{{ m.team }} (old)</option>
                      }
                    </select>
                  </td>
                }
                <td class="mid">
                  <input type="checkbox" [ngModel]="draftOf(m).canLogin"
                         (ngModelChange)="edit(m, { canLogin: $event })"
                         [ngModelOptions]="{ standalone: true }" />
                </td>
                @if (section.primary) {
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
                }
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
        }
        }
        @if (notice()) { <p class="notice">{{ notice() }}</p> }
      }
    </section>
  `,
  styles: [`
    /* Embedded in the Manage hub's panel, which supplies the page width and the heading. */
    .backoffice { padding: .25rem 0 0; }
    .hint { opacity: .7; margin-bottom: 1rem; max-width: 70rem; }
    .section-title { margin: 1.5rem 0 .5rem; font-size: 1rem; }
    .section-title .count { opacity: .6; font-weight: 400; margin-left: .35rem; }
    .sort { display: flex; gap: .4rem; align-items: center; margin-bottom: .6rem; }
    .sort label { display: flex; gap: .4rem; align-items: center; }
    .sort label span { font-size: .8rem; opacity: .7; }
    .sort select { padding: .3rem .45rem; border: 1px solid rgba(128,128,128,.4); border-radius: 6px;
      font: inherit; }
    .sort button { padding: .3rem .6rem; }
    .grid { width: 100%; border-collapse: collapse; }
    .grid th, .grid td { text-align: left; padding: .45rem .6rem; border-bottom: 1px solid rgba(128,128,128,.25); vertical-align: middle; }
    .grid th { font-size: .75rem; text-transform: uppercase; opacity: .6; font-weight: 600; }
    .grid input, .grid select { padding: .3rem .45rem; border: 1px solid rgba(128,128,128,.4);
      border-radius: 6px; font: inherit; width: 100%; box-sizing: border-box; min-width: 0; }
    .grid input[type=checkbox] { width: var(--checkbox-size); }
    .grid td.mid { text-align: center; }
    .mono { font-family: monospace; opacity: .8; }
    .quiet { opacity: .7; white-space: nowrap; }
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

  protected readonly sortKey = signal<SortKey>('ign');
  protected readonly sortDesc = signal(false);

  /** One table per guild: GameVN first, then GVN2. A guild with nobody listed draws no table. Only
   *  GameVN is sorted; GVN2 keeps the API's IGN order. */
  protected readonly sections = computed(() => {
    const all = this.members();
    return [
      { key: 'gvn', title: 'GameVN', primary: true,
        members: this.sorted(all.filter((m) => !m.secondaryGuild)) },
      { key: 'gvn2', title: 'GVN2', primary: false, members: all.filter((m) => !!m.secondaryGuild) },
    ];
  });

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly busy = signal<number | null>(null);
  readonly notice = signal<string | null>(null);

  protected readonly combatRoles = COMBAT_ROLES;
  protected readonly teams = TEAMS;
  protected readonly sorts = SORTS;

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
      mainRole: m.mainRole ?? '',
      subRole: m.subRole ?? '',
      team: m.team ?? '',
    };
  }

  /**
   * The GameVN rows in the chosen order. Blanks sit at the bottom whichever way it runs — a list
   * sorted by team should open on people who have one — and IGN breaks ties so the order is stable.
   */
  private sorted(list: CommanderMember[]): CommanderMember[] {
    const key = this.sortKey();
    const dir = this.sortDesc() ? -1 : 1;
    const value = (m: CommanderMember): string | number | null => {
      switch (key) {
        case 'joined': return m.joinTime ?? null;
        case 'discord': return m.discord?.trim().toLowerCase() || null;
        case 'mainRole': return rank(COMBAT_ROLES, m.mainRole);
        case 'team': return rank(TEAMS, m.team);
        default: return m.ign.toLowerCase();
      }
    };
    return [...list].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (va === null || vb === null) {
        if (va !== vb) return va === null ? 1 : -1;
      } else if (va !== vb) {
        return (va < vb ? -1 : 1) * dir;
      }
      return a.ign.localeCompare(b.ign);
    });
  }

  protected joinedLabel(m: CommanderMember): string {
    if (!m.joinTime) return '—';
    const d = new Date(m.joinTime * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  /** A team value from the free-text days that is not one of the three. */
  protected isLegacyTeam(team: string | null): boolean {
    return !!team && !TEAMS.some((t) => t.value === team);
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
    if (draft.mainRole !== base.mainRole) patch.mainRole = draft.mainRole;
    if (draft.subRole !== base.subRole) patch.subRole = draft.subRole;
    if (draft.team !== base.team) patch.team = draft.team;

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
          err?.error?.error === 'secondary_guild_member'
            ? 'GVN2 members cannot be Commander/Admin, or have roles, team or FP/FTP.'
            : err?.status === 403
            ? 'Not permitted (role-grant policy).'
            : err?.error?.error === 'discord_taken'
              ? 'That Discord handle belongs to another member.'
              : err?.error?.error === 'field_too_long'
                ? 'One of those values is too long.'
                : err?.error?.error === 'invalid_combat_role'
                  ? 'That is not a valid combat role.'
                  : err?.error?.error === 'invalid_team'
                    ? 'That is not a valid team.'
                    : 'Update failed.');
      },
    });
  }
}

/** Position in an option list, so roles and teams sort in the dropdown's order rather than
 *  alphabetically. Blank, or a value not in the list, is null. */
function rank(options: readonly { value: string }[], value: string | null): number | null {
  if (!value) return null;
  const i = options.findIndex((o) => o.value === value);
  return i < 0 ? null : i;
}
