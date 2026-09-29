import { Component, inject } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HonorRollComponent } from './components/honor-roll/honor-roll.component';
import { extractYouTubeVideoId } from '../../core/utils/youtube.utils';

/** The video at the top of the homepage — any YouTube link or bare id. Empty hides it. */
const HOME_VIDEO = 'https://www.youtube.com/watch?v=qUI7MmyGVnE';

/**
 * The homepage: the guild's video, then the honors our members hold this week.
 *
 * The honors replace the leaderboard placements that stood here: the board sweep that fed those
 * read `wwmdb.vlt.fyi`, which is NXDOMAIN, so they had been frozen at their last good read.
 */
@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [HonorRollComponent],
  templateUrl: './home-page.component.html',
  styleUrls: ['./home-page.component.scss'],
})
export class HomePageComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly videoSrc: SafeResourceUrl | null = this.embed(extractYouTubeVideoId(HOME_VIDEO));

  private embed(id: string): SafeResourceUrl | null {
    if (!id) return null;

    // ⚠ `mute=1` is not optional: browsers only autoplay a muted video, so the music starts when
    // the viewer unmutes it in the player. `playlist=<id>` is what makes `loop` work on a single
    // video. A viewer who asked for reduced motion gets the player without autoplay.
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const params = new URLSearchParams({
      autoplay: reduced ? '0' : '1',
      mute: '1',
      loop: '1',
      playlist: id,
      playsinline: '1',
      rel: '0',
    });
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.youtube-nocookie.com/embed/${id}?${params}`);
  }
}
