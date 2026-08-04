import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { map } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';
import {
  BackofficeService,
  MatchOptions,
  MatchResult,
} from '../../../../core/services/backoffice.service';
import { DiscordAuthService } from '../../../../core/services/discord-auth.service';
import { MatchFormPopupService } from '../../../../core/services/match-form-popup.service';
import { MatchHistoryDataService } from '../../match-history-data.service';
import { FootageEntry, MatchStatus, MatchType } from '../../match-record.model';
import { extractYouTubeVideoId } from '../../../../core/utils/youtube.utils';

const RESULT_OF_STATUS: Record<MatchStatus, MatchResult | ''> = {
  '✅': 'win',
  '❌': 'loss',
  '➕': 'draw',
  '': '',
};

/** Local yyyy-MM-dd for today. Not toISOString() — that's UTC and can land a day off. */
function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

@Component({
  selector: 'app-match-form-popup',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './match-form-popup.component.html',
  styleUrls: ['./match-form-popup.component.scss'],
})
export class MatchFormPopupComponent {
  private readonly popup = inject(MatchFormPopupService);
  private readonly backoffice = inject(BackofficeService);
  private readonly matchData = inject(MatchHistoryDataService);
  private readonly auth = inject(DiscordAuthService);

  readonly mode = this.popup.mode;
  readonly editing = this.popup.editing;

  /** Footage management is a footage-permission action — the section only shows with ftp. */
  readonly ftpPermission = toSignal(
    this.auth.currentUser$.pipe(map((user) => user?.ftp ?? false)),
    { initialValue: false },
  );

  /** The logged-in user's roster IGN — the default uploader when they add a clip, on the
   *  assumption you're most often filing your own footage. IGN, not Discord username:
   *  every stored uploader is an IGN (bot + historical), and the session already resolved
   *  the Discord identity to an IGN at login, so keeping this an IGN is what keeps
   *  attribution consistent. Blank when the session has no IGN (e.g. the dev bypass). */
  private readonly currentUploaderIgn = signal('');

  readonly loadingOptions = signal(true);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  readonly allOpponents = signal<string[]>([]);
  readonly seasons = signal<number[]>([]);
  readonly uploaders = signal<string[]>([]);

  // ── Opponent combobox state ──────────────────────────────────────────────
  readonly opponentQuery = signal('');
  readonly opponentListOpen = signal(false);

  readonly filteredOpponents = computed(() => {
    const q = this.opponentQuery().trim();
    const all = this.allOpponents();
    if (q.length === 0) return all;
    // A digit can't type a CJK/Hangul/symbol name, so typing a number is the affordance
    // to surface exactly those un-typeable guilds (names not starting with a Latin letter).
    if (/^\d+$/.test(q)) return all.filter((name) => !/^[A-Za-z]/.test(name));
    const lower = q.toLowerCase();
    return all.filter((name) => name.toLowerCase().includes(lower));
  });

  // ── Footage state (edit mode) ────────────────────────────────────────────
  readonly footages = signal<FootageEntry[]>([]);
  readonly footageError = signal<string | null>(null);
  readonly addingFootage = signal(false);
  /** A footage add persists immediately, so the list needs refreshing even if the user
   *  closes without pressing Save. */
  private changed = false;

  readonly footageForm = new FormGroup({
    uploader: new FormControl('', { validators: Validators.required, nonNullable: true }),
    youtubeLink: new FormControl('', { validators: Validators.required, nonNullable: true }),
  });

  /** Live value of the link field, for the duplicate check as you type. */
  private readonly linkValue = toSignal(this.footageForm.controls.youtubeLink.valueChanges, {
    initialValue: '',
  });

  /**
   * The already-attached clip matching what's typed, or null. Same video-id compare the
   * server dedupes on, run client-side so a duplicate is flagged (and the Add button
   * disabled) before a request goes out — youtube.com/watch?v=X and youtu.be/X match.
   */
  readonly duplicateFootage = computed<FootageEntry | null>(() => {
    const id = extractYouTubeVideoId(this.linkValue() ?? '');
    if (!id) return null;
    return this.footages().find((f) => f.videoId === id) ?? null;
  });

  readonly types: MatchType[] = ['league', 'ranked', 'scrim'];
  readonly results: { value: MatchResult | ''; label: string }[] = [
    { value: '', label: 'Not decided yet' },
    { value: 'win', label: 'Win' },
    { value: 'loss', label: 'Loss' },
    { value: 'draw', label: 'Draw' },
  ];

  readonly form = new FormGroup({
    date: new FormControl('', { validators: Validators.required, nonNullable: true }),
    opponent: new FormControl('', {
      validators: [Validators.required, Validators.maxLength(100)],
      nonNullable: true,
    }),
    type: new FormControl<MatchType | ''>('', { validators: Validators.required, nonNullable: true }),
    result: new FormControl<MatchResult | ''>('', { nonNullable: true }),
    season: new FormControl<number | null>(null, { validators: Validators.required }),
  });

  constructor() {
    this.loadOptions();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    // The suggestion list swallows Escape first; only then does Escape close the modal.
    if (this.opponentListOpen()) {
      this.opponentListOpen.set(false);
      return;
    }
    if (!this.submitting()) this.close();
  }

  close(): void {
    if (this.changed) this.matchData.reload();
    this.popup.close();
  }

  private async loadOptions(): Promise<void> {
    let options: MatchOptions;
    try {
      options = await firstValueFrom(this.backoffice.getMatchOptions());
    } catch {
      this.error.set('Could not load opponents and seasons. Close and try again.');
      this.loadingOptions.set(false);
      return;
    }

    const match = this.editing();
    const opponents = [...options.opponents];
    const seasons = [...options.seasons];

    if (match) {
      // An opponent or season outside the offered set still has to be representable, or
      // just opening the dialog would silently relabel the match on save — season 1
      // predates the 2–10 range, and an opponent can be renamed out from under an old row.
      if (match.opponent && !opponents.includes(match.opponent)) opponents.unshift(match.opponent);
      const current = Number(match.season);
      if (Number.isFinite(current) && !seasons.includes(current)) seasons.unshift(current);
      seasons.sort((a, b) => a - b);
      this.footages.set([...match.footages]);
    }

    // currentUser$ is a BehaviorSubject, so this resolves with the current session at once.
    const me = (await firstValueFrom(this.auth.currentUser$))?.ign?.trim() ?? '';
    this.currentUploaderIgn.set(me);
    // Make sure the current user is a selectable option even if they've never uploaded
    // before, and pin them first so "you" is the default.
    const uploaders = [...options.uploaders];
    if (me && !uploaders.includes(me)) uploaders.unshift(me);

    this.allOpponents.set(opponents);
    this.seasons.set(seasons);
    this.uploaders.set(uploaders);
    this.footageForm.controls.uploader.setValue(me);
    this.loadingOptions.set(false);

    this.form.patchValue(
      match
        ? {
            date: match.date,
            opponent: match.opponent,
            type: match.type,
            result: RESULT_OF_STATUS[match.status] ?? '',
            season: Number(match.season) || options.defaultSeason,
          }
        : { date: todayIso(), season: options.defaultSeason },
    );
    this.opponentQuery.set(this.form.controls.opponent.value);
  }

  // ── Opponent combobox handlers ─────────────────────────────────────────────
  onOpponentInput(value: string): void {
    this.form.controls.opponent.setValue(value);
    this.opponentQuery.set(value);
    this.opponentListOpen.set(true);
  }

  openOpponentList(): void {
    this.opponentQuery.set(this.form.controls.opponent.value);
    this.opponentListOpen.set(true);
  }

  chooseOpponent(name: string): void {
    this.form.controls.opponent.setValue(name);
    this.opponentQuery.set(name);
    this.opponentListOpen.set(false);
  }

  /** "+ Add new opponent" — keep whatever's typed and just close the list. */
  keepTypedOpponent(): void {
    this.opponentListOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.opponentListOpen()) return;
    const target = event.target as HTMLElement;
    if (!target.closest('.mf-combo')) this.opponentListOpen.set(false);
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.error.set(null);

    const v = this.form.getRawValue();
    const body = {
      date: v.date,
      opponent: v.opponent.trim(),
      type: v.type as Exclude<MatchType, ''>,
      result: v.result,
      season: v.season!,
    };

    try {
      const editing = this.editing();
      await firstValueFrom(
        editing
          ? this.backoffice.patchMatch(editing.id, body)
          : this.backoffice.createMatch({ ...body, result: body.result || null }),
      );
      this.matchData.reload();
      this.popup.close();
    } catch (err: unknown) {
      this.error.set(this.describeError(err));
    } finally {
      this.submitting.set(false);
    }
  }

  // ── Footage ────────────────────────────────────────────────────────────────
  async addFootage(): Promise<void> {
    const editing = this.editing();
    if (!editing || this.footageForm.invalid || this.duplicateFootage()) {
      this.footageForm.markAllAsTouched();
      return;
    }
    this.addingFootage.set(true);
    this.footageError.set(null);
    const { uploader, youtubeLink } = this.footageForm.getRawValue();
    try {
      const updated = await firstValueFrom(
        this.backoffice.addFootage(editing.id, { uploader, youtubeLink: youtubeLink.trim() }),
      );
      this.footages.set([...updated.footages]);
      // Keep the current user as the default for the next clip, not a blank.
      this.footageForm.reset({ uploader: this.currentUploaderIgn(), youtubeLink: '' });
      this.changed = true;
    } catch (err: unknown) {
      this.footageError.set(this.describeFootageError(err));
    } finally {
      this.addingFootage.set(false);
    }
  }

  private describeError(err: unknown): string {
    const status = (err as { status?: number })?.status;
    const code = (err as { error?: { error?: string } })?.error?.error;
    switch (code) {
      case 'duplicate_match':
        return 'A match against this opponent on this date, of this type, already exists.';
      case 'invalid_type':
        return 'Pick a valid match type.';
      case 'invalid_result':
        return 'Pick a valid result.';
      case 'invalid_season':
        return 'Season must be between 2 and 10.';
      case 'opponent_required':
        return 'An opponent is required.';
      case 'field_too_long':
        return 'That opponent name is too long (100 characters max).';
      default:
        if (status === 403) return 'You do not have permission to edit matches.';
        if (status === 404) return 'That match no longer exists — it may have been removed.';
        return 'Saving failed. Please try again.';
    }
  }

  private describeFootageError(err: unknown): string {
    const code = (err as { error?: { error?: string } })?.error?.error;
    switch (code) {
      case 'already_added':
        return 'That clip is already on this match.';
      case 'invalid_link':
        return 'That doesn’t look like a YouTube link.';
      case 'link_required':
        return 'A YouTube link is required.';
      case 'uploader_required':
        return 'Pick an uploader.';
      case 'not_authorized':
        return 'You need footage permission to add clips.';
      default:
        return 'Could not add the clip. Please try again.';
    }
  }
}
