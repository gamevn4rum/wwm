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
