// What the daily build and the fetcher publish, and the web app reads.

/** The R2 bucket, behind the CDN, that serves the daily bundles and the live snapshot. */
export const LIVE_URL = 'https://viapeninsula-live.gariasf.com';

/** The live data, as the fetcher writes it about every 20 s (ADR-0003). */
export interface Snapshot {
  /** When the fetcher wrote it, in ms since 1970. */
  generated: number;
  /** How fresh each Network's live data is. */
  feeds: Record<string, Freshness>;
  /** What the operators report about each Train: for a feed whose last try failed, what it said when it last worked. */
  reports: Report[];
}

/** When the fetcher last tried a Network's live data and last got it, in ms since 1970, how the try went, and how often it tries. */
export interface Freshness {
  lastSuccess?: number;
  lastAttempt: number;
  /** `ok`, or what went wrong. */
  status: string;
  /** How long from one try to the next, in ms. Its Trains turn Scheduled once they miss about three. */
  every: number;
}

/** What an operator reports about one Train. */
export interface Report {
  /** Its Trip, as the bundle names it, or for the Metro, whose timetable names no Blocks, none: the engine matches its Block to one. */
  trip?: string;
  /**
   * For a Train its operator names by a Trip the bundle doesn't have, as Geotren does Montserrat's
   * rack Trains: its Line, as the bundle names it. The engine matches it to the Line's Trip whose
   * `trip_id` ends as its own does, after the `|`.
   */
  line?: string;
  /** For the Metro, which names each Train by its Block: its Line, as the bundle names it, and TMB's number for it, which another Line's can share. */
  block?: { line: string; number: string };
  /** For the Metro, where it's headed, as its Trip's headsign has it. */
  headsign?: string;
  /** When the operator reported it, in ms since 1970. */
  at: number;
  /**
   * Where it is, in the feed's own terms: its coordinates; at or near a Station, or for TRAM at one,
   * by TRAM's number for its platform, which isn't the bundle's; how far it has come along its Trip
   * since its first Station, in metres, as TRAM counts them; or for the Metro, the Station it comes
   * to next, and when it's expected there, in ms since 1970.
   */
  position?: { lon: number; lat: number } | { near: string } | { along: number } | { next: { station: string; at: number } };
  /** How late it's running, in seconds, as its operator has it: early where it's negative. */
  delay?: number;
  /** Where its operator gives no Delay, when it expects it at a Station, in ms since 1970, as FGC does. */
  expected?: { station: string; at: number };
  /** Whether its operator has announced that it won't run. */
  cancelled?: true;
  /** The type of Unit it runs as, where its operator publishes it: FGC's series, such as 213x2 for two 213s coupled. */
  unitType?: string;
}

/** Names the bundle for each service day. Cached briefly; the bundles it names never change. */
export interface Manifest {
  days: ManifestDay[];
}

/**
 * A service day's files, its track and its Trips, and when its first Train comes onto the map and its
 * last leaves it, on time, in ms since 1970.
 */
export interface ManifestDay {
  date: string;
  track: string;
  trips: string;
  from: number;
  to: number;
}

/**
 * What the map draws before any Train, which it loads first: the Networks, Lines, Stations and track,
 * one file that every day a build publishes shares.
 */
export type Track = Pick<Bundle, 'networks' | 'lines' | 'stations' | 'shapes' | 'strokes' | 'sides'>;

/** A service day's Trips, which the map loads after its track. */
export type DayTrips = Pick<Bundle, 'serviceDay' | 'noonMinus12h' | 'trips'>;

/** Everything the map needs for one service day: its track and its Trips. */
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
  /**
   * Where the map puts each Line's Trains zoomed out: every one of its shapes, all along it, at the
   * side of its track the Line's stroke there is drawn.
   */
  sides: Stroke[];
  trips: Trip[];
}

export interface Network {
  id: string;
  name: string;
  profile: SpeedProfile;
  /** Which track of a double track its Trains run on, looking the way they go. */
  runningSide: 'left' | 'right';
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
  /** The station its operator groups it in with other Lines' Stations, which the map shows as one place: `tmb:P.6660327` at Passeig de Gràcia (ADR-0005). */
  place?: string;
}

/** Where the map shows one or more Stations as one, known by their place, or a lone Station's ID: one Station board lists them all. */
export interface Place {
  id: string;
  name: string;
  stations: string[];
  lon: number;
  lat: number;
}

/** Where the map shows the Stations: those grouped in one place as one, at the middle of theirs, and every other on its own. */
export function places(stations: Station[]): Place[] {
  const groups = new Map<string, Station[]>();
  for (const s of stations) groups.set(s.place ?? s.id, [...(groups.get(s.place ?? s.id) ?? []), s]);
  return [...groups].map(([id, group]) => ({
    id,
    name: group[0]?.name ?? '',
    stations: group.map((s) => s.id),
    lon: group.reduce((sum, s) => sum + s.lon, 0) / group.length,
    lat: group.reduce((sum, s) => sum + s.lat, 0) / group.length,
  }));
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

/** The point a distance along a line, moved so many metres to its right, or its left where negative. */
export function beside(line: Pick<Shape, 'coords' | 'dist'>, d: number, metres: number): [lon: number, lat: number] {
  const [lon, lat] = pointAt(line, d);
  if (!metres) return [lon, lat];
  // Which way the line runs, over the metre either side of d, flat around it.
  const end = line.dist.at(-1) ?? 0;
  const [a, b] = [pointAt(line, Math.max(0, d - 1)), pointAt(line, Math.min(end, d + 1))];
  const kx = Math.cos((lat * Math.PI) / 180);
  const [dx, dy] = [(b[0] - a[0]) * kx, b[1] - a[1]];
  const length = Math.hypot(dx, dy) || 1;
  const off = metres / DEGREE / length;
  return [lon + (dy * off) / kx, lat - dx * off];
}

export type Point = [lon: number, lat: number];

/** The Earth's mean radius, and the length of a degree of latitude, in metres. */
export const EARTH = 6_371_008.8;
export const DEGREE = (EARTH * Math.PI) / 180;

/** Where the segment from a to b comes closest to p: a fraction t along it, and how far away, in metres flat around p, where a degree of longitude is kx metres. */
export function closestOnSegment(a: Point, b: Point, p: Point, kx: number): [t: number, metres: number] {
  const [ax, ay] = [(a[0] - p[0]) * kx, (a[1] - p[1]) * DEGREE];
  const [dx, dy] = [(b[0] - a[0]) * kx, (b[1] - a[1]) * DEGREE];
  const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
  return [t, Math.hypot(ax + t * dx, ay + t * dy)];
}

/** The date so many days after one (YYYY-MM-DD), or before it where negative. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400_000).toISOString().slice(0, 10);
}

/** The date in Spain, as YYYY-MM-DD. */
export function madridDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(at);
}
