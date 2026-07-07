import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { EventsDataService } from '../../../events/events-data.service';
import { EventRecord } from '../../../events/event-record.model';

const PAGE_SIZE = 2;

@Component({
  selector: 'app-events-list',
  standalone: true,
  imports: [],
  templateUrl: './events-list.component.html',
  styleUrls: ['./events-list.component.scss'],
})
export class EventsListComponent implements OnInit, OnDestroy {
  private readonly eventsDataService = inject(EventsDataService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly events = signal<EventRecord[]>([]);
  readonly loading = signal(true);
  readonly visibleCount = signal(PAGE_SIZE);
  readonly lightboxSrc = signal<string | null>(null);

  readonly visibleEvents = computed(() => this.events().slice(0, this.visibleCount()));
  readonly hasMore = computed(() => this.visibleCount() < this.events().length);

  ngOnInit(): void {
    this.eventsDataService.getEvents().subscribe({
      next: (records) => {
        this.events.set(records);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
  }

  showMore(): void {
    this.visibleCount.update((count) => count + PAGE_SIZE);
  }

  openLightbox(src: string | null | undefined): void {
    if (!src) return;
    this.lightboxSrc.set(src);
    document.body.style.overflow = 'hidden';
  }

  closeLightbox(): void {
    this.lightboxSrc.set(null);
    document.body.style.overflow = '';
  }

  /** Event delegation — the description HTML is trusted/injected via innerHTML,
   * so inline images can't take an Angular (click) binding directly. */
  onContentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.tagName === 'IMG' && target.classList.contains('event-content-img')) {
      this.openLightbox((target as HTMLImageElement).src);
    }
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
