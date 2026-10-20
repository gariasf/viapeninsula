// Favourites (#472, #328's pick): the Stations and Lines a viewer keeps, in their browser only (ADR-0011).

/**
 * A kept Station, by its place's ID and one of its Stations', which the regions it loads are found by, as a
 * link's `station=` (regionsNeeded()), or a kept Line, by its ID; each with its name as it was kept, which
 * its row says where the map no longer has it. Not a Train: a Train is one service day's run.
 */
export type Favourite = { kind: 'station'; id: string; station: string; name: string } | { kind: 'line'; id: string; name: string };

/** What they're kept under on the viewer's device, as JSON, in local storage, as the view and the language are: its version after the colon. */
const KEY = 'favourites:1';

/** Whether `f` is a Favourite as favourites() keeps one. */
const readable = (f: unknown): f is Favourite => {
  const { kind, id, name, station } = (f ?? {}) as Record<string, unknown>;
  return typeof id === 'string' && typeof name === 'string' && (kind === 'line' || (kind === 'station' && typeof station === 'string'));
};

/**
 * The viewer's Favourites, read from `storage` once and written to it at each toggle, in the order they were
 * kept. Storage that's blocked, as in some private windows, or full, keeps nothing, and the Favourites last
 * for the page's life: nothing throws. They go in no link and to no server.
 */
export function favourites(storage: () => Pick<Storage, 'getItem' | 'setItem'>) {
  let kept: Favourite[] = [];
  try {
    const read: unknown = JSON.parse(storage().getItem(KEY) ?? '[]');
    if (Array.isArray(read) && read.every(readable)) kept = read;
  } catch {
    // Storage is off, or what's kept isn't as this keeps it: none are kept.
  }
  const same = (a: Favourite) => (b: Favourite) => a.kind === b.kind && a.id === b.id;
  return {
    all: (): readonly Favourite[] => kept,
    has: (f: Favourite) => kept.some(same(f)),
    /** Keeps `f`, last, or removes it where it's kept. */
    toggle(f: Favourite) {
      kept = kept.some(same(f)) ? kept.filter((k) => !same(f)(k)) : [...kept, f];
      try {
        storage().setItem(KEY, JSON.stringify(kept));
      } catch {
        // Storage is off or full: they last until the page closes.
      }
    },
  };
}

/**
 * The Favourites sheet's rows: kept Stations, then kept Lines, each in the order kept, `loading` till the
 * regions it needs have `come`, then `shown` where the map `has` it, or `gone`, no longer on the map, as a
 * Station renamed or merged (#243) or a Line gone, whose row stays, with its kept name, to be removed.
 */
export function favouriteRows(kept: readonly Favourite[], come: (f: Favourite) => boolean, has: (f: Favourite) => boolean) {
  const rows = kept.map((f) => ({ ...f, state: !come(f) ? ('loading' as const) : has(f) ? ('shown' as const) : ('gone' as const) }));
  return { stations: rows.filter((r) => r.kind === 'station'), lines: rows.filter((r) => r.kind === 'line') };
}
