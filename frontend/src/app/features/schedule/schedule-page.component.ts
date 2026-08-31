import { Component, inject } from '@angular/core';
import { EventsListComponent } from '../home/components/events-list/events-list.component';
import { ConfigService } from '../../core/services/config.service';

/**
 * Guild Events.
 *
 * This page used to lead with an UPCOMING MATCHES list read from `/api/public/schedule`. That
 * endpoint served the `ScheduleItems` table, whose only writer was the Google-Sheet sync deleted
 * a while back — so the list could never gain a row again and rendered "No upcoming matches
 * scheduled." on every visit. Table, endpoint and section went together; the events below were
 * always the part of this page with a live source.
 */
@Component({
  selector: 'app-schedule-page',
  standalone: true,
  imports: [EventsListComponent],
  templateUrl: './schedule-page.component.html',
  styleUrls: ['./schedule-page.component.scss'],
})
export class SchedulePageComponent {
  /** Gates the Events section, same flag it had on the homepage. */
  readonly config = inject(ConfigService);
}
