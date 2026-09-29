/** One activity's honors as `/api/public/honors` serves it — e.g. every GvG League title. */
export interface HonorGroup {
  activity: string;
  titles: HonorTitle[];
}

/**
 * One title and who holds it. A holder the game would not name is left out of `igns` and
 * counted in `unnamedCount`, so a squad of ten still reads as ten.
 */
export interface HonorTitle {
  title: string;
  igns: string[];
  unnamedCount: number;
}
