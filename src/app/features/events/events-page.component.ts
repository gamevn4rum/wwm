import { Component, inject, OnInit, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { EventsDataService } from './events-data.service';
import { EventRecord } from './event-record.model';

@Component({
  selector: 'app-events-page',
  standalone: true,
  imports: [],
  templateUrl: './events-page.component.html',
  styleUrls: ['./events-page.component.scss'],
})
export class EventsPageComponent implements OnInit {
  private readonly eventsDataService = inject(EventsDataService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly events = signal<EventRecord[]>([]);
  readonly loading = signal(true);

  ngOnInit(): void {
    this.eventsDataService.getEvents().subscribe({
      next: (records) => {
        this.events.set(records);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  buildDescription(event: EventRecord): SafeHtml {
    const placeholders: Record<string, string | null> = {
      '[P1]': event.p1,
      '[P2]': event.p2,
      '[P3]': event.p3,
      '[P4]': event.p4,
      '[P5]': event.p5,
    };

    let html = event.description;
    for (const [token, url] of Object.entries(placeholders)) {
      if (url) {
        html = html.split(token).join(`<img src="${url}" class="event-content-img" alt="" />`);
      }
    }

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  isFuture(date: string): boolean {
    if (!date) return false;
    const MONTHS: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const parts = date.split('/');
    if (parts.length !== 3) return false;
    const [d, mon, y] = parts;
    const namedMonth = MONTHS[mon.toLowerCase()];
    let ts: number;
    if (namedMonth !== undefined) {
      ts = Date.UTC(+y, namedMonth, +d);
    } else {
      const numericMonth = parseInt(mon, 10);
      if (isNaN(numericMonth) || numericMonth < 1 || numericMonth > 12) return false;
      const fullYear = y.length === 2 ? 2000 + parseInt(y, 10) : +y;
      ts = Date.UTC(fullYear, numericMonth - 1, +d);
    }
    if (isNaN(ts)) return false;
    const today = new Date();
    return ts > Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  }
}
