import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import { Player } from '../models/player.model';
import { MembersDataService } from '../../../core/services/members-data.service';
import { findVal } from '../../../core/utils/sheet.utils';

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

  private readonly players$: Observable<Player[]> = this.membersData.getRows()
    .pipe(
      map((rows) => {
        const players: Player[] = rows
          .map((row, i) => ({
            id: `player-${String(i + 1).padStart(2, '0')}`,
            name: findVal(row, 'ign'),
            rank: findVal(row, 'role'),
            rankIconKey: rankIconKey(findVal(row, 'role')),
            notes: findVal(row, 'notes'),
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
