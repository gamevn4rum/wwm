import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MemberGridComponent } from '../home/components/member-grid/member-grid.component';
import { GvgFormationModalComponent } from './gvg-formation/gvg-formation-modal.component';
import { DiscordAuthService, isCommanderRole } from '../../core/services/discord-auth.service';

@Component({
  selector: 'app-formation-page',
  standalone: true,
  imports: [MemberGridComponent, GvgFormationModalComponent],
  templateUrl: './formation-page.component.html',
  styleUrls: ['./formation-page.component.scss'],
})
export class FormationPageComponent {
  private readonly user = toSignal(inject(DiscordAuthService).currentUser$, { initialValue: null });

  /** Formation access (`fp`) is separate from rank, but the pool and share endpoints are
   *  Commander-only — a Warrior with `fp` would be offered a button that can only fail. */
  readonly canForm = () => isCommanderRole(this.user()?.role);

  readonly formOpen = signal(false);
}
