import { Component, forwardRef, inject, input, signal } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { DiscordDirectoryService } from '../../core/services/discord-directory.service';

const CHANNEL_ICON: Record<string, string> = {
  text: '#',
  announcement: '📢',
  voice: '🔊',
};

/**
 * A dropdown of Discord channels or roles, bound to a form control that still holds the **id**.
 *
 * The value never changes shape: every form here has always stored a snowflake and the API has
 * always taken one, so this is a nicer way to choose the same string. That is what makes the paste
 * fallback honest rather than a workaround — the typed id and the picked one are the same value,
 * and switching between the two modes cannot lose what is already selected.
 *
 * The fallback is not optional garnish. The list is a cache refreshed nightly, so a channel made an
 * hour ago is not in it, and without a way to type an id the panel would be *less* capable than the
 * text box it replaced. It also carries the case where the directory has never synced at all.
 */
@Component({
  selector: 'app-discord-picker',
  standalone: true,
  imports: [FormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DiscordPickerComponent),
      multi: true,
    },
  ],
  template: `
    @if (typing() || directory.empty()) {
      <span class="picker">
        <input
          type="text"
          class="id-input"
          inputmode="numeric"
          [placeholder]="placeholder()"
          [disabled]="disabled()"
          [ngModel]="value()"
          (ngModelChange)="write($event)" />
        @if (!directory.empty()) {
          <button type="button" class="link" (click)="typing.set(false)">choose from list</button>
        }
      </span>
    } @else {
      <span class="picker">
        <select
          [disabled]="disabled()"
          [ngModel]="value()"
          (ngModelChange)="write($event)">
          <option value="">{{ blankLabel() }}</option>

          @if (kind() === 'channel') {
            @for (c of directory.channels(); track c.id) {
              <option [value]="c.id">{{ icon(c.type) }} {{ c.name }}</option>
            }
          } @else {
            @for (r of directory.roles(); track r.id) {
              <option [value]="r.id">{{ r.name }}{{ r.mentionable ? '' : ' (not mentionable)' }}</option>
            }
          }

          <!-- An id that is set but not in the cache — a channel deleted since the last sync, or one
               made since. It has to stay selectable, or simply opening the form would silently
               rewrite somebody's schedule to a different channel on the next save. -->
          @if (unknown()) {
            <option [value]="value()">{{ value() }} (not in the list)</option>
          }
        </select>
        <button type="button" class="link" (click)="typing.set(true)">paste an ID</button>
      </span>
    }
  `,
  styles: [`
    .picker { display: inline-flex; gap: .4rem; align-items: center; flex-wrap: wrap; width: 100%; }
    select, .id-input { padding: .45rem .6rem; border: 1px solid rgba(128,128,128,.4);
      border-radius: 6px; font: inherit; flex: 1; min-width: 12rem; }
    .id-input { font-family: monospace; }
    .link { background: none; border: none; padding: 0; font-size: .72rem; cursor: pointer;
      opacity: .7; text-decoration: underline; color: inherit; }
    .link:hover { opacity: 1; }
  `],
})
export class DiscordPickerComponent implements ControlValueAccessor {
  protected readonly directory = inject(DiscordDirectoryService);

  readonly kind = input.required<'channel' | 'role'>();
  readonly placeholder = input('e.g. 123456789012345678');
  readonly blankLabel = input('— none —');

  protected readonly value = signal('');
  protected readonly disabled = signal(false);
  protected readonly typing = signal(false);

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    this.directory.load().subscribe();
  }

  /** Whether the current id is absent from the cached list, which decides if the "not in the list"
   *  option has to be rendered to keep it selectable. */
  protected unknown(): boolean {
    const current = this.value();
    if (!current) return false;
    const list = this.kind() === 'channel' ? this.directory.channels() : this.directory.roles();
    return !list.some((item) => item.id === current);
  }

  protected icon(type: string): string {
    return CHANNEL_ICON[type] ?? '#';
  }

  protected write(next: string): void {
    this.value.set(next ?? '');
    this.onChange(this.value());
    this.onTouched();
  }

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
