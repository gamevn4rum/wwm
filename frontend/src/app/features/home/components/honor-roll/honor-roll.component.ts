import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HonorsDataService } from '../../services/honors-data.service';
import { HonorGroup, HonorHolder, HonorTitle } from '../../models/honor.model';
import { apiUrl } from '../../../../core/api';

/** The game's own default name card — plain dark linen — for a holder without art of their own. */
const DEFAULT_NAME_CARD_ID = 1;

/** One plaque: a title and its holders, named for the homepage. */
interface Plaque extends HonorTitle {
  key: string;
  label: string;
}

/**
 * The honors our members hold right now, one plaque per title in a single box, each holder drawn
 * as their in-game nameplate: name card behind, portrait beside the IGN.
 *
 * "Of the week" in the sense the game means it: an honor lasts about seven days, so this is what
 * is still held rather than what was won since the Monday reset (see the API's HeldHonorsAsync).
 */
@Component({
  selector: 'app-honor-roll',
  standalone: true,
  templateUrl: './honor-roll.component.html',
  styleUrls: ['./honor-roll.component.scss'],
})
export class HonorRollComponent {
  /** `undefined` while loading, null when the API did not answer. */
  readonly honors = toSignal<HonorGroup[] | null | undefined>(inject(HonorsDataService).getHonors(), {
    initialValue: undefined,
  });

  /**
   * Every title across every activity, in the API's order (GvG League first). No activity headings:
   * the GvG titles name themselves, and the rest read better as what they are — a title called
   * "MVP" is shown as its activity ("Breaking Army", "Showdown"), since "MVP" twice says nothing.
   */
  readonly plaques = computed<Plaque[]>(() =>
    (this.honors() ?? []).flatMap((g) => g.titles.map((t) => ({
      ...t,
      key: `${g.activity}/${t.title}`,
      label: t.title === 'MVP' ? g.activity : t.title,
    }))),
  );

  /** Images that failed to load, by URL — the plate then falls back rather than show a broken image. */
  private readonly broken = signal<ReadonlySet<string>>(new Set());

  cardSrc(h: HonorHolder): string | null {
    const own = h.nameCardId != null ? this.art('name-card', h.nameCardId) : null;
    const fallback = this.art('name-card', DEFAULT_NAME_CARD_ID);
    return [own, fallback].find((src) => src && !this.broken().has(src)) ?? null;
  }

  portraitSrc(h: HonorHolder): string | null {
    const src = h.portraitId != null ? this.art('portrait', h.portraitId) : null;
    return src && !this.broken().has(src) ? src : null;
  }

  drop(src: string | null): void {
    if (src) this.broken.update((s) => new Set(s).add(src));
  }

  initial(ign: string): string {
    return [...ign.trim()][0]?.toUpperCase() ?? '?';
  }

  private art(kind: 'name-card' | 'portrait', id: number): string {
    return apiUrl(`/public/official-art/${kind}/${id}.png`);
  }
}
