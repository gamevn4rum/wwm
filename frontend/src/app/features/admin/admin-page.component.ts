import { Component, inject, signal } from '@angular/core';
import { BackofficeService, FeatureFlag } from '../../core/services/backoffice.service';

@Component({
  selector: 'app-admin-page',
  template: `
    <section class="backoffice">
      <h1>Feature flags</h1>
      <p class="hint">Turn a page or feature on/off. Disabling a page stops the
        server serving its data, not just hiding the link.</p>

      @if (loading()) {
        <p>Loading…</p>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      } @else {
        <table class="grid">
          <thead>
            <tr><th>Feature</th><th>Key</th><th>State</th><th></th></tr>
          </thead>
          <tbody>
            @for (flag of flags(); track flag.key) {
              <tr>
                <td>{{ flag.label || flag.key }}</td>
                <td class="mono">{{ flag.key }}</td>
                <td>
                  <span class="pill" [class.on]="flag.enabled" [class.off]="!flag.enabled">
                    {{ flag.enabled ? 'Enabled' : 'Disabled' }}
                  </span>
                </td>
                <td>
                  <button (click)="toggle(flag)" [disabled]="busy() === flag.key">
                    {{ flag.enabled ? 'Disable' : 'Enable' }}
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </section>
  `,
  styles: [`
    .backoffice { max-width: 860px; margin: 0 auto; padding: 1.5rem; }
    h1 { margin-bottom: .25rem; }
    .hint { opacity: .7; margin-bottom: 1rem; }
    .grid { width: 100%; border-collapse: collapse; }
    .grid th, .grid td { text-align: left; padding: .5rem .75rem; border-bottom: 1px solid rgba(128,128,128,.25); }
    .mono { font-family: monospace; opacity: .8; }
    .pill { padding: .1rem .5rem; border-radius: 999px; font-size: .8rem; }
    .pill.on { background: rgba(40,167,69,.2); color: #28a745; }
    .pill.off { background: rgba(220,53,69,.2); color: #dc3545; }
    button { padding: .35rem .8rem; cursor: pointer; }
    .error { color: #dc3545; }
  `],
})
export class AdminPageComponent {
  private readonly backoffice = inject(BackofficeService);

  readonly flags = signal<FeatureFlag[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly busy = signal<string | null>(null);

  ngOnInit(): void {
    this.backoffice.getFeatures().subscribe({
      next: (f) => { this.flags.set(f); this.loading.set(false); },
      error: () => { this.error.set('Failed to load feature flags.'); this.loading.set(false); },
    });
  }

  toggle(flag: FeatureFlag): void {
    this.busy.set(flag.key);
    this.backoffice.setFeature(flag.key, !flag.enabled).subscribe({
      next: (updated) => {
        this.flags.update((list) => list.map((f) => (f.key === updated.key ? updated : f)));
        this.busy.set(null);
      },
      error: () => this.busy.set(null),
    });
  }
}
