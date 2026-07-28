import { AsyncPipe, UpperCasePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { DiscordAuthService } from '../../../core/services/discord-auth.service';
import { ProfilePopupService } from '../../../core/services/profile-popup.service';

@Component({
  selector: 'app-login-button',
  standalone: true,
  imports: [AsyncPipe, UpperCasePipe],
  templateUrl: './login-button.component.html',
  styleUrls: ['./login-button.component.scss'],
})
export class LoginButtonComponent {
  private readonly authService = inject(DiscordAuthService);
  private readonly profilePopup = inject(ProfilePopupService);

  readonly currentUser$ = this.authService.currentUser$;
  readonly authResolved$ = this.authService.authResolved$;

  constructor() {
    this.authService.initializeAuthState();
  }

  onLoginClick(): void {
    this.authService.login();
  }

  /** Logged-in badge opens the profile; logging out lives inside it. */
  onProfileClick(): void {
    this.profilePopup.show();
  }
}
