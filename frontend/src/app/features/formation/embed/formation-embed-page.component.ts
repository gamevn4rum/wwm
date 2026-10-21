import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { GvgFormationModalComponent } from '../gvg-formation/gvg-formation-modal.component';

/**
 * The "Form GvG Team" modal and nothing else, for the window the bot's RSVP post opens.
 *
 * Outside the main layout on purpose: no nav, no footer, no page behind the overlay — the window
 * is the modal. The match comes in as `?eventId=`, so the formation is for the post that was
 * clicked rather than whatever the API would have called "next".
 */
@Component({
  selector: 'app-formation-embed-page',
  standalone: true,
  imports: [GvgFormationModalComponent],
  template: `<app-gvg-formation-modal [eventId]="eventId" (closed)="close()" />`,
  styles: [':host { display: block; }'],
})
export class FormationEmbedPageComponent {
  readonly eventId = inject(ActivatedRoute).snapshot.queryParamMap.get('eventId');

  /**
   * Closes the window the bot opened. `window.close()` only works on a window that was opened by
   * script, so a tab somebody navigated here by hand stays put — blanking the page would be worse
   * than leaving the modal up.
   */
  close(): void {
    window.close();
  }
}
