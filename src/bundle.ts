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
export type Track = Pick<Bundle, 'networks' | 'lines' | 'stations' | 'shapes' | 'strokes' | 'rails' | 'sides'>;

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
  /** The Lines' track, and the centrelines of the stretches they're drawn along, whose IDs start with STRETCH, some smoothed for a zoom band too (smoothId()). */
  shapes: Shape[];
  /** How the map draws the Lines: each Line once on each stretch it runs along, beside the other Lines on it (ADR-0006). */
  strokes: Stroke[];
  /** How the map draws the Lines zoomed right in, where they're back on the rails: each Line's own track once. */
  rails: Stroke[];
  /**
   * Where the map puts each Line's Trains zoomed out: every one of its shapes, all along it, at the
   * side of its track the Line's stroke there would be drawn on its own track.
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
  /** Only in this zoom band (BANDS): a curve across a node, which is made for each (#163). */
  band?: number;
  /** A curve's side at its end, which it's eased to from `side` at its start: it's drawn in pieces(). */
  ease?: number;
  /** In each zoom band, how many metres less of its shape it's drawn along at its start and at its end, where a curve takes over (#163). */
  cut?: [start: number, end: number][];
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
  /**
   * A traced shape's level, where it isn't all on the ground: from each distance along it on, until
   * the next, as OpenStreetMap tags the track there, `tunnel <layer>`, `bridge <layer>` or
   * `layer <layer>`, or '' on the ground (#165). The map doesn't use it: it's there so that
   * measures.ts can draw a day's track again.
   */
  levels?: [from: number, level: string][];
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
  // Which way the line runs, over the metre either side of d.
  const end = line.dist.at(-1) ?? 0;
  const [dx, dy] = direction(line, Math.max(0, d - 1), Math.min(end, d + 1));
  const length = Math.hypot(dx, dy) || 1;
  const off = metres / DEGREE / length;
  return [lon + (dy * off) / Math.cos((lat * Math.PI) / 180), lat - dx * off];
}

/** Which way a line runs from one distance along it to another, flat around the first: how far east and north the second point is from it, in degrees of latitude. */
export function direction(line: Pick<Shape, 'coords' | 'dist'>, from: number, to: number): [east: number, north: number] {
  const [a, b] = [pointAt(line, from), pointAt(line, to)];
  return [(b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180), b[1] - a[1]];
}

export type Point = [lon: number, lat: number];

/** How the IDs of the stretches' centrelines start, among the track's shapes. */
export const STRETCH = 'stretch:';
/** How the IDs of the links start: the curves that join a Line's stroke on one Stretch to its next, one for each zoom band. */
export const LINK = `${STRETCH}link`;

/**
 * The zoom bands the curves across the line graph's nodes are made for, by the zoom each is made at:
 * each shows from halfway between its zoom and the one before to halfway to the next (#163).
 */
export const BANDS = [10, 11, 12, 13];

/** The zoom a band starts at, and the zoom the next starts at. */
export function bandZooms(band: number): [from: number, to: number] {
  const [zoom = 0, before, next] = [BANDS[band], BANDS[band - 1], BANDS[band + 1]];
  return [before === undefined ? 0 : (before + zoom) / 2, next === undefined ? Infinity : (zoom + next) / 2];
}

/**
 * What a centreline's ID is followed by, and then its band's index, where it's smoothed for the band
 * (#164). The smoothed one's `dist` is the centreline's, not its own, so strokes go as far along it.
 */
export const SMOOTH = '@';

/** A centreline's ID, smoothed for a zoom band. */
export function smoothId(id: string, band: number): string {
  return `${id}${SMOOTH}${band}`;
}

/** The shape a stroke goes along in a zoom band: its centreline smoothed for the band, where it is. */
export function inBand(shapes: Map<string, Shape>, id: string, band: number): Shape | undefined {
  return shapes.get(smoothId(id, band)) ?? shapes.get(id);
}

/** The zoom band a zoom is in. */
export function bandAt(zoom: number): number {
  return BANDS.findIndex((_, band) => zoom < bandZooms(band)[1]);
}

/** How many line widths a curve moves over from one of its pieces to the next, at most. */
const PIECE = 1 / 8;

/**
 * A stroke as the map draws it: `line-offset` is constant along a feature, so a curve that eases from
 * one side to another goes in pieces, a PIECE of a line width over from each to the next, eased in
 * and out along it.
 */
export function pieces(stroke: Stroke): Stroke[] {
  const { ease, ...rest } = stroke;
  if (ease === undefined) return [stroke];
  const [start, stop, n] = [stroke.side, ease, Math.ceil(Math.abs(ease - stroke.side) / PIECE) + 1];
  const length = stroke.to - stroke.from;
  const cut = (k: number) => (k <= 0 ? 0 : k >= n ? length : (length * Math.acos(1 - (2 * (k - 0.5)) / (n - 1))) / Math.PI);
  return Array.from({ length: n }, (_, k) => ({ ...rest, from: stroke.from + cut(k), to: stroke.from + cut(k + 1), side: n > 1 ? start + ((stop - start) * k) / (n - 1) : start }));
}

/** How many metres on the ground a pixel is at a zoom, at a latitude. */
export function pixelMetres(zoom: number, lat: number): number {
  return (2 * Math.PI * EARTH * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

/** A Line's width, in pixels at each zoom. */
export const WIDTH: [zoom: number, px: number][] = [[7, 1.5], [14, 4]];
/**
 * How far apart Lines that share track are drawn, in pixels at each zoom: a line width apart zoomed
 * out, as on a transit map, and back on the rails zoomed right in, where people follow a Train.
 */
export const APART: [zoom: number, px: number][] = [...WIDTH, [15, 0]];

/** The value at a zoom of these, going smoothly from one zoom's to the next's, as the map's byZoom() does. */
export function atZoom(stops: [zoom: number, px: number][], zoom: number): number {
  const i = stops.findIndex(([z]) => z > zoom);
  if (i < 0) return stops.at(-1)?.[1] ?? 0;
  const [[z0, v0] = [zoom, 0], [z1, v1] = [zoom, 0]] = [stops[Math.max(0, i - 1)], stops[i]];
  return z1 > z0 ? v0 + ((v1 - v0) * (zoom - z0)) / (z1 - z0) : v1;
}

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

/**
 * The manifest's days the map needs at a moment (ms since 1970): today, whatever the time; each day
 * whose Trains are on the map or come onto it within `early`, as tomorrow's first can before
 * midnight, or went off it less than `late` ago, as yesterday's last do after; and the next day once
 * today's last Train has left the map, or a Station board has had no departures left on
 * `emptyBoard`, today's date. Where the manifest is out of date, its last day stands for today.
 */
export function daysNeeded(days: ManifestDay[], at: number, { early, late, emptyBoard }: { early: number; late: number; emptyBoard?: string }): { today: ManifestDay; days: ManifestDay[] } | undefined {
  const today = days.find((d) => d.date === madridDate(new Date(at))) ?? days.at(-1);
  if (!today) return undefined;
  const next = days[days.indexOf(today) + 1];
  const nextDayDue = at >= today.to || emptyBoard === today.date;
  return { today, days: days.filter((d) => d === today || (d === next && nextDayDue) || (d.from - early <= at && at <= d.to + late)) };
}
