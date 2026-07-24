import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  DiscordAuthService, DiscordUserSession, isAdminRole, isCommanderRole,
} from '../../../../core/services/discord-auth.service';
import { ConfigService } from '../../../../core/services/config.service';
import { environment } from '../../../../../environments/environment';

@Component({
  selector: 'app-home-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, AsyncPipe],
  templateUrl: './home-nav.component.html',
  styleUrls: ['./home-nav.component.scss'],
})
export class HomeNavComponent {
  private readonly authService = inject(DiscordAuthService);
  readonly config = inject(ConfigService);
  readonly currentUser$ = this.authService.currentUser$;
  readonly authResolved$ = this.authService.authResolved$;
  readonly useBackend = environment.useBackend;

  isCommander(user: DiscordUserSession): boolean { return isCommanderRole(user.role); }
  isAdmin(user: DiscordUserSession): boolean { return isAdminRole(user.role); }
}
