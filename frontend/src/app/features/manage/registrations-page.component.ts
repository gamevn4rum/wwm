import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { BackofficeService, Registration, RegistrationApprove } from '../../core/services/backoffice.service';

@Component({
  selector: 'app-registrations-page',
  imports: [DatePipe],
  template: `
    <section class="backoffice">
      <h1>Registration requests</h1>
      <p class="hint">Review each request, then grant access. Approving creates or
        updates the member and lets them log in immediately (audited).</p>

      @if (loading()) {
        <p>Loading…</p>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else if (pending().length === 0) {
        <p>No pending requests.</p>
      } @else {
        @for (r of pending(); track r.id) {
          <article class="card" [class.busy]="busy() === r.id">
            <header>
              <strong>{{ r.ign }}</strong>
              <span class="mono">{{ r.discord }}</span>
              <span class="when">{{ r.submittedUtc | date:'medium' }}</span>
            </header>
            <dl class="fields">
              <div><dt>UID</dt><dd>{{ r.uid || '—' }}</dd></div>
              <div><dt>Main</dt><dd>{{ r.mainWeapon || '—' }}</dd></div>
              <div><dt>Secondary</dt><dd>{{ r.secondaryWeapon || '—' }}</dd></div>
              <div><dt>Saturday</dt><dd>{{ r.saturday || '—' }}</dd></div>
              <div><dt>Sunday</dt><dd>{{ r.sunday || '—' }}</dd></div>
              @if (r.note) { <div><dt>Note</dt><dd>{{ r.note }}</dd></div> }
            </dl>
            <footer class="grant">
              <label><input type="checkbox" [checked]="grant(r.id).canLogin" (change)="set(r.id, 'canLogin', $event)" /> Can log in</label>
              <label><input type="checkbox" [checked]="grant(r.id).fp" (change)="set(r.id, 'fp', $event)" /> Formation</label>
              <label><input type="checkbox" [checked]="grant(r.id).ftp" (change)="set(r.id, 'ftp', $event)" /> Footage</label>
              <button class="approve" (click)="approve(r)" [disabled]="busy() === r.id">Approve</button>
              <button class="reject" (click)="reject(r)" [disabled]="busy() === r.id">Reject</button>
            </footer>
          </article>
        }
      }
      @if (notice()) { <p class="notice">{{ notice() }}</p> }
    </section>
  `,
  styles: [`
    .backoffice { max-width: 820px; margin: 0 auto; padding: 1.5rem; }
    h1 { margin-bottom: .25rem; }
    .hint { opacity: .7; margin-bottom: 1rem; }
    .card { border: 1px solid rgba(128,128,128,.3); border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
    .card.busy { opacity: .5; }
    .card header { display: flex; gap: .75rem; align-items: baseline; flex-wrap: wrap; }
    .card header .when { margin-left: auto; opacity: .6; font-size: .85rem; }
    .mono { font-family: monospace; opacity: .8; }
    .fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: .4rem 1rem; margin: .75rem 0; }
    .fields dt { font-size: .75rem; opacity: .6; text-transform: uppercase; }
    .fields dd { margin: 0; }
    .grant { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; border-top: 1px solid rgba(128,128,128,.2); padding-top: .75rem; }
    .grant label { display: inline-flex; gap: .35rem; align-items: center; }
    .approve, .reject { padding: .35rem .9rem; cursor: pointer; }
    .approve { margin-left: auto; }
    .error { color: #dc3545; }
    .notice { opacity: .8; }
  `],
})
export class RegistrationsPageComponent {
  private readonly backoffice = inject(BackofficeService);

  readonly pending = signal<Registration[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly busy = signal<number | null>(null);
  readonly notice = signal<string | null>(null);

  private readonly grants = signal<Record<number, RegistrationApprove & { canLogin: boolean; fp: boolean; ftp: boolean }>>({});

  ngOnInit(): void {
    this.backoffice.getRegistrations('pending').subscribe({
      next: (list) => {
        this.pending.set(list);
        const defaults: Record<number, RegistrationApprove & { canLogin: boolean; fp: boolean; ftp: boolean }> = {};
        for (const r of list) defaults[r.id] = { canLogin: true, fp: false, ftp: false };
        this.grants.set(defaults);
        this.loading.set(false);
      },
      error: () => { this.error.set('Failed to load registrations.'); this.loading.set(false); },
    });
  }

  grant(id: number) {
    return this.grants()[id] ?? { canLogin: true, fp: false, ftp: false };
  }

  set(id: number, key: 'canLogin' | 'fp' | 'ftp', event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.grants.update((g) => ({ ...g, [id]: { ...this.grant(id), [key]: checked } }));
  }

  approve(reg: Registration): void {
    this.busy.set(reg.id);
    this.notice.set(null);
    this.backoffice.approveRegistration(reg.id, this.grant(reg.id)).subscribe({
      next: () => { this.remove(reg.id); this.notice.set(`Approved ${reg.ign}.`); this.busy.set(null); },
      error: (err) => {
        this.busy.set(null);
        this.notice.set(err?.status === 403 ? 'Not permitted (role-grant policy).' : 'Approve failed.');
      },
    });
  }

  reject(reg: Registration): void {
    const note = window.prompt(`Reject ${reg.ign}? Optional reason:`) ?? undefined;
    this.busy.set(reg.id);
    this.notice.set(null);
    this.backoffice.rejectRegistration(reg.id, note).subscribe({
      next: () => { this.remove(reg.id); this.notice.set(`Rejected ${reg.ign}.`); this.busy.set(null); },
      error: () => { this.busy.set(null); this.notice.set('Reject failed.'); },
    });
  }

  private remove(id: number): void {
    this.pending.update((list) => list.filter((r) => r.id !== id));
  }
}
