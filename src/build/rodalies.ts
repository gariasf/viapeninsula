import type { Line, Network, Station } from '../bundle.ts';
import { rows, seconds, serviceIdsOn, type Source } from './gtfs.ts';
import type { OsmWay } from './osm.ts';
import type { FeedShape } from './track.ts';
import type { FeedTrip } from './trips.ts';

export const RODALIES: Network = {
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

// Renfe's feed gives two Lines the wrong colour on the routes their Trips run on (seen 2026-09-24).
// R7's carry R2's green, though Renfe's other R7 routes say B57CBB. R13's carry R2S's green, but R13
// is pink (Wikidata Q6018166).
const COLOUR_FIXES: Record<string, string> = { R7: 'B57CBB', R13: 'E52E87' };

/**
 * Rodalies, including its regional lines, from Renfe's Cercanías GTFS: núcleo 51 only, and rail
 * routes only (route_type 3 is a rail-replacement bus, which isn't a Train). Its Lines, Stations and
 * shapes are those of every day in the feed, and its Trips those of one service day (YYYY-MM-DD).
 */
export async function buildRodalies(
  gtfs: Source,
  day: string,
): Promise<{ lines: Line[]; stations: Station[]; shapes: FeedShape[]; trips: FeedTrip[] }> {
  const services = await serviceIdsOn(gtfs, day);
  const routes = new Map<string, { name: string; colour: string }>();
  for await (const r of rows(gtfs, 'routes.txt', ['route_id', 'route_short_name', 'route_type', 'route_color'])) {
    if (r.route_id.startsWith('51') && r.route_type === '2') {
      routes.set(r.route_id, { name: r.route_short_name, colour: r.route_color });
    }
  }

  // A Line's colour comes from the routes that carry Trips: Renfe also lists unused routes.
  const shapeOf = new Map<string, string>(); // each Trip's shape, on any day
  const lines = new Map<string, { colour: string; shapes: Set<string> }>();
  const dayTrips = new Map<string, Omit<FeedTrip, 'calls'> & { calls: (FeedTrip['calls'][number] & { seq: number })[] }>();
  for await (const t of rows(gtfs, 'trips.txt', ['route_id', 'service_id', 'trip_id', 'trip_headsign', 'shape_id'])) {
    const route = routes.get(t.route_id);
    if (!route) continue;
    shapeOf.set(t.trip_id, t.shape_id);
    const line = lines.get(route.name) ?? { colour: route.colour, shapes: new Set() };
    line.shapes.add(t.shape_id);
    lines.set(route.name, line);
    if (!services.has(t.service_id)) continue;
    // A trip_id is the service_id, then the Train number's five digits, then the Line.
    const number = t.trip_id.slice(t.service_id.length).match(/^\d{5}/)?.[0];
    const trip = { id: `rodalies:${t.trip_id}`, line: `rodalies:${route.name}`, shape: `rodalies:${t.shape_id}`, headsign: t.trip_headsign };
    dayTrips.set(t.trip_id, { ...trip, ...(number && { number }), calls: [] });
  }

  const served = new Map<string, Set<string>>(); // the Stations each shape's Trips serve
  for await (const s of rows(gtfs, 'stop_times.txt', ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence'])) {
    const shape = shapeOf.get(s.trip_id);
    if (shape === undefined) continue;
    served.set(shape, (served.get(shape) ?? new Set()).add(adif(s.stop_id)));
    dayTrips.get(s.trip_id)?.calls.push({
      seq: Number(s.stop_sequence),
      station: adif(s.stop_id),
      arrival: seconds(s.arrival_time),
      departure: seconds(s.departure_time),
    });
  }

  const all = new Set([...served.values()].flatMap((s) => [...s]));
  const stations: Station[] = [];
  for await (const s of rows(gtfs, 'stops.txt', ['stop_id', 'stop_name', 'stop_lat', 'stop_lon'])) {
    if (all.has(adif(s.stop_id))) {
      stations.push({ id: adif(s.stop_id), name: s.stop_name, lon: Number(s.stop_lon), lat: Number(s.stop_lat) });
    }
  }

  const wanted = new Set([...lines.values()].flatMap((l) => [...l.shapes]));
  const points = new Map<string, ShapePoint[]>();
  for await (const p of rows(gtfs, 'shapes.txt', ['shape_id', 'shape_pt_sequence', 'shape_pt_lat', 'shape_pt_lon'])) {
    if (!wanted.has(p.shape_id)) continue;
    const list = points.get(p.shape_id) ?? [];
    list.push({ seq: Number(p.shape_pt_sequence), lon: Number(p.shape_pt_lon), lat: Number(p.shape_pt_lat) });
    points.set(p.shape_id, list);
  }
  for (const id of wanted) if (!points.has(id)) console.warn(`Rodalies shape ${id} has no points`);

  const names = new Map(stations.map((s) => [s.id, s.name]));
  return {
    lines: [...lines].map(([name, line]) => ({
      id: `rodalies:${name}`,
      network: RODALIES.id,
      name,
      colour: `#${COLOUR_FIXES[name] ?? line.colour}`,
      shapes: [...line.shapes].filter((id) => points.has(id)).map((id) => `rodalies:${id}`),
    })),
    stations,
    shapes: [...points].map(([id, pts]) => ({
      id: `rodalies:${id}`,
      coords: pts.sort((a, b) => a.seq - b.seq).map((p) => [p.lon, p.lat]),
      stations: [...(served.get(id) ?? [])],
    })),
    trips: [...dayTrips.values()].map((trip) => {
      const calls = trip.calls.sort((a, b) => a.seq - b.seq).map(({ seq: _, ...call }) => call);
      // Renfe publishes no headsigns, so a Trip is headed for its last Station.
      return { ...trip, headsign: trip.headsign || (names.get(calls.at(-1)?.station ?? '') ?? ''), calls };
    }),
  };
}

interface ShapePoint {
  seq: number;
  lon: number;
  lat: number;
}

/** Renfe's Stations are Adif's, known by Adif's codes. */
function adif(stop: string): string {
  return `adif:${stop}`;
}
