import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { YOUTUBE_PLAYER_CONFIG, YouTubePlayer } from '@angular/youtube-player';
import { FootageRecord } from '../footages.model';
import { formatIsoDate } from '../../../core/utils/date.utils';

@Component({
  selector: 'app-footage-video-card',
  standalone: true,
  imports: [YouTubePlayer],
  // Provided here, the only place a player is drawn, rather than app-wide: an import in app.config
  // kept the whole player package in the initial bundle.
  providers: [{ provide: YOUTUBE_PLAYER_CONFIG, useValue: { disableCookies: true } }],
  templateUrl: './footage-video-card.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
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
