import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FootagePopupService } from './core/services/footage-popup.service';
import { RegisterPopupService } from './core/services/register-popup.service';
import { FootageVideoCardComponent } from './features/footages/components/footage-video-card.component';
import { RegisterFormPopupComponent } from './shared/components/register-form-popup/register-form-popup.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, FootageVideoCardComponent, RegisterFormPopupComponent],
  template: `
    <router-outlet />

    @if (popup.popupOpen()) {
      <div class="footage-popup-overlay" (click)="popup.close()">
        <div class="footage-popup-panel" (click)="$event.stopPropagation()">
          <div class="footage-popup-header">
            <span class="footage-popup-title">{{ popup.popupHeader() }}</span>
            <button class="footage-popup-close" (click)="popup.close()" aria-label="Close">
              <img src="icons/icon-cross.png" alt="Close" />
            </button>
          </div>
          <div class="footage-popup-body">
            @if (popup.popupFootages().length === 0) {
              <p class="footage-popup-empty">No footage found for this match.</p>
            } @else {
              <div class="footage-popup-grid">
                @for (footage of popup.popupFootages(); track footage.videoId + footage.date + footage.uploader) {
                  <app-footage-video-card [footage]="footage" [eager]="true"></app-footage-video-card>
                }
              </div>
            }
          </div>
        </div>
      </div>
    }

    @if (registerPopup.open()) {
      <app-register-form-popup />
    }
  `,
})
export class App {
  readonly popup = inject(FootagePopupService);
  readonly registerPopup = inject(RegisterPopupService);
}
