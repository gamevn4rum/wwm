import { Component } from '@angular/core';
import { RegisterButtonComponent } from '../home/components/register-button/register-button.component';
import { MemberGridComponent } from '../home/components/member-grid/member-grid.component';

@Component({
  selector: 'app-formation-page',
  standalone: true,
  imports: [RegisterButtonComponent, MemberGridComponent],
  templateUrl: './formation-page.component.html',
  styleUrls: ['./formation-page.component.scss'],
})
export class FormationPageComponent {}
