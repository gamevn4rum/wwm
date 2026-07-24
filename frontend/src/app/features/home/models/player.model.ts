export interface Player {
  id: string;
  name: string;
  rank: string;
  rankIconKey: string;
  notes: string;
}

export type RankType =
  | 'Caller'
  | 'Attacker'
  | 'Healer'
  | 'Tanker'
  | 'Carrier';
