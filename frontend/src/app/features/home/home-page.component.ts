import { Component, inject } from '@angular/core';
import { EventsListComponent } from './components/events-list/events-list.component';
import { ConfigService } from '../../core/services/config.service';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [
    EventsListComponent,
  ],
  templateUrl: './home-page.component.html',
  styleUrls: ['./home-page.component.scss'],
})
export class HomePageComponent {
  readonly config = inject(ConfigService);
}
