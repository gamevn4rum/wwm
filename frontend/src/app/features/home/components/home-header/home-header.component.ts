import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LoginButtonComponent } from '../../../../shared/components/login-button/login-button.component';
import { RegisterButtonComponent } from '../register-button/register-button.component';

@Component({
  selector: 'app-home-header',
  standalone: true,
  imports: [RouterLink, LoginButtonComponent, RegisterButtonComponent],
  templateUrl: './home-header.component.html',
  styleUrls: ['./home-header.component.scss'],
})
export class HomeHeaderComponent {}
