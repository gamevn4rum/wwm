import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { RouterLink } from '@angular/router';
import { LoginButtonComponent } from '../../../../shared/components/login-button/login-button.component';
import { RegisterButtonComponent } from '../register-button/register-button.component';
import { GuildOverviewComponent } from '../../../guild/components/guild-overview/guild-overview.component';
import { GuildDataService } from '../../../guild/guild-data.service';

@Component({
  selector: 'app-home-header',
  standalone: true,
  imports: [RouterLink, LoginButtonComponent, RegisterButtonComponent, GuildOverviewComponent],
  templateUrl: './home-header.component.html',
  styleUrls: ['./home-header.component.scss'],
})
export class HomeHeaderComponent {
  /** The guild's banner glyph off the rank file (shared with the overview tiles). */
  readonly flag = toSignal(
    inject(GuildDataService).getRank().pipe(map((r) => r?.flag?.text?.trim() || null)),
    { initialValue: null },
  );
}
