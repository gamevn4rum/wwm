import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ScheduleDataService } from './schedule-data.service';
import { ScheduleRecord } from './schedule-record.model';

@Component({
  selector: 'app-schedule-page',
  standalone: true,
  imports: [],
  templateUrl: './schedule-page.component.html',
  styleUrls: ['./schedule-page.component.scss'],
})
export class SchedulePageComponent implements OnInit {
  private readonly dataService = inject(ScheduleDataService);
  private readonly router = inject(Router);

  readonly allRows  = signal<ScheduleRecord[]>([]);
  readonly loading  = signal(true);

  readonly weeklyActivities = computed(() =>
    this.allRows().filter((r) => r.type.toLowerCase() !== 'scrim')
  );

  readonly upcomingMatches = computed(() =>
    this.allRows().filter((r) => r.type.toLowerCase() === 'scrim')
  );

  ngOnInit(): void {
    this.dataService.getSchedule().subscribe({
      next: (rows) => { this.allRows.set(rows); this.loading.set(false); },
      error: ()     => this.loading.set(false),
    });
  }

  typeIconChar(type: string): string {
    switch (type.toLowerCase()) {
      case 'daily':  return 'D';
      case 'weekly': return 'W';
      case 'gvg':    return 'G';
      case 'scrim':  return 'S';
      default:       return type.charAt(0).toUpperCase() || '?';
    }
  }

  typeIconClass(type: string): string {
    switch (type.toLowerCase()) {
      case 'daily':  return 'icon-daily';
      case 'weekly': return 'icon-weekly';
      case 'gvg':    return 'icon-gvg';
      case 'scrim':  return 'icon-scrim';
      default:       return 'icon-default';
    }
  }

  typeBadgeClass(type: string): string {
    switch (type.toLowerCase()) {
      case 'daily':  return 'badge-daily';
      case 'weekly': return 'badge-weekly';
      case 'gvg':    return 'badge-gvg';
      case 'scrim':  return 'badge-scrim';
      default:       return 'badge-default';
    }
  }

  typeIconSrc(type: string): string {
    switch (type.toLowerCase()) {
      case 'daily':  return 'icons/icon-daily.png';
      case 'weekly': return 'icons/icon-weekly.png';
      case 'gvg':    return 'icons/icon-gvg.png';
      case 'scrim':  return 'icons/icon-scrim.png';
      default:       return 'icons/icon-schedule.png';
    }
  }

  goToFootages(activity: string): void {
    this.router.navigate(['/footages'], { queryParams: { opponent: activity } });
  }
}


