// Shape served by GET /api/public/guild/opponents
// from the wwmdb relay's `Guild {id, hostnum}` response — one record per opponent
// guild we have faced. Public data (unencrypted), see SECURITY.md.

import { GuildRankEntry } from '../guild/guild.model';

export interface OpponentGuildMember {
  /** Opaque wwmdb player id (pId). */
  id: string;
  /** In-game name. */
  name: string;
  /** Join time, unix seconds. Absent on the odd record the relay doesn't carry it for. */
  joinTime?: number;
}

export interface OpponentGuild {
  /** Opaque wwmdb guild id. */
  id: string;
  /** Numeric in-game guild id (e.g. 10005661). */
  numberId: number | null;
  /** The guild's name *now* — guilds rename, so this can differ from `aliases`. */
  name: string;
  /** Region/server number (e.g. 10402). */
  hostnum: number | null;
  level: number | null;
  /** Founding time, unix seconds. */
  createTime: number | null;
  /**
   * Every Match History "Opponent" spelling that points at this guild — the join
   * key between a match record and this data, and the reason a rename doesn't
   * orphan old matches.
   */
  aliases: string[];
  /**
   * Standing on the live Guild Prosperity board — the same boards and the same
   * `GuildRankEntry` shape /api/public/guild/rank uses for us, so the two can be
   * read side by side. Null when the guild doesn't place (each board is top-200).
   */
  prosperity: GuildRankEntry | null;
  memberCount: number;
  members: OpponentGuildMember[];
}

export interface OpponentGuilds {
  guildCount: number;
  memberCount: number;
  guilds: OpponentGuild[];
}
