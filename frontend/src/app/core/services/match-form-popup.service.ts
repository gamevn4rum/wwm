import { Injectable, computed, signal } from '@angular/core';
import { MatchRecord } from '../../features/match-history/match-record.model';

/**
 * Open state for the add/edit-match dialog, held here rather than in the page so the
 * dialog can be mounted once at the app root — the same arrangement FootagePopupService
 * and RegisterPopupService use. Body scroll locking lives here too, so a caller cannot
 * open the dialog and forget it.
 */
@Injectable({ providedIn: 'root' })
export class MatchFormPopupService {
  /** The match being edited, or null when the dialog is closed or creating a new one. */
  readonly editing = signal<MatchRecord | null>(null);

  private readonly visible = signal(false);

  readonly open = computed(() => this.visible());
  readonly mode = computed<'create' | 'edit'>(() => (this.editing() ? 'edit' : 'create'));

  openCreate(): void {
    this.editing.set(null);
    this.show();
  }

  openEdit(match: MatchRecord): void {
    this.editing.set(match);
    this.show();
  }

  close(): void {
    this.visible.set(false);
    this.editing.set(null);
    document.body.style.overflow = '';
  }

  private show(): void {
    this.visible.set(true);
    document.body.style.overflow = 'hidden';
  }
}
