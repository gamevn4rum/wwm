import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { RegisterPopupService } from '../../../core/services/register-popup.service';
import { MembersDataService } from '../../../core/services/members-data.service';
import { findVal, ignMatches, isRegisteredRow, normalizeUid } from '../../../core/utils/sheet.utils';
import { environment } from '../../../../environments/environment';
import { apiUrl } from '../../../core/api';

const WEAPONS_MAIN = [
  'Nameless Sword', 'Nameless Spear', 'Infernal Twinblades', 'Heavenquaker Spear',
  'Strategic Sword', 'Mortal Rope Dart', 'Snowparting Blade', 'Inkwell Fan',
  'Vernal Umbrella', 'Unfettered Rope Dart', 'Thundercry Blade', 'Stormbreaker Spear',
  'Phalanxbane Blade', 'Panacea Fan', 'Soulshade Umbrella', 'Everspring Umbrella',
] as const;

const WEAPONS_SECONDARY = [
  ...WEAPONS_MAIN,
  'Mixed: PF/IF', 'Mixed: SS/IF', 'Mixed: TwB/IF', 'Mixed: TB/PB',
] as const;

const AVAILABILITY = ['7h30+', '8h30+', '9h30+', '🚫'] as const;

// ── Google Form submission ─────────────────────────────────────────────────────
// To find entry IDs: open the Google Form, right-click → View Page Source,
// then search for "entry." to locate each field's entry ID.
const FORM_ID         = '1FAIpQLSd6Yy9XG3ctcA76MXiL7FAMxBAjfnrMX6aflpcon4dnVTqgng';
const ENTRY_DISCORD = 'entry.495718859';
const ENTRY_UID = 'entry.1358790419';
const ENTRY_IGN = 'entry.1196526175';
const ENTRY_MAIN = 'entry.1309785826';
const ENTRY_SECONDARY = 'entry.1132106276';
const ENTRY_SATURDAY = 'entry.150224146';
const ENTRY_SUNDAY = 'entry.184418147';

@Component({
  selector: 'app-register-form-popup',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './register-form-popup.component.html',
  styleUrls: ['./register-form-popup.component.scss'],
})
export class RegisterFormPopupComponent {
  private readonly popupService = inject(RegisterPopupService);
  private readonly http = inject(HttpClient);
  private readonly membersData = inject(MembersDataService);

  readonly weaponsMain      = WEAPONS_MAIN;
  readonly weaponsSecondary = WEAPONS_SECONDARY;
  readonly availability     = AVAILABILITY;
  readonly submitted        = signal(false);
  readonly submitting       = signal(false);
  readonly error            = signal<string | null>(null);

  readonly form = new FormGroup({
    // Required in both modes: the backend stores it on the Registration and the
    // Google Form now carries a matching field.
    discord:   new FormControl('', { validators: [Validators.required, Validators.minLength(2)], nonNullable: true }),
    uid:       new FormControl('', { validators: Validators.required, nonNullable: true }),
    ign:       new FormControl('', { validators: [Validators.required, Validators.minLength(2)], nonNullable: true }),
    main:      new FormControl('', { validators: Validators.required, nonNullable: true }),
    secondary: new FormControl('', { validators: Validators.required, nonNullable: true }),
    saturday:  new FormControl('', { validators: Validators.required, nonNullable: true }),
    sunday:    new FormControl('', { validators: Validators.required, nonNullable: true }),
  });

  close(): void {
    this.popupService.hide();
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();

    // Roster gate: you can only claim a Members-sheet row that is still
    // Unregistered (no Discord) and whose IGN + UID both match. Checked here so the
    // applicant gets a useful message instead of a silent officer-side rejection;
    // in backend mode the API enforces the same rule authoritatively.
    const rosterError = await this.checkRoster(v.ign, v.uid);
    if (rosterError) {
      this.error.set(rosterError);
      this.submitting.set(false);
      return;
    }

    try {
      if (environment.useBackend) {
        // Backend mode: creates a pending Registration for officers to review.
        await firstValueFrom(this.http.post(apiUrl('/public/register'), {
          discord: v.discord,
          uid: v.uid,
          ign: v.ign,
          mainWeapon: v.main,
          secondaryWeapon: v.secondary,
          saturday: v.saturday,
          sunday: v.sunday,
        }));
      } else {
        // Static mode: post to the Google Form. Officers transcribe the response
        // row onto the Members sheet, where Discord is the login key.
        const body = new URLSearchParams({
          [ENTRY_DISCORD]:   v.discord,
          [ENTRY_UID]:       v.uid,
          [ENTRY_IGN]:       v.ign,
          [ENTRY_MAIN]:      v.main,
          [ENTRY_SECONDARY]: v.secondary,
          [ENTRY_SATURDAY]:  v.saturday,
          [ENTRY_SUNDAY]:    v.sunday,
        });
        // mode: 'no-cors' — CORS error is expected; the POST still reaches Google.
        await fetch(
          `https://docs.google.com/forms/d/e/${FORM_ID}/formResponse`,
          { method: 'POST', body, mode: 'no-cors' }
        );
      }
      this.submitted.set(true);
    } catch (err: unknown) {
      this.error.set(this.describeError(err));
    } finally {
      this.submitting.set(false);
    }
  }

  /**
   * Validate IGN + UID against the roster. Returns an error message, or null to
   * proceed. Fails *open* when the roster can't be read or carries no UIDs.
   *
   * In **static mode that is the normal case**: `UID`/`PID` are deliberately not
   * exported to `data/` (fetch-data.js OMITTED_COLUMNS), because published data is
   * readable by anyone and the IGN+UID pair is what the gate accepts as proof of
   * identity — shipping it would let a visitor claim any unregistered row. So this
   * check only really bites in backend mode, where the API enforces the same rule
   * authoritatively against SQL. Static submissions stay officer-reviewed.
   */
  private async checkRoster(ign: string, uid: string): Promise<string | null> {
    let rows;
    try {
      rows = await firstValueFrom(this.membersData.getRows());
    } catch {
      return null;
    }
    const withUid = rows.filter((r) => findVal(r, 'uid') !== '');
    if (withUid.length === 0) return null;

    const wanted = normalizeUid(uid);
    const row = withUid.find((r) => normalizeUid(findVal(r, 'uid')) === wanted);
    if (!row) {
      return 'That UID isn’t on the GameVN roster yet. Ask an officer to add you first.';
    }
    if (!ignMatches(findVal(row, 'ign'), ign)) {
      // Deliberately doesn't echo back the IGN that UID belongs to.
      return 'That IGN and UID don’t match the same roster entry. Check both and try again.';
    }
    if (isRegisteredRow(row)) {
      return 'That member is already registered. Contact an officer if this isn’t you.';
    }
    return null;
  }

  private describeError(err: unknown): string {
    const status = (err as { status?: number })?.status;
    const code = (err as { error?: { error?: string } })?.error?.error;
    switch (code) {
      case 'not_on_roster':
        return 'That UID isn’t on the GameVN roster yet. Ask an officer to add you first.';
      case 'ign_uid_mismatch':
        return 'That IGN and UID don’t match the same roster entry. Check both and try again.';
      case 'already_registered':
        return 'That member is already registered. Contact an officer if this isn’t you.';
      case 'uid_already_pending':
        return 'A registration for that UID is already awaiting review.';
      case 'already_pending':
        return 'You already have a pending registration.';
      case 'uid_required':
        return 'Your in-game UID is required.';
      case 'discord_and_ign_required':
        return 'Your Discord username and in-game name are both required.';
      case 'field_too_long':
        return 'One of the fields is too long. Shorten it and try again.';
      default:
        return status === 409
          ? 'You already have a pending registration.'
          : 'Submission failed. Please try again.';
    }
  }
}
