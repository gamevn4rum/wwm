/**
 * The game's own end-of-match scoreboard, as `GET /member/matches/{id}/scoreboard` serves it.
 *
 * Only matches the nightly history sync has tied to a game record have one. Everything older than
 * the guild's retained match handles — and anything the sync could not identify — has none, and
 * the endpoint answers `null` for those rather than 404, so "no scoreboard" is a normal state and
 * not an error.
 */

/** One player's line. Both guilds' players appear, each on their own side. */
export interface ScoreboardPlayer {
  /** In-game name, or null when the gateway would not name them. Show nothing, never "Unknown". */
  ign: string | null;
  /**
   * The game's own match score.
   *
   * ⚠ Recovered by regression against the game's displayed totals, not served by the API. Stored
   * server-side as computed, so a later correction to the formula cannot silently rewrite what an
   * old match showed.
   */
  mvpScore: number;
  kills: number;
  deaths: number;
  assists: number;
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
  damageToGoose: number;
  damageToTowers: number;
  funCoins: number;
  /** Metres of Fortune Tree carried. */
  treeMetres: number;
  /**
   * Won the mid-match duel.
   *
   * ⚠ The game marks only the WINNER — at most one player in the whole match — so `false` means
   * "did not win it", never "lost it", and no duel win rate can be built from this.
   */
  wonDuel: boolean;
  /** Best player of the match: top score on the winning side, not in the match overall. */
  isMvp: boolean;
}

export interface ScoreboardSide {
  name: string;
  /** League points either side of the match. Null for a friendly, which moves neither. */
  scoreBefore: number | null;
  scoreAfter: number | null;
  /** Team total of Fortune Tree metres — caps around 330, the distance between the bases. */
  treeMetres: number | null;
  /**
   * Goose health remaining, as a percentage.
   *
   * ⚠ Recorded for the WINNING side only, and not even always. Null means "not recorded", never
   * "none left" — a loser's goose is simply absent from the record.
   */
  gooseHpPercent: number | null;
  /** Team Fun Coins as the game's result screen shows them. Only ever our own side. */
  funCoins: number | null;
  players: ScoreboardPlayer[];
}

export interface Scoreboard {
  matchId: number;
  opponent: string;
  /** Our result, from the record's own verdict. Null when the record did not say. */
  won: boolean | null;
  /** Seconds actually fought — preparation and the result screen already removed. */
  foughtSeconds: number | null;
  /** A challenge match that counted for nothing. */
  friendly: boolean;
  /** League tier, named. Null for a friendly, which has no tier. */
  tierName: string | null;
  seasonNo: number | null;
  round: number | null;
  us: ScoreboardSide;
  them: ScoreboardSide;
}

/** Columns the scoreboard can be ordered by. */
export type ScoreboardSortKey =
  | 'name'
  | 'mvp'
  | 'kills'
  | 'deaths'
  | 'assists'
  | 'damageDealt'
  | 'damageTaken'
  | 'healingDone'
  | 'funCoins'
  | 'treeMetres';

/** Which way a column is ordered. */
export type ScoreboardSortDir = 'asc' | 'desc';

/**
 * The direction a column sorts the FIRST time it is picked.
 *
 * Every stat reads "more is better", so they all open biggest-first and the top of the table is
 * the best performance. The two exceptions are the ones where that is not what a reader wants:
 * deaths, where fewest is the achievement, and the name, which is a lookup rather than a ranking
 * and is only ever useful A-Z. Clicking the same column again reverses whichever it chose.
 */
export function defaultSortDir(key: ScoreboardSortKey): ScoreboardSortDir {
  return key === 'deaths' || key === 'name' ? 'asc' : 'desc';
}

/**
 * 1,234,567 → "1.2M". Big damage numbers are the whole table, and printing them in full makes
 * every column a different width on a phone.
 */
export function compactNumber(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1000)}k`;
  if (value >= 1_000) return `${(value / 1000).toFixed(1)}k`;
  return Math.round(value).toLocaleString('en-US');
}

/** 1759 → "29m 19s". Em dash when the record carried no duration. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}
