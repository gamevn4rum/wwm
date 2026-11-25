import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';

/**
 * A member's card head — in-game name card behind, portrait in a ring (initial when there is
 * none), IGN, school and UID, and a pill on the right. Shared by the Guild roster and the
 * homepage honor roll so the two stay identical.
 *
 * Purely presentational: the parent owns the image URLs and drops one when its `(…Error)` fires.
 * Inside a padded card, set `--card-pad` on the parent so the name card bleeds to its edges.
 */
@Component({
  selector: 'app-member-card-head',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.has-card]': '!!cardSrc()' },
  template: `
    @if (cardSrc(); as card) {
      <img
        class="art"
        [src]="card"
        alt=""
        crossorigin="anonymous"
        decoding="async"
        (error)="cardError.emit()"
      />
    }
    <span class="avatar">
      @if (portraitSrc(); as face) {
        <img class="portrait" [src]="face" alt="" decoding="async" (error)="portraitError.emit()" />
      } @else {
        {{ initial() }}
      }
      @if (online()) {
        <span class="dot" aria-hidden="true"></span>
      }
    </span>
    <span class="id">
      <span class="ign">{{ ign() }}</span>
      @if (school() !== undefined) {
        <span class="school">{{ school() || '—' }}</span>
      }
      @if (uid()) {
        <span class="uid">UID {{ uid() }}</span>
      }
    </span>
    @if (pill()) {
      <span class="pill">{{ pill() }}</span>
    }
  `,
  styles: [
    `
      :host {
        position: relative;
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }
      :host(.has-card) {
        margin: calc(-1 * var(--card-pad, 0px)) calc(-1 * var(--card-pad, 0px)) 0;
        padding: var(--card-pad, var(--space-3));
        min-height: 76px;
        overflow: hidden;
      }
      /* A dark shade between the art and the text: the art runs from near-white to near-black. */
      :host(.has-card)::before {
        content: '';
        position: absolute;
        inset: 0;
        z-index: 1;
        background: linear-gradient(90deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.42) 60%, rgba(0, 0, 0, 0.2) 100%);
      }
      :host(.has-card) > :not(.art) {
        position: relative;
        z-index: 2;
      }
      .art {
        position: absolute;
        inset: 0;
        z-index: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .avatar {
        position: relative;
        flex-shrink: 0;
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background: var(--color-surface-alt);
        color: var(--color-primary-dark);
        font-family: var(--font-heading);
        font-size: 1rem;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      :host(.has-card) .avatar {
        background: rgba(255, 255, 255, 0.9);
        box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.55);
      }
      .portrait {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        object-fit: cover;
      }
      .dot {
        position: absolute;
        right: -1px;
        bottom: -1px;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--color-secondary);
        border: 2px solid #fff;
      }
      .id {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        min-width: 0;
        flex: 1;
      }
      .ign,
      .school {
        font-family: var(--font-body);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .ign {
        font-size: 0.9rem;
        font-weight: 600;
        color: var(--color-ink);
        line-height: 1.3;
      }
      .school {
        font-size: 0.72rem;
        color: var(--color-ink-faint);
      }
      .uid {
        font-family: var(--font-body);
        font-size: 0.68rem;
        color: var(--color-ink-faint);
        font-variant-numeric: tabular-nums;
        user-select: all;
      }
      :host(.has-card) .ign {
        color: #fff;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85), 0 0 1px rgba(0, 0, 0, 0.9);
      }
      :host(.has-card) .school,
      :host(.has-card) .uid {
        color: rgba(255, 255, 255, 0.88);
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
      }
      .pill {
        flex-shrink: 0;
        font-family: var(--font-heading);
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--color-primary-dark);
        background: var(--color-primary-tint);
        border-radius: var(--radius-pill);
        padding: 0.15rem 0.55rem;
        white-space: nowrap;
        max-width: 45%;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      :host(.has-card) .pill {
        color: #fff;
        background: rgba(0, 0, 0, 0.45);
        border: 1px solid rgba(255, 255, 255, 0.55);
      }
    `,
  ],
})
export class MemberCardHeadComponent {
  readonly ign = input.required<string>();
  /** `undefined` hides the line; null or empty shows a dash. */
  readonly school = input<string | null | undefined>(undefined);
  readonly uid = input<string | null>(null);
  readonly cardSrc = input<string | null>(null);
  readonly portraitSrc = input<string | null>(null);
  readonly online = input(false);
  /** The right-hand pill: level on the roster, the title on the honor roll. */
  readonly pill = input<string | null>(null);

  readonly cardError = output<void>();
  readonly portraitError = output<void>();

  readonly initial = computed(() => [...this.ign().trim()][0]?.toUpperCase() ?? '?');
}
