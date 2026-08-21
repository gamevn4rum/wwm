export interface EventRecord {
  /** The row's id. Only used to key the list: titles are not unique now that officers can post,
   *  and two articles called "Weekly giveaway" would collide as a track key. */
  id: number;
  title: string;
  date: string;
  description: string;
  banner: string | null;
  p1: string | null;
  p2: string | null;
  p3: string | null;
  p4: string | null;
  p5: string | null;
  link: string | null;
  /** Pinned articles lead the feed regardless of date. The API already orders on this, but the
   *  client re-sorts, so it has to be visible here or the pin would be sorted straight back out. */
  pin: boolean;
}
