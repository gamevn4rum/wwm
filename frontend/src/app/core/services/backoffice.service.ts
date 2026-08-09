import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { apiUrl } from '../api';
import { UserRole } from './discord-auth.service';
import { MatchRecord } from '../../features/match-history/match-record.model';

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  label: string | null;
}

export interface CommanderMember {
  id: number;
  ign: string;
  /** Numeric in-game UID — the stable identity the sheet sync keys on. */
  uid: string | null;
  /** Opaque wwmdb pId, used by the stats sync. Officer-only. */
  pid: string | null;
  discord: string | null;
  role: UserRole;
  canLogin: boolean;
  fp: boolean;
  ftp: boolean;
  /** Derived: has a Discord handle. False = "Unregistered". */
  registered: boolean;
}

export interface MemberPatch {
  canLogin?: boolean;
  fp?: boolean;
  ftp?: boolean;
  role?: UserRole;
}

export interface Registration {
  id: number;
  discord: string;
  uid: string | null;
  ign: string;
  mainWeapon: string | null;
  secondaryWeapon: string | null;
  saturday: string | null;
  sunday: string | null;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected';
  submittedUtc: string;
  reviewedBy: string | null;
  reviewedUtc: string | null;
  reviewNote: string | null;
  memberId: number | null;
}

export interface RegistrationApprove {
  canLogin?: boolean;
  fp?: boolean;
  ftp?: boolean;
  role?: UserRole;
}

/** A recurring weekly message the bot posts to a Discord channel. Times are Vietnam
 *  local (UTC+7); dayOfWeek is Sunday=0 … Saturday=6. */
export interface ScheduledMessage {
  id: number;
  dayOfWeek: number;
  /** "HH:mm", Vietnam time. */
  time: string;
  channelId: string;
  message: string;
  /** Role id called out on its own line above the message. Null pings nobody. It counts
   *  against the same 2000-character limit as the text. */
  mentionRoleId: string | null;
  enabled: boolean;
  lastSentUtc: string | null;
}

export interface ScheduleCreate {
  dayOfWeek: number;
  time: string;
  channelId: string;
  message: string;
  /** Empty or null both mean "ping nobody" — a message has no per-type default to fall back to. */
  mentionRoleId: string | null;
  enabled: boolean;
}

export type SchedulePatch = Partial<ScheduleCreate>;

/** The kind of RSVP event a scheduled template posts. */
export type ScheduledEventType = 'GvG' | 'GvE' | 'Event';

/** A recurring RSVP-event template — a scheduled `/gvg`. Every time is "HH:mm" Vietnam local
 *  (UTC+7); dayOfWeek is Sunday=0 … Saturday=6, -1 for every day, or -2 for on demand (posted only
 *  by the "Post now" button, never the timer). `startTime` is resolved to the first such time at or
 *  after the post — which is what lets an on-demand template have one at all — and `closeTime` to
 *  the occurrence at or before the start (null = at start). */
export interface ScheduledEvent {
  id: number;
  dayOfWeek: number;
  /** When the form is posted. Meaningless on an on-demand template. */
  time: string;
  eventType: ScheduledEventType;
  title: string;
  channelId: string;
  notes: string;
  capacity: number | null;
  /** Null only on a template last saved before clock times existed. */
  startTime: string | null;
  closeTime: string | null;
  /** Which role this template's post calls out, overriding the event type's own role
   *  ({@link EventPingRole}). Null uses that default; empty pings nobody. */
  mentionRoleId: string | null;
  enabled: boolean;
  lastFiredUtc: string | null;
}

export interface ScheduledEventCreate {
  dayOfWeek: number;
  time: string;
  eventType: ScheduledEventType;
  title: string;
  channelId: string;
  notes: string;
  capacity: number | null;
  startTime: string;
  /** Empty or null closes RSVPs at the start. */
  closeTime: string | null;
  /** Null uses the event type's own role; empty pings nobody; a role id overrides both. */
  mentionRoleId: string | null;
  enabled: boolean;
}

/**
 * On a patch, null means "leave this field alone" — so it is not how a template goes back to
 * using its event type's role. {@link USE_TYPE_DEFAULT_ROLE} is.
 */
export type ScheduledEventPatch = Partial<ScheduledEventCreate>;

/**
 * The `mentionRoleId` a patch sends to drop a template's override and put it back on whatever its
 * event type pings. A role id is all digits, so this word can't be mistaken for one.
 */
export const USE_TYPE_DEFAULT_ROLE = 'default';

/** The role one event type's posts call out, when the template doesn't override it. */
export interface EventPingRole {
  eventType: ScheduledEventType;
  /** Null or empty means posts of this type ping nobody — a real setting, not an unset one. */
  roleId: string | null;
  updatedBy: string | null;
  updatedUtc: string | null;
}

/** Choices for the match editor, resolved server-side in one call. */
export interface MatchOptions {
  /** Every opponent guild on record, for the dropdown. */
  opponents: string[];
  /** Selectable season numbers (2–10). */
  seasons: number[];
  /** Highest season currently in the DB, clamped into `seasons`. */
  defaultSeason: number;
  /** Distinct uploaders already on record, for the footage attribution dropdown. */
  uploaders: string[];
}

export type MatchResult = 'win' | 'loss' | 'draw';

export interface MatchCreate {
  /** ISO date, `yyyy-MM-dd`. */
  date: string;
  opponent: string;
  type: 'league' | 'ranked' | 'scrim';
  /** Omitted/null for a match with no agreed result yet. */
  result?: MatchResult | null;
  season: number;
}

/** Every field optional: null/absent leaves it alone. The one exception is `result`,
 * where an empty string clears a result back to undecided. */
export type MatchPatch = Partial<Omit<MatchCreate, 'result'>> & { result?: MatchResult | '' };

/** Back-office API (Admin/Commander). The auth interceptor attaches the JWT;
 * the server re-checks role/escalation on every call. */
@Injectable({ providedIn: 'root' })
export class BackofficeService {
  private readonly http = inject(HttpClient);

  getFeatures(): Observable<FeatureFlag[]> {
    return this.http.get<FeatureFlag[]>(apiUrl('/admin/features'));
  }

  setFeature(key: string, enabled: boolean): Observable<FeatureFlag> {
    return this.http.patch<FeatureFlag>(apiUrl(`/admin/features/${key}`), { enabled });
  }

  getMembers(): Observable<CommanderMember[]> {
    return this.http.get<CommanderMember[]>(apiUrl('/commander/members'));
  }

  patchMember(id: number, patch: MemberPatch): Observable<CommanderMember> {
    return this.http.patch<CommanderMember>(apiUrl(`/commander/members/${id}`), patch);
  }

  getRegistrations(status?: string): Observable<Registration[]> {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.http.get<Registration[]>(apiUrl(`/commander/registrations${q}`));
  }

  approveRegistration(id: number, body: RegistrationApprove): Observable<Registration> {
    return this.http.post<Registration>(apiUrl(`/commander/registrations/${id}/approve`), body);
  }

  rejectRegistration(id: number, note?: string): Observable<Registration> {
    return this.http.post<Registration>(apiUrl(`/commander/registrations/${id}/reject`), { note });
  }

  getMatchOptions(): Observable<MatchOptions> {
    return this.http.get<MatchOptions>(apiUrl('/commander/matches/options'));
  }

  createMatch(body: MatchCreate): Observable<MatchRecord> {
    return this.http.post<MatchRecord>(apiUrl('/commander/matches'), body);
  }

  patchMatch(id: number, patch: MatchPatch): Observable<MatchRecord> {
    return this.http.patch<MatchRecord>(apiUrl(`/commander/matches/${id}`), patch);
  }

  addFootage(matchId: number, body: { uploader: string; youtubeLink: string }): Observable<MatchRecord> {
    return this.http.post<MatchRecord>(apiUrl(`/commander/matches/${matchId}/footage`), body);
  }

  /** Hard-delete a match and its footage. */
  deleteMatch(id: number): Observable<{ deleted: number; footagesRemoved: number }> {
    return this.http.delete<{ deleted: number; footagesRemoved: number }>(apiUrl(`/commander/matches/${id}`));
  }

  // ── Scheduled messages (Admin) ────────────────────────────────────────────
  getSchedules(): Observable<ScheduledMessage[]> {
    return this.http.get<ScheduledMessage[]>(apiUrl('/admin/schedules'));
  }

  createSchedule(body: ScheduleCreate): Observable<ScheduledMessage> {
    return this.http.post<ScheduledMessage>(apiUrl('/admin/schedules'), body);
  }

  patchSchedule(id: number, patch: SchedulePatch): Observable<ScheduledMessage> {
    return this.http.patch<ScheduledMessage>(apiUrl(`/admin/schedules/${id}`), patch);
  }

  deleteSchedule(id: number): Observable<{ deleted: number }> {
    return this.http.delete<{ deleted: number }>(apiUrl(`/admin/schedules/${id}`));
  }

  /** Post a schedule's message to its channel right now (test). Resolves with the outcome —
   *  `ok:false` carries the exact Discord failure (permission/channel) for display. */
  sendScheduleNow(id: number): Observable<{ ok: boolean; status?: number; error?: string }> {
    return this.http.post<{ ok: boolean; status?: number; error?: string }>(
      apiUrl(`/admin/schedules/${id}/send-now`), {});
  }

  // ── Scheduled events (Admin) — a recurring /gvg ───────────────────────────
  getScheduledEvents(): Observable<ScheduledEvent[]> {
    return this.http.get<ScheduledEvent[]>(apiUrl('/admin/scheduled-events'));
  }

  createScheduledEvent(body: ScheduledEventCreate): Observable<ScheduledEvent> {
    return this.http.post<ScheduledEvent>(apiUrl('/admin/scheduled-events'), body);
  }

  patchScheduledEvent(id: number, patch: ScheduledEventPatch): Observable<ScheduledEvent> {
    return this.http.patch<ScheduledEvent>(apiUrl(`/admin/scheduled-events/${id}`), patch);
  }

  deleteScheduledEvent(id: number): Observable<{ deleted: number }> {
    return this.http.delete<{ deleted: number }>(apiUrl(`/admin/scheduled-events/${id}`));
  }

  /** Create + post this template's event to Discord immediately (a live test — it makes a real
   *  event, but doesn't affect the timer's next run). `ok:false` carries the Discord failure. */
  postScheduledEventNow(id: number): Observable<{ ok: boolean; slug?: string; status?: number; error?: string }> {
    return this.http.post<{ ok: boolean; slug?: string; status?: number; error?: string }>(
      apiUrl(`/admin/scheduled-events/${id}/post-now`), {});
  }

  // ── Event ping roles (Admin) ──────────────────────────────────────────────
  /** Always answers with a row per event type, configured or not. */
  getPingRoles(): Observable<EventPingRole[]> {
    return this.http.get<EventPingRole[]>(apiUrl('/admin/ping-roles'));
  }

  /** A PUT, not a patch: there is one field, and clearing it is a real setting ("ping nobody")
   *  rather than "leave it alone". */
  setPingRole(eventType: ScheduledEventType, roleId: string | null): Observable<EventPingRole> {
    return this.http.put<EventPingRole>(
      apiUrl(`/admin/ping-roles/${eventType}`), { roleId });
  }
}
