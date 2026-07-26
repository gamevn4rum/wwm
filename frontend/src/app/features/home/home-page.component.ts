import { Component } from '@angular/core';
import { HallOfFameComponent } from '../guild/components/hall-of-fame/hall-of-fame.component';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [
    HallOfFameComponent,
  ],
  templateUrl: './home-page.component.html',
  styleUrls: ['./home-page.component.scss'],
})
export class HomePageComponent {}
