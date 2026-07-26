export interface Player {
  id: string;
  name: string;
  rank: string;
  rankIconKey: string;
  notes: string;
  /** In-game UID. Normally '': it is withheld from published data on purpose
   *  (fetch-data.js OMITTED_COLUMNS) and absent from the backend's public roster
   *  projection too — it's an identity key, not display data. */
  uid: string;
  /** False = on the roster but no Discord handle yet, i.e. "Unregistered". */
  registered: boolean;
}

export type RankType =
  | 'Caller'
  | 'Attacker'
  | 'Healer'
  | 'Tanker'
  | 'Carrier';
