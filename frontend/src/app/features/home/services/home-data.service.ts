import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import { Player } from '../models/player.model';
import { MembersDataService } from '../../../core/services/members-data.service';

function rankIconKey(rank: string): string {
  const afterDash = rank.includes(' ') ? rank.substring(rank.lastIndexOf(' ') + 1) : rank;
  return afterDash.toLowerCase().trim();
}

function sortPlayers(players: Player[]): Player[] {
  const carriers = players.filter((p) => p.rank === 'Carrier');
  const callers = players.filter((p) => p.rank === 'Caller');
  const rest = players
    .filter((p) => p.rank !== 'Carrier' && p.rank !== 'Caller')
    .sort(() => Math.random() - 0.5);
  return [...carriers, ...callers, ...rest];
}

@Injectable({ providedIn: 'root' })
export class HomeDataService {
  private readonly membersData = inject(MembersDataService);

  private readonly players$: Observable<Player[]> = this.membersData.getMembers()
    .pipe(
      map((members) => {
        const players: Player[] = members
          .map((m, i) => ({
            id: `player-${String(i + 1).padStart(2, '0')}`,
            name: m.ign,
            rank: m.role,
            rankIconKey: rankIconKey(m.role),
            notes: m.notes,
            registered: m.registered,
          }))
          .filter((p) => p.name !== '');

        return sortPlayers(players);
      }),
      shareReplay(1)
    );

  getPlayers(): Observable<Player[]> {
    return this.players$;
  }
}
