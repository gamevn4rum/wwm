import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { map, startWith } from 'rxjs/operators';
import {
  AdminEvent,
  BackofficeService,
  EventCreate,
  EventPatch,
} from '../../core/services/backoffice.service';
import {
  IMAGE_SLOTS,
  ImageSlot,
  buildEventHtml,
  substituteImages,
  tokenFor,
} from '../events/event-content';

/** The fields that hold a URL. All of them are links to somewhere else — the site hosts no images. */
const URL_FIELDS = ['banner', 'p1', 'p2', 'p3', 'p4', 'p5', 'link'] as const;
type UrlField = (typeof URL_FIELDS)[number];

/**
 * Where the guild's news articles are written — the Events section of `/schedule`.
 *
 * **The body is HTML.** Not markdown, not plain text: `<b>`, `<p>`, `<ul>`, `<a href>` and the rest
 * work, and are stripped down to safe markup on the way to the page. That is deliberate rather than
 * convenient — the section has rendered HTML since it was fed from a spreadsheet, and every article
 * already published is written in it.
 *
 * **Images are links, and go in through the five slots.** Nothing is uploaded; the API refuses
 * anything that is not an absolute http(s) URL. Paste a URL into a slot, then put its token —
 * `[P1]`..`[P5]` — where the image belongs in the body. The token is what places it, so a slot with
 * a URL and no token is simply unused, and a token with no URL stays visible as text. The **Insert**
 * button drops the token at the cursor, which is the only fiddly part of doing this by hand.
 *
 * **The preview is the real renderer**, not an approximation — it calls the same substitution and the
 * same sanitizer the public page does (`events/event-content.ts`), so what it shows is what will
 * publish, including markup that gets stripped.
 *
 * One form serves both writing and editing, rather than the inline row editor the tournaments page
 * uses: an article is a dozen fields and a body of prose, and a table cell is no place to write one.
 * Editing loads the article into that form and scrolls to it, which is also why the list below is
 * kept narrow — it is an index, not a grid to work in.
 */
@Component({
  selector: 'app-manage-events-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <section class="backoffice">
      <h1>Events</h1>
      <p class="hint">
        The articles in the <strong>EVENTS</strong> section of the Schedule page. The body is
        <strong>HTML</strong>. Images are links — paste one into a slot, then put its token
        (<code>[P1]</code>…<code>[P5]</code>) where it belongs in the body. Pinned articles stay at
        the top of the feed whatever their date.
      </p>

      @if (loading()) {
        <p>Loading…</p>
      } @else {
        @if (error(); as e) {
          <p class="error">{{ e }}</p>
        }

        <!-- ── write / edit one article ──────────────────────────────────── -->
        <form [formGroup]="form" (ngSubmit)="submit()" class="new" id="event-form">
          <h2>{{ editing() ? 'Edit article' : 'New article' }}</h2>

          <label>
            <span>Title</span>
            <input formControlName="title" maxlength="200" placeholder="Sự kiện Trung Thu" />
          </label>

          <div class="pair">
            <label>
              <span>Date</span>
              <input type="date" formControlName="date" />
              <small>Printed on the card, and what the feed is ordered by.</small>
            </label>
            <label class="check">
              <input type="checkbox" formControlName="pin" />
              <span>
                Pin to the top
                <small>Held above everything else regardless of date, and labelled "Pinned".</small>
              </span>
            </label>
          </div>

          <label>
            <span>Banner image (optional)</span>
            <input formControlName="banner" maxlength="500" placeholder="https://…" />
            <small>
              Sits behind the title at the top of the card. Leave blank for a plain title bar.
            </small>
          </label>

          <label>
            <span>Content (HTML)</span>
            <textarea
              #contentEl
              formControlName="description"
              rows="12"
              spellcheck="false"
              placeholder="&lt;p&gt;Chào cả nhà!&lt;/p&gt;&#10;[P1]&#10;&lt;p&gt;Phần thưởng:&lt;/p&gt;&#10;[P2]"
            ></textarea>
          </label>

          <fieldset class="slots">
            <legend>Image slots</legend>
            @for (slot of slots; track slot) {
              <div class="slot">
                <code class="token">{{ tokenFor(slot) }}</code>
                <input
                  [formControlName]="slot"
                  maxlength="500"
                  placeholder="https://… (leave blank if unused)" />
                <button type="button" (click)="insertToken(slot, contentEl)">Insert</button>
                <span class="state" [class.on]="tokenUsed(slot)">
                  {{ slotState(slot) }}
                </span>
              </div>
            }
          </fieldset>

          <label>
            <span>Link (optional)</span>
            <input formControlName="link" maxlength="500" placeholder="https://…" />
            <small>Stored with the article. The card does not render it yet.</small>
          </label>

          <div class="actions">
            <button type="submit" [disabled]="form.invalid || saving()">
              {{ saving() ? 'Saving…' : editing() ? 'Save changes' : 'Post article' }}
            </button>
            @if (editing()) {
              <button type="button" (click)="resetForm()">Cancel</button>
            }
            @if (formError(); as e) {
              <span class="warn">{{ e }}</span>
            }
            @if (notice(); as n) {
              <span class="ok">{{ n }}</span>
            }
          </div>
        </form>

        <!-- ── preview: the same renderer the public page uses ───────────── -->
        <details class="panel" open>
          <summary>Preview</summary>
          <div class="preview">
            @if (previewBanner(); as banner) {
              <div class="preview-header">
                <img [src]="banner" alt="" />
                <span>{{ previewTitle() }}</span>
              </div>
            } @else {
              <div class="preview-header plain">
                <span>{{ previewTitle() }}</span>
              </div>
            }
            <p class="preview-date">
              @if (form.controls.pin.value) {
                <span class="pinned">Pinned</span>
              }
              {{ previewDate() }}
            </p>
            @if (previewHtml(); as html) {
              <div class="preview-body" [innerHTML]="html"></div>
            } @else {
              <p class="preview-empty">Nothing written yet.</p>
            }
            @if (strippedMarkup()) {
              <p class="warn">
                Some markup was removed by the sanitizer — the preview above is what will publish.
              </p>
            }
            @if (danglingTokens(); as tokens) {
              <p class="warn">
                {{ tokens }} in the body with no image behind {{ tokens.includes(',') ? 'them' : 'it' }} —
                it will show as text.
              </p>
            }
          </div>
        </details>

        <!-- ── the articles ─────────────────────────────────────────────── -->
        <h2 class="list-heading">Posted ({{ events().length }})</h2>
        @if (events().length === 0) {
          <p class="hint">Nothing posted yet.</p>
        } @else {
          <table class="grid">
            <thead>
              <tr>
                <th>Article</th>
                <th>Date</th>
                <th>Images</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (e of events(); track e.id) {
                <tr [class.editing]="editing() === e.id" [class.saving]="busy() === e.id">
                  <td>
                    <strong>{{ e.title }}</strong>
                    @if (e.pin) {
                      <small class="pin-tag">pinned</small>
                    }
                  </td>
                  <td class="num">{{ e.date ?? '—' }}</td>
                  <td class="num">{{ imageCount(e) }}</td>
                  <td class="row-actions">
                    <button type="button" (click)="startEdit(e)" [disabled]="busy() === e.id">
                      Edit
                    </button>
                    <button type="button" (click)="remove(e)" [disabled]="busy() === e.id">
                      {{ busy() === e.id ? '…' : 'Delete' }}
                    </button>
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
        max-width: 60rem;
        margin: 0 auto;
        padding: 1.5rem;
      }
      h1 {
        margin-bottom: 0.25rem;
      }
      .hint {
        opacity: 0.7;
        margin-bottom: 1rem;
      }
      .error {
        color: #dc3545;
      }
      .new {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
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
        /* Grid and flex children default to min-width:auto, which for a date input is its intrinsic
           width — wide enough to overflow a 1fr track and cover the field beside it. */
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
      /* Nothing global styles a bare input — each panel dresses its own. font: inherit matters:
         without it a control renders in the browser's default face at a size the rest of the page
         never uses, and stops reading as a field you can type in. */
      .new input,
      .new textarea {
        padding: 0.45rem 0.6rem;
        border: 1px solid rgba(128, 128, 128, 0.4);
        border-radius: 6px;
        font: inherit;
        width: 100%;
        box-sizing: border-box;
        min-width: 0;
      }
      /* The body is HTML and gets read back as often as it gets typed, so it is monospaced —
         a tag is easier to spot when the characters line up. */
      .new textarea {
        resize: vertical;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.85rem;
        line-height: 1.5;
      }
      /* A checkbox must not be stretched by the rule above. */
      .new input[type='checkbox'] {
        width: var(--checkbox-size);
        min-width: auto;
        margin: 0.2rem 0 0;
        flex: 0 0 auto;
      }
      /* auto-fit rather than fixed tracks so a narrow window stacks the pair instead of squeezing
         a date input into space it does not fit. */
      .pair {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
        gap: 0.75rem;
        align-items: start;
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
      fieldset.slots {
        border: 1px solid rgba(128, 128, 128, 0.3);
        border-radius: 6px;
        padding: 0.6rem 0.75rem 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        min-width: 0;
      }
      fieldset.slots legend {
        font-weight: 600;
        font-size: 0.85rem;
        padding: 0 0.3rem;
      }
      /* Token, field, button, state — one line per slot, collapsing to a stack when the token and
         the state can no longer sit beside a usable input. */
      .slot {
        display: grid;
        grid-template-columns: 3.4rem minmax(8rem, 1fr) auto 5.5rem;
        align-items: center;
        gap: 0.5rem;
      }
      @media (max-width: 34rem) {
        .slot {
          grid-template-columns: 3.4rem minmax(6rem, 1fr) auto;
        }
        .slot .state {
          grid-column: 2 / -1;
        }
      }
      .slot code.token {
        font-size: 0.78rem;
        opacity: 0.85;
      }
      .slot .state {
        font-size: 0.72rem;
        opacity: 0.6;
      }
      .slot .state.on {
        opacity: 1;
        color: #5f7757;
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
      .ok {
        color: #5f7757;
      }
      .warn {
        color: #b5533d;
      }
      /* Same collapsible dressing as the Bot schedule panels. */
      details.panel {
        border: 1px solid rgba(128, 128, 128, 0.3);
        border-radius: 8px;
        padding: 0.5rem 0.9rem;
        margin-bottom: 1.5rem;
      }
      details.panel > summary {
        cursor: pointer;
        font-weight: 600;
        list-style: none;
      }
      details.panel > summary::-webkit-details-marker {
        display: none;
      }
      details.panel > summary::before {
        content: '▸';
        display: inline-block;
        width: 1rem;
        transition: transform 0.15s;
      }
      details.panel[open] > summary::before {
        transform: rotate(90deg);
      }
      .preview {
        padding: 0.75rem 0 0.25rem;
      }
      /* Echoes the public card: a banner with the title over it, or a plain bar when there is none. */
      .preview-header {
        position: relative;
        display: flex;
        align-items: flex-end;
        min-height: 8rem;
        max-height: 20rem;
        overflow: hidden;
        border-radius: 6px;
        border: 1px solid rgba(128, 128, 128, 0.3);
      }
      .preview-header img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .preview-header > span {
        position: relative;
        padding: 0.6rem 0.8rem;
        font-weight: 700;
        font-size: 1.1rem;
        color: #fff;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
      }
      .preview-header.plain {
        min-height: 0;
        align-items: center;
      }
      .preview-header.plain > span {
        color: inherit;
        text-shadow: none;
      }
      .preview-date {
        font-size: 0.85rem;
        font-weight: 600;
        margin: 0.5rem 0;
        opacity: 0.85;
      }
      .preview-date .pinned {
        display: inline-block;
        margin-right: 0.4rem;
        padding: 0 0.4rem;
        border: 1px solid currentColor;
        border-radius: 4px;
        font-size: 0.7rem;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
      .preview-body {
        border: 1px solid rgba(128, 128, 128, 0.25);
        border-radius: 6px;
        padding: 0.75rem 1rem;
        max-width: 68ch;
      }
      /* The substituted images are injected as innerHTML, so they are not in this component's
         template and its scoped styles never reach them. */
      ::ng-deep .preview-body .event-content-img {
        display: block;
        max-width: 100%;
        height: auto;
        margin: 0.75rem auto;
        border-radius: 4px;
      }
      .preview-empty {
        opacity: 0.6;
      }
      .list-heading {
        font-size: 1.05rem;
        margin: 0 0 0.5rem;
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
      .grid tr.editing {
        background: rgba(128, 128, 128, 0.12);
      }
      .grid tr.saving {
        opacity: 0.5;
      }
      td.num {
        white-space: nowrap;
      }
      td.row-actions {
        white-space: nowrap;
        display: flex;
        gap: 0.4rem;
      }
      small.pin-tag {
        display: inline-block;
        margin-left: 0.4rem;
        font-size: 0.7rem;
        opacity: 0.7;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
    `,
  ],
})
export class ManageEventsPageComponent {
  private readonly api = inject(BackofficeService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly events = signal<AdminEvent[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly busy = signal<number | null>(null);

  /** The id being edited, or null while writing a new one. */
  protected readonly editing = signal<number | null>(null);

  /** What the form held when an edit started, so a save can send only what actually changed. */
  private readonly baseline = signal<AdminEvent | null>(null);

  protected readonly slots = IMAGE_SLOTS;
  protected readonly tokenFor = tokenFor;

  protected readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    date: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    pin: new FormControl(false, { nonNullable: true }),
    banner: new FormControl('', { nonNullable: true }),
    p1: new FormControl('', { nonNullable: true }),
    p2: new FormControl('', { nonNullable: true }),
    p3: new FormControl('', { nonNullable: true }),
    p4: new FormControl('', { nonNullable: true }),
    p5: new FormControl('', { nonNullable: true }),
    link: new FormControl('', { nonNullable: true }),
  });

  /** The form's value as a signal, so the preview recomputes as it is typed. `getRawValue` rather
   *  than the emitted partial, because every computed below wants the whole article. */
  private readonly value = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      map(() => this.form.getRawValue()),
    ),
    { requireSync: true },
  );

  protected readonly previewTitle = computed(() => this.value().title.trim() || 'Untitled');

  protected readonly previewBanner = computed(() => this.value().banner.trim() || null);

  /** The card prints dd/MMM/yyyy, so the preview does too rather than showing the input's ISO. */
  protected readonly previewDate = computed(() => {
    const iso = this.value().date;
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    const month = months[Number(m) - 1];
    return month ? `${d}/${month}/${y}` : iso;
  });

  protected readonly previewHtml = computed(() => {
    const v = this.value();
    return buildEventHtml(v.description, v, this.sanitizer);
  });

  /**
   * True when the sanitizer dropped one of the author's elements.
   *
   * Compared by element name rather than by string: the sanitizer rewrites what it keeps as well as
   * removing what it does not — quoting attributes, closing `<img />` as `<img>` — so comparing the
   * text would report every article with an image in it as having been stripped. Names catch the
   * case that matters, an element that is simply gone. An attribute removed off an element that
   * stayed is not flagged; the preview is still the truth about it.
   */
  protected readonly strippedMarkup = computed(() => {
    const v = this.value();
    if (!v.description.trim()) return false;
    return elementNames(substituteImages(v.description, v)) !== elementNames(this.previewHtml());
  });

  /** Tokens written into the body whose slot is empty. They publish as literal text, which is
   *  nearly always a slot someone meant to fill. */
  protected readonly danglingTokens = computed(() => {
    const v = this.value();
    const dangling = IMAGE_SLOTS.filter(
      (slot) => v.description.includes(tokenFor(slot)) && !v[slot].trim(),
    ).map(tokenFor);
    return dangling.length > 0 ? dangling.join(', ') : null;
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.getEvents().subscribe({
      next: (rows) => {
        this.events.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load the events.');
        this.loading.set(false);
      },
    });
  }

  protected tokenUsed(slot: ImageSlot): boolean {
    return this.value().description.includes(tokenFor(slot));
  }

  protected slotState(slot: ImageSlot): string {
    const filled = !!this.value()[slot].trim();
    const used = this.tokenUsed(slot);
    if (!filled && !used) return 'unused';
    if (filled && used) return 'placed';
    return filled ? 'not placed' : 'no image';
  }

  protected imageCount(e: AdminEvent): string {
    const slots = IMAGE_SLOTS.filter((slot) => !!e[slot]).length;
    const banner = e.banner ? 1 : 0;
    if (slots + banner === 0) return '—';
    return banner ? `${slots} + banner` : `${slots}`;
  }

  /**
   * Drop a token where the cursor is, rather than at the end.
   *
   * Placing an image is a decision about a spot in the prose, so the button has to act on that spot.
   * The caret is then put after what was inserted, so typing carries on where it left off — writing
   * through `setValue` would otherwise send it to the end of the field.
   */
  protected insertToken(slot: ImageSlot, el: HTMLTextAreaElement): void {
    const token = tokenFor(slot);
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    this.form.controls.description.setValue(
      `${el.value.slice(0, start)}${token}${el.value.slice(end)}`,
    );

    const caret = start + token.length;
    queueMicrotask(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }

  protected startEdit(e: AdminEvent): void {
    this.editing.set(e.id);
    this.baseline.set(e);
    this.formError.set(null);
    this.notice.set(null);
    this.form.setValue({
      title: e.title,
      date: e.date ?? '',
      description: e.description,
      pin: e.pin,
      banner: e.banner ?? '',
      p1: e.p1 ?? '',
      p2: e.p2 ?? '',
      p3: e.p3 ?? '',
      p4: e.p4 ?? '',
      p5: e.p5 ?? '',
      link: e.link ?? '',
    });
    // The list can be long, and the form it just loaded is above it.
    document.getElementById('event-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected resetForm(): void {
    this.editing.set(null);
    this.baseline.set(null);
    this.formError.set(null);
    this.notice.set(null);
    this.form.reset({
      title: '',
      date: '',
      description: '',
      pin: false,
      banner: '',
      p1: '',
      p2: '',
      p3: '',
      p4: '',
      p5: '',
      link: '',
    });
  }

  protected submit(): void {
    const v = this.value();
    this.notice.set(null);

    if (!v.title.trim()) {
      this.formError.set('A title is required.');
      return;
    }
    if (!v.date) {
      this.formError.set('A date is required.');
      return;
    }

    // Checked here as well as API-side, because this is the one an author can see and fix without a
    // round trip — and the API's answer cannot say which of seven URL fields it objected to.
    const badUrl = URL_FIELDS.find((f) => {
      const raw = v[f].trim();
      return raw.length > 0 && !isHttpUrl(raw);
    });
    if (badUrl) {
      this.formError.set(
        `${labelOf(badUrl)} must be a full link starting with http:// or https:// — images are ` +
          'linked, not uploaded.',
      );
      return;
    }

    this.formError.set(null);
    const base = this.baseline();
    if (base) this.saveEdit(base, v);
    else this.createNew(v);
  }

  private createNew(v: FormValue): void {
    const body: EventCreate = {
      title: v.title.trim(),
      date: v.date,
      description: v.description.trim() || null,
      pin: v.pin,
      banner: blank(v.banner),
      p1: blank(v.p1),
      p2: blank(v.p2),
      p3: blank(v.p3),
      p4: blank(v.p4),
      p5: blank(v.p5),
      link: blank(v.link),
    };

    this.saving.set(true);
    this.api.createEvent(body).subscribe({
      next: () => {
        this.saving.set(false);
        this.resetForm();
        this.notice.set('Posted.');
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.formError.set(messageFor(err));
      },
    });
  }

  /**
   * Sends only the fields that changed.
   *
   * The API reads an absent field as "leave alone" and an empty string as "clear", so a full body
   * would work — but a patch of exactly what moved is what makes the audit row readable afterwards,
   * and it is the convention the members page set.
   */
  private saveEdit(base: AdminEvent, v: FormValue): void {
    const patch: EventPatch = {};
    if (v.title.trim() !== base.title) patch.title = v.title.trim();
    if (v.date !== (base.date ?? '')) patch.date = v.date;
    if (v.description !== base.description) patch.description = v.description;
    if (v.pin !== base.pin) patch.pin = v.pin;
    for (const f of URL_FIELDS) {
      if (v[f].trim() !== (base[f] ?? '')) patch[f] = v[f].trim();
    }

    if (Object.keys(patch).length === 0) {
      this.notice.set('Nothing changed.');
      return;
    }

    this.saving.set(true);
    this.busy.set(base.id);
    this.api.patchEvent(base.id, patch).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.busy.set(null);
        // Re-baseline rather than close the form: an edit is usually a few passes over the same
        // article, and a second Save must diff against what is now stored, not what was loaded.
        this.baseline.set(saved);
        this.notice.set('Saved.');
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.busy.set(null);
        this.formError.set(messageFor(err));
      },
    });
  }

  protected remove(e: AdminEvent): void {
    if (!confirm(`Delete "${e.title}"? It comes off the Schedule page and is not recoverable.`)) {
      return;
    }

    this.busy.set(e.id);
    this.api.deleteEvent(e.id).subscribe({
      next: () => {
        this.busy.set(null);
        // The form was holding the article that just stopped existing, so a Save from it would
        // 404. Clearing it is the only coherent state left.
        if (this.editing() === e.id) this.resetForm();
        this.load();
      },
      error: () => {
        this.busy.set(null);
        this.error.set('Could not delete that article.');
      },
    });
  }
}

type FormValue = ReturnType<ManageEventsPageComponent['form']['getRawValue']>;

/** The element names in a fragment, sorted, as one comparable string. Sorted because the sanitizer
 *  is free to reorder as well as rewrite, and only presence is being asked about. */
function elementNames(html: string): string {
  return [...html.matchAll(/<\s*([a-zA-Z][a-zA-Z0-9-]*)/g)]
    .map((m) => m[1].toLowerCase())
    .sort()
    .join(',');
}

function blank(value: string): string | null {
  return value.trim() || null;
}

/** Absolute http(s) only — the same rule the API enforces, so the two agree on what a link is. */
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function labelOf(field: UrlField): string {
  return field === 'banner' ? 'The banner' : field === 'link' ? 'The link' : `Slot ${tokenFor(field)}`;
}

function messageFor(err: { error?: { error?: string }; status?: number }): string {
  switch (err?.error?.error) {
    case 'title_required':
      return 'A title is required.';
    case 'date_required':
      return 'A date is required.';
    case 'title_too_long':
      return 'The title is over 200 characters.';
    case 'description_too_long':
      return 'The body is over 20,000 characters. Trim it, or split the article in two.';
    case 'url_too_long':
      return 'One of the links is over 500 characters.';
    case 'invalid_url':
      return 'One of the links is not a full http:// or https:// URL.';
    default:
      return err?.status === 403
        ? 'Not permitted — posting events needs Commander.'
        : 'Could not save that article.';
  }
}
