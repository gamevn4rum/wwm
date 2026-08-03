import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FootagePopupService } from './core/services/footage-popup.service';
import { RegisterPopupService } from './core/services/register-popup.service';
import { ProfilePopupService } from './core/services/profile-popup.service';
import { MatchFormPopupService } from './core/services/match-form-popup.service';
import { MatchPopupComponent } from './features/match-history/components/match-popup/match-popup.component';
import { MatchFormPopupComponent } from './features/match-history/components/match-form-popup/match-form-popup.component';
import { RegisterFormPopupComponent } from './shared/components/register-form-popup/register-form-popup.component';
import { ProfileModalComponent } from './shared/components/profile-modal/profile-modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    MatchPopupComponent,
    MatchFormPopupComponent,
    RegisterFormPopupComponent,
    ProfileModalComponent,
  ],
  template: `
    <router-outlet />

    @if (popup.popupOpen()) {
      <app-match-popup />
    }

    <!-- Deferred, unlike its siblings: it is Commander-only and pulls ~16 kB into a
         bundle that is already over budget, so it is fetched on first open instead
         of by every visitor. -->
    @if (matchFormPopup.open()) {
      @defer (on immediate) {
        <app-match-form-popup />
      }
    }

    @if (registerPopup.open()) {
      <app-register-form-popup />
    }

    @if (profilePopup.open()) {
      <app-profile-modal />
    }
  `,
})
export class App {
  readonly popup = inject(FootagePopupService);
  readonly matchFormPopup = inject(MatchFormPopupService);
  readonly registerPopup = inject(RegisterPopupService);
  readonly profilePopup = inject(ProfilePopupService);
}
