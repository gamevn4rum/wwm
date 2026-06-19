import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class RegisterPopupService {
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
