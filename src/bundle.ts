// What the daily build publishes and the web app reads.

/** The R2 bucket, behind the CDN, that serves the daily bundles and (later) the live snapshot. */
export const LIVE_URL = 'https://viapeninsula-live.gariasf.com';

/** Names the bundle for each service day. Cached briefly; the bundles it names never change. */
export interface Manifest {
  days: { date: string; bundle: string }[];
}

/** Everything the map needs for one service day. */
export interface Bundle {
  serviceDay: string;
  networks: Network[];
  lines: Line[];
  stations: Station[];
  shapes: Shape[];
  /** How the map draws the Lines: each Line's track once, beside the other Lines on it. */
  strokes: Stroke[];
}

export interface Network {
  id: string;
  name: string;
}

export interface Line {
  id: string;
  network: string;
  name: string;
  colour: string;
  shapes: string[];
}

/**
 * Part of one of a Line's shapes, from one distance along it to another in metres, drawn `side`
 * line widths to the right of its track, or to the left where negative.
 */
export interface Stroke {
  line: string;
  shape: string;
  from: number;
  to: number;
  side: number;
}

/** Identified by whoever runs it: `adif:<code>` for Renfe's Stations. */
export interface Station {
  id: string;
  name: string;
  lon: number;
  lat: number;
}

/** A stretch of track: its points in order, and the distance along it at each point, in metres. */
export interface Shape {
  id: string;
  coords: [lon: number, lat: number][];
  dist: number[];
}

/** A line's points from one distance along it to another, where `dist` gives the distance at each point. */
export function along({ coords, dist }: Pick<Shape, 'coords' | 'dist'>, from: number, to: number): Shape['coords'] {
  const at = (d: number): [lon: number, lat: number] => {
    const i = dist.findIndex((x) => x >= d);
    const [a, b] = [coords[i - 1], coords[i]];
    if (!b) return coords.at(-1) ?? [NaN, NaN]; // at or beyond the end, give or take rounding
    if (!a) return b;
    const [start = 0, end = 0] = [dist[i - 1], dist[i]];
    const t = end > start ? (d - start) / (end - start) : 0;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  return [at(from), ...coords.filter((_, i) => (dist[i] ?? 0) > from && (dist[i] ?? 0) < to), at(to)];
}

/** The date in Spain, as YYYY-MM-DD. */
export function madridDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(at);
}
