// The tab bar on a phone and the rail on a wide window (#470, #328's pick): which of its tabs is current.

/** The bar's tabs, each a screen it opens as a sheet over the map (ADR-0011): Search (#471), Nearby and Favourites (#472). Now (#474) and the Passport (#332) join as they land. */
export type Tab = 'search' | 'nearby' | 'favourites';

/**
 * The tab whose sheet the panel shows, which the bar marks current (`aria-current`), by what main.ts
 * holds: Favourites' while it shows them (#472), Nearby's while it shows the viewer's nearby Trains, or that it's finding where they are or
 * can't, and Search's. None while it shows a followed Train, a place's board or a Line's screen (#473), though
 * one opened from Nearby has a Back to it (#322), nor while it's closed.
 */
export function currentTab({ following, boardPlace, lineShown, nearMe, searching, favouritesShown }: { following?: unknown; boardPlace?: string; lineShown?: string; nearMe?: unknown; searching?: boolean; favouritesShown?: boolean }): Tab | undefined {
  if (following || boardPlace || lineShown) return undefined;
  if (favouritesShown) return 'favourites';
  if (nearMe) return 'nearby';
  return searching ? 'search' : undefined;
}
