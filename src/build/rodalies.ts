import type { Line, Network, Station } from '../bundle.ts';
import { rows, type Source } from './gtfs.ts';
import type { OsmWay } from './osm.ts';
import type { FeedShape } from './track.ts';

export const RODALIES: Network = { id: 'rodalies', name: 'Rodalies de Catalunya' };

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
 * routes only (route_type 3 is a rail-replacement bus, which isn't a Train).
 */
export async function buildRodalies(gtfs: Source): Promise<{ lines: Line[]; stations: Station[]; shapes: FeedShape[] }> {
  const routes = new Map<string, { name: string; colour: string }>();
  for await (const r of rows(gtfs, 'routes.txt', ['route_id', 'route_short_name', 'route_type', 'route_color'])) {
    if (r.route_id.startsWith('51') && r.route_type === '2') {
      routes.set(r.route_id, { name: r.route_short_name, colour: r.route_color });
    }
  }

  // A Line's colour comes from the routes that carry Trips: Renfe also lists unused routes.
  const trips = new Map<string, string>(); // each Trip's shape
  const lines = new Map<string, { colour: string; shapes: Set<string> }>();
  for await (const t of rows(gtfs, 'trips.txt', ['route_id', 'trip_id', 'shape_id'])) {
    const route = routes.get(t.route_id);
    if (!route) continue;
    trips.set(t.trip_id, t.shape_id);
    const line = lines.get(route.name) ?? { colour: route.colour, shapes: new Set() };
    line.shapes.add(t.shape_id);
    lines.set(route.name, line);
  }

  const served = new Map<string, Set<string>>(); // the Stations each shape's Trips serve
  for await (const s of rows(gtfs, 'stop_times.txt', ['trip_id', 'stop_id'])) {
    const shape = trips.get(s.trip_id);
    if (shape === undefined) continue;
    served.set(shape, (served.get(shape) ?? new Set()).add(adif(s.stop_id)));
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
