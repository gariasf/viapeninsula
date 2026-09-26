// Catalonia's border: the map draws no track and no Stations beyond it, and Trains leave it there.

import { pointAt, type Point, type Shape, type Station } from '../bundle.ts';
import { nearest } from './track.ts';
import { REACH, type FeedTrip } from './trips.ts';

/**
 * A Network's Stations, track and each day's Trips as the feed times them, within a border drawn
 * as the ways that make it up, in any order. Track is cut where it crosses the border, and still
 * counts from where it started, so Trips placed on the whole track stay placed. A Trip keeps its
 * calls within the border, and the first beyond it each way where its track reaches that far, so its
 * Train runs to the border and leaves the map there; one that never comes within it is left out.
 * Those calls beyond the border name Stations that aren't the bundle's.
 */
export function crop(border: Point[][], stations: Station[], shapes: Shape[], days: FeedTrip[][]) {
  const inside = within(border);
  const kept = new Set(stations.filter((s) => inside([s.lon, s.lat])).map((s) => s.id));
  const [byId, byShape] = [new Map(stations.map((s) => [s.id, s])), new Map(shapes.map((s) => [s.id, s]))];
  const onTrack = (station: string, shape: string) => {
    const [s, track] = [byId.get(station), byShape.get(shape)];
    return !!s && !!track && nearest(track.coords, [s.lon, s.lat]).metres <= REACH;
  };
  const callKept = (trip: FeedTrip, i: number) => {
    const station = trip.calls[i]?.station ?? '';
    if (kept.has(station)) return true;
    const beside = [i - 1, i + 1].some((j) => kept.has(trip.calls[j]?.station ?? ''));
    return beside && onTrack(station, trip.shape);
  };
  return {
    stations: stations.filter((s) => kept.has(s.id)),
    shapes: shapes.flatMap((s) => clip(s, inside) ?? []),
    days: days.map((trips) =>
      trips.flatMap((trip): FeedTrip[] => {
        const calls = trip.calls.filter((_, i) => callKept(trip, i));
        return calls.some((c) => kept.has(c.station)) ? [{ ...trip, calls }] : [];
      }),
    ),
  };
}

/** Whether a point lies within a border: a ray from it due east crosses the border an odd number of times. */
function within(border: Point[][]): (p: Point) => boolean {
  // Each ray only meets the border's segments that span its latitude, so they go in bands of it.
  const BAND = 0.01;
  const bands = new Map<number, [Point, Point][]>();
  for (const way of border) {
    for (const [i, b] of way.entries()) {
      const a = way[i - 1];
      if (!a) continue;
      for (let k = Math.floor(Math.min(a[1], b[1]) / BAND); k <= Math.floor(Math.max(a[1], b[1]) / BAND); k++) {
        let band = bands.get(k);
        if (!band) bands.set(k, (band = []));
        band.push([a, b]);
      }
    }
  }
  return ([x, y]) => {
    let odd = false;
    for (const [a, b] of bands.get(Math.floor(y / BAND)) ?? []) {
      if (a[1] > y !== b[1] > y && x < a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1])) odd = !odd;
    }
    return odd;
  };
}

/**
 * A shape from where it first comes within the border to where it last leaves it, or none if it
 * never does.
 * ponytail: keeps any stretch that strays beyond the border in between; none of Catalonia's does.
 * Split a shape into its pieces within the border if one ever does.
 */
function clip(shape: Shape, inside: (p: Point) => boolean): Shape | undefined {
  const { coords, dist } = shape;
  const isInside = coords.map(inside);
  const [first, last] = [isInside.indexOf(true), isInside.lastIndexOf(true)];
  if (first < 0) return undefined;
  // How far along the shape it crosses the border between a point within it and one beyond, found by halving.
  const crossing = (i: number, j: number) => {
    let [a, b] = [dist[i] ?? 0, dist[j] ?? 0];
    for (let n = 0; n < 40; n++) {
      const mid = (a + b) / 2;
      if (inside(pointAt(shape, mid))) a = mid;
      else b = mid;
    }
    return Math.round(a);
  };
  const from = first > 0 ? [crossing(first, first - 1)] : [];
  const to = last < coords.length - 1 ? [crossing(last, last + 1)] : [];
  return {
    id: shape.id,
    coords: [...from.map((d) => pointAt(shape, d)), ...coords.slice(first, last + 1), ...to.map((d) => pointAt(shape, d))],
    dist: [...from, ...dist.slice(first, last + 1), ...to],
  };
}
