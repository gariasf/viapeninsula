// What the daily build and the fetcher publish, and the web app reads.

/** The R2 bucket, behind the CDN, that serves the daily bundles and the live snapshot. */
export const LIVE_URL = 'https://viapeninsula-live.gariasf.com';

/** The live data, as the fetcher writes it about every 20 s (ADR-0003). */
export interface Snapshot {
  /** When the fetcher wrote it, in ms since 1970. */
  generated: number;
  /** How fresh each Network's live data is. */
  feeds: Record<string, Freshness>;
  /**
   * What the operators report about each Train: for a feed whose last try failed, what it said when it
   * last worked, and for a Network whose Trains have all just vanished from a feed that works and feeds
   * other Networks too, what it last said of them, for two tries (src/fetcher/step.ts).
   */
  reports: Report[];
  /** The Stations Renfe has said Trips won't stop at, where it has said so of any: as it does of the Stations a Train cut short, or that starts late, doesn't run to (#346). */
  skipped?: Skipped[];
}

/** A Trip's Stations its operator has said it won't stop at, where its trip updates list them SKIPPED (#346). */
export interface Skipped {
  /** Its Trip, as the bundle names it. */
  trip: string;
  /** The Stations, by their IDs. */
  stations: string[];
  /** When its operator first said so of any of them, in ms since 1970: Renfe no longer lists a Station its timetable has left, skipped or not. */
  since: number;
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
   * Where it is, in the feed's own terms: its coordinates; at or near a Station, or for TRAM the stop
   * it's at or has just left, by TRAM's number for its platform, which isn't the bundle's; how far it
   * has come along its Trip since its first Station, in metres, as TRAM counts them, which TRAM gives
   * only for about 40 s as it reaches a Station (#42); or for the Metro, the Station it comes to next,
   * and when it's expected there, in ms since 1970.
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

/**
 * The operators' Alerts, as the fetcher writes them to alerts.json beside the snapshot, when what it
 * holds changes and at least every 5 minutes (ADR-0003, ADR-0012): each feed's, by the ID of the live
 * source it's from (src/networks.ts), such as `renfe`.
 */
export type Alerts = Record<string, AlertFeed>;

/** One operator's Alerts: when the fetcher last read them, how its last try went, and the Alerts as it last read them, newest first. */
export interface AlertFeed {
  /**
   * When it last read them, in ms since 1970, where it has. It reads Renfe's every 20 s and TRAM's
   * every 5 minutes, and writes this at least every 5 minutes, so while a feed and the fetcher work, it
   * was never more than about 10 minutes ago.
   */
  read?: number;
  /** `ok`, or what went wrong. */
  status: string;
  alerts: Alert[];
}

/** What an operator says about Lines or Stations, in its own words (ADR-0012). */
export interface Alert {
  /** The operator's ID for it. */
  id: string;
  /** Its Lines, as the bundle names them, such as `rodalies:R1`. */
  lines: string[];
  /** Its Stations, as the bundle names them, such as `adif:70100`. */
  stations: string[];
  /** When it began, in ms since 1970, where it says. */
  from?: number;
  /** When it ends, in ms since 1970, where it says. */
  to?: number;
  /** What it does to service, where it says, as GTFS-RT names it, such as `MODIFIED_SERVICE`. */
  effect?: string;
  /** Its title, where it has one, and its words: each in the languages it gives them, its feed's own first. */
  header?: Words[];
  description: Words[];
}

/** An Alert's words in one language, by its code, such as `ca`, where its feed says. */
export interface Words {
  language?: string;
  text: string;
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
  /** The Networks with no Trips that day, by their IDs, where there are any: they're built without them, and the map says so (#226). */
  noTrips?: string[];
}

/**
 * What the map draws before any Train, which it loads first: the Networks, Lines, Stations and track,
 * one file that every day a build publishes shares.
 */
export type Track = Pick<Bundle, 'networks' | 'lines' | 'stations' | 'shapes' | 'strokes' | 'rails' | 'slots' | 'tracks'>;

/** A service day's Trips and Closures, which the map loads after its track. */
export type DayTrips = Pick<Bundle, 'serviceDay' | 'noonMinus12h' | 'trips' | 'closures'>;

/** Everything the map needs for one service day: its track, its Trips and its Closures. */
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
  /** How the map draws the Lines zoomed right in, where they're back on the rails: each Line's own track once, marked where Lines share it, which the map draws grey (#139). */
  rails: Stroke[];
  /** Where the map puts each Line's Trains zoomed out: every one of its shapes, all along it, on the Line's stroke (#176). */
  slots: Slot[];
  /** How the map draws the track below zoom 7: each Network's once, in its colour, on the shapes of its Lines that run it (#190). */
  tracks: Stroke[];
  trips: Trip[];
  /** The service day's Closures, where it has any: a day file built before #340 has none. */
  closures?: Closure[];
}

export interface Network {
  id: string;
  name: string;
  profile: SpeedProfile;
  /** Which track of a double track its Trains run on, looking the way they go. */
  runningSide: 'left' | 'right';
  /** The colour its track is drawn in below zoom 7 (#190), near its brand's. */
  colour: string;
  /** The zoom its Trains are drawn as pills from, with their Line's name, and as dots below it (#90). */
  pillZoom: number;
  /** Who its data comes from, credited as their terms ask: the same for each Network a source feeds, which the map credits once (ADR-0010). */
  credit: Credit;
  /** How the engine reads its live data, where it has any. */
  live?: LiveTraits;
}

/** A source's credit: its name, or the words its terms ask for instead, linked to its data. */
export interface Credit {
  text: string;
  url: string;
  /** Its data's licence, where its terms ask for it to be named. */
  licence?: 'CC BY 4.0';
  /** The day it last updated its timetable (YYYY-MM-DD), where its terms ask the map to show it. */
  updated?: string;
}

/** How the engine reads a Network's live data. */
export interface LiveTraits {
  /**
   * The Delay a Train carries where its position measures none: its operator's (`operator`); its last
   * GPS Delay, as Renfe's own figure is often minutes off, where GPS unchanged since its report before
   * counts as no position (`gps`, #33); or its operator's, but shown nowhere (`none`), as TMB runs the
   * Metro by headway (#103).
   */
  delay: 'operator' | 'gps' | 'none';
  /**
   * A Train reported near a Station stands there (`standing`), or may still be coming in or have left
   * (`pinned`), as Renfe pins Trains coming into a Station too, and TRAM names the stop a Train is at or
   * has just left (#42).
   */
  near: 'standing' | 'pinned';
  /**
   * It names Trips long after they ended, as Geotren does Montserrat's rack Trains (#232): a report
   * whose Trip ended more than the engine's ENDED before it is dropped, as one that matches no Trip is.
   */
  lingers?: true;
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
  /** What it runs as, which its Trains' pills are outlined by. */
  kind: Kind;
}

/** A Line's kind of service (CONTEXT.md). */
export type Kind = 'commuter' | 'regional' | 'metro' | 'tram' | 'rack' | 'funicular';

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
  /**
   * Only in this zoom band (BANDS): a curve across a node, which is made for each (#163), or below
   * GRAPH_BAND, a stroke on the band's own line graph (ADR-0007).
   */
  band?: number;
  /** A curve's side at its end, which it's eased to from `side` at its start: it's drawn in pieces(). */
  ease?: number;
  /**
   * In each zoom band it's drawn in, from its first (`band`, or else GRAPH_BAND), how many metres less
   * of its shape it's drawn along at its start and at its end, where a curve takes over (#163): cutIn().
   */
  cut?: [start: number, end: number][];
  /** Zoomed right in, on its own track (`rails`): where another Line runs on that track too (#139). */
  shared?: true;
  /**
   * In a tunnel, this many of OpenStreetMap's layers below the ground: the map draws it below the
   * Lines on the street and those less deep, and where one covers it, shows it through (#178).
   */
  under?: number;
  /** Along a Stretch with more than CROWD places side by side (#283), closer together than a line width, so that each covers some of the next. */
  crowded?: true;
  /**
   * A curve's: the centreline it leaves, those of the Stretches its node absorbed, and the one it comes
   * onto, and from how far along each to how far, the way it goes, the Line's strokes there are cut
   * back, or not drawn, to make room for it (#176, ADR-0007).
   */
  across?: [shape: string, start: number, end: number][];
}

/**
 * Where a Line's Trains go zoomed out along part of one of its shapes, from `from` to `to` metres along
 * it: on its stroke there, `side` line widths right of `on`, the centreline of the Stretch it's drawn
 * along, or its own shape where it's drawn on that, from `at[0]` to `at[1]` metres along it (#176).
 */
export interface Slot {
  line: string;
  shape: string;
  from: number;
  to: number;
  side: number;
  on: string;
  at: [from: number, to: number];
  /** Only in this zoom band, below GRAPH_BAND: on the band's own line graph (ADR-0007). */
  band?: number;
}

/** Identified by whoever runs it: `adif:<code>` for Renfe's Stations, one Station however many Networks it serves. */
export interface Station {
  id: string;
  name: string;
  lon: number;
  lat: number;
  /** The station its operator groups it in with other Lines' Stations, which the map shows as one place: `tmb:P.6660327` at Passeig de Gràcia (ADR-0005). */
  place?: string;
  /**
   * The Networks whose Trains stop there, by their IDs, as Rodalies' and AVE y Larga Distancia's do at
   * Sants (#243). The build names them once it has every Network's Stations (stationsOf()); a track built before #243 names none.
   */
  networks?: string[];
}

/** Where the map shows one or more Stations as one, known by their place, or a lone Station's ID: one Station board lists them all. */
export interface Place {
  id: string;
  name: string;
  stations: string[];
  /** The Networks whose Trains stop at its Stations, by their IDs: its own, whose track its name goes beside (#143). */
  networks: string[];
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
    networks: [...new Set(group.flatMap((s) => s.networks ?? []))],
    lon: group.reduce((sum, s) => sum + s.lon, 0) / group.length,
    lat: group.reduce((sum, s) => sum + s.lat, 0) / group.length,
  }));
}

/** A timetable entry: the Stations a Train calls at, in order, when, and where along its shape. */
export interface Trip {
  id: string;
  line: string;
  shape: string;
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

/**
 * A part of a Line closed on a service day, with buses in its Trains' place, as the timetable's
 * replacement buses have it (ADR-0012): between two of the Line's Stations on its track that none of
 * its Trains calls at both of that day (closuresOf()), from the first bus's departure from either of
 * them to the last bus's arrival at either, in seconds into the service day, as a Trip's calls are.
 */
export interface Closure {
  line: string;
  /** Its two Stations, in order of ID. */
  stations: [string, string];
  from: number;
  to: number;
  /** What it is: closed, with buses in its Trains' place. */
  kind: 'buses';
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
 * each shows from halfway between its zoom and the one before to halfway to the next (#163), a band
 * for each whole zoom (ADR-0007).
 */
export const BANDS = [7, 8, 9, 10, 11, 12, 13, 14];

/**
 * The first band drawn on the one line graph every band from zoom 10 up shares, in one order. Each
 * band below draws a graph of its own, where tracks about a line width apart are one Stretch (ADR-0007).
 */
export const GRAPH_BAND = BANDS.indexOf(10);

/** Whether a stroke, or a slot, is drawn in a zoom band: in its own band, or without one, in each from GRAPH_BAND on. */
export function drawnIn({ band: own }: { band?: number }, band: number): boolean {
  return own === undefined ? band >= GRAPH_BAND : own === band;
}

/** How many metres less of its shape a stroke is drawn along in a zoom band, at its start and at its end (Stroke's `cut`). */
export function cutIn(s: Pick<Stroke, 'band' | 'cut'>, band: number): [start: number, end: number] {
  return s.cut?.[band - (s.band ?? GRAPH_BAND)] ?? [0, 0];
}

/** How long a curve across a node is, for each metre a Line moves over on it, half from each stroke it joins (#163). */
export const LENGTH = 4;

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

/**
 * Where a Line is drawn on a curve across a node in a zoom band instead of along a centreline (`on`),
 * from `at[0]` to `at[1]` metres along it: on the curve's stroke (`link`), from `along[0]` to
 * `along[1]` metres along it, on its way to or from the centreline `other` (#176).
 */
export interface Zone {
  on: string;
  at: [from: number, to: number];
  link: Stroke;
  along: [from: number, to: number];
  /** The centrelines at the curve's other ends. */
  others: string[];
}

/** Where each Line is drawn on its curves, by `<line> <band>`: each stretch of centreline a curve takes over, and the part of the curve that stands for it, in proportion. */
export function zones(strokes: Stroke[]): Map<string, Zone[]> {
  const found = new Map<string, Zone[]>();
  for (const link of strokes) {
    if (!link.across || link.band === undefined) continue;
    const parts = link.across;
    const total = parts.reduce((sum, [, a, b]) => sum + Math.abs(b - a), 0) || 1;
    const key = `${link.line} ${link.band}`;
    const list = found.get(key) ?? [];
    let gone = 0;
    for (const [i, [on, a, b]] of parts.entries()) {
      const start = gone;
      gone += (link.to * Math.abs(b - a)) / total;
      const others = [parts[0]?.[0] ?? '', parts.at(-1)?.[0] ?? ''].filter((_, k) => (k ? i !== parts.length - 1 : i !== 0));
      list.push({ on, at: [a, b], link, along: [start, gone], others });
    }
    found.set(key, list);
  }
  return found;
}

/** How near, in metres along its shape, a Train's Line goes onto a centreline for it to be on its way there, across a node. */
export const NEXT = 500;

/**
 * Where a Train `dist` metres along its shape is drawn at a zoom, from its Line's slots along that
 * shape drawn in the zoom's band: on the Line's stroke, along the centreline the stroke follows in the zoom's band, at its
 * side, or across a node, on its curve (`zones()`), and half a line width to the side its Network's
 * Trains keep to, 1 right and -1 left, so that Trains going opposite ways show apart (#176). Or
 * nowhere, where the Line has no slot there.
 */
export function onStroke(slots: Slot[] | undefined, shapes: Map<string, Shape>, dist: number, zoom: number, keep: number, curves = new Map<string, Zone[]>()): Point | undefined {
  const band = bandAt(zoom);
  const slot = slots?.find((s) => s.from <= dist && dist <= s.to && drawnIn(s, band));
  const line = slot && inBand(shapes, slot.on, band);
  if (!slot || !line) return undefined;
  const { at, way } = slotAt(slot, dist);
  const width = atZoom(APART, zoom) * pixelMetres(zoom, pointAt(line, at)[1]);
  // On a curve, where the Line is: of those at a fork, the one to or from where the Train goes next or came from.
  const here = (curves.get(`${slot.line} ${band}`) ?? []).filter((z) => z.on === slot.on && Math.min(...z.at) <= at && at <= Math.max(...z.at) && z.at[0] !== z.at[1]);
  const goes = (other: string) => slots?.some((s) => s.on === other && s.from - NEXT <= dist && dist <= s.to + NEXT);
  const zone = here.find((z) => z.others.every(goes)) ?? here.find((z) => z.others.some(goes)) ?? here[0];
  const curve = zone && shapes.get(zone.link.shape);
  if (zone && curve) {
    const [[a0, a1], [x0, x1]] = [zone.at, zone.along];
    const x = x0 + ((x1 - x0) * (at - a0)) / (a1 - a0);
    const side = pieces(zone.link).find((p) => p.from <= x && x <= p.to)?.side ?? zone.link.side;
    // The Train goes along the curve the way it goes along the centreline, or back.
    return beside(curve, x, (side + 0.5 * keep * way * Math.sign((x1 - x0) * (a1 - a0) || 1)) * width);
  }
  // The Train runs its shape forwards: its right is the centreline's where that runs the same way.
  return beside(line, at, (slot.side + 0.5 * keep * way) * width);
}

/** How far along its line a slot puts a distance along its shape, and which way that line runs against the shape, 1 the same way and -1 back. */
export function slotAt({ from, to, at: [start, stop] }: Slot, dist: number): { at: number; way: number } {
  return { at: start + ((stop - start) * (dist - from)) / (to - from || 1), way: stop < start ? -1 : 1 };
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
