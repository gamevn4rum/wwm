import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { apiUrl } from '../api';
import { UserRole } from './discord-auth.service';

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  label: string | null;
}

export interface CommanderMember {
  id: number;
  ign: string;
  discord: string | null;
  role: UserRole;
  canLogin: boolean;
  fp: boolean;
  ftp: boolean;
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
}
