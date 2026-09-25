// What the daily build and the fetcher publish, and the web app reads.

/** The R2 bucket, behind the CDN, that serves the daily bundles and the live snapshot. */
export const LIVE_URL = 'https://viapeninsula-live.gariasf.com';

/** The live data, as the fetcher writes it about every 20 s (ADR-0003). */
export interface Snapshot {
  /** When the fetcher wrote it, in ms since 1970. */
  generated: number;
  /** How fresh each Network's live data is. */
  feeds: Record<string, Freshness>;
  /** What the operators report about each Train. */
  reports: Report[];
}

/** When the fetcher last tried a Network's live data and last got it, in ms since 1970, and how the try went. */
export interface Freshness {
  lastSuccess?: number;
  lastAttempt: number;
  /** `ok`, or what went wrong. */
  status: string;
}

/** What an operator reports about one Train. */
export interface Report {
  /** Its Trip, as the bundle names it. */
  trip: string;
  /** When the operator reported it, in ms since 1970. */
  at: number;
  /** Where it is, in the feed's own terms: its coordinates, or at or near a Station. */
  position?: { lon: number; lat: number } | { near: string };
  /** How late it's running, in seconds, as its operator has it: early where it's negative. */
  delay?: number;
  /** Whether its operator has announced that it won't run. */
  cancelled?: true;
}

/** Names the bundle for each service day. Cached briefly; the bundles it names never change. */
export interface Manifest {
  days: { date: string; bundle: string }[];
}

/** Everything the map needs for one service day. */
export interface Bundle {
  serviceDay: string;
  /**
   * When the service day's timetable reads 00:00:00, in ms since 1970: noon less 12 hours, as GTFS
   * has it, which on the nights the clocks change is an hour off midnight.
   */
  noonMinus12h: number;
  networks: Network[];
  lines: Line[];
  stations: Station[];
  shapes: Shape[];
  /** How the map draws the Lines: each Line's track once, beside the other Lines on it. */
  strokes: Stroke[];
  trips: Trip[];
}

export interface Network {
  id: string;
  name: string;
  profile: SpeedProfile;
  /** The day its operator last updated its timetable (YYYY-MM-DD), where their terms ask the map to show it. */
  updated?: string;
}

/** How a Network's Trains run between Stations, in metres and seconds. */
export interface SpeedProfile {
  acceleration: number;
  braking: number;
  topSpeed: number;
  /** How long a Train stands at a Station its timetable gives it no time at. */
  dwell: number;
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

/** A timetable entry: the Stations a Train calls at, in order, when, and where along its shape. */
export interface Trip {
  id: string;
  line: string;
  shape: string;
  /** 0 where it runs the way its Line's first shape does, 1 where it runs back the other way. */
  direction: 0 | 1;
  /** Where it's headed. */
  headsign: string;
  /** Its Train number, where the operator publishes one. */
  number?: string;
  calls: Call[];
}

/**
 * A Trip's call at a Station: arrival and departure in seconds into the service day, and how far
 * along the Trip's shape the Station is, in metres. A Trip can run its shape either way, and turn back.
 */
export interface Call {
  station: string;
  arrival: number;
  departure: number;
  dist: number;
}

/** A stretch of track: its points in order, and the distance along it at each point, in metres. */
export interface Shape {
  id: string;
  coords: [lon: number, lat: number][];
  dist: number[];
}

/** A line's points from one distance along it to another, where `dist` gives the distance at each point. */
export function along(line: Pick<Shape, 'coords' | 'dist'>, from: number, to: number): Shape['coords'] {
  const { coords, dist } = line;
  return [pointAt(line, from), ...coords.filter((_, i) => (dist[i] ?? 0) > from && (dist[i] ?? 0) < to), pointAt(line, to)];
}

/** The point a distance along a line, where `dist` gives the distance at each of its points. */
export function pointAt({ coords, dist }: Pick<Shape, 'coords' | 'dist'>, d: number): [lon: number, lat: number] {
  // The first point at or beyond d, found by halving.
  let [i, end] = [0, dist.length];
  while (i < end) {
    const mid = (i + end) >> 1;
    if ((dist[mid] ?? 0) < d) i = mid + 1;
    else end = mid;
  }
  const [a, b] = [coords[i - 1], coords[i]];
  if (!b) return coords.at(-1) ?? [NaN, NaN]; // at or beyond the end, give or take rounding
  if (!a) return b;
  const [start = 0, stop = 0] = [dist[i - 1], dist[i]];
  const t = stop > start ? (d - start) / (stop - start) : 0;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** The date in Spain, as YYYY-MM-DD. */
export function madridDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(at);
}
