import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DiscordAuthService, isCommanderRole } from '../../../core/services/discord-auth.service';
import { GvgFormationModalComponent } from '../gvg-formation/gvg-formation-modal.component';

type Access = 'checking' | 'anonymous' | 'denied' | 'allowed';

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
  template: `
    @switch (access()) {
      @case ('allowed') {
        <app-gvg-formation-modal [eventId]="eventId" (closed)="close()" />
      }
      @case ('checking') {
        <p class="fe-msg">Đang kiểm tra quyền…</p>
      }
      @case ('anonymous') {
        <p class="fe-msg">
          Hãy đăng nhập bằng Discord để xếp đội hình.
          <button type="button" class="fe-btn" (click)="auth.login()">Đăng nhập Discord</button>
        </p>
      }
      @default {
        <p class="fe-msg">Xếp đội hình cần chức <b>Commander</b> trở lên.</p>
      }
    }
  `,
  styles: [`
    :host { display: block; min-height: 100vh; }
    .fe-msg {
      display: flex; flex-direction: column; gap: 1rem; align-items: center; justify-content: center;
      min-height: 100vh; margin: 0; padding: 1.5rem; text-align: center;
    }
    .fe-btn {
      padding: 0.6rem 1.2rem; border: 0; border-radius: 0.4rem;
      background: #5865f2; color: #fff; font: inherit; cursor: pointer;
    }
  `],
})
export class FormationEmbedPageComponent {
  readonly auth = inject(DiscordAuthService);
  readonly eventId = inject(ActivatedRoute).snapshot.queryParamMap.get('eventId');

  /**
   * Checked here rather than by a route guard, because a guard can only redirect — and in a window
   * that holds nothing but this modal, a redirect to the home page is the whole site arriving where
   * the commander expected a formation. Discord shows the post's link button to every reader, so
   * being turned away is an ordinary outcome and deserves a sentence. The pool and share endpoints
   * are Commander-only regardless; this only saves a request that would 403.
   */
  readonly access = signal<Access>('checking');

  constructor() {
    firstValueFrom(this.auth.initializeAuthState())
      .then((user) => this.access.set(
        !user ? 'anonymous' : isCommanderRole(user.role) ? 'allowed' : 'denied'))
      .catch(() => this.access.set('anonymous'));
  }

  /**
   * Closes the window the bot opened. `window.close()` only works on a window that was opened by
   * script, so a tab somebody navigated here by hand stays put — blanking the page would be worse
   * than leaving the modal up.
   */
  close(): void {
    window.close();
  }
}
