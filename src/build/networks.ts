// Reading a Network's timetables, and finding its rails, as src/networks.ts has them.

import { copyFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { madridDate, type Line, type Station } from '../bundle.ts';
import { FGC, METRO, NETWORKS, RODALIES, TRAM, type Gauges, type NetworkConfig, type Rails, type Timetable } from '../networks.ts';
import { rows, seconds, serviceIdsOn, zipFile, zipSource, type Source } from './gtfs.ts';
import type { OsmWay } from './osm.ts';
import type { Found } from './report.ts';
import { eachWay, fine, type FeedShape } from './track.ts';
import type { FeedBus, FeedTrip } from './trips.ts';

/**
 * The rails of every kind any Network runs on, as osm() is asked for them. The kinds are sorted, so the
 * copy osm() keeps isn't named by the Networks' order.
 * ponytail: the map's Networks' kinds, which hold long distance's (rail and narrow_gauge, `lines.gauges`);
 * add theirs if one of its Lines ever runs on another.
 */
export const RAILWAYS = [...new Set(NETWORKS.flatMap((n) => n.rails.railway))].sort();

/** Whether a way is one of these rails. */
export function onRails({ railway, gauge, operator, notOperator }: Rails): (way: OsmWay) => boolean {
  return ({ tags }) =>
    railway.includes(tags.railway ?? '') &&
    (!gauge || (tags.gauge ?? '').split(';').some((g) => gauge.includes(g))) &&
    (!operator || operator.includes(tags.operator ?? '')) &&
    !notOperator?.includes(tags.operator ?? '');
}

/** The rails a Network's Lines are traced along: the ways of its own kind, each without the points fine() drops. */
export function ownRails(rails: OsmWay[], network: Pick<NetworkConfig, 'rails'>): OsmWay[] {
  return fine(rails.filter(onRails(network.rails)));
}

/** One of a Network's timetables, to read as that Network's. */
export type Feed = Timetable & { network: Pick<NetworkConfig, 'id' | 'name' | 'lines'> };

// ponytail: today's Networks' timetables and rails, by the names networks.test.ts imports, kept so it
// runs unchanged (#240); they can go once it reads src/networks.ts.
export const RODALIES_FEED: Feed = { network: RODALIES, ...RODALIES.timetables[0] };
export const FGC_FEED: Feed = { network: FGC, ...FGC.timetables[0] };
export const TRAMBAIX_FEED: Feed = { network: TRAM, ...TRAM.timetables[0] };
export const METRO_FEED: Feed = { network: METRO, ...METRO.timetables[0] };
export const onRodaliesRails = onRails(RODALIES.rails);
export const onFgcRails = onRails(FGC.rails);
export const onMetroRails = onRails(METRO.rails);

/** The route types that run Trains: tram, metro, rail and funicular. Buses (3) and cable cars (6) don't. */
const RAIL = new Set(['0', '1', '2', '7']);

/**
 * A Network's Lines, Stations and shapes from one operator's GTFS feed, as those of every day in the
 * feed, and its Trips and replacement buses on one service day (YYYY-MM-DD). Renfe lists the buses
 * it runs in its Trains' place as Trips of bus routes named as their Line's routes are, as R3's: a
 * bus route named as none of them, as TMB's city buses are, is no Line's. Where the feed lists a Train
 * in parts, they're made one Trip, and the calls that fit none are logged (joinParts()).
 */
export async function readFeed(
  gtfs: Source,
  day: string,
  feed: Feed,
  log = console.log,
): Promise<{ lines: Line[]; stations: Station[]; shapes: FeedShape[]; trips: FeedTrip[]; buses: FeedBus[]; listed: Map<string, Set<string>> }> {
  const { network, prefix, operator } = feed;
  const pattern = feed.number && new RegExp(feed.number);
  const services = await serviceIdsOn(gtfs, day);
  const routes = new Map<string, { name: string; colour: string; gauges?: Gauges }>();
  const busRoutes = new Map<string, string>(); // each bus route's name
  for await (const r of rows(gtfs, 'routes.txt', ['route_id', 'route_short_name', 'route_type', 'route_color'])) {
    if (!r.route_id.startsWith(feed.routes?.idPrefix ?? '') || !(feed.routes?.names?.includes(r.route_short_name) ?? true)) continue;
    const name = network.lines.names?.[r.route_short_name] ?? r.route_short_name;
    const gauges = Object.entries(feed.routes?.gauges ?? {}).find(([end]) => r.route_id.endsWith(end))?.[1] ?? network.lines.gauges?.[name];
    if (RAIL.has(r.route_type)) routes.set(r.route_id, { name, colour: r.route_color, ...(gauges && { gauges }) });
    if (r.route_type === '3') busRoutes.set(r.route_id, name);
  }
  const named = new Set([...routes.values()].map((r) => r.name));

  const stops = new Map<string, Record<'stop_id' | 'stop_name' | 'stop_lat' | 'stop_lon' | 'parent_station', string>>();
  for await (const s of rows(gtfs, 'stops.txt', ['stop_id', 'stop_name', 'stop_lat', 'stop_lon', 'parent_station'], { blank: ['parent_station'] })) {
    stops.set(s.stop_id, s);
  }
  const stationOf = (stop: string) => {
    const own = stops.get(stop);
    return (feed.parents && own?.parent_station && stops.get(own.parent_station)) || own;
  };
  const station = (stop: string) => `${operator}:${stationOf(stop)?.stop_id ?? stop}`;

  // A Line's colour comes from the routes that carry Trips: Renfe also lists unused routes.
  const shapeOf = new Map<string, string>(); // each Trip's shape, on any day
  const numbers = new Map<string, string>(); // each Trip's Train number, on any day
  const lines = new Map<string, { colour: string; shapes: Set<string> }>();
  const dayTrips = new Map<string, Omit<FeedTrip, 'calls'> & { calls: (FeedTrip['calls'][number] & { seq: number })[] }>();
  const dayBuses = new Map<string, Omit<FeedBus, 'calls'> & { calls: { seq: number; stop: string; arrival: number; departure: number }[] }>();
  // Renfe's and TRAM's feeds publish no headsigns, and only Renfe's long-distance one trip_short_names.
  for await (const t of rows(gtfs, 'trips.txt', ['route_id', 'service_id', 'trip_id', 'trip_headsign', 'trip_short_name', 'shape_id'], { blank: ['trip_headsign', 'trip_short_name'] })) {
    const bus = busRoutes.get(t.route_id);
    if (bus && named.has(bus) && services.has(t.service_id)) dayBuses.set(t.trip_id, { id: `${prefix}:${t.trip_id}`, line: `${network.id}:${bus}`, calls: [] });
    const route = routes.get(t.route_id);
    if (!route) continue;
    shapeOf.set(t.trip_id, t.shape_id);
    const line = lines.get(route.name) ?? { colour: route.colour, shapes: new Set() };
    line.shapes.add(t.shape_id);
    lines.set(route.name, line);
    const number = pattern && (feed.shortNames ? t.trip_short_name : t.trip_id.slice(t.service_id.length)).match(pattern)?.[0];
    if (number) numbers.set(t.trip_id, number);
    if (!services.has(t.service_id)) continue;
    const trip = { id: `${prefix}:${t.trip_id}`, line: `${network.id}:${route.name}`, shape: `${prefix}:${t.shape_id}`, headsign: t.trip_headsign };
    dayTrips.set(t.trip_id, { ...trip, ...(number && { number }), ...(route.gauges && { gauges: route.gauges }), calls: [] });
  }

  const served = new Map<string, Set<string>>(); // the Stations each shape's Trips serve
  const everyDay = new Map<string, Set<string>>(); // the Stations each Train number calls at, on any day
  const ends = new Map<string, { first: [seq: number, station: string]; last: [seq: number, station: string] }>(); // each Trip's, on any day
  for await (const s of rows(gtfs, 'stop_times.txt', ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence'])) {
    dayBuses.get(s.trip_id)?.calls.push({ seq: Number(s.stop_sequence), stop: s.stop_id, arrival: seconds(s.arrival_time), departure: seconds(s.departure_time) });
    const shape = shapeOf.get(s.trip_id);
    if (shape === undefined) continue;
    const [seq, at] = [Number(s.stop_sequence), station(s.stop_id)];
    served.set(shape, (served.get(shape) ?? new Set()).add(at));
    const number = numbers.get(s.trip_id);
    if (number) everyDay.set(number, (everyDay.get(number) ?? new Set()).add(at));
    const end = ends.get(s.trip_id) ?? { first: [seq, at], last: [seq, at] };
    if (seq < end.first[0]) end.first = [seq, at];
    if (seq > end.last[0]) end.last = [seq, at];
    ends.set(s.trip_id, end);
    dayTrips.get(s.trip_id)?.calls.push({
      seq,
      station: at,
      arrival: seconds(s.arrival_time),
      departure: seconds(s.departure_time),
    });
  }

  // A frequency-based Trip, like the Montjuïc funicular's, is a pattern its Trains repeat every
  // headway from the start of each period, and one Trip each time.
  const repeats = new Map<string, { start: number; end: number; headway: number }[]>();
  for await (const f of rows(gtfs, 'frequencies.txt', ['trip_id', 'start_time', 'end_time', 'headway_secs'], { optional: true })) {
    const period = { start: seconds(f.start_time), end: seconds(f.end_time), headway: Number(f.headway_secs) };
    if (dayTrips.has(f.trip_id)) repeats.set(f.trip_id, [...(repeats.get(f.trip_id) ?? []), period]);
  }

  const all = new Set([...served.values()].flatMap((s) => [...s]));
  const stations = new Map<string, Station>();
  for (const id of stops.keys()) {
    const s = stationOf(id);
    const key = station(id);
    if (!s || !all.has(key) || stations.has(key)) continue;
    // Where the Station is a Line's own stop, as the Metro's are, the station grouping it is its place.
    const place = s.parent_station && `${operator}:${s.parent_station}`;
    const [lon, lat] = feed.points?.[s.stop_id] ?? [Number(s.stop_lon), Number(s.stop_lat)];
    stations.set(key, { id: key, name: s.stop_name, lon, lat, ...(place && { place }) });
  }

  // Renfe's long-distance timetable has no shapes, and its Trips name none.
  const wanted = new Set([...lines.values()].flatMap((l) => [...l.shapes]).filter((id) => id));
  const points = new Map<string, ShapePoint[]>();
  for await (const p of rows(gtfs, 'shapes.txt', ['shape_id', 'shape_pt_sequence', 'shape_pt_lat', 'shape_pt_lon'], { optional: feed.shapeless })) {
    if (!wanted.has(p.shape_id)) continue;
    const list = points.get(p.shape_id) ?? [];
    list.push({ seq: Number(p.shape_pt_sequence), lon: Number(p.shape_pt_lon), lat: Number(p.shape_pt_lat) });
    points.set(p.shape_id, list);
  }
  for (const id of wanted) if (!points.has(id)) console.warn(`${network.name} shape ${id} has no points`);

  // ponytail: a shape two Lines' Trips run goes with the last of them; no feed had one on 5 Oct 2026.
  const lineOf = new Map([...lines].flatMap(([name, line]) => [...line.shapes].map((id): [string, string] => [id, `${network.id}:${name}`])));
  const { shapes, shapeOf: shapeFor } = eachWay(
    [...points].map(([id, pts]) => ({
      id: `${prefix}:${id}`,
      line: lineOf.get(id) ?? '',
      coords: pts.sort((a, b) => a.seq - b.seq).map((p) => [p.lon, p.lat]),
      stations: [...(served.get(id) ?? [])],
    })),
    [...stations.values()],
    [...ends].map(([id, { first, last }]) => ({ shape: `${prefix}:${shapeOf.get(id)}`, from: first[1], to: last[1] })),
  );
  const ids = new Set(shapes.map((s) => s.id));
  // The Train numbers of its Trips that day, with the Stations each calls at, as another timetable's
  // Trains with one of them are its (unlisted()). On a day it has none of its Trips, they're every
  // day's: Renfe's Cercanías file of 10 Oct 2026 has none of Rodalies' from 22 October, but its
  // long-distance file still has Rodalies' regional Trains then, which aren't long distance's (#258).
  const listed = new Map<string, Set<string>>();
  for (const { number, calls } of dayTrips.values()) if (number) listed.set(number, new Set([...(listed.get(number) ?? []), ...calls.map((c) => c.station)]));
  const trips = [...dayTrips].flatMap(([id, { shape, ...rest }]) => {
    const trip = { ...rest, shape: shapeFor({ shape, from: ends.get(id)?.first[1] ?? '', to: ends.get(id)?.last[1] ?? '' }) };
    const calls = trip.calls.sort((a, b) => a.seq - b.seq).map(({ seq: _, ...call }) => call);
    // A Trip without a headsign is headed for its last Station.
    const headsign = trip.headsign || (stations.get(calls.at(-1)?.station ?? '')?.name ?? '');
    const periods = repeats.get(id);
    if (!periods) return [{ ...trip, headsign, calls }];
    const first = calls[0]?.departure ?? 0;
    return periods.flatMap(({ start, end, headway }) => {
      const each: FeedTrip[] = [];
      for (let t = start; headway > 0 && t < end; t += headway) {
        const at = (time: number) => time - first + t;
        each.push({ ...trip, id: `${trip.id}@${clock(t)}`, headsign, calls: calls.map((c) => ({ ...c, arrival: at(c.arrival), departure: at(c.departure) })) });
      }
      return each;
    });
  });
  return {
    lines: [...lines].map(([name, line]) => ({
      id: `${network.id}:${name}`,
      network: network.id,
      name,
      colour: network.lines.colours?.[name] ?? network.lines.colour ?? `#${line.colour}`,
      shapes: [...line.shapes].flatMap((id) => [`${prefix}:${id}`, `${prefix}:${id}:back`].filter((way) => ids.has(way))),
      kind: network.lines.kinds?.[name] ?? network.lines.kind,
      ...(network.lines.profiles?.[name] && { profile: network.lines.profiles[name] }),
    })),
    stations: [...stations.values()],
    shapes,
    trips: feed.parts ? joinParts(trips, stations, day, log) : trips,
    buses: [...dayBuses.values()].map((bus) => ({
      ...bus,
      // A stop only buses call at is none of the Network's Stations, but the report names it.
      calls: bus.calls.sort((a, b) => a.seq - b.seq).map(({ seq: _, stop, ...call }) => {
        const [id, s] = [station(stop), stationOf(stop)];
        return { station: stations.get(id) ?? { id, name: s?.stop_name ?? stop, lon: Number(s?.stop_lon), lat: Number(s?.stop_lat) }, ...call };
      }),
    })),
    listed: dayTrips.size ? listed : everyDay,
  };
}

/**
 * How far apart in time a Train's calls at a Station, each in one of the Trips its timetable lists it
 * in, can be and still be one call: a Trip that ends where another starts arrives a minute or two before
 * the other leaves, as Alvia 00622's at Ourense, 20:59 against 21:01 (docs/research/high-speed.md).
 */
const SAME_CALL = 120;

/**
 * A day's Trips, with each Train's made one where its timetable lists it in parts, a Trip for each part
 * of its run it sells, as Renfe's long-distance one does (CONTEXT.md). It's its Trip with the most
 * calls, joined by each other part in turn: a part's call at one of its Stations within SAME_CALL is
 * that call, and its calls between two such ones join it in time, as MD 18030's at Linares-Baeza did on
 * 10 Oct 2026. Any other call is dropped, and logged with its Train number, Station and time: on 5 Oct
 * 2026 all were where Renfe runs part of the way by road, as Reg.Exp. 17307's to and from Baides (#269).
 */
export function joinParts(trips: FeedTrip[], stations: Map<string, Station>, day: string, log = console.log): FeedTrip[] {
  const parts = new Map<string, FeedTrip[]>();
  for (const t of trips) parts.set(t.number ?? t.id, [...(parts.get(t.number ?? t.id) ?? []), t]);
  // Each once, though one of a Train's Trips ends there and another starts there.
  const dropped = new Set<string>();
  const joined = [...parts.values()].map((each) =>
    each
      .toSorted((a, b) => b.calls.length - a.calls.length)
      .reduce((trip, part) => {
        const shared = part.calls.map((c) => trip.calls.some((t) => t.station === c.station && Math.max(c.arrival - t.departure, t.arrival - c.departure) <= SAME_CALL));
        const [first, last] = [shared.indexOf(true), shared.lastIndexOf(true)];
        const between = part.calls.filter((_, i) => !shared[i] && first < i && i < last);
        for (const [i, c] of part.calls.entries()) {
          if (shared[i] || (first < i && i < last)) continue;
          dropped.add(`${trip.line} ${trip.number} drops its call at ${stations.get(c.station)?.name ?? c.station} at ${clock(c.arrival).slice(0, 5)} on ${day}: it lies outside the run its Trips share`);
        }
        return { ...trip, calls: [...trip.calls, ...between].sort((a, b) => a.arrival - b.arrival) };
      }),
  );
  for (const line of dropped) log(line);
  return joined;
}

/**
 * Trips less the Trains other timetables list too, by each of their Train numbers and the Stations it
 * calls at (readFeed()'s `listed`): those with one of the numbers that call at one of its Stations
 * (CONTEXT.md), which are kept from that timetable, as Rodalies' and the núcleos' have shapes. On 10 Oct
 * 2026 Renfe's long-distance timetable lists 98 of Rodalies' Trains, on R11, R13–R17, RL3 and RT2, and
 * 55 of the núcleos'.
 */
export function unlisted(trips: FeedTrip[], listed: Map<string, Set<string>>[]): FeedTrip[] {
  return trips.filter((t) => !listed.some((l) => t.calls.some((c) => l.get(t.number ?? '')?.has(c.station))));
}

/** The folder readTimetables() keeps its copies in unless given another, so the one copyOf() names too. */
const CACHE = '.cache';

/** Where readTimetables() keeps the copy of a timetable, in `cache`, which `npm run snippet` reads. */
export function copyOf({ prefix }: Timetable, cache = CACHE): string {
  return join(cache, `timetable-${prefix}.zip`);
}

/**
 * A Network's timetables, read (`read`) from their downloads, in zipFile(), or where one couldn't be
 * downloaded (`failed` says why) or read, or gives the Network no Lines, from the copy of them that
 * last built it, kept in `cache` (#286), which is reported as a problem spot, with the day it was kept
 * and why. `read` gives the Lines each timetable gives the Network. Timetables that each give it Lines
 * replace its copy, which is its own, as one Renfe file can have one núcleo's Trips and not another's.
 * With no copy, it fails.
 */
export async function readTimetables<T extends { lines: unknown[][] }>(
  network: Pick<NetworkConfig, 'id' | 'name' | 'timetables' | 'lines'>,
  failed: unknown,
  read: (feeds: (Feed & { gtfs: Source })[]) => Promise<T>,
  report: (found: Found) => void,
  cache = CACHE,
): Promise<T> {
  const copy = (t: Timetable) => copyOf(t, cache);
  const from = (zip: (t: Timetable) => string) => read(network.timetables.map((t) => ({ ...t, network, gtfs: zipSource(zip(t)) })));
  let why = failed;
  let got: T | undefined;
  if (!failed) {
    try {
      got = await from((t) => zipFile(t.prefix));
    } catch (error) {
      why = error;
    }
  }
  const empty = got && network.timetables.find((_, i) => !got.lines[i]?.length);
  if (got && !empty) {
    await mkdir(cache, { recursive: true });
    // ponytail: a copy for each Network, as one Renfe file can give one núcleo its Trips and not
    // another, so Renfe's 14 MB file is kept 15 times, about 210 MB of every save of the cache; keep a
    // file several Networks' copies share once, by its hash, if the cache nears the 10 GB Actions
    // keeps for a repo.
    for (const t of network.timetables) await copyFile(zipFile(t.prefix), copy(t));
    return got;
  }
  // Never print a query string: TMB's holds its key.
  if (empty) why = `${empty.url.split('?')[0]} gives it no Lines`;
  // One line, for the summary's list: unzip prints the rest of its own to the log.
  const reason = `${why instanceof Error ? why.message : why}`.replace(/\n.*/s, '');
  // The day the copy was kept, none where one of the Network's timetables has none.
  const day = await Promise.all(network.timetables.map((t) => stat(copy(t)))).then(([first]) => first && madridDate(first.mtime), () => undefined);
  if (!day) throw new Error(`${network.name} has no copy of its timetables to build it from: ${reason}`);
  const line = `${network.name} is built from the copy of its timetables kept on ${day}: ${reason}`;
  console.warn(line);
  report({ kind: 'copy', network: network.id, text: [line] });
  return from(copy);
}

/** Seconds into the service day as a GTFS time, such as 25:10:00. */
function clock(time: number): string {
  return [time / 3600, (time / 60) % 60, time % 60].map((n) => String(Math.floor(n)).padStart(2, '0')).join(':');
}

interface ShapePoint {
  seq: number;
  lon: number;
  lat: number;
}
