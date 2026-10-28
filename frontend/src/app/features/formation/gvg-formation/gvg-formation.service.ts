import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { apiUrl } from '../../../core/api';
import {
  FORMATION_BOXES, FormationLayout, FormationPool, FormationTasks, SLOTS_PER_BOX, SavedFormation,
  SavedFormationDto, ShareChannel, TASK_OPTIONS, TaskId, emptyLayout,
} from './gvg-formation.models';

const CHANNEL_KEY = 'gv_gvg_share_channel';

/**
 * Talks to the API for the formation modal. The formation is saved on the server, one per match and
 * shared by every commander; only the last-used share channel stays in localStorage, guarded because
 * storage can be blocked or full.
 */
@Injectable({ providedIn: 'root' })
export class GvgFormationService {
  private readonly http = inject(HttpClient);

  /** `eventId` names the match to form for; without one the API picks the next one itself. */
  getPool(eventId?: string | null): Observable<FormationPool> {
    const query = eventId ? `?eventId=${encodeURIComponent(eventId)}` : '';
    return this.http.get<FormationPool>(apiUrl(`/commander/gvg/formation-pool${query}`));
  }

  getChannels(): Observable<ShareChannel[]> {
    return this.http.get<ShareChannel[]>(apiUrl('/commander/discord/channels'));
  }

  share(image: Blob, channelId: string, eventTitle: string): Observable<{ messageId: string | null }> {
    const body = new FormData();
    body.append('image', image, 'formation.png');
    body.append('channelId', channelId);
    body.append('eventTitle', eventTitle);
    return this.http.post<{ messageId: string | null }>(apiUrl('/commander/gvg/formation/share'), body);
  }

  /** The shared formation for a match, or null when nobody has saved one. When that match has none
   *  yet the API hands back the most recently saved of any match, flagged `inherited`. Anything the
   *  server sent that is not a valid slot or task is dropped rather than trusted. */
  async loadSaved(eventId: string | null): Promise<SavedFormation | null> {
    const query = eventId ? `?eventId=${encodeURIComponent(eventId)}` : '';
    const res = await firstValueFrom(
      this.http.get<{ formation: SavedFormationDto | null }>(apiUrl(`/commander/gvg/formation${query}`)),
    );
    const parsed = res.formation;
    if (!parsed?.boxes) return null;
    const layout = emptyLayout();
    for (const box of FORMATION_BOXES) {
      const slots = parsed.boxes[box.id];
      if (!Array.isArray(slots)) continue;
      for (let i = 0; i < SLOTS_PER_BOX; i++) {
        const key = slots[i];
        layout[box.id][i] = typeof key === 'string' && key ? key : null;
      }
    }
    const tasks: FormationTasks = {};
    for (const [key, task] of Object.entries(parsed.tasks ?? {})) {
      if (TASK_OPTIONS.some((t) => t.id === task)) tasks[key] = task as TaskId;
    }
    return { layout, tasks, savedBy: parsed.savedBy, savedAtUtc: parsed.savedAtUtc, inherited: !!parsed.inherited };
  }

  /** Overwrites the shared formation of this match (`null` = the no-event, whole-roster one). */
  saveFormation(eventId: string | null, layout: FormationLayout, tasks: FormationTasks): Promise<unknown> {
    return firstValueFrom(
      this.http.put(apiUrl('/commander/gvg/formation'), { eventId: eventId ?? '', boxes: layout, tasks }),
    );
  }

  loadChannelId(): string | null {
    try { return localStorage.getItem(CHANNEL_KEY); } catch { return null; }
  }

  saveChannelId(id: string): void {
    try { localStorage.setItem(CHANNEL_KEY, id); } catch { /* a convenience only */ }
  }
}
