import { Component, input } from '@angular/core';
import { YouTubePlayer } from '@angular/youtube-player';
import { FootageRecord } from '../footages.model';
import { formatIsoDate } from '../../../core/utils/date.utils';

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
    return formatIsoDate(this.footage().date);
  }
}
