// The daily build's bundle, region by region (ADR-0014): each region's Networks are built into a
// track file and a Trips file for each day of their own, one region after another, so that a region
// whose build fails keeps the files its last build published while the others build and publish.

import { isDeepStrictEqual } from 'node:util';
import { BANDS, networkTracks, STRETCH, type Closure, type Line, type Manifest, type ManifestDay, type ManifestRegion, type Network, type Point, type Shape, type Station, type Track, type Trip, type ZoomedOut } from '../bundle.ts';
import { EVERYWHERE } from '../networks.ts';
import { decodeTrack, encodeTrack, type StoredTrack } from '../pieces.ts';
import { dayTrips, manifestDay } from './manifest.ts';
import { simplify } from './offset.ts';
import type { Found, Spot } from './report.ts';
import { sharedTrack, sideBySide, type Shared } from './sideBySide.ts';
import { round, stationsOf } from './track.ts';

/** A Network as the build makes it of its timetables: its Lines, its Stations and track cut at the border, and its Trips and Closures on each day. */
export interface BuiltNetwork {
  network: Network;
  lines: Line[];
  stations: Station[];
  shapes: Shape[];
  trips: Trip[][];
  closures: Closure[][];
  /** The Trips its config leaves out today, as readFeed() logs them (#368). */
  left?: string[];
}

/** Some Networks loaded together, by their region's ID (regionsOf()). */
export interface Region<N> {
  id: string;
  networks: N[];
}

/**
 * A region built: its Networks, and its track and each day's Trips as files of its own, named by
 * `write` for the region and its content, which the manifest names. Where a Network's Lines share
 * track with another's, they're drawn side by side; where the Network is in another region, they
 * aren't (sharedStretches()).
 * Each day's Trips are logged and reported by Network (dayTrips()), and a region whose Networks have no
 * Trips at all today is built all the same: that's no failure of the region's.
 */
export async function buildRegion<N>(
  region: Region<N>,
  {
    dates,
    network,
    write,
    log = console.warn,
    report = () => {},
    last,
  }: {
    /** The service days, today's first. */
    dates: string[];
    /** One of the region's Networks built from its timetables. */
    network: (config: N) => Promise<BuiltNetwork>;
    /** Writes a file under a name starting with `prefix`, and gives its key. */
    write: (prefix: string, content: object, what: string) => Promise<string>;
    log?: (line: string) => void;
    report?: (found: Found) => void;
    /** The last build's report, whose counts of each Network's Trips the report carries on from. */
    last?: Spot[];
  },
): Promise<{ track: Track; days: ManifestDay[] }> {
  const networks: BuiltNetwork[] = [];
  for (const config of region.networks) networks.push(await network(config));
  const eachDay = dayTrips(dates, networks, log, report, last);
  const [lines, traced] = [networks.flatMap((n) => n.lines), networks.flatMap((n) => n.shapes)];
  const { strokes, centrelines, rails, slots, tracks } = await sideBySide(lines, traced, region.id);
  const track: Track = {
    networks: networks.map((n) => n.network),
    lines,
    stations: stationsOf(networks),
    shapes: [...traced, ...centrelines],
    strokes,
    rails,
    slots,
    tracks,
  };
  const trackKey = await write(`days/track-${region.id}`, trackFile(track, region.id, log), `${track.lines.length} Lines, ${track.stations.length} Stations, ${track.shapes.length} shapes`);
  const days = await Promise.all(
    eachDay.map(async (trips) => {
      const key = await write(`days/${trips.serviceDay}-${region.id}`, trips, `${trips.trips.length} Trips, ${trips.closures?.length ?? 0} Closures`);
      return manifestDay({ ...track, ...trips }, { track: trackKey, trips: key });
    }),
  );
  return { track, days };
}

/**
 * A region's track as its file stores it (ADR-0015): its traced shapes as pieces and its slots as
 * chains. The map must read back from it the track the build made, as JSON has it, so that its Trains
 * and its Lines are where they were: where it doesn't, the region's build fails, and it keeps the
 * files of its last build, rather than publish a track that differs from the one built. Where its
 * slots can't be chains, it says so through `log`: they're in the file whole, at the size they were.
 */
export function trackFile(track: Track, region: string, log: (line: string) => void = console.warn): StoredTrack {
  const file = encodeTrack(track);
  const read = decodeTrack(JSON.parse(JSON.stringify(file)) as StoredTrack);
  if (!isDeepStrictEqual(read, JSON.parse(JSON.stringify(track)))) throw new Error(`${region}'s track file doesn't give back the track built: its shapes and slots as pieces and chains read back differently`);
  if ('slots' in file) log(`${region}'s slots are whole in its track file, not chains: one doesn't follow the one before along its shape, or names a Line or shape its track hasn't`);
  return file;
}

/**
 * Builds each region with `build`, one after another, in the order given. One whose build throws is
 * logged, with its stack, and reported as a spot, and goes without a result, so that the manifest keeps
 * the files of its last build (manifestOf()) and the others are built and published as ever. The
 * spots of the last report that are its Networks' are carried over as they were, so that they don't
 * show gone from the report, and new in the next. Fails where none of the regions built has Trips on
 * its first day, today: that's a broken build, not a day without Trains.
 * ponytail: one after another, as ADR-0014 has it, though the regions share nothing: the build's
 * 281 s on a Mac, 9 minutes in Actions (run 38044181878, set-up too), are far inside its 60, but if
 * they ever aren't, run them in parallel, each reading the same downloads and rails.
 */
export async function buildRegions<N extends { id: string }, R extends { days: ManifestDay[] }>(
  regions: Region<N>[],
  build: (region: Region<N>) => Promise<R>,
  { log = console.warn, report, last = [] }: { log?: (line: string) => void; report: { add: (found: Found) => void; carry: (spot: Spot) => void }; last?: Spot[] },
): Promise<{ id: string; built?: R }[]> {
  const results: { id: string; built?: R }[] = [];
  for (const region of regions) {
    try {
      results.push({ id: region.id, built: await build(region) });
    } catch (error) {
      // One line for the report, as readTimetables() gives its reason, and the whole of it for the log.
      const reason = `${error instanceof Error ? error.message : error}`.replace(/\n.*/s, '');
      const line = `${region.id} isn't built, and keeps the files of its last build: ${reason}`;
      log(line);
      log(`${error instanceof Error ? (error.stack ?? error.message) : error}`);
      report.add({ kind: 'region', region: region.id, text: [line] });
      // A last report it can't read, as one of an older shape, has none to carry, and doesn't stop the build (dayTrips()).
      const own = new Set(region.networks.map((n) => n.id));
      for (const spot of Array.isArray(last) ? last : []) if (spot?.network && own.has(spot.network)) report.carry(spot);
      results.push({ id: region.id });
    }
  }
  const today = results.flatMap((r) => r.built?.days[0] ?? []);
  if (today.length && !today.some((d) => Number.isFinite(d.from))) throw new Error(`No Network's timetable has Trips on ${today[0]?.date}`);
  return results;
}

/**
 * How far each Network's track in the file below zoom 7 is simplified, in degrees: a tenth of a pixel
 * at zoom 7, the most it's drawn at, at the equator, where a pixel is the most degrees. MapLibre
 * simplifies it by 0.375 of a pixel itself (offset.ts).
 */
const ZOOMED_OUT = 360 / (512 * 2 ** (BANDS[0] ?? 7)) / 10;

/**
 * What the map needs to load only the regions in view (#266): in the manifest, each region's Networks,
 * which a link to one of their Trains finds it by, and where its Stations and track lie, outward to a
 * thousandth of a degree, about 100 m, but for the region every view loads (EVERYWHERE), which has no
 * extent; and the file below zoom 7 (ZoomedOut), with every region's Networks, Network tracks, simplified
 * by ZOOMED_OUT and to a ten-thousandth of a degree, and Stations. Each region's are its track's as
 * built, or for one whose build failed, those of the track file the manifest names for it, its last
 * build's, which `read` fetches, so that the map doesn't lose its track below zoom 7. Where that can't
 * be read, the build fails.
 */
export async function zoomedOut(manifest: Manifest, built: Map<string, Track>, read: (key: string) => Promise<Track>): Promise<{ regions: ManifestRegion[]; file: ZoomedOut }> {
  const tracks = await Promise.all(manifest.regions.map(({ id, days }) => built.get(id) ?? read(days.at(-1)?.track ?? '')));
  const regions = manifest.regions.map((region, i) => {
    const track = tracks[i] ?? { networks: [], stations: [], shapes: [] };
    const [floor, ceil] = [(d: number) => Math.floor(d * 1e3) / 1e3, (d: number) => Math.ceil(d * 1e3) / 1e3];
    // By hand, not Math.min(...), which takes no more than about 100,000 points.
    let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [lon, lat] of [...track.stations.map((s): Point => [s.lon, s.lat]), ...track.shapes.flatMap((s) => s.coords)]) {
      [west, south, east, north] = [Math.min(west, lon), Math.min(south, lat), Math.max(east, lon), Math.max(north, lat)];
    }
    const extent: ManifestRegion['extent'] = [floor(west), floor(south), ceil(east), ceil(north)];
    return { ...region, networks: track.networks.map((n) => n.id), ...(region.id !== EVERYWHERE && { extent }) };
  });
  const file: ZoomedOut = {
    networks: tracks.flatMap((t) => t.networks),
    tracks: tracks.flatMap((t) => networkTracks(t).map(({ network, coordinates }) => ({ network, coordinates: simplify(coordinates, ZOOMED_OUT).map(([lon, lat]): Point => [round(lon, 1e4), round(lat, 1e4)]) }))),
    stations: Object.fromEntries(manifest.regions.map(({ id }, i) => [id, tracks[i]?.stations.map((s) => s.id) ?? []])),
  };
  return { regions, file };
}

/**
 * Logs each pair of regions whose Lines share a Stretch, which a region's own graph can't draw
 * beside theirs (ADR-0014): how many, how long, and where the first is, with the Lines, or that none
 * does.
 */
export function sharedStretches(built: { id: string; track: Pick<Track, 'lines' | 'shapes'> }[], log = console.log): Shared[] {
  const region = new Map(built.flatMap(({ id, track }) => track.lines.map((l): [string, string] => [l.id, id])));
  const lines = built.flatMap((b) => b.track.lines);
  const traced = built.flatMap((b) => b.track.shapes.filter((s) => !s.id.startsWith(STRETCH)));
  const found = sharedTrack(lines, traced, (l) => region.get(l.id) ?? '');
  for (const { regions, stretches, metres, at, lines: along } of found) {
    log(`${regions[0]} and ${regions[1]} share ${stretches} Stretch${stretches === 1 ? '' : 'es'}, ${(metres / 1000).toFixed(1)} km, from ${at[1]},${at[0]}: ${along.toSorted().join(', ')}. Their Lines are drawn over each other there, not side by side (ADR-0014)`);
  }
  if (!found.length) log('No Stretch is shared by two regions');
  return found;
}
