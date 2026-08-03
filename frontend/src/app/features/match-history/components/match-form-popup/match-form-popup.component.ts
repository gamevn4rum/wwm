import { Component, HostListener, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  BackofficeService,
  MatchOptions,
  MatchResult,
} from '../../../../core/services/backoffice.service';
import { MatchFormPopupService } from '../../../../core/services/match-form-popup.service';
import { MatchHistoryDataService } from '../../match-history-data.service';
import { MatchStatus, MatchType } from '../../match-record.model';

/** Sentinel option value that swaps the opponent dropdown for a free-text box. */
const NEW_OPPONENT = '__new__';

const RESULT_OF_STATUS: Record<MatchStatus, MatchResult | ''> = {
  '✅': 'win',
  '❌': 'loss',
  '➕': 'draw',
  '': '',
};

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

  readonly newOpponentValue = NEW_OPPONENT;

  readonly mode = this.popup.mode;
  readonly editing = this.popup.editing;

  readonly loadingOptions = signal(true);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  readonly opponents = signal<string[]>([]);
  readonly seasons = signal<number[]>([]);

  readonly types: MatchType[] = ['league', 'ranked', 'scrim'];
  readonly results: { value: MatchResult | ''; label: string }[] = [
    { value: '', label: 'Not decided yet' },
    { value: 'win', label: 'Win' },
    { value: 'loss', label: 'Loss' },
    { value: 'draw', label: 'Draw' },
  ];

  readonly form = new FormGroup({
    date: new FormControl('', { validators: Validators.required, nonNullable: true }),
    opponent: new FormControl('', { validators: Validators.required, nonNullable: true }),
    newOpponent: new FormControl('', { nonNullable: true }),
    type: new FormControl<MatchType | ''>('', { validators: Validators.required, nonNullable: true }),
    result: new FormControl<MatchResult | ''>('', { nonNullable: true }),
    season: new FormControl<number | null>(null, { validators: Validators.required }),
  });

  constructor() {
    this.loadOptions();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.submitting()) this.close();
  }

  close(): void {
    this.popup.close();
  }

  get addingNewOpponent(): boolean {
    return this.form.controls.opponent.value === NEW_OPPONENT;
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
      // An opponent or season that isn't offered still has to be representable, or simply
      // opening the dialog would silently relabel the match on save — season 1 predates
      // the 2–10 range, and an opponent can be renamed out from under an old row.
      if (match.opponent && !opponents.includes(match.opponent)) opponents.unshift(match.opponent);
      const current = Number(match.season);
      if (Number.isFinite(current) && !seasons.includes(current)) seasons.unshift(current);
      seasons.sort((a, b) => a - b);
    }

    this.opponents.set(opponents);
    this.seasons.set(seasons);
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
        : { season: options.defaultSeason },
    );
  }

  async onSubmit(): Promise<void> {
    const opponent = this.resolvedOpponent();
    if (this.form.invalid || !opponent) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.error.set(null);

    const v = this.form.getRawValue();
    const body = {
      date: v.date,
      opponent,
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
      // The list is a shared cached stream, so a reload also refreshes the footages page.
      this.matchData.reload();
      this.close();
    } catch (err: unknown) {
      this.error.set(this.describeError(err));
    } finally {
      this.submitting.set(false);
    }
  }

  /** The dropdown value, or what was typed when "new opponent" is selected. */
  private resolvedOpponent(): string {
    const { opponent, newOpponent } = this.form.getRawValue();
    return (opponent === NEW_OPPONENT ? newOpponent : opponent).trim();
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
}
