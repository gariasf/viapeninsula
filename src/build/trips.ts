// Each Trip placed on its track: how far along it each of its Stations is.

import { closestOnSegment, DEGREE, type Line, type Point, type Shape, type Station, type Trip } from '../bundle.ts';
import { nearest, orderAlong } from './track.ts';

/** A Trip as the feed times it, before its Stations are placed on its track. */
export interface FeedTrip {
  id: string;
  line: string;
  shape: string;
  headsign: string;
  number?: string;
  /** Its calls in order, with arrival and departure in seconds into the service day. */
  calls: { station: string; arrival: number; departure: number }[];
}

/**
 * A Station is on a Trip's track where the track passes within 300 m of it. Renfe's Stations are
 * within 70 m of their traced track, and the ones off it are kilometres away.
 */
const REACH = 300;

/**
 * Places each Trip's Stations along its track. Where the track passes a Station more than once, a
 * Station goes where the Trip travels least to reach it and carry on: a Trip can turn back at a
 * Station, but not in between. A Trip calling at a Station off its track, or that would have to run
 * faster than its Network's top speed (in m/s) between two Stations, is left out and reported rather
 * than drawn wrong.
 */
export function placeTrips(
  trips: FeedTrip[],
  lines: Line[],
  shapes: Shape[],
  stations: Station[],
  topSpeed: number,
  log = console.log,
): Trip[] {
  const byId = new Map(stations.map((s) => [s.id, s]));
  const byShape = new Map(shapes.map((s) => [s.id, s]));
  const firstShape = new Map(lines.map((l) => [l.id, byShape.get(l.shapes[0] ?? '')]));
  const cached = new Map<string, Pass[]>();
  const passesOf = (shape: Shape, station: Station) => {
    const key = `${shape.id} ${station.id}`;
    const found = cached.get(key) ?? passes(shape, [station.lon, station.lat]);
    cached.set(key, found);
    return found;
  };

  return trips.flatMap(({ calls, ...trip }): Trip[] => {
    const shape = byShape.get(trip.shape);
    if (!shape || calls.length < 2) {
      log(`${trip.id} is left out: ${shape ? 'it calls at fewer than two Stations' : `its shape ${trip.shape} has no track`}`);
      return [];
    }
    const calledAt = calls.map((c) => byId.get(c.station) ?? { id: c.station, name: c.station, lon: NaN, lat: NaN });
    const options = calledAt.map((s) => passesOf(shape, s));
    const off = calledAt.find((_, i) => !options[i]?.length);
    if (off) {
      const km = (nearest(shape.coords, [off.lon, off.lat]).metres / 1000).toFixed(1);
      log(`${trip.id} is left out: ${off.name} is ${km} km off its track`);
      return [];
    }
    const dist = leastTravel(options);
    // A stretch faster than the Network's top speed is placed on the wrong track, say one that runs back past a Station.
    const speed = (i: number) => Math.abs((dist[i] ?? 0) - (dist[i - 1] ?? 0)) / ((calls[i]?.arrival ?? 0) - (calls[i - 1]?.departure ?? 0));
    const fast = calls.findIndex((_, i) => i > 0 && speed(i) > topSpeed);
    if (fast > 0) {
      log(`${trip.id} is left out: it would run ${calledAt[fast - 1]?.name} → ${calledAt[fast]?.name} at ${Math.round(speed(fast) * 3.6)} km/h along its track`);
      return [];
    }
    // Which way it runs along its Line's first shape, from its first Station to its last.
    const first = firstShape.get(trip.line) ?? shape;
    const [from = 0, to = 0] = [calledAt[0], calledAt.at(-1)].map((s) => (s ? orderAlong(first.coords, nearest(first.coords, [s.lon, s.lat])) : 0));
    return [{ ...trip, direction: to < from ? 1 : 0, calls: calls.map((c, i) => ({ ...c, dist: Math.round(dist[i] ?? 0) })) }];
  });
}

/** One time a track passes a Station: how far along it comes closest, and how close, in metres. */
interface Pass {
  along: number;
  metres: number;
}

/** Each time a shape passes within REACH of a point, from its start. */
function passes({ coords, dist }: Shape, p: Point): Pass[] {
  const kx = DEGREE * Math.cos((p[1] * Math.PI) / 180);
  const found: Pass[] = [];
  let inside = false; // whether the shape is within REACH where the last segment ends
  for (const [i, b] of coords.entries()) {
    const a = coords[i - 1];
    if (!a) continue;
    const [t, metres] = closestOnSegment(a, b, p, kx);
    if (metres <= REACH) {
      const [start = 0, end = 0] = [dist[i - 1], dist[i]];
      const pass = { along: start + t * (end - start), metres };
      const last = found.at(-1);
      if (!inside || !last) found.push(pass);
      else if (metres < last.metres) Object.assign(last, pass);
    }
    inside = Math.hypot((b[0] - p[0]) * kx, (b[1] - p[1]) * DEGREE) <= REACH;
  }
  return found;
}

/**
 * Where along the track to place each of a Trip's Stations, given the passes of each: the ones
 * that make the distance it travels from first to last shortest, and of those, the ones closest to
 * its Stations.
 */
function leastTravel(options: Pass[][]): number[] {
  const better = <T extends { travel: number; off: number }>(a: T, b: T) => (b.travel < a.travel || (b.travel === a.travel && b.off < a.off) ? b : a);
  let ways = (options[0] ?? []).map((p) => ({ travel: 0, off: p.metres, dist: [p.along] }));
  for (const passes of options.slice(1)) {
    ways = passes.map((p) => {
      const best = ways.map((way) => ({ ...way, travel: way.travel + Math.abs(p.along - (way.dist.at(-1) ?? 0)) })).reduce(better);
      return { travel: best.travel, off: best.off + p.metres, dist: [...best.dist, p.along] };
    });
  }
  return ways.reduce(better).dist;
}
