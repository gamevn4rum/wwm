import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { RegisterPopupService } from '../../../core/services/register-popup.service';
import { apiUrl } from '../../../core/api';

/**
 * The three seats somebody can play.
 *
 * This replaced the two weapon questions. What a member carries is read from the game now — the
 * live sweep knows their martial arts and gear, correctly and currently — so asking them to type it
 * once at registration only produced a second, staler answer. Which seat they want to fill is the
 * part the game cannot tell us, because it is a preference rather than a fact.
 *
 * ⚠ The values are the API's `CombatRole` ids, which are also the RSVP role menu's and the
 * tournament pools'. Same three words everywhere, so the answers line up without a mapping.
 */
const COMBAT_ROLES = [
  { value: 'tank', label: 'Tank' },
  { value: 'dps', label: 'DPS' },
  { value: 'healer', label: 'Healer' },
] as const;

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

  readonly combatRoles      = COMBAT_ROLES;
  readonly submitted        = signal(false);
  readonly submitting       = signal(false);
  readonly error            = signal<string | null>(null);

  readonly form = new FormGroup({
    // Required in both modes: the backend stores it on the Registration and the
    // Google Form now carries a matching field.
    discord:   new FormControl('', { validators: [Validators.required, Validators.minLength(2)], nonNullable: true }),
    uid:       new FormControl('', { validators: Validators.required, nonNullable: true }),
    ign:       new FormControl('', { validators: [Validators.required, Validators.minLength(2)], nonNullable: true }),
    mainRole:  new FormControl('', { validators: Validators.required, nonNullable: true }),
    // Optional: '' is "none", which is a real answer — some people play one seat only.
    subRole:   new FormControl('', { nonNullable: true }),
  });

  /** The sub role's choices: the main role is not offered again, since it would say nothing. */
  subRoles(): readonly { value: string; label: string }[] {
    const main = this.form.controls.mainRole.value;
    return this.combatRoles.filter((r) => r.value !== main);
  }

  constructor() {
    // Picking the sub role as the new main role leaves the sub pointing at an option that is no
    // longer listed, so it is cleared rather than submitted invisibly.
    this.form.controls.mainRole.valueChanges.subscribe((main) => {
      if (this.form.controls.subRole.value === main) this.form.controls.subRole.setValue('');
    });
  }

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

    try {
      // Creates a pending Registration for officers to review. The roster gate — the row
      // must still be unregistered and its IGN and UID must both match — is enforced by
      // the API against SQL, and describeError() below turns each of its codes into the
      // message the applicant sees. There is deliberately no client-side pre-check: it
      // would need UIDs, and the public roster withholds them precisely because the
      // IGN+UID pair is what the gate accepts as proof of identity.
      await firstValueFrom(this.http.post(apiUrl('/public/register'), {
        discord: v.discord,
        uid: v.uid,
        ign: v.ign,
        mainRole: v.mainRole,
        subRole: v.subRole,
      }));
      this.submitted.set(true);
    } catch (err: unknown) {
      this.error.set(this.describeError(err));
    } finally {
      this.submitting.set(false);
    }
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
      case 'invalid_combat_role':
        return 'Please pick a role from the list.';
      case 'field_too_long':
        return 'One of the fields is too long. Shorten it and try again.';
      default:
        return status === 409
          ? 'You already have a pending registration.'
          : 'Submission failed. Please try again.';
    }
  }
}
