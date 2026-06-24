import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RegisterPopupService } from '../../../core/services/register-popup.service';

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

  readonly weaponsMain      = WEAPONS_MAIN;
  readonly weaponsSecondary = WEAPONS_SECONDARY;
  readonly availability     = AVAILABILITY;
  readonly submitted        = signal(false);
  readonly submitting       = signal(false);

  readonly form = new FormGroup({
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
    const v = this.form.getRawValue();

    try {
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
    } catch {
      // Swallow — no-cors requests always throw on response reading, not on send.
    }

    this.submitting.set(false);
    this.submitted.set(true);
  }
}
