import { Component } from '@angular/core';

/**
 * Deliberately empty.
 *
 * Events moved to the Guild Events page (`/schedule`), and the leaderboard placements that
 * stood here after them are gone: the board sweep that fed them reads `wwmdb.vlt.fyi`,
 * which is NXDOMAIN, so the Hall of Fame had been frozen at its last good read rather than
 * showing anything current. The weekly honours are the intended replacement — they have a
 * live source — and this page waits for them rather than showing stale placements.
 */
@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [],
  templateUrl: './home-page.component.html',
  styleUrls: ['./home-page.component.scss'],
})
export class HomePageComponent {}
