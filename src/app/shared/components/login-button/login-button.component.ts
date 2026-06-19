import { AsyncPipe, UpperCasePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DiscordAuthService } from '../../../core/services/discord-auth.service';

@Component({
  selector: 'app-login-button',
  standalone: true,
  imports: [AsyncPipe, UpperCasePipe],
  templateUrl: './login-button.component.html',
  styleUrls: ['./login-button.component.scss'],
})
export class LoginButtonComponent {
  private readonly authService = inject(DiscordAuthService);
  private readonly router = inject(Router);

  readonly currentUser$ = this.authService.currentUser$;

  constructor() {
    this.authService.initializeAuthState();
  }

  onLoginClick(): void {
    this.authService.login();
  }

  onLogoutClick(event: Event): void {
    event.stopPropagation();
    this.authService.logout();
    this.router.navigate(['/']);
  }
}
