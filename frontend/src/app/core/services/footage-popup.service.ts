import { Injectable, computed, signal } from '@angular/core';
import { MatchRecord } from '../../features/match-history/match-record.model';
import { FootageRecord, MatchType } from '../../features/footages/footages.model';

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const mon = MONTH_ABBR[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day}/${mon}/${year}`;
}

function toDisplayMatchType(type: MatchRecord['type']): MatchType {
  return (type.charAt(0).toUpperCase() + type.slice(1)) as MatchType;
}

@Injectable({ providedIn: 'root' })
export class FootagePopupService {
  readonly popupMatch = signal<MatchRecord | null>(null);

  readonly popupOpen = computed(() => this.popupMatch() !== null);

  readonly popupHeader = computed(() => {
    const match = this.popupMatch();
    if (!match) return '';
    return `${toDisplayMatchType(match.type)} - ${match.opponent} - ${formatDate(match.date)}`;
  });

  readonly popupFootages = computed<FootageRecord[]>(() => {
    const match = this.popupMatch();
    if (!match) return [];
    return match.footages.map((footage) => ({
      date: match.date,
      matchType: toDisplayMatchType(match.type),
      opponent: match.opponent,
      uploader: footage.uploader,
      videoId: footage.videoId,
      season: match.season,
    }));
  });

  open(match: MatchRecord): void {
    this.popupMatch.set(match);
    document.body.style.overflow = 'hidden';
  }

  close(): void {
    this.popupMatch.set(null);
    document.body.style.overflow = '';
  }
}
