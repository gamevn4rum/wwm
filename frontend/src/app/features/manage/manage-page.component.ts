import { Component } from '@angular/core';
import { ManageMembersPageComponent } from './manage-members-page.component';
import { GuildsPanelComponent } from './guilds-panel.component';

/**
 * The Manage hub: the two rosters an officer maintains — our own members, and the opponent guilds
 * we play — each in its own collapsible panel, so one nav entry covers both.
 *
 * They share a page rather than a nav entry each because they are the same job seen from two sides:
 * who we field, and who we face. Members is open by default because it is the one opened daily;
 * Guilds is a task you go looking for, usually right after a match against somebody new.
 *
 * The panels are the standalone components themselves, embedded rather than routed to — the same
 * arrangement Bot schedule uses. Each keeps its own loading and error state, so a failure in one
 * leaves the other usable.
 */
@Component({
  selector: 'app-manage-page',
  standalone: true,
  imports: [ManageMembersPageComponent, GuildsPanelComponent],
  template: `
    <section class="wrap">
      <h1>Manage</h1>
      <p class="intro">The guild's rosters — ours, and everyone we play.</p>

      <details class="panel" open>
        <summary>
          <span class="name">Members</span>
          <span class="tag">permissions &amp; roster details</span>
        </summary>
        <div class="body"><app-manage-members-page /></div>
      </details>

      <details class="panel">
        <summary>
          <span class="name">Guilds</span>
          <span class="tag">opponent UIDs &amp; scouting</span>
        </summary>
        <div class="body"><app-guilds-panel /></div>
      </details>
    </section>
  `,
  styles: [`
    /* Wider than Bot schedule's hub: the members table carries thirteen columns, and squeezing it
       to that page's 1040px put every select on two lines. */
    .wrap { max-width: 1400px; margin: 0 auto; padding: 1.5rem; }
    h1 { margin-bottom: .25rem; }
    .intro { opacity: .7; margin-bottom: 1.25rem; }
    .panel { border: 1px solid rgba(128,128,128,.3); border-radius: 8px; margin-bottom: 1rem; overflow: hidden; }
    summary {
      list-style: none; cursor: pointer; user-select: none;
      display: flex; align-items: center; gap: .6rem;
      padding: .8rem 1rem; font-weight: 700; font-size: 1.05rem;
      background: rgba(128,128,128,.08);
    }
    summary::-webkit-details-marker { display: none; }
    /* Rotating disclosure caret, so the panel state is obvious. */
    summary::before {
      content: '▸'; display: inline-block; transition: transform .15s ease; opacity: .7; font-size: .9rem;
    }
    details[open] > summary::before { transform: rotate(90deg); }
    summary:hover { background: rgba(128,128,128,.14); }
    .tag { font-weight: 500; font-size: .74rem; opacity: .6; }
    .body { padding: 0 1rem 1rem; }
  `],
})
export class ManagePageComponent {}
