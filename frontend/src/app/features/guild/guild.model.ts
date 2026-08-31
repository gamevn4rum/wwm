// Shape served by GET /api/member/guild. Originally from the wwmdb
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

/**
 * A member who has left, listed after the current roster.
 *
 * Comes from a different source than `GuildMember`: the in-game roster drops anyone who
 * leaves and keeps no record of them, so the leave date is ours — an admin sets it on the
 * Members table. No uid/pid, because there are no live stats to look up for someone gone.
 */
export interface FormerMember {
  ign: string;
  role?: string | null;
  /** `yyyy-MM-dd`. A plain date string, not a timestamp: the column has no time of day, and
   *  parsing it as one would let the browser's timezone shift it onto the wrong day. */
  leaveDate: string;
}

/** Our placement on one in-game leaderboard (GET /api/public/guild/rank). */
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
 * Shape served by GET /api/public/guild/rank.
 * Public data (no encryption): only our own standing, no UID/PID, no other guild.
 * `league` is null whenever the Guild War league table isn't published.
 */
export interface GuildRank {
  guildId: string;
  hostnum: number | null;
  prosperity: GuildRankEntry | null;
  guildWar: { ranked: GuildRankEntry | null; league: GuildRankEntry | null } | null;
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
  /** Current members only — `formerMembers` is not counted in the guild's size. */
  memberCount: number;
  members: GuildMember[];
  /** Departed members, newest leaver first. Empty against an API older than this build. */
  formerMembers: FormerMember[];
}
