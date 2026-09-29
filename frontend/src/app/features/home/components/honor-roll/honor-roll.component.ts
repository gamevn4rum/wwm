import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HonorsDataService } from '../../services/honors-data.service';
import { HonorGroup } from '../../models/honor.model';

/**
 * The honors our members hold right now, one plaque per title, grouped by activity.
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
}
