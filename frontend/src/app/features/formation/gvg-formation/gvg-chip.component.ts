import { Component, input } from '@angular/core';
import { martialPathOption } from '../../../core/models/martial-path';
import { PathIconComponent } from '../../../shared/components/path-icon/path-icon.component';
import { PoolMember } from './gvg-formation.models';

const ROLE_LABEL: Record<string, string> = { tank: 'Tank', dps: 'DPS', healer: 'Healer' };
const TEAM_LABEL: Record<string, string> = { attack: 'Công', defense: 'Thủ', flex: 'Flex' };

/** A member as a chip: their main and sub martial path icons, then the name, with the team as a
 *  quiet hint. A path they have not got draws a "-" placeholder so the names stay aligned. */
@Component({
  selector: 'app-gvg-chip',
  standalone: true,
  imports: [PathIconComponent],
  template: `
    <span class="chip" [class.off]="!member().onRoster" [class.compact]="compact()" [title]="tooltip()">
      <span class="paths">
        <app-path-icon [slug]="member().mainPath" [size]="20" />
        <app-path-icon [slug]="member().subPath" [size]="20" />
      </span>
      <span class="name">{{ member().name }}</span>
      @if (!compact() && member().team) {
        <span class="team">{{ teamLabel(member().team) }}</span>
      }
    </span>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .chip {
      display: flex; align-items: center; gap: 6px; min-width: 0;
      padding: 4px 10px 4px 5px; border-radius: 999px;
      background: #fff; border: 1.5px solid rgba(79, 102, 132, 0.35);
      font: 600 0.82rem/1.2 Inter, system-ui, sans-serif; color: #2f3b4c;
      user-select: none; white-space: nowrap;
    }
    .chip.off { background: #f1f1ef; border-style: dashed; color: #6b6b66; }
    .paths { display: inline-flex; gap: 3px; flex: none; }
    .name { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .team { flex: none; font-size: 0.62rem; font-weight: 500; color: #8a8f96; letter-spacing: 0.02em; }

    /* Phones: three boxes side by side leave a chip ~100px, so a boxed chip is two rows — the
       icons on top, the name under them — instead of one that would crush the name. */
    @media (max-width: 640px) {
      .chip.compact {
        flex-direction: column; align-items: flex-start; gap: 2px;
        padding: 4px 7px; border-radius: 12px; width: 100%; box-sizing: border-box;
        font-size: 0.76rem;
      }
      .chip.compact .name { max-width: 100%; }
    }
  `],
})
export class GvgChipComponent {
  readonly member = input.required<PoolMember>();
  /** Inside a box: the team hint is noise there, and on a phone the chip takes two rows. */
  readonly compact = input(false);

  teamLabel(team: string | null): string { return team ? (TEAM_LABEL[team] ?? '') : ''; }

  tooltip(): string {
    const m = this.member();
    const parts = [m.name];
    if (m.mainPath) parts.push(`Main path: ${martialPathOption(m.mainPath)?.label ?? m.mainPath}`);
    if (m.subPath) parts.push(`Sub path: ${martialPathOption(m.subPath)?.label ?? m.subPath}`);
    if (m.mainRole) parts.push(`Role: ${ROLE_LABEL[m.mainRole] ?? m.mainRole}`);
    if (m.team) parts.push(`Team: ${TEAM_LABEL[m.team] ?? m.team}`);
    if (!m.onRoster) parts.push('Không có trong roster');
    return parts.join(' · ');
  }
}
