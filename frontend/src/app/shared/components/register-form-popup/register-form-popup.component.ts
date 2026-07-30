import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { RegisterPopupService } from '../../../core/services/register-popup.service';
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
        mainWeapon: v.main,
        secondaryWeapon: v.secondary,
        saturday: v.saturday,
        sunday: v.sunday,
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
      case 'field_too_long':
        return 'One of the fields is too long. Shorten it and try again.';
      default:
        return status === 409
          ? 'You already have a pending registration.'
          : 'Submission failed. Please try again.';
    }
  }
}
