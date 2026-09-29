/** One activity's honors as `/api/public/honors` serves it — e.g. every GvG League title. */
export interface HonorGroup {
  activity: string;
  titles: HonorTitle[];
}

/**
 * One title and who holds it. A holder the game would not name is left out of `holders` and
 * counted in `unnamedCount`, so a squad of ten still reads as ten.
 */
export interface HonorTitle {
  title: string;
  holders: HonorHolder[];
  unnamedCount: number;
}

/** A holder and their in-game look. Each id is set only when the official site has art for it. */
export interface HonorHolder {
  ign: string;
  portraitId: number | null;
  nameCardId: number | null;
}
