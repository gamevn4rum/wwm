/**
 * A roster entry as `/api/public/roster` serves it.
 *
 * Deliberately narrow: the backend withholds Discord handles, UIDs and PIDs from the
 * public projection, so `registered` arrives as a derived flag rather than something the
 * client infers from a Discord column. Anything richer requires a member token and comes
 * from `/api/commander/members`.
 */
export interface RosterMember {
  ign: string;
  role: string;
  notes: string;
  registered: boolean;
  /** `MemberPath` ids; absent against an older API and null until someone sets them. */
  mainPath?: string | null;
  subPath?: string | null;
}
