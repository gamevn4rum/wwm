import { Injectable, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';
import { OpponentGuild, OpponentGuilds } from '../../features/match-history/opponent-guild.model';

/**
 * Opponent guild directory (data/guild-opponents.json) — identity + member roster
 * for every guild in Match History, refreshed twice a day by
 * `sync-opponent-guilds.yml`.
 *
 * Public data, so it is fetched plain with no key and no backend variant (unlike
 * our own roster in GuildDataService). Fails closed to null: a missing or broken
 * file means the match popup simply shows no guild details.
 *
 * Lookup is by the sheet's Opponent string. Guilds rename, so a record is indexed
 * under BOTH its current `name` and every `aliases` entry (the Match History
 * spellings) — matching case- and whitespace-insensitively, since the sheet's
 * casing drifts ("LadpraoBros" / "LadPraoBros").
 */
@Injectable({ providedIn: 'root' })
export class OpponentGuildsService {
  private readonly http = inject(HttpClient);

  private readonly data = toSignal(
    this.http.get<OpponentGuilds>(`data/guild-opponents.json?t=${Date.now()}`).pipe(
      catchError(() => of(null)),
      shareReplay(1),
    ),
    { initialValue: null },
  );

  /** normalized alias/name → guild. Built once per load. */
  private readonly index = computed(() => {
    const map = new Map<string, OpponentGuild>();
    for (const guild of this.data()?.guilds ?? []) {
      for (const key of [guild.name, ...(guild.aliases ?? [])]) {
        const k = normalizeName(key);
        if (k) map.set(k, guild);
      }
    }
    return map;
  });

  /** True once the file has resolved (either way) — lets the UI avoid a flash of "no data". */
  readonly loaded = computed(() => this.data() !== null);

  find(opponent: string | null | undefined): OpponentGuild | null {
    if (!opponent) return null;
    return this.index().get(normalizeName(opponent)) ?? null;
  }
}

function normalizeName(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}
