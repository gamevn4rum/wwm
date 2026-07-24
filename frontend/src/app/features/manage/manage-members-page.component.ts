import { Component, inject, signal } from '@angular/core';
import { BackofficeService, CommanderMember, MemberPatch } from '../../core/services/backoffice.service';
import { UserRole } from '../../core/services/discord-auth.service';

@Component({
  selector: 'app-manage-members-page',
  template: `
    <section class="backoffice">
      <h1>Member permissions</h1>
      <p class="hint">Edit login, formation (fp), footage (ftp) and role. Changes
        are audited server-side. Role changes are policy-bounded.</p>

      @if (loading()) {
        <p>Loading…</p>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else {
        <table class="grid">
          <thead>
            <tr><th>IGN</th><th>Discord</th><th>Role</th><th>Login</th><th>FP</th><th>FTP</th></tr>
          </thead>
          <tbody>
            @for (m of members(); track m.id) {
              <tr [class.saving]="busy() === m.id">
                <td>{{ m.ign }}</td>
                <td class="mono">{{ m.discord || '—' }}</td>
                <td>
                  <select [value]="m.role" (change)="patch(m, { role: roleOf($event) })">
                    <option value="Warrior">Warrior</option>
                    <option value="Commander">Commander</option>
                    <option value="Admin">Admin</option>
                  </select>
                </td>
                <td><input type="checkbox" [checked]="m.canLogin" (change)="patch(m, { canLogin: checkedOf($event) })" /></td>
                <td><input type="checkbox" [checked]="m.fp" (change)="patch(m, { fp: checkedOf($event) })" /></td>
                <td><input type="checkbox" [checked]="m.ftp" (change)="patch(m, { ftp: checkedOf($event) })" /></td>
              </tr>
            }
          </tbody>
        </table>
        @if (notice()) { <p class="notice">{{ notice() }}</p> }
      }
    </section>
  `,
  styles: [`
    .backoffice { max-width: 900px; margin: 0 auto; padding: 1.5rem; }
    h1 { margin-bottom: .25rem; }
    .hint { opacity: .7; margin-bottom: 1rem; }
    .grid { width: 100%; border-collapse: collapse; }
    .grid th, .grid td { text-align: left; padding: .45rem .6rem; border-bottom: 1px solid rgba(128,128,128,.25); }
    .mono { font-family: monospace; opacity: .8; }
    tr.saving { opacity: .5; }
    .error { color: #dc3545; }
    .notice { margin-top: .75rem; opacity: .8; }
  `],
})
export class ManageMembersPageComponent {
  private readonly backoffice = inject(BackofficeService);

  readonly members = signal<CommanderMember[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly busy = signal<number | null>(null);
  readonly notice = signal<string | null>(null);

  ngOnInit(): void {
    this.backoffice.getMembers().subscribe({
      next: (m) => { this.members.set(m); this.loading.set(false); },
      error: () => { this.error.set('Failed to load members.'); this.loading.set(false); },
    });
  }

  roleOf(event: Event): UserRole {
    return (event.target as HTMLSelectElement).value as UserRole;
  }
  checkedOf(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  patch(member: CommanderMember, patch: MemberPatch): void {
    this.busy.set(member.id);
    this.notice.set(null);
    this.backoffice.patchMember(member.id, patch).subscribe({
      next: (updated) => {
        this.members.update((list) => list.map((m) => (m.id === updated.id ? updated : m)));
        this.busy.set(null);
      },
      error: (err) => {
        this.busy.set(null);
        // Re-load to revert the optimistic control state on a rejected change.
        this.notice.set(err?.status === 403
          ? 'Not permitted (role-grant policy).'
          : 'Update failed.');
        this.ngOnInit();
      },
    });
  }
}
