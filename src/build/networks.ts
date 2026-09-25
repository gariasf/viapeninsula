// Each Network: how its Trains run, which rails they run on, and how to read its operator's feed.

import type { Line, Network, Station } from '../bundle.ts';
import { rows, seconds, serviceIdsOn, type Source } from './gtfs.ts';
import type { OsmWay } from './osm.ts';
import type { FeedShape } from './track.ts';
import type { FeedTrip } from './trips.ts';

const RODALIES: Network = {
  id: 'rodalies',
  name: 'Rodalies de Catalunya',
  // Every stretch between Stations in Renfe's timetable of 24 September 2026 fits 1 m/s² (138 don't
  // fit 0.7), and the fastest Units on the regional lines run at 160 km/h. Small Stations get half a minute.
  profile: { acceleration: 1, braking: 1, topSpeed: 160 / 3.6, dwell: 30 },
};

/** Rodalies runs on Iberian-gauge rails, which keeps it off the standard-gauge high-speed line. */
export function onRodaliesRails(way: OsmWay): boolean {
  return way.tags.railway === 'rail' && (way.tags.gauge ?? '').split(';').includes('1668');
}

/** Rodalies, including its regional lines, from Renfe's Cercanías GTFS: núcleo 51 only. Its Stations are Adif's. */
export const RODALIES_FEED: Feed = {
  network: RODALIES,
  prefix: 'rodalies',
  operator: 'adif',
  routes: (id) => id.startsWith('51'),
  // A trip_id is the service_id, then the Train number's five digits, then the Line.
  number: (trip) => trip.trip_id.slice(trip.service_id.length).match(/^\d{5}/)?.[0],
  // Renfe's feed gives two Lines the wrong colour on the routes their Trips run on (seen 2026-09-24).
  // R7's carry R2's green, though Renfe's other R7 routes say B57CBB. R13's carry R2S's green, but R13
  // is pink (Wikidata Q6018166).
  colours: { R7: 'B57CBB', R13: 'E52E87' },
};

const FGC: Network = {
  id: 'fgc',
  name: 'Ferrocarrils de la Generalitat de Catalunya',
  // FGC's timetable is in quarter minutes, so a tenth of the stretches it runs on 1 October 2026 fit
  // no train at 1 m/s², such as Baixador de Vallvidrera to Les Planes, 933 m in 30 s: those Trains
  // accelerate and brake harder. Its fastest Units, on the line to La Pobla, run at 120 km/h. Most of
  // its Stations get half a minute.
  profile: { acceleration: 1, braking: 1, topSpeed: 120 / 3.6, dwell: 30 },
};

/** FGC runs on rails of its own, of three gauges. */
export function onFgcRails(way: OsmWay): boolean {
  return ['rail', 'narrow_gauge', 'subway', 'funicular'].includes(way.tags.railway ?? '') && isFgc(way);
}

function isFgc(way: OsmWay): boolean {
  return ['FGC', 'Ferrocarrils de la Generalitat de Catalunya'].includes(way.tags.operator ?? '');
}

/** FGC's feed makes each platform a stop of its own; its Stations go by FGC's codes. */
export const FGC_FEED: Feed = {
  network: FGC,
  prefix: 'fgc',
  operator: 'fgc',
  parents: true,
  // R53 and R63 are FGC's names for R5's and R6's late Trips, which call at every Station: Martorell
  // Vila and Colònia Güell too, and Santa Coloma de Cervelló on R53. The public knows them as R5 and
  // R6: their route URLs point to R5's and R6's pages (seen 2026-09-25).
  names: { R53: 'R5', R63: 'R6' },
};

const TRAM: Network = {
  id: 'tram',
  name: 'TRAM',
  // Every stretch TRAM runs on 1 October 2026 fits 1.2 m/s² (312 don't fit 1), and its Units, Citadis
  // trams, run at 70 km/h. It gives every Station 10 seconds.
  profile: { acceleration: 1.2, braking: 1.2, topSpeed: 70 / 3.6, dwell: 10 },
};

export function onTramRails(way: OsmWay): boolean {
  return way.tags.railway === 'tram';
}

/**
 * TRAM publishes a feed for each of its halves, Trambaix (T1–T3) and Trambesòs (T4–T6), and their
 * shapes' IDs clash. Each feed makes each platform a stop of its own.
 */
export const TRAMBAIX_FEED: Feed = { network: TRAM, prefix: 'tram:TBX', operator: 'tram', parents: true };
export const TRAMBESOS_FEED: Feed = { network: TRAM, prefix: 'tram:TBS', operator: 'tram', parents: true };

const METRO: Network = {
  id: 'metro',
  name: 'Metro de Barcelona',
  // Every stretch the Metro runs on 1 October 2026 fits 1.3 m/s² (689 don't fit 1.2), but for one L1
  // Trip's 894 m from Santa Coloma to Fondo in 30 s. Its Units run at 80 km/h. TMB gives each Station
  // about 20 seconds.
  profile: { acceleration: 1.3, braking: 1.3, topSpeed: 80 / 3.6, dwell: 20 },
};

/** The Metro runs underground, but for the Montjuïc funicular, on rails that aren't FGC's. */
export function onMetroRails(way: OsmWay): boolean {
  return ['subway', 'funicular'].includes(way.tags.railway ?? '') && !isFgc(way);
}

/**
 * TMB's feed, whose metro and funicular are the Metro's. Its Stations are TMB's stops, one for each
 * Line calling there: the stations TMB groups them in can hold Lines 270 m apart, as at Passeig de
 * Gràcia, too far from some of their rails for one place to stand for them all (ADR-0005).
 */
export const METRO_FEED: Feed = { network: METRO, prefix: 'metro', operator: 'tmb' };

/** How to read one operator's GTFS feed: which of its Trains are this Network's, and what to call what it publishes. */
export interface Feed {
  network: Network;
  /** What its Trips' and shapes' IDs start with, as in `rodalies:<trip_id>`. */
  prefix: string;
  /** What its Stations' IDs start with: whoever runs them, as in `adif:<stop_id>` for Renfe's. */
  operator: string;
  /** Whether a stop's Station is its parent station, where the feed makes each platform a stop of its own. */
  parents?: boolean;
  /** Which of its rail routes are this Network's, where not all are. */
  routes?: (routeId: string) => boolean;
  /** A Trip's Train number, where the operator publishes one. */
  number?: (trip: { trip_id: string; service_id: string }) => string | undefined;
  /** Colours for the Lines the feed gets wrong, by the Line's name. */
  colours?: Record<string, string>;
  /** The Line each route runs on, by the route's name, where the feed names some of a Line's Trips apart. */
  names?: Record<string, string>;
}

/** The route types that run Trains: tram, metro, rail and funicular. Buses (3) and cable cars (6) don't. */
const RAIL = new Set(['0', '1', '2', '7']);

/**
 * A Network's Lines, Stations and shapes from one operator's GTFS feed, as those of every day in the
 * feed, and its Trips on one service day (YYYY-MM-DD).
 */
export async function readFeed(
  gtfs: Source,
  day: string,
  feed: Feed,
): Promise<{ lines: Line[]; stations: Station[]; shapes: FeedShape[]; trips: FeedTrip[] }> {
  const { network, prefix, operator } = feed;
  const services = await serviceIdsOn(gtfs, day);
  const routes = new Map<string, { name: string; colour: string }>();
  for await (const r of rows(gtfs, 'routes.txt', ['route_id', 'route_short_name', 'route_type', 'route_color'])) {
    if (RAIL.has(r.route_type) && (feed.routes?.(r.route_id) ?? true)) {
      routes.set(r.route_id, { name: feed.names?.[r.route_short_name] ?? r.route_short_name, colour: r.route_color });
    }
  }

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
  const lines = new Map<string, { colour: string; shapes: Set<string> }>();
  const dayTrips = new Map<string, Omit<FeedTrip, 'calls'> & { calls: (FeedTrip['calls'][number] & { seq: number })[] }>();
  // Renfe's and TRAM's feeds publish no headsigns.
  for await (const t of rows(gtfs, 'trips.txt', ['route_id', 'service_id', 'trip_id', 'trip_headsign', 'shape_id'], { blank: ['trip_headsign'] })) {
    const route = routes.get(t.route_id);
    if (!route) continue;
    shapeOf.set(t.trip_id, t.shape_id);
    const line = lines.get(route.name) ?? { colour: route.colour, shapes: new Set() };
    line.shapes.add(t.shape_id);
    lines.set(route.name, line);
    if (!services.has(t.service_id)) continue;
    const number = feed.number?.(t);
    const trip = { id: `${prefix}:${t.trip_id}`, line: `${network.id}:${route.name}`, shape: `${prefix}:${t.shape_id}`, headsign: t.trip_headsign };
    dayTrips.set(t.trip_id, { ...trip, ...(number && { number }), calls: [] });
  }

  const served = new Map<string, Set<string>>(); // the Stations each shape's Trips serve
  for await (const s of rows(gtfs, 'stop_times.txt', ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence'])) {
    const shape = shapeOf.get(s.trip_id);
    if (shape === undefined) continue;
    served.set(shape, (served.get(shape) ?? new Set()).add(station(s.stop_id)));
    dayTrips.get(s.trip_id)?.calls.push({
      seq: Number(s.stop_sequence),
      station: station(s.stop_id),
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
    stations.set(key, { id: key, name: s.stop_name, lon: Number(s.stop_lon), lat: Number(s.stop_lat), ...(place && { place }) });
  }

  const wanted = new Set([...lines.values()].flatMap((l) => [...l.shapes]));
  const points = new Map<string, ShapePoint[]>();
  for await (const p of rows(gtfs, 'shapes.txt', ['shape_id', 'shape_pt_sequence', 'shape_pt_lat', 'shape_pt_lon'])) {
    if (!wanted.has(p.shape_id)) continue;
    const list = points.get(p.shape_id) ?? [];
    list.push({ seq: Number(p.shape_pt_sequence), lon: Number(p.shape_pt_lon), lat: Number(p.shape_pt_lat) });
    points.set(p.shape_id, list);
  }
  for (const id of wanted) if (!points.has(id)) console.warn(`${network.name} shape ${id} has no points`);

  return {
    lines: [...lines].map(([name, line]) => ({
      id: `${network.id}:${name}`,
      network: network.id,
      name,
      colour: `#${feed.colours?.[name] ?? line.colour}`,
      shapes: [...line.shapes].filter((id) => points.has(id)).map((id) => `${prefix}:${id}`),
    })),
    stations: [...stations.values()],
    shapes: [...points].map(([id, pts]) => ({
      id: `${prefix}:${id}`,
      coords: pts.sort((a, b) => a.seq - b.seq).map((p) => [p.lon, p.lat]),
      stations: [...(served.get(id) ?? [])],
    })),
    trips: [...dayTrips].flatMap(([id, trip]) => {
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
    }),
  };
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
