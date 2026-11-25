import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ScheduledEventsPageComponent } from './scheduled-events-page.component';
import { PingRolesPanelComponent } from './ping-roles-panel.component';
import { ScoutWatchPanelComponent } from './scout-watch-panel.component';

/**
 * "Bot management" hub: recurring RSVP events the bot posts on a timer, the role each event type
 * pings, and the Scout list (the guilds the GvG panel's Scout button reports on). Each is an
 * existing standalone component in its own collapsible panel.
 */
@Component({
  selector: 'app-bot-schedule-page',
  standalone: true,
  imports: [
    ScheduledEventsPageComponent,
    PingRolesPanelComponent,
    ScoutWatchPanelComponent,
  ],
  template: `
    <section class="wrap">
      <h1>Bot management</h1>
      <p class="intro">
        The RSVP events the bot posts on a timer, who they ping, and what it watches. Times are
        Vietnam (UTC+7).
      </p>

      <details class="panel" open>
        <summary>
          <span class="name">Scheduled events</span>
          <span class="tag">recurring /gvg</span>
        </summary>
        <div class="body"><app-scheduled-events-page /></div>
      </details>

      <details class="panel">
        <summary>
          <span class="name">Event ping roles</span>
          <span class="tag">who gets mentioned</span>
        </summary>
        <div class="body"><app-ping-roles-panel /></div>
      </details>

      <details class="panel">
        <summary>
          <span class="name">Scout list</span>
          <span class="tag">GvG panel · up to 20 guilds</span>
        </summary>
        <div class="body"><app-scout-watch-panel /></div>
      </details>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      .wrap {
        max-width: 1040px;
        margin: 0 auto;
        padding: 1.5rem;
      }
      @media (max-width: 600px) {
        .wrap {
          padding: 1rem 0.5rem;
        }
        .body {
          padding: 0 0.5rem 0.75rem !important;
        }
        summary {
          padding: 0.7rem 0.75rem !important;
        }
      }
      h1 {
        margin-bottom: 0.25rem;
      }
      .intro {
        opacity: 0.7;
        margin-bottom: 1.25rem;
      }
      .panel {
        border: 1px solid rgba(128, 128, 128, 0.3);
        border-radius: 8px;
        margin-bottom: 1rem;
        overflow: hidden;
      }
      summary {
        list-style: none;
        cursor: pointer;
        user-select: none;
        display: flex;
        align-items: center;
        gap: 0.6rem;
        padding: 0.8rem 1rem;
        font-weight: 700;
        font-size: 1.05rem;
        background: rgba(128, 128, 128, 0.08);
      }
      summary::-webkit-details-marker {
        display: none;
      }
      /* Rotating disclosure caret, so the panel state is obvious. */
      summary::before {
        content: '▸';
        display: inline-block;
        transition: transform 0.15s ease;
        opacity: 0.7;
        font-size: 0.9rem;
      }
      details[open] > summary::before {
        transform: rotate(90deg);
      }
      summary:hover {
        background: rgba(128, 128, 128, 0.14);
      }
      .tag {
        font-weight: 500;
        font-size: 0.74rem;
        opacity: 0.6;
      }
      .body {
        padding: 0 1rem 1rem;
      }
    `,
  ],
})
export class BotSchedulePageComponent {}
