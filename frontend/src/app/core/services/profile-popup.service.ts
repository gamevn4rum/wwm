import { Injectable, signal } from '@angular/core';

/** Opens the logged-in member's profile modal (from the login badge menu). */
@Injectable({ providedIn: 'root' })
export class ProfilePopupService {
  readonly open = signal(false);

  show(): void {
    this.open.set(true);
    document.body.style.overflow = 'hidden';
  }

  hide(): void {
    this.open.set(false);
    document.body.style.overflow = '';
  }
}
