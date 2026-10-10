// The daily build's bundle, region by region (ADR-0014): each region's Networks are built into a
// track file and a Trips file for each day of their own, one region after another, so that a region
// whose build fails keeps the files its last build published while the others build and publish.

import { STRETCH, type Closure, type Line, type ManifestDay, type Network, type Shape, type Station, type Track, type Trip } from '../bundle.ts';
import { dayTrips, manifestDay } from './manifest.ts';
import type { Found, Spot } from './report.ts';
import { sharedTrack, sideBySide, type Shared } from './sideBySide.ts';
import { stationsOf } from './track.ts';

/** A Network as the build makes it of its timetables: its Lines, its Stations and track cut at the border, and its Trips and Closures on each day. */
export interface BuiltNetwork {
  network: Network;
  lines: Line[];
  stations: Station[];
  shapes: Shape[];
  trips: Trip[][];
  closures: Closure[][];
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
  const trackKey = await write(`days/track-${region.id}`, track, `${track.lines.length} Lines, ${track.stations.length} Stations, ${track.shapes.length} shapes`);
  const days = await Promise.all(
    eachDay.map(async (trips) => {
      const key = await write(`days/${trips.serviceDay}-${region.id}`, trips, `${trips.trips.length} Trips, ${trips.closures?.length ?? 0} Closures`);
      return manifestDay({ ...track, ...trips }, { track: trackKey, trips: key });
    }),
  );
  return { track, days };
}

/**
 * Builds each region with `build`, one after another, in the order given. One whose build throws is
 * logged, with its stack, and reported as a spot, and goes without a result, so that the manifest keeps
 * the files of its last build (manifestOf()) and the others are built and published as ever. The
 * spots of the last report that are its Networks' are carried over as they were, so that they don't
 * show gone from the report, and new in the next. Fails where none of the regions built has Trips on
 * its first day, today: that's a broken build, not a day without Trains.
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
      const own = new Set(region.networks.map((n) => n.id));
      for (const spot of last) if (spot.network && own.has(spot.network)) report.carry(spot);
      results.push({ id: region.id });
    }
  }
  const today = results.flatMap((r) => r.built?.days[0] ?? []);
  if (today.length && !today.some((d) => Number.isFinite(d.from))) throw new Error(`No Network's timetable has Trips on ${today[0]?.date}`);
  return results;
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
