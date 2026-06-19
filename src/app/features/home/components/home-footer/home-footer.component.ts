import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { DiscordAuthService } from '../../../../core/services/discord-auth.service';

@Component({
  selector: 'app-home-footer',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, AsyncPipe],
  templateUrl: './home-footer.component.html',
  styleUrls: ['./home-footer.component.scss'],
})
export class HomeFooterComponent {
  private readonly authService = inject(DiscordAuthService);
  readonly currentUser$ = this.authService.currentUser$;
}
