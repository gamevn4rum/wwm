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
  enabled: boolean;
  lastSentUtc: string | null;
}

export interface ScheduleCreate {
  dayOfWeek: number;
  time: string;
  channelId: string;
  message: string;
  enabled: boolean;
}

export type SchedulePatch = Partial<ScheduleCreate>;

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
}
