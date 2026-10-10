// How the map loads a service day from its regions' files (ADR-0014): the tracks of the regions that
// come, joined as one, which it draws before the Trips, and then the Trips of those whose track came.

import { joinTracks, joinTrips, type Bundle, type DayFiles, type DayTrips, type Track } from '../bundle.ts';

/**
 * Loads days through `get`, which fetches a file by its name. A region whose file fails to come is left
 * out of its day, which is drawn from the rest, and `failed()` says some did, so that the map looks
 * again; where none of a day's tracks, or Trips, come, the day fails. Each set of tracks is joined once,
 * in `joined` by the files it's from, so that looking again where a region's file came again, or failed
 * again, gives the track it drew already, whose `stations` the map knows by their identity.
 */
export function regionLoader(get: <T>(key: string) => Promise<T>, joined: Map<string, Track>, warn: (reason: unknown) => void = console.warn) {
  let failed = false;
  const settle = async <T>(files: Promise<T>[]) => {
    const got = await Promise.allSettled(files);
    for (const g of got) {
      if (g.status !== 'rejected') continue;
      failed = true;
      warn(g.reason);
    }
    return got.map((g) => (g.status === 'fulfilled' ? g.value : undefined));
  };
  const tracks = new Map<DayFiles, Promise<{ track: Track; loaded: DayFiles['regions'] }>>();
  /** A day's tracks joined, once, with the regions whose track came: the map draws them before the Trips come. */
  const trackOf = (day: DayFiles) => {
    const known = tracks.get(day);
    if (known) return known;
    const found = settle(day.regions.map((r) => get<Track>(r.track))).then((got) => {
      const [loaded, came] = [day.regions.filter((_, i) => got[i]), got.flatMap((t) => (t ? [t] : []))];
      if (!came.length) throw new Error(`No region's track came for ${day.date}`);
      const files = loaded.map((r) => r.track).join();
      const track = joined.get(files) ?? joinTracks(came);
      joined.set(files, track);
      return { track, loaded };
    });
    tracks.set(day, found);
    return found;
  };
  /** A day's bundle: its track, and the Trips of the regions whose track came, fetched once it had so that it isn't slowed by them. */
  const bundleOf = async (day: DayFiles): Promise<Bundle> => {
    const { track, loaded } = await trackOf(day);
    const trips = (await settle(loaded.map((r) => get<DayTrips>(r.trips)))).flatMap((t) => (t ? [t] : []));
    if (!trips.length) throw new Error(`No region's Trips came for ${day.date}`);
    return { ...track, ...joinTrips(trips) };
  };
  return { trackOf, bundleOf, failed: () => failed };
}
