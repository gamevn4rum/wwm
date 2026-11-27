import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FootagePopupService } from './core/services/footage-popup.service';
import { ProfilePopupService } from './core/services/profile-popup.service';
import { MatchFormPopupService } from './core/services/match-form-popup.service';
import { MatchPopupComponent } from './features/match-history/components/match-popup/match-popup.component';
import { MatchFormPopupComponent } from './features/match-history/components/match-form-popup/match-form-popup.component';
import { ProfileModalComponent } from './shared/components/profile-modal/profile-modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    MatchPopupComponent,
    MatchFormPopupComponent,
    ProfileModalComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <router-outlet />

    <!-- The match popup and profile modal are ~80 kB together (plus the YouTube
         player) and most visits open neither, so they leave the initial bundle.
         "when" loads them on first open; "prefetch on idle" fetches the chunk once
         the page has settled, so that first open does not wait on the network. -->
    @defer (when popup.popupOpen(); prefetch on idle) {
      @if (popup.popupOpen()) {
        <app-match-popup />
      }
    }

    <!-- Commander-only, so not prefetched: fetched on first open instead of by
         every visitor. -->
    @if (matchFormPopup.open()) {
      @defer (on immediate) {
        <app-match-form-popup />
      }
    }

    @defer (when profilePopup.open(); prefetch on idle) {
      @if (profilePopup.open()) {
        <app-profile-modal />
      }
    }
  `,
})
export class App {
  readonly popup = inject(FootagePopupService);
  readonly matchFormPopup = inject(MatchFormPopupService);
  readonly profilePopup = inject(ProfilePopupService);
}
