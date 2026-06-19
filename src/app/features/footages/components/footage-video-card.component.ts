import { Component, input } from '@angular/core';
import { YouTubePlayer } from '@angular/youtube-player';
import { FootageRecord } from '../footages.model';

@Component({
  selector: 'app-footage-video-card',
  standalone: true,
  imports: [YouTubePlayer],
  templateUrl: './footage-video-card.component.html',
  styleUrls: ['./footage-video-card.component.scss'],
})
export class FootageVideoCardComponent {
  readonly footage = input.required<FootageRecord>();
  readonly eager = input(false);

  get matchTypeClass(): string {
    return `match-type-${this.footage().matchType.toLowerCase()}`;
  }

  get displayDate(): string {
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const raw = this.footage().date;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    const day = String(d.getUTCDate()).padStart(2, '0');
    const mon = MONTHS[d.getUTCMonth()];
    const year = d.getUTCFullYear();
    return `${day}/${mon}/${year}`;
  }
}
