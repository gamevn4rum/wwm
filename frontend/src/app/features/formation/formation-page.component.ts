import { Component } from '@angular/core';
import { MemberGridComponent } from '../home/components/member-grid/member-grid.component';

@Component({
  selector: 'app-formation-page',
  standalone: true,
  imports: [MemberGridComponent],
  templateUrl: './formation-page.component.html',
  styleUrls: ['./formation-page.component.scss'],
})
export class FormationPageComponent {}
