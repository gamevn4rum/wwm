import { Component } from '@angular/core';
import { RegisterButtonComponent } from './components/register-button/register-button.component';
import { MemberGridComponent } from './components/member-grid/member-grid.component';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [
    RegisterButtonComponent,
    MemberGridComponent,
  ],
  templateUrl: './home-page.component.html',
  styleUrls: ['./home-page.component.scss'],
})
export class HomePageComponent {}
