import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { apiUrl } from '../../../core/api';
import {
  FORMATION_BOXES, FormationLayout, FormationPool, FormationTasks, SLOTS_PER_BOX, SavedFormation,
  ShareChannel, TASK_OPTIONS, TaskId, emptyLayout,
} from './gvg-formation.models';

const LAYOUT_KEY = 'gv_gvg_formation_v1';
const CHANNEL_KEY = 'gv_gvg_share_channel';

/**
 * Talks to the API for the formation modal and keeps its one rolling save in localStorage. The save
 * is per browser by design — no database — so every read and write is guarded: storage can be
 * blocked or full, and the modal has to work without it.
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

  /** The saved layout and its tasks, or null when there is none or it cannot be read. A save
   *  written before tasks existed has none, and reads back with an empty map rather than failing. */
  loadSaved(): SavedFormation | null {
    try {
      const raw = localStorage.getItem(LAYOUT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as {
        v?: number;
        boxes?: Record<string, unknown>;
        tasks?: Record<string, unknown>;
      };
      if (parsed?.v !== 1 || !parsed.boxes) return null;
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
      return { layout, tasks };
    } catch {
      return null;
    }
  }

  saveFormation(layout: FormationLayout, tasks: FormationTasks): boolean {
    try {
      localStorage.setItem(
        LAYOUT_KEY,
        JSON.stringify({ v: 1, savedAt: new Date().toISOString(), boxes: layout, tasks }),
      );
      return true;
    } catch {
      return false;
    }
  }

  loadChannelId(): string | null {
    try { return localStorage.getItem(CHANNEL_KEY); } catch { return null; }
  }

  saveChannelId(id: string): void {
    try { localStorage.setItem(CHANNEL_KEY, id); } catch { /* a convenience only */ }
  }
}
