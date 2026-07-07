import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { DiscordAuthService } from '../../../../core/services/discord-auth.service';
import { RegisterPopupService } from '../../../../core/services/register-popup.service';

@Component({
  selector: 'app-register-button',
  standalone: true,
  imports: [AsyncPipe],
  templateUrl: './register-button.component.html',
  styleUrls: ['./register-button.component.scss'],
})
export class RegisterButtonComponent {
  private readonly authService = inject(DiscordAuthService);
  private readonly registerPopup = inject(RegisterPopupService);
  readonly currentUser$ = this.authService.currentUser$;
  readonly authResolved$ = this.authService.authResolved$;

  openForm(): void {
    this.registerPopup.show();
  }
}
