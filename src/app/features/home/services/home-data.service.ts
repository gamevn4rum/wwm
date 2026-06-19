import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';
import { Player } from '../models/player.model';
import { GoogleSheetsApiService } from '../../../core/services/google-sheets/google-sheets-api.service';
import { SheetRow } from '../../../core/models/sheet.model';
import { findVal } from '../../../core/utils/sheet.utils';
import { environment } from '../../../../environments/environment';

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
  private readonly http      = inject(HttpClient);
  private readonly sheetsApi = inject(GoogleSheetsApiService);

  private readonly players$: Observable<Player[]> = this.http
    .get<SheetRow[]>(`data/members.json?t=${Date.now()}`)
    .pipe(
      switchMap((rows) =>
        rows && rows.length > 0
          ? of(rows)
          : this.sheetsApi.getRows(environment.defaultSpreadsheetId, 'Members!A:Z', environment.googleApiKey)
      ),
      catchError(() =>
        this.sheetsApi.getRows(environment.defaultSpreadsheetId, 'Members!A:Z', environment.googleApiKey)
      ),
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
