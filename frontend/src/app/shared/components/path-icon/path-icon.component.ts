import { Component, computed, input, signal } from '@angular/core';
import { martialPathIcon, martialPathOption } from '../../../core/models/martial-path';

/**
 * One martial path as a small round icon. A path with no artwork (Wings, the mixes) or whose file
 * fails to load draws its initials, and a member with no path at all draws "-", so a row of two
 * always lines up whether or not both are known.
 */
@Component({
  selector: 'app-path-icon',
  standalone: true,
  template: `
    @if (src() && !failed()) {
      <img class="pi" [src]="src()" [alt]="label()" [title]="label()"
           [style.width.px]="size()" [style.height.px]="size()" (error)="failed.set(true)" />
    } @else {
      <span class="pi ph" [class.empty]="!slug()" [title]="label()"
            [style.width.px]="size()" [style.height.px]="size()"
            [style.font-size.px]="size() * 0.42">{{ text() }}</span>
    }
  `,
  styles: [`
    :host { display: inline-flex; flex: none; }
    .pi { display: block; border-radius: 50%; object-fit: contain; }
    .ph {
      display: inline-flex; align-items: center; justify-content: center;
      background: #e3e8ef; color: #4f6684; border: 1.5px solid rgba(79, 102, 132, 0.45);
      font-family: Inter, system-ui, sans-serif; font-weight: 700; line-height: 1;
      box-sizing: border-box; user-select: none;
    }
    .ph.empty { background: #f1f1ef; color: #9a9a94; border-style: dashed; border-color: #c4c4be; }
  `],
})
export class PathIconComponent {
  readonly slug = input<string | null | undefined>(null);
  readonly size = input(22);

  protected readonly failed = signal(false);

  protected readonly src = computed(() => martialPathIcon(this.slug()));
  protected readonly label = computed(() => martialPathOption(this.slug())?.label ?? 'Chưa có');
  protected readonly text = computed(() => {
    if (!this.slug()) return '-';
    return martialPathOption(this.slug())?.initials ?? '?';
  });
}
