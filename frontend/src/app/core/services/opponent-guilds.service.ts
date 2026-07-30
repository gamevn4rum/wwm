import { Injectable, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';
import { apiUrl } from '../api';
import { OpponentGuild, OpponentGuilds } from '../../features/match-history/opponent-guild.model';

/**
 * Opponent guild directory — identity + member roster for every guild we hold an upstream
 * id for. Public rather than member-gated: it is other guilds' public data.
 *
 * Fails closed to null, so an unreachable API means the match popup simply shows no guild
 * details instead of erroring.
 *
 * Lookup is by the Opponent string as Match History spells it. Guilds rename, so a record
 * is indexed under BOTH its current `name` and every `aliases` entry — matching case- and
 * whitespace-insensitively, since the spellings drift ("LadpraoBros" / "LadPraoBros").
 */
@Injectable({ providedIn: 'root' })
export class OpponentGuildsService {
  private readonly http = inject(HttpClient);

  private readonly data = toSignal(
    this.http.get<OpponentGuilds>(apiUrl('/public/guild/opponents')).pipe(
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
