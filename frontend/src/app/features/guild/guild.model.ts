// Shape of data/guild.json, produced by scripts/fetch-guild.js from the wwmdb
// relay's `Guild {id, hostnum}` response. Guild-level identity plus the member
// roster; any account/email-looking field is stripped at ingestion.

export interface GuildMember {
  /** Opaque wwmdb player id (pId) — the id `Player {id}` accepts. */
  uid: string;
  /** In-game name. */
  ign: string;
  /** Join time, unix seconds (may be absent on older records). */
  joinTime?: number | null;
}

/** Our placement on one in-game leaderboard (data/guild-rank.json). */
export interface GuildRankEntry {
  /** Season-scoped board id — informational only; never used as a lookup key. */
  boardId: number | null;
  board: string | null;
  group: string | null;
  rank: number | null;
  score: number | null;
  /** Entries on the board, so a rank can be shown as "#41 of 200". */
  total: number | null;
  /** When the board itself was last recomputed upstream, unix seconds. */
  updated: number | null;
}

/**
 * Shape of data/guild-rank.json, produced by scripts/fetch-guild-rank.js.
 * Public data (no encryption): only our own standing, no UID/PID, no other guild.
 * `league` is null whenever the Guild War league table isn't published.
 */
export interface GuildRank {
  guildId: string;
  hostnum: number | null;
  prosperity: GuildRankEntry | null;
  guildWar: { ranked: GuildRankEntry | null; league: GuildRankEntry | null } | null;
}

/** One leaderboard row that credits at least one guild member. */
export interface HallOfFameEntry {
  boardId: number;
  board: string | null;
  group: string | null;
  rank: number | null;
  score: number | null;
  /** Entries on the board, for "#4 of 200" context. */
  of: number | null;
  updated: number | null;
  /**
   * Members on this row. Usually one, but raid/Endless boards rank a whole party,
   * so a single placement can legitimately credit several members at once.
   */
  members: string[];
}

/** Shape of data/hall-of-fame.json, produced by scripts/fetch-hall-of-fame.js. */
export interface HallOfFame {
  boardsScanned: number;
  boardsWithData: number;
  placements: number;
  membersPlacing: number;
  entries: HallOfFameEntry[];
}

export interface Guild {
  /** Opaque wwmdb guild id (e.g. "aXDXseODlazen7BW"). */
  id: string;
  /** Numeric in-game guild id (e.g. 10242973). */
  numberId: number | null;
  name: string;
  level: number | null;
  /** Founding time, unix seconds. */
  createTime: number | null;
  /** Region/server number (e.g. 10402). */
  hostnum: number | null;
  memberCount: number;
  members: GuildMember[];
}
