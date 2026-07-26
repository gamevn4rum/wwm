import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LoginButtonComponent } from '../../../../shared/components/login-button/login-button.component';
import { RegisterButtonComponent } from '../register-button/register-button.component';
import { GuildOverviewComponent } from '../../../guild/components/guild-overview/guild-overview.component';

@Component({
  selector: 'app-home-header',
  standalone: true,
  imports: [RouterLink, LoginButtonComponent, RegisterButtonComponent, GuildOverviewComponent],
  templateUrl: './home-header.component.html',
  styleUrls: ['./home-header.component.scss'],
})
export class HomeHeaderComponent {}
