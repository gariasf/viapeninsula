// The tab bar on a phone and the rail on a wide window (#470, #328's pick): which of its tabs is current.

/** The bar's tabs, each a screen it opens as a sheet over the map (ADR-0011): Search (#471) and Nearby. Now (#474), Favourites (#472) and the Passport (#332) join as they land. */
export type Tab = 'search' | 'nearby';

/**
 * The tab whose sheet the panel shows, which the bar marks current (`aria-current`), by what main.ts
 * holds: Nearby's while it shows the viewer's nearby Trains, or that it's finding where they are or
 * can't, and Search's. None while it shows a followed Train or a place's board, though one opened from
 * Nearby has a Back to it (#322), nor while it's closed.
 */
export function currentTab({ following, boardPlace, nearMe, searching }: { following?: unknown; boardPlace?: string; nearMe?: unknown; searching?: boolean }): Tab | undefined {
  if (following || boardPlace) return undefined;
  if (nearMe) return 'nearby';
  return searching ? 'search' : undefined;
}
