import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { RegisterPopupService } from '../../../core/services/register-popup.service';
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

  readonly weaponsMain      = WEAPONS_MAIN;
  readonly weaponsSecondary = WEAPONS_SECONDARY;
  readonly availability     = AVAILABILITY;
  readonly submitted        = signal(false);
  readonly submitting       = signal(false);
  readonly error            = signal<string | null>(null);
  // The Discord field only exists in backend mode (the Google Form has no entry
  // for it), so it's only required there.
  readonly useBackend       = environment.useBackend;

  readonly form = new FormGroup({
    discord:   new FormControl('', { validators: environment.useBackend ? [Validators.required, Validators.minLength(2)] : [], nonNullable: true }),
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
        // Static mode: post to the Google Form (no Discord entry there).
        const body = new URLSearchParams({
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
      const status = (err as { status?: number })?.status;
      this.error.set(status === 409
        ? 'You already have a pending registration.'
        : 'Submission failed. Please try again.');
    } finally {
      this.submitting.set(false);
    }
  }
}
