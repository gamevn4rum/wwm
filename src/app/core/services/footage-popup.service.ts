import { Injectable, computed, inject, signal } from '@angular/core';
import { FootagesDataService } from '../../features/footages/footages-data.service';
import { FootageRecord, toIsoDate } from '../../features/footages/footages.model';
import { MatchRecord } from '../../features/match-history/match-record.model';

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const mon = MONTH_ABBR[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day}/${mon}/${year}`;
}

@Injectable({ providedIn: 'root' })
export class FootagePopupService {
  private readonly footagesDataService = inject(FootagesDataService);

  readonly allFootages     = signal<FootageRecord[]>([]);
  readonly footagesLoading = signal(true);
  readonly popupMatch      = signal<MatchRecord | null>(null);

  readonly popupOpen = computed(() => this.popupMatch() !== null);

  readonly popupHeader = computed(() => {
    const match = this.popupMatch();
    if (!match) return '';
    const type = match.type.charAt(0).toUpperCase() + match.type.slice(1);
    return `${type} - ${match.opponent} - ${formatDate(match.date)}`;
  });

  readonly popupFootages = computed(() => {
    const match = this.popupMatch();
    if (!match) return [];
    const isoDate = match.date;
    return this.allFootages().filter(
      (f) => toIsoDate(f.date) === isoDate && f.opponent === match.opponent
    );
  });

  loadFootages(): void {
    if (!this.footagesLoading() && this.allFootages().length > 0) return;
    this.footagesDataService.getFootages().subscribe({
      next: (footages) => {
        this.allFootages.set(footages);
        this.footagesLoading.set(false);
      },
      error: () => this.footagesLoading.set(false),
    });
  }

  open(match: MatchRecord): void {
    this.popupMatch.set(match);
    document.body.style.overflow = 'hidden';
  }

  close(): void {
    this.popupMatch.set(null);
    document.body.style.overflow = '';
  }
}
