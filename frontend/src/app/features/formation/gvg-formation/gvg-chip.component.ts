import { Component, input } from '@angular/core';
import { PoolMember } from './gvg-formation.models';

const ROLE_LETTER: Record<string, string> = { tank: '🛡️', dps: '⚔️', healer: '⛑️' };
const ROLE_LABEL: Record<string, string> = { tank: 'Tank', dps: 'DPS', healer: 'Healer' };
const TEAM_LABEL: Record<string, string> = { attack: 'Công', defense: 'Thủ', flex: 'Flex' };

/** A member as a chip: combat-role badge, name, and the sub role and team as quiet hints. */
@Component({
  selector: 'app-gvg-chip',
  standalone: true,
  template: `
    <span class="chip" [class.off]="!member().onRoster" [title]="tooltip()">
      <span class="role" [class]="'role r-' + (member().mainRole ?? 'none')">{{ letter(member().mainRole) }}</span>
      <span class="name">{{ member().name }}</span>
      @if (member().subRole) {
        <span class="sub" [class]="'sub r-' + member().subRole">{{ letter(member().subRole) }}</span>
      }
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
    .role {
      flex: none; width: 20px; height: 20px; border-radius: 50%;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 0.8rem; line-height: 1; color: #9aa3ad; background: #eef1f5;
    }
    .role.r-tank { background: rgba(79, 102, 132, 0.18); }
    .role.r-dps { background: rgba(192, 80, 47, 0.18); }
    .role.r-healer { background: rgba(95, 119, 87, 0.2); }
    .name { overflow: hidden; text-overflow: ellipsis; }
    .sub {
      flex: none; font-size: 0.68rem; line-height: 1; opacity: 0.75;
    }
    .team { flex: none; font-size: 0.62rem; font-weight: 500; color: #8a8f96; letter-spacing: 0.02em; }
  `],
})
export class GvgChipComponent {
  readonly member = input.required<PoolMember>();
  /** Inside a box: the team hint is noise there. */
  readonly compact = input(false);

  letter(role: string | null): string { return role ? (ROLE_LETTER[role] ?? '?') : '–'; }
  teamLabel(team: string | null): string { return team ? (TEAM_LABEL[team] ?? '') : ''; }

  tooltip(): string {
    const m = this.member();
    const parts = [m.name];
    if (m.mainRole) parts.push(`Main: ${ROLE_LABEL[m.mainRole] ?? m.mainRole}`);
    if (m.subRole) parts.push(`Sub: ${ROLE_LABEL[m.subRole] ?? m.subRole}`);
    if (m.team) parts.push(`Team: ${TEAM_LABEL[m.team] ?? m.team}`);
    if (!m.onRoster) parts.push('Không có trong roster');
    return parts.join(' · ');
  }
}
