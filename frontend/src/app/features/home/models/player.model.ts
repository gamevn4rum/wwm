export interface Player {
  id: string;
  name: string;
  rank: string;
  rankIconKey: string;
  notes: string;
  /** False = on the roster but no Discord handle yet, i.e. "Unregistered". */
  registered: boolean;
}

export type RankType =
  | 'Caller'
  | 'Attacker'
  | 'Healer'
  | 'Tanker'
  | 'Carrier';
