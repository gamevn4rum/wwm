import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { DiscordAuthService } from '../../../../core/services/discord-auth.service';

@Component({
  selector: 'app-home-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, AsyncPipe],
  templateUrl: './home-nav.component.html',
  styleUrls: ['./home-nav.component.scss'],
})
export class HomeNavComponent {
  private readonly authService = inject(DiscordAuthService);
  readonly currentUser$ = this.authService.currentUser$;
  readonly authResolved$ = this.authService.authResolved$;
}
