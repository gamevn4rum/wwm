import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  BackofficeService,
  GuildDuplicate,
  GuildScoutReading,
  ManagedGuild,
} from '../../core/services/backoffice.service';

/**
 * Opponent guild administration: giving a name an identity, correcting the name, and looking
 * inside it.
 *
 * **What "UID" means here.** A guild row is born the first time the match sync meets an opponent
 * *name* — and that is all it is, a name, until somebody reads the guild's number off it in game
 * and enters it here. The number is the only guild identifier that can be resolved at run time:
 * there is no name search upstream, so a guild we have played nine times stays invisible to every
 * sync until one person types six digits. That is what this panel is for, and why the list puts the
 * unidentified rows first.
 *
 * **Identifying is a write with consequences**, not a note-to-self: the row becomes syncable, and
 * the next run fills it with that guild's roster, level and standing. Pointing a row at the wrong
 * guild therefore fills it with a stranger's data quietly, which is why the panel shows the guild's
 * name in game after a successful lookup — that name is how you confirm you typed the right number,
 * and it is deliberately *not* copied over our own spelling, which Match History depends on.
 *
 * **Two rows for one guild is the other half of the job.** Because a row is created on first sight
 * of a *spelling*, a second spelling of the same guild becomes a second row that then holds some of
 * the matches — and both show on the site as separate, half-empty opponents. The duplicates block
 * offers the pairs that look like one guild typed two ways; merging re-points the matches onto the
 * kept row and keeps the other spelling as an alias, which is the part that stops the pair
 * re-forming on the next import.
 *
 * **Renaming is only offered where it is the actual fix.** On a row with no UID the name is all the
 * row is and no sync will ever touch it, so a typo is permanent until someone corrects it here. On
 * an identified row the weekly name pass reads the name from the game — so a typo there already
 * corrects itself, and the field is not editable rather than editable-and-reverted.
 *
 * **Scout is a reading, never a record.** It is the same answer `/gscout` gives: who is online in
 * that guild at the moment of asking. Nothing about it is cached or stored — not here, not in the
 * API — because a minute-old copy would put people in a fight they have already left. It is shown
 * with the time it was taken for the same reason, and it is dropped the moment the row collapses.
 *
 * **The match reading is a guess and is worded as one.** The API infers a match only from the
 * largest instanced group and only inside the GvG window (19:30–midnight VN); nothing in the
 * payload actually says "GvG". A scout taken at any other hour is answered in full — everyone
 * online, and their parties — and simply never claims a match. That is not a failure, and the panel
 * says so rather than leaving an empty space where a match count would be.
 */
@Component({
  selector: 'app-guilds-panel',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <section class="backoffice">
      <p class="hint">
        A guild is only a name until it has a <strong>UID</strong> — the in-game guild number, read
        off the guild itself. Enter it and the row becomes syncable: rosters, level and standing
        arrive on the next sync, and <strong>Scout</strong> can read who is online. Identifying is
        audited, and never renames the guild — the spelling here is the one Match History uses.
      </p>

      @if (loading()) {
        <p>Loading…</p>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else {
        <!-- Above the list on purpose: a duplicate pair is work to do, not a property of a row. -->
        @if (duplicates().length) {
          <div class="dupes">
            <h3>Possible duplicates <span class="quiet">{{ duplicates().length }}</span></h3>
            <p class="dupes-hint">
              Rows whose names are close enough to be one guild spelled two ways — a typo, or a
              stray space. Merging moves the matches onto the kept row, keeps the other spelling as
              an alias so the next import resolves onto it instead of rebuilding the row, and
              deletes the empty one.
              <br />
              ⚠ <strong>A suggestion, not a finding.</strong> Two real guilds can be one character
              apart, so read the pair before merging — it cannot be undone from here. Renames are
              never listed: those two spellings look nothing alike, and the weekly name pass reports
              them on its own.
            </p>

            @for (d of duplicates(); track d.keepId + ':' + d.foldId) {
              <div class="dupe" [class.saving]="merging() === d.foldId">
                <div class="pair">
                  <span class="side side-keep">
                    <strong>{{ keepSide(d).name }}</strong>
                    <span class="quiet">
                      keep · {{ keepSide(d).identified ? 'tracked' : 'no UID' }} ·
                      {{ keepSide(d).matches }} {{ keepSide(d).matches === 1 ? 'match' : 'matches' }}
                    </span>
                  </span>
                  <span class="arrow" aria-hidden="true">◀</span>
                  <span class="side side-fold">
                    <strong>{{ foldSide(d).name }}</strong>
                    <span class="quiet">
                      fold in · {{ foldSide(d).identified ? 'tracked' : 'no UID' }} ·
                      {{ foldSide(d).matches }} {{ foldSide(d).matches === 1 ? 'match' : 'matches' }}
                    </span>
                  </span>
                </div>
                <span class="reason">{{ d.reason }}</span>
                <span class="dupe-actions">
                  <!-- The proposal favours the row a sync can already see; swapping is here
                       because the merge works either way and the officer may know better. -->
                  <button type="button" (click)="swap(d)" [disabled]="merging() === d.foldId"
                          title="Keep the other row instead">Swap</button>
                  <button type="button" class="danger" (click)="merge(d)"
                          [disabled]="merging() !== null">
                    {{ merging() === d.foldId ? '…' : 'Merge' }}
                  </button>
                </span>
              </div>
            }
          </div>
        }

        <div class="toolbar">
          <input class="search" [ngModel]="search()" (ngModelChange)="search.set($event)"
                 placeholder="Filter by name or alias…" />
          <label class="only">
            <input type="checkbox" [ngModel]="unidentifiedOnly()"
                   (ngModelChange)="unidentifiedOnly.set($event)" />
            Needs a UID only
          </label>
          <span class="count">{{ shown().length }} of {{ guilds().length }} · {{ pending() }} without a UID</span>
        </div>

        <table class="grid">
          <thead>
            <tr>
              <th>Guild</th>
              <th class="num">Matches</th>
              <th>UID</th>
              <th>Tracking</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (g of shown(); track g.id) {
              <tr [class.saving]="busy() === g.id" [class.unknown]="!g.identified">
                <td>
                  @if (g.identified) {
                    <!-- Not editable, and not merely disabled: the weekly name pass reads this
                         guild's name from the game, so a correction typed here would be reverted
                         within the week — and a wrong name upstream is already self-fixing. -->
                    <span class="name"
                          title="Read from the game by the weekly name pass — it cannot be edited here, and a wrong spelling corrects itself on the next run.">{{ g.name }}</span>
                  } @else {
                    <div class="rename">
                      <input class="name-input" type="text"
                             [ngModel]="nameOf(g)" (ngModelChange)="editName(g, $event)"
                             [ngModelOptions]="{ standalone: true }"
                             [title]="'No sync will ever touch this name — a typo here is permanent until it is corrected'" />
                      <button type="button" (click)="rename(g)"
                              [disabled]="!isNameDirty(g) || busy() === g.id">
                        {{ busy() === g.id ? '…' : 'Rename' }}
                      </button>
                    </div>
                  }
                  <!-- Aliases are how an officer recognises a guild that has since renamed, which
                       is exactly the moment they are looking one up. -->
                  @if (g.aliases.length) {
                    <span class="aka" [title]="g.aliases.join(', ')">aka {{ g.aliases.join(', ') }}</span>
                  }
                </td>
                <td class="num">{{ g.matchCount || '—' }}</td>
                <td>
                  <div class="uid">
                    <input class="mono" type="text" inputmode="numeric"
                           [ngModel]="uidOf(g)" (ngModelChange)="editUid(g, $event)"
                           [ngModelOptions]="{ standalone: true }" placeholder="guild number" />
                    <button type="button" (click)="identify(g)"
                            [disabled]="!isUidDirty(g) || busy() === g.id">
                      {{ busy() === g.id ? '…' : g.identified ? 'Update' : 'Identify' }}
                    </button>
                  </div>
                </td>
                <td class="tracking">
                  @if (g.identified) {
                    <span class="tag tag-on">Tracked</span>
                    @if (g.syncedUtc) {
                      <span class="quiet">synced {{ g.syncedUtc | date:'d MMM, HH:mm' }}</span>
                    } @else {
                      <!-- Identified but never synced: the id is in place and the next run will
                           fill the row. Distinct from "tracked and stale", and reads differently. -->
                      <span class="quiet">awaiting first sync</span>
                    }
                    <span class="quiet">
                      {{ g.memberCount || '—' }} members@if (g.level) { · lv {{ g.level }} }
                    </span>
                  } @else {
                    <span class="tag tag-off">No UID</span>
                    <span class="quiet">invisible to every sync</span>
                  }
                </td>
                <td class="row-actions">
                  <button type="button" (click)="toggleScout(g)"
                          [disabled]="!g.identified || scouting() === g.id"
                          [title]="g.identified ? 'Read who is online right now' : 'Needs a UID first'">
                    {{ scouting() === g.id ? '…' : expanded() === g.id ? 'Hide' : 'Scout' }}
                  </button>
                </td>
              </tr>

              @if (expanded() === g.id) {
                <tr class="scout-row">
                  <td colspan="5">
                    @if (scouting() === g.id) {
                      <p class="quiet">Reading who is online…</p>
                    } @else if (scoutError()) {
                      <p class="error">{{ scoutError() }}</p>
                    } @else if (scout(); as s) {
                      <div class="scout">
                        <header>
                          <strong>{{ s.guild }}</strong>
                          <span class="quiet">
                            {{ s.onlineCount }} of {{ s.memberCount }} online ·
                            {{ s.partyCount }} {{ s.partyCount === 1 ? 'group' : 'groups' }} sharing an instance
                          </span>
                          <!-- The time is part of the answer, not a footnote: this expires. -->
                          <span class="taken">read {{ s.takenUtc | date:'HH:mm:ss' }}</span>
                        </header>

                        <!-- ⚠ Worded as a guess on purpose. The API infers a match from the largest
                             instanced group inside the GvG window; nothing upstream says "GvG". -->
                        @if (s.matchCount > 0) {
                          <p class="verdict verdict-match">
                            <strong>{{ s.matchCount }}</strong> appear to be in a match together —
                            <em>a guess</em>, from the largest group sharing an instance this
                            evening. Highlighted below.
                          </p>
                        } @else if (s.onlineCount === 0) {
                          <p class="verdict">Nobody from this guild is online.</p>
                        } @else {
                          <p class="verdict">
                            Nothing reads as a match. A match is only ever inferred between 19:30
                            and midnight (VN) — outside that, this is just who is online.
                          </p>
                        }

                        @if (s.members.length) {
                          <ul class="online">
                            @for (m of s.members; track m.ign) {
                              <li [class.in-match]="m.inMatch">
                                <span class="ign">{{ m.ign }}</span>
                                @if (m.level) { <span class="lv">lv {{ m.level }}</span> }
                                <span class="arts">
                                  {{ m.firstArt || '—' }}@if (m.secondArt) { + {{ m.secondArt }} }
                                </span>
                                @if (m.path) {
                                  <span class="pill">{{ m.family }} · {{ m.path }}</span>
                                } @else if (m.family) {
                                  <span class="pill">{{ m.family }}</span>
                                }
                                @if (m.partyNumber) {
                                  <span class="pill pill-party" title="Sharing an instance — a hint, not a confirmed party">
                                    group {{ m.partyNumber }} of {{ m.partySize }}
                                  </span>
                                }
                                @if (m.instanced) {
                                  <span class="pill pill-inst" title="On an instance server, not in the open world">instanced</span>
                                }
                              </li>
                            }
                          </ul>
                        }
                      </div>
                    }
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>

        @if (shown().length === 0) {
          <p class="quiet empty">No guild matches that filter.</p>
        }
        @if (notice()) { <p class="notice">{{ notice() }}</p> }
      }
    </section>
  `,
  styles: [`
    .backoffice { padding: .25rem 0 0; }
    .hint { opacity: .7; margin-bottom: 1rem; max-width: 70rem; }
    .toolbar { display: flex; gap: .75rem; align-items: center; flex-wrap: wrap; margin-bottom: .75rem; }
    .search { padding: .35rem .6rem; border: 1px solid rgba(128,128,128,.4); border-radius: 6px;
      font: inherit; min-width: 16rem; }
    .only { display: inline-flex; gap: .35rem; align-items: center; }
    .count { margin-left: auto; opacity: .6; font-size: .85rem; }

    /* Tinted like an unidentified row, because it is the same kind of thing: data that needs a
       person, sitting above the list rather than inside it. */
    .dupes { border: 1px solid rgba(173,122,76,.5); background: rgba(173,122,76,.06);
      border-radius: 8px; padding: .8rem 1rem; margin-bottom: 1.25rem; }
    .dupes h3 { margin: 0 0 .35rem; font-size: .95rem; }
    .dupes-hint { opacity: .75; font-size: .84rem; margin: 0 0 .7rem; max-width: 62rem; }
    .dupe { display: flex; gap: .75rem; align-items: center; flex-wrap: wrap;
      padding: .45rem 0; border-top: 1px solid rgba(128,128,128,.2); }
    .dupe.saving { opacity: .5; }
    .pair { display: flex; gap: .6rem; align-items: center; flex-wrap: wrap; }
    .side { display: inline-flex; flex-direction: column; }
    .arrow { opacity: .5; font-size: .8rem; }
    .reason { font-size: .78rem; opacity: .7; font-style: italic; }
    .dupe-actions { margin-left: auto; display: inline-flex; gap: .35rem; white-space: nowrap; }
    /* Merging deletes a row and cannot be undone from this panel, so the button says so. */
    button.danger { border-color: rgba(173,122,76,.75); color: #9a6a3f; }

    .grid { width: 100%; border-collapse: collapse; }
    .grid th, .grid td { text-align: left; padding: .45rem .6rem; border-bottom: 1px solid rgba(128,128,128,.25); vertical-align: middle; }
    .grid th { font-size: .75rem; text-transform: uppercase; opacity: .6; font-weight: 600; }
    .grid td.num, .grid th.num { text-align: right; }
    .name { font-weight: 600; }
    .rename { display: flex; gap: .35rem; align-items: center; }
    .name-input { padding: .3rem .45rem; border: 1px solid rgba(128,128,128,.4); border-radius: 6px;
      font: inherit; font-weight: 600; width: 14rem; }
    .aka { display: block; font-size: .74rem; opacity: .55; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; max-width: 22rem; }
    .uid { display: flex; gap: .35rem; align-items: center; }
    .uid input { padding: .3rem .45rem; border: 1px solid rgba(128,128,128,.4); border-radius: 6px;
      font: inherit; width: 11ch; }
    .mono { font-family: monospace; }
    .tracking { display: flex; gap: .4rem; align-items: baseline; flex-wrap: wrap; }
    .quiet { opacity: .6; font-size: .82rem; white-space: nowrap; }
    .tag { font-size: .72rem; padding: .1rem .4rem; border: 1px solid rgba(128,128,128,.45);
      border-radius: 999px; opacity: .75; white-space: nowrap; }
    .tag-on { border-color: rgba(124,148,115,.75); color: #5f7757; opacity: 1; }
    .tag-off { border-color: rgba(173,122,76,.75); color: #9a6a3f; opacity: 1; }
    /* A row with no UID is the one the panel exists for, so it is marked rather than left to be
       found by reading the Tracking column. */
    tr.unknown { background: rgba(173,122,76,.06); }
    tr.saving { opacity: .5; }
    .row-actions { white-space: nowrap; }
    button { padding: .3rem .8rem; border: 1px solid rgba(128,128,128,.4); border-radius: 6px;
      font: inherit; cursor: pointer; background: transparent; color: inherit; }
    button:disabled { cursor: default; opacity: .45; }
    .scout-row > td { background: rgba(128,128,128,.06); }
    .scout header { display: flex; gap: .6rem; align-items: baseline; flex-wrap: wrap; margin-bottom: .4rem; }
    .scout header .taken { margin-left: auto; opacity: .6; font-size: .8rem; font-variant-numeric: tabular-nums; }
    .verdict { margin: .3rem 0 .6rem; opacity: .85; }
    .verdict-match { color: #9a6a3f; }
    .online { list-style: none; margin: 0; padding: 0; display: grid;
      grid-template-columns: repeat(auto-fill, minmax(23rem, 1fr)); gap: .25rem .75rem; }
    .online li { display: flex; gap: .4rem; align-items: baseline; flex-wrap: wrap;
      padding: .25rem .4rem; border-radius: 6px; }
    .online li.in-match { background: rgba(173,122,76,.14); }
    .ign { font-weight: 600; }
    .lv { opacity: .6; font-size: .8rem; }
    .arts { opacity: .75; font-size: .84rem; }
    .pill { font-size: .7rem; padding: .05rem .4rem; border-radius: 999px;
      border: 1px solid rgba(128,128,128,.4); opacity: .7; white-space: nowrap; }
    .pill-party { border-color: rgba(110,130,160,.6); }
    .pill-inst { border-color: rgba(124,148,115,.6); }
    .empty { margin-top: .75rem; }
    .error { color: #dc3545; }
    .notice { margin-top: .75rem; opacity: .8; }
  `],
})
export class GuildsPanelComponent {
  private readonly backoffice = inject(BackofficeService);

  readonly guilds = signal<ManagedGuild[]>([]);
  readonly duplicates = signal<GuildDuplicate[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);

  /** The row an identify or a rename is in flight for. */
  readonly busy = signal<number | null>(null);
  /** The row a scout is in flight for — separate from {@link busy}, since a scout is a read and
   *  should not make the row look like it is being written to. */
  readonly scouting = signal<number | null>(null);
  /** The row being folded away by a merge in flight. Every Merge button is disabled while one
   *  runs: the pairs overlap (a row can appear in two), so a second merge could name a row the
   *  first one has already deleted. */
  readonly merging = signal<number | null>(null);

  readonly search = signal('');
  readonly unidentifiedOnly = signal(false);

  /** The row whose scout is showing. At most one: a scout is a live reading, and two of them on
   *  screen at once are two different moments being read as if they were one. */
  readonly expanded = signal<number | null>(null);
  readonly scout = signal<GuildScoutReading | null>(null);
  readonly scoutError = signal<string | null>(null);

  /** Typed-but-unsaved UIDs by row id. Absent means the row shows what is stored. */
  private readonly uidDrafts = signal<Record<number, string>>({});
  /** Typed-but-unsaved names, same arrangement. */
  private readonly nameDrafts = signal<Record<number, string>>({});
  /** Pairs the officer has flipped, so the kept side is the one they chose. */
  private readonly swapped = signal<Record<string, boolean>>({});

  readonly pending = computed(() => this.guilds().filter((g) => !g.identified).length);

  readonly shown = computed(() => {
    const q = this.search().trim().toLowerCase();
    const only = this.unidentifiedOnly();
    return this.guilds().filter((g) => {
      if (only && g.identified) return false;
      if (!q) return true;
      // Aliases are searched too: looking up a guild by the name you remember is the whole point of
      // keeping the old spellings.
      return g.name.toLowerCase().includes(q)
        || g.aliases.some((a) => a.toLowerCase().includes(q))
        || String(g.numberId ?? '').includes(q);
    });
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.backoffice.getGuilds().subscribe({
      next: (g) => {
        this.guilds.set(g);
        this.uidDrafts.set({});
        this.nameDrafts.set({});
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load guilds.');
        this.loading.set(false);
      },
    });

    // Separate call, and a failure here is swallowed on purpose: duplicates are a suggestion, and
    // losing them must not take the list — the panel's actual job — down with it.
    this.backoffice.getGuildDuplicates().subscribe({
      next: (d) => {
        this.duplicates.set(d);
        this.swapped.set({});
      },
      error: () => this.duplicates.set([]),
    });
  }

  // ── Identifying ────────────────────────────────────────────────────────────

  protected uidOf(g: ManagedGuild): string {
    return this.uidDrafts()[g.id] ?? (g.numberId === null ? '' : String(g.numberId));
  }

  /** Digits only. The field takes an in-game guild number, and letting anything else in only
   *  produces a round trip that comes back `invalid_number`. */
  protected editUid(g: ManagedGuild, value: string): void {
    const digits = value.replace(/\D/g, '');
    this.uidDrafts.update((all) => ({ ...all, [g.id]: digits }));
  }

  /** Compared against what is stored rather than "a draft exists", so typing a digit and deleting
   *  it leaves the button disabled. An empty box is never dirty — clearing a UID is not something
   *  this panel does, and the API has no way to ask for it. */
  protected isUidDirty(g: ManagedGuild): boolean {
    const draft = this.uidDrafts()[g.id];
    if (draft === undefined || draft === '') return false;
    return draft !== String(g.numberId ?? '');
  }

  protected identify(g: ManagedGuild): void {
    const draft = this.uidDrafts()[g.id];
    if (!draft) return;
    const numberId = Number(draft);
    if (!Number.isSafeInteger(numberId) || numberId <= 0) {
      this.notice.set('That is not a guild number.');
      return;
    }

    this.busy.set(g.id);
    this.notice.set(null);
    this.backoffice.identifyGuild(g.id, numberId).subscribe({
      next: (res) => {
        this.busy.set(null);
        this.uidDrafts.update((all) => {
          const { [g.id]: _dropped, ...rest } = all;
          return rest;
        });
        // Reloaded rather than patched in place: identifying changes the ordering (the row leaves
        // the unidentified block) and the row's tracking state, and a list that reorders on the
        // next visit instead of now is the kind of thing that gets clicked twice.
        this.load();
        // Their name in game is how you confirm you typed the right number, so it leads the
        // notice — and it is said plainly when it differs from the spelling we file them under.
        this.notice.set(
          res.upstreamName && res.upstreamName !== res.name
            ? `${res.name} is “${res.upstreamName}” in game — ${res.memberCount ?? '?'} members. `
              + 'Kept our spelling; the roster arrives on the next sync.'
            : `Identified ${res.name} — ${res.memberCount ?? '?'} members. `
              + 'The roster arrives on the next sync.');
      },
      error: (err) => {
        this.busy.set(null);
        // The draft is kept on failure: losing the number somebody just read off a guild screen
        // means going back into the game for it.
        this.notice.set(
          err?.error?.error === 'no_such_guild'
            ? 'No guild carries that number — check the digits.'
            : err?.error?.error === 'club_id_taken'
              ? `That guild is already tracked as “${err.error.ownerName}”. The two rows are one `
                + 'guild — merge them instead.'
              : err?.error?.error === 'invalid_number'
                ? 'That is not a guild number.'
                : err?.error?.error === 'signing_key_missing'
                  ? 'The server cannot reach the game API (signing key missing).'
                  : err?.status === 403
                    ? 'Not permitted.'
                    : 'Lookup failed — the game API did not answer.');
      },
    });
  }

  // ── Renaming (rows with no UID only) ───────────────────────────────────────

  protected nameOf(g: ManagedGuild): string {
    return this.nameDrafts()[g.id] ?? g.name;
  }

  protected editName(g: ManagedGuild, value: string): void {
    this.nameDrafts.update((all) => ({ ...all, [g.id]: value }));
  }

  protected isNameDirty(g: ManagedGuild): boolean {
    const draft = this.nameDrafts()[g.id];
    if (draft === undefined) return false;
    const trimmed = draft.trim();
    return trimmed.length > 0 && trimmed !== g.name;
  }

  protected rename(g: ManagedGuild): void {
    const draft = this.nameDrafts()[g.id]?.trim();
    if (!draft || draft === g.name) return;

    this.busy.set(g.id);
    this.notice.set(null);
    this.backoffice.renameGuild(g.id, draft).subscribe({
      next: (res) => {
        this.busy.set(null);
        this.load();
        // The alias is the half that is not obvious, so it is what the notice is about: the old
        // spelling still has to resolve or the next import rebuilds the row under it.
        this.notice.set(
          `Renamed ${res.previousName} to ${res.name}.`
          + (res.aliasKept
            ? ` “${res.previousName}” is kept as an alias, so matches still filed under it land here.`
            : ''));
      },
      error: (err) => {
        this.busy.set(null);
        this.notice.set(
          err?.error?.error === 'name_is_synced'
            ? 'This guild has a UID, so the weekly name pass reads its name from the game — a '
              + 'wrong spelling there corrects itself on the next run.'
            : err?.error?.error === 'name_taken'
              ? `“${err.error.ownerName}” already holds that name. If they are the same guild, `
                + 'merge the two rows instead of renaming.'
              : err?.error?.error === 'name_is_alias'
                ? 'Another guild already answers to that name as an alias.'
                : err?.error?.error === 'invalid_name'
                  ? 'That is not a usable guild name.'
                  : err?.status === 403
                    ? 'Not permitted.'
                    : 'Rename failed.');
      },
    });
  }

  // ── Merging duplicate rows ─────────────────────────────────────────────────

  private pairKey(d: GuildDuplicate): string {
    return `${d.keepId}:${d.foldId}`;
  }

  private isSwapped(d: GuildDuplicate): boolean {
    return this.swapped()[this.pairKey(d)] === true;
  }

  protected keepSide(d: GuildDuplicate) {
    return this.isSwapped(d)
      ? { id: d.foldId, name: d.foldName, identified: d.foldIdentified, matches: d.foldMatchCount }
      : { id: d.keepId, name: d.keepName, identified: d.keepIdentified, matches: d.keepMatchCount };
  }

  protected foldSide(d: GuildDuplicate) {
    return this.isSwapped(d)
      ? { id: d.keepId, name: d.keepName, identified: d.keepIdentified, matches: d.keepMatchCount }
      : { id: d.foldId, name: d.foldName, identified: d.foldIdentified, matches: d.foldMatchCount };
  }

  protected swap(d: GuildDuplicate): void {
    const key = this.pairKey(d);
    this.swapped.update((all) => ({ ...all, [key]: !all[key] }));
  }

  protected merge(d: GuildDuplicate): void {
    const keep = this.keepSide(d);
    const fold = this.foldSide(d);

    this.merging.set(fold.id);
    this.notice.set(null);
    this.backoffice.mergeGuild(keep.id, fold.id).subscribe({
      next: (res) => {
        this.merging.set(null);
        this.load();
        this.notice.set(
          `Merged ${res.mergedName} into ${res.survivorName} — `
          + `${res.matchesMoved} ${res.matchesMoved === 1 ? 'match' : 'matches'} moved`
          + (res.aliasesKept.length
            ? `, now also answering to ${res.aliasesKept.map((a) => `“${a}”`).join(', ')}.`
            : '.')
          + (res.adoptedIdentity
            ? ' The kept row took the other one’s UID, so it is syncable now.'
            : ''));
      },
      error: (err) => {
        this.merging.set(null);
        this.notice.set(
          err?.error?.error === 'match_collision'
            ? 'Both rows record the same match, so merging would lose one of the two records: '
              + `${err.error.detail}. Delete one of them in Match History first — one may have `
              + 'footage the other does not.'
            : err?.error?.error === 'gvg_collision'
              ? `Both rows are sides of the same recorded GvG match (${err.error.detail}), which `
                + 'has to be sorted out first.'
              : err?.error?.error === 'our_guild'
                ? 'One of those rows is our own guild, which is never merged.'
                : err?.error?.error === 'guild_not_found'
                  ? 'One of those rows is already gone — reloading.'
                  : err?.status === 403
                    ? 'Not permitted.'
                    : 'Merge failed, and nothing was changed.');
      },
    });
  }

  // ── Scouting ───────────────────────────────────────────────────────────────

  protected toggleScout(g: ManagedGuild): void {
    if (this.expanded() === g.id) {
      // Collapsing drops the reading rather than parking it. Re-opening must take a fresh one:
      // a reading kept around is a stale one, and this is the kind of stale that misleads.
      this.expanded.set(null);
      this.scout.set(null);
      this.scoutError.set(null);
      return;
    }

    this.expanded.set(g.id);
    this.scout.set(null);
    this.scoutError.set(null);
    this.scouting.set(g.id);
    this.backoffice.scoutGuild(g.id).subscribe({
      next: (reading) => {
        this.scouting.set(null);
        // Guard against a slow answer for a row the officer has since closed or moved off:
        // dropping it is right, because it is a reading of a moment that has passed.
        if (this.expanded() === g.id) this.scout.set(reading);
      },
      error: (err) => {
        this.scouting.set(null);
        if (this.expanded() !== g.id) return;
        this.scoutError.set(
          err?.error?.error === 'guild_not_identified'
            ? 'This guild has no UID yet — enter its number first.'
            : err?.error?.error === 'signing_key_missing'
              ? 'The server cannot reach the game API (signing key missing).'
              : 'The game API did not answer. Try again in a moment.');
      },
    });
  }
}
