import { Component } from '@angular/core';
import { SchedulesPageComponent } from './schedules-page.component';
import { ScheduledEventsPageComponent } from './scheduled-events-page.component';

/**
 * Admin "Bot schedule" hub: the two things the bot posts on a timer — plain scheduled messages,
 * and recurring RSVP events — each in its own collapsible panel, so one nav entry covers both.
 * The panels are the existing standalone components, embedded rather than routed to.
 */
@Component({
  selector: 'app-bot-schedule-page',
  standalone: true,
  imports: [SchedulesPageComponent, ScheduledEventsPageComponent],
  template: `
    <section class="wrap">
      <h1>Bot schedule</h1>
      <p class="intro">Everything the bot posts on a timer. Times are Vietnam (UTC+7).</p>

      <details class="panel" open>
        <summary>
          <span class="name">Scheduled messages</span>
          <span class="tag">plain text</span>
        </summary>
        <div class="body"><app-schedules-page /></div>
      </details>

      <details class="panel">
        <summary>
          <span class="name">Scheduled events</span>
          <span class="tag">recurring /gvg</span>
        </summary>
        <div class="body"><app-scheduled-events-page /></div>
      </details>
    </section>
  `,
  styles: [`
    .wrap { max-width: 1040px; margin: 0 auto; padding: 1.5rem; }
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
export class BotSchedulePageComponent {}
