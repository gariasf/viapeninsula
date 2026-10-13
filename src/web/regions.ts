// How the map loads a service day from its regions' files (ADR-0014): the tracks of the regions that
// come, joined as one, which it draws before the Trips, and then the Trips of those whose track came.

import { BANDS, DEGREE, joinTracks, joinTrips, type Bundle, type DayFiles, type DayTrips, type ManifestRegion, type Point, type Stroke, type Track, type ZoomedOut } from '../bundle.ts';
import { joinDays } from '../engine.ts';
import { decodeTrack, type TrackFile } from '../pieces.ts';

/**
 * How far beyond the view a region is loaded, in the view's widths and heights each way, so that a pan
 * comes onto its track drawn, more often than not: a region's files take a second or more to come.
 */
const AHEAD = 0.5;

/**
 * The regions the map needs, by their IDs, in the manifest's order (#266): from zoom 7, where it draws
 * Lines and Trains, those whose extent is in `view`, or within AHEAD of it; below it none, as the file
 * below zoom 7 draws every region's track there (ZoomedOut); and at every zoom, those with no extent,
 * which every view loads, as long distance's, as every region of a manifest from before #266. And
 * wherever the map is, the region of the Train a link names, by the Network its Trip's ID leads with,
 * those that have the Station a link names, by the file below zoom 7's `stations`, once it has come,
 * and for Nearby, those within so many metres of the viewer.
 */
export function regionsNeeded(
  regions: Pick<ManifestRegion, 'id' | 'networks' | 'extent'>[],
  view: { bounds: [Point, Point]; zoom: number } | undefined,
  { train, station, stations = {}, nearby }: { train?: string | null; station?: string | null; stations?: ZoomedOut['stations']; nearby?: { at: Point; metres: number } } = {},
): string[] {
  /** A box by its south-west and north-east corners, grown so many degrees east and west, and north and south. */
  const box = ([[west, south], [east, north]]: [Point, Point], x = 0, y = 0) => (extent: NonNullable<ManifestRegion['extent']>) => extent[0] <= east + x && extent[2] >= west - x && extent[1] <= north + y && extent[3] >= south - y;
  const [[west, south], [east, north]] = view?.bounds ?? [[0, 0], [0, 0]];
  const inView = view && view.zoom >= (BANDS[0] ?? 7) ? box(view.bounds, (east - west) * AHEAD, (north - south) * AHEAD) : () => false;
  const [lat, degrees] = [nearby?.at[1] ?? 0, (nearby?.metres ?? 0) / DEGREE];
  const near = nearby ? box([nearby.at, nearby.at], degrees / Math.cos((lat * Math.PI) / 180), degrees) : () => false;
  // A day's link names its Trip after the day.
  const network = train?.replace(/^\d{4}-\d{2}-\d{2}\//, '').split(':')[0];
  return regions.flatMap(({ id, networks, extent }) => {
    const needed = !extent || inView(extent) || near(extent) || (network !== undefined && networks?.includes(network)) || (station && stations[id]?.includes(station));
    return needed ? [id] : [];
  });
}

/**
 * Of the regions the map needs (regionsNeeded()), those it loads at its first look: all but those with no extent,
 * as long distance's, which every view needs and whose track file is larger than any view's own (1.5 MB brotli
 * against Catalonia's 0.4 MB on 11 Oct 2026). They come at its second, so that they hold back neither the first
 * Lines in view nor, zoomed out, the Network tracks, which wait for the first look's track (#262).
 */
export function firstLook(regions: Pick<ManifestRegion, 'id' | 'extent'>[], needed: string[]): string[] {
  return needed.filter((id) => regions.find((r) => r.id === id)?.extent);
}

/** What joins the names of the files a track was joined from, in `joined`'s keys. */
const JOINED = ',';

/** Forgets what was joined from files that aren't all among `keys`, the files the days now needed name. */
export function forgetJoined(joined: Map<string, Track>, keys: string[]) {
  for (const files of joined.keys()) if (!files.split(JOINED).every((file) => keys.includes(file))) joined.delete(files);
}

/** The regions a joined track was joined from, by its strokes, which the bundles and the days joined from it keep (joinDays()). */
const regionsOf = new WeakMap<Stroke[], { id: string; track: Track }[]>();

/** The regions, by their IDs, and their tracks, that a track the loader joined (regionLoader()) was joined from, in its order: the map draws each region's Lines once (#733). */
export function joinedFrom({ strokes }: Pick<Track, 'strokes'>): { id: string; track: Track }[] | undefined {
  return regionsOf.get(strokes);
}

/** Each track file read once, however many days name it and however many times the map looks again: the files the page keeps are these objects. */
const decoded = new WeakMap<TrackFile, Track>();

/** A region's track file as the track it was built from (decodeTrack()), where it was stored as pieces. */
function decodedTrack(file: TrackFile): Track {
  let track = decoded.get(file);
  if (!track) decoded.set(file, (track = decodeTrack(file)));
  return track;
}

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
    const found = settle(day.regions.map((r) => get<TrackFile>(r.track).then(decodedTrack))).then((got) => {
      const [loaded, came] = [day.regions.filter((_, i) => got[i]), got.flatMap((t) => (t ? [t] : []))];
      if (!came.length) throw new Error(`No region's track came for ${day.date}`);
      const files = loaded.map((r) => r.track).join(JOINED);
      let track = joined.get(files);
      if (!track) {
        track = joinTracks(came);
        regionsOf.set(track.strokes, came.map((t, i) => ({ id: loaded[i]?.id ?? '', track: t })));
      }
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

/**
 * The regions of `loaded` that have come for the days that have (`done`, of the `days` a look is for): those
 * whose files in them are all among those fetched (`has`), as one whose file failed has to come at a later
 * look, and those with files in none of `days`, which have nothing to wait for. One with files only in a day
 * still to come hasn't, as it has none to show yet.
 */
export function regionsCame(loaded: Iterable<string>, days: DayFiles[], done: DayFiles[], has: (file: string) => boolean): string[] {
  return [...loaded].filter((id) => {
    const filesIn = (list: DayFiles[]) => list.flatMap((d) => d.regions.filter((r) => r.id === id));
    const mine = filesIn(done);
    return (mine.length > 0 || filesIn(days).length === 0) && mine.every((r) => has(r.track) && has(r.trips));
  });
}

/**
 * The days a look needs, as their bundles come (#593): a step each time one comes, of the days that
 * have so far, joined in the order of `days` (joinDays()), so that the map has the first day's Trips
 * when they come, and the others' join as theirs do, not all together once the last day's have. A day
 * that fails is no step of its own, but for the last where it's the one that ends the look.
 * A day that hasn't come yet is, for as long as it hasn't, the bundle the map had of it (`kept`, by its
 * date), so that a look for a region the map doesn't have yet, which fetches every day's files again,
 * doesn't take a day's Trips off the map while the other's come. The last step, `complete`, is the days
 * that came alone, with those that failed in `lost` and with the bundle of none where none came;
 * `byDate` is the bundle each day of the step has, to give the next look as `kept`.
 */
export function daysAsTheyCome(days: DayFiles[], bundleOf: (day: DayFiles) => Promise<Bundle>, kept: ReadonlyMap<string, Bundle> = new Map()) {
  const came = new Map<DayFiles, Bundle>();
  const lost: [DayFiles, unknown][] = [];
  // Asked for at once, whether or not a step has been asked for yet, so that a day that fails first is handled.
  const waiting = new Map(
    days.map((day, i) => [i, bundleOf(day).then((bundle) => void came.set(day, bundle), (reason: unknown) => void lost.push([day, reason])).then(() => i)]),
  );
  return (async function* () {
    // What the map has of these days to begin with, the bundles it kept, so that a failure that comes first is nothing new.
    let last: { parts: Bundle[]; bundle?: Bundle } = { parts: days.flatMap((day) => kept.get(day.date) ?? []) };
    for (let complete = false; !complete; ) {
      waiting.delete(await Promise.race(waiting.values()));
      // Every day has come or failed to: days that came in the one turn are one step.
      complete = came.size + lost.length === days.length;
      const byDate = new Map(days.flatMap((day): [string, Bundle][] => {
        const bundle = came.get(day) ?? (complete ? undefined : kept.get(day.date));
        return bundle ? [[day.date, bundle]] : [];
      }));
      const parts = [...byDate.values()];
      // Nothing new since the last step, as where a day failed, or came with another in one turn.
      const same = parts.length === last.parts.length && parts.every((part, i) => part === last.parts[i]);
      if (same && !complete) continue;
      last = { parts, bundle: same ? last.bundle : parts.length ? joinDays(parts) : undefined };
      yield { bundle: last.bundle, came: days.filter((day) => came.has(day)), lost, byDate, complete };
    }
  })();
}
