// The tab bar on a phone and the rail on a wide window (#470, #328's pick): which of its tabs is current.

/** The bar's tabs, each a screen it opens as a sheet over the map (ADR-0011): Search (#471), Nearby, Now (#474), Favourites (#472) and the Passport (#332). */
export type Tab = 'search' | 'nearby' | 'now' | 'favourites' | 'passport';

/**
 * The tab whose sheet the panel shows, which the bar marks current (`aria-current`), by what main.ts
 * holds: the Passport's while it shows it (#332), a Train followed behind it too, Favourites' while it shows them (#472), Now's while it shows it (#474), Nearby's while it shows the viewer's nearby Trains, or that it's finding where they are or
 * can't, and Search's. None while it shows a followed Train, a place's board or a Line's screen (#473), though
 * one opened from Nearby has a Back to it (#322), nor while it's closed.
 */
export function currentTab({ following, boardPlace, lineShown, nearMe, searching, favouritesShown, nowShown, passportShown }: { following?: unknown; boardPlace?: string; lineShown?: string; nearMe?: unknown; searching?: boolean; favouritesShown?: boolean; nowShown?: boolean; passportShown?: boolean }): Tab | undefined {
  if (passportShown) return 'passport';
  if (following || boardPlace || lineShown) return undefined;
  if (favouritesShown) return 'favourites';
  if (nowShown) return 'now';
  if (nearMe) return 'nearby';
  return searching ? 'search' : undefined;
}
