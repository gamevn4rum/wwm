import { AsyncPipe, UpperCasePipe } from '@angular/common';
import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
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
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly currentUser$ = this.authService.currentUser$;
  readonly authResolved$ = this.authService.authResolved$;

  /** The badge's dropdown: View Profile / Logout. */
  readonly menuOpen = signal(false);

  constructor() {
    this.authService.initializeAuthState();
  }

  onLoginClick(): void {
    this.authService.login();
  }

  toggleMenu(event: Event): void {
    event.stopPropagation();
    this.menuOpen.update((open) => !open);
  }

  onProfileClick(event: Event): void {
    event.stopPropagation();
    this.menuOpen.set(false);
    this.profilePopup.show();
  }

  onLogoutClick(event: Event): void {
    event.stopPropagation();
    this.menuOpen.set(false);
    this.authService.logout();
    this.router.navigate(['/']);
  }

  /** A click anywhere outside the badge closes the menu (the badge's own
   *  handlers stop propagation). */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.menuOpen()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) this.menuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.menuOpen.set(false);
  }
}
