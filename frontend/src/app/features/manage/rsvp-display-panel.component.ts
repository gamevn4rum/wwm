import { Component, inject, signal } from '@angular/core';
import { BackofficeService, RsvpDisplay } from '../../core/services/backoffice.service';

const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Vietnam is a fixed UTC+7 (no DST)

/**
 * What an event post writes beside each name in the columns a commander fields from — the combat
 * role, or the responder's two martial paths.
 *
 * One setting for the guild rather than one per event, and a Commander's rather than an Admin's:
 * it changes nothing about what the bot collects, only how the list it has already collected reads,
 * and the people reading it are the ones organising the war.
 *
 * **Combat role is the default**, and is what the posts carried until 2026-10-28. The paths are the
 * other reading of the same list — what somebody can bring, rather than the seat a commander would
 * put them in — and they cost the post: a badge is a custom emoji, about forty-five characters of
 * markup against the six thousand an embed holds, where the role emoji is two. A well-attended GvG
 * shows fewer names before its "+N người nữa" line with them on, and the columns lose their
 * green/yellow colouring, which cannot survive in the same field as a custom emoji.
 *
 * The "Không" column shows the combat role whichever way this is set.
 *
 * A change reaches a post already in its channel the next time anybody presses anything on it —
 * the bot redraws the whole embed on every press, and asks for this setting as it does.
 */
@Component({
  selector: 'app-rsvp-display-panel',
  standalone: true,
  template: `
    <section class="backoffice">
      <p class="hint">
        What an event post writes beside each name in the <strong>Có</strong> columns of a
        <strong>GvG</strong> and an <strong>/event</strong>. The <strong>Không</strong> column shows
        the combat role either way, and a GvE and a PvP tournament mark nobody — their columns are
        the roles and the pools already.
      </p>

      @if (loading()) {
        <p>Loading…</p>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else {
        <div class="choices">
          <button type="button" class="choice" [class.picked]="!paths()" [disabled]="saving()"
                  (click)="choose(false)">
            <span class="mark">🛡️ ⚔️ ➕</span>
            <span class="name">Combat role <em>(default)</em></span>
            <span class="blurb">
              The seat they play, as one emoji. Cheap enough that a column shows everybody, and the
              names stay coloured by answer.
            </span>
          </button>

          <button type="button" class="choice" [class.picked]="paths()" [disabled]="saving()"
                  (click)="choose(true)">
            <span class="mark">main + sub</span>
            <span class="name">Martial paths</span>
            <span class="blurb">
              What they can bring, as two path badges, with the column grouped by them. Costs the
              colouring and some of the names on a big turnout.
            </span>
          </button>
        </div>

        <p class="meta">
          @if (result(); as r) {
            <span [class.ok]="r.ok" [class.bad]="!r.ok">{{ r.text }}</span>
          } @else {
            <span class="who-when">{{ lastEdit() }}</span>
          }
        </p>
      }
    </section>
  `,
  styles: [`
    .backoffice { padding: .25rem 0 0; }
    .hint { opacity: .75; margin-bottom: 1rem; line-height: 1.5; }
    .choices { display: flex; gap: 1rem; flex-wrap: wrap; }
    .choice {
      flex: 1 1 18rem; text-align: left; cursor: pointer; padding: .9rem 1rem;
      display: flex; flex-direction: column; gap: .35rem;
      border: 1px solid rgba(128,128,128,.4); border-radius: 8px; background: transparent;
      color: inherit; font: inherit;
    }
    .choice:hover:not(:disabled) { background: rgba(128,128,128,.1); }
    .choice:disabled { opacity: .6; cursor: default; }
    .choice.picked { border-color: #1F8B4C; background: rgba(31,139,76,.12); }
    .mark { font-size: .95rem; letter-spacing: .1em; opacity: .85; }
    .name { font-weight: 700; }
    .name em { font-weight: 500; font-size: .76rem; opacity: .6; font-style: normal; }
    .blurb { font-size: .76rem; opacity: .7; line-height: 1.45; }
    .meta { font-size: .74rem; margin-top: .9rem; }
    .who-when { opacity: .55; }
    .ok { color: #28a745; }
    .bad { color: #dc3545; }
    .error { color: #dc3545; }
  `],
})
export class RsvpDisplayPanelComponent {
  private readonly backoffice = inject(BackofficeService);

  readonly setting = signal<RsvpDisplay | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly result = signal<{ ok: boolean; text: string } | null>(null);

  /** What the post is marking names with right now. */
  paths(): boolean {
    return this.setting()?.paths ?? false;
  }

  ngOnInit(): void {
    this.backoffice.getRsvpDisplay().subscribe({
      next: (s) => { this.setting.set(s); this.loading.set(false); },
      error: () => { this.error.set('Failed to load the setting.'); this.loading.set(false); },
    });
  }

  /** Pressing the side it is already on writes nothing — there is no change to record. */
  choose(paths: boolean): void {
    if (this.saving() || paths === this.paths()) return;

    this.saving.set(true);
    this.result.set(null);
    this.backoffice.setRsvpDisplay(paths).subscribe({
      next: (saved) => {
        this.setting.set(saved);
        this.result.set({
          ok: true,
          text: saved.paths
            ? 'Saved ✓ — posts now show martial paths'
            : 'Saved ✓ — posts now show combat role',
        });
        this.saving.set(false);
      },
      error: () => {
        this.result.set({ ok: false, text: 'Save failed. Please try again.' });
        this.saving.set(false);
      },
    });
  }

  /** "by khanh · Sat 14:32 · 9/8", or nothing while nobody has ever set it. */
  lastEdit(): string {
    const row = this.setting();
    if (!row?.updatedUtc) return 'never changed — posts show the combat role';
    const d = new Date(new Date(row.updatedUtc).getTime() + VN_OFFSET_MS);
    const p = (n: number) => String(n).padStart(2, '0');
    const when = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} · ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
    return row.updatedBy ? `by ${row.updatedBy} · ${when}` : when;
  }
}
