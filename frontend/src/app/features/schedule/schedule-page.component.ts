import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ScheduleDataService } from './schedule-data.service';
import { ScheduleRecord } from './schedule-record.model';
import { EventsListComponent } from '../home/components/events-list/events-list.component';
import { ConfigService } from '../../core/services/config.service';

@Component({
  selector: 'app-schedule-page',
  standalone: true,
  imports: [EventsListComponent],
  templateUrl: './schedule-page.component.html',
  styleUrls: ['./schedule-page.component.scss'],
})
export class SchedulePageComponent implements OnInit {
  private readonly dataService = inject(ScheduleDataService);
  private readonly router = inject(Router);
  /** Gates the Events section, same flag it had on the homepage. */
  readonly config = inject(ConfigService);

  readonly allRows  = signal<ScheduleRecord[]>([]);
  readonly loading  = signal(true);

  /** Scrims only. The endpoint still serves the guild's fixed weekly activities — dailies, the GvG
   *  slot — but this page no longer shows them: they never changed week to week, so a fixed list
   *  reprinted above the matches was furniture rather than news. */
  readonly upcomingMatches = computed(() =>
    this.allRows().filter((r) => r.type.toLowerCase() === 'scrim')
  );

  ngOnInit(): void {
    this.dataService.getSchedule().subscribe({
      next: (rows) => { this.allRows.set(rows); this.loading.set(false); },
      error: ()     => this.loading.set(false),
    });
  }

  goToFootages(activity: string): void {
    this.router.navigate(['/footages'], { queryParams: { opponent: activity } });
  }
}


