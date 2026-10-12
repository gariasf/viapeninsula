// Each Trip placed on its track: how far along it each of its Stations is. And the Closures that
// replacement buses make of a Line, where they run in its Trains' place.

import { closestOnSegment, DEGREE, type Closure, type Point, type Shape, type Station, type Trip } from '../bundle.ts';
import type { Gauges } from '../networks.ts';
import type { Cause, Found } from './report.ts';
import { nearest, type FeedShape } from './track.ts';

/** A Trip as the feed times it, before its Stations are placed on its track. */
export interface FeedTrip {
  id: string;
  line: string;
  shape: string;
  headsign: string;
  number?: string;
  /** The IDs of the Trips of its Train that were made one with it (#467), which live data names the Train by while it runs their part. */
  joined?: string[];
  /** Its calls in order, with arrival and departure in seconds into the service day. */
  calls: { station: string; arrival: number; departure: number }[];
  /** The rails it runs on, where its timetable has no shapes, as Renfe's long-distance one hasn't, to trace it along (traceRuns()). */
  gauges?: Gauges;
}

/** A replacement bus's Trip as the feed times it, which isn't a Train: its stops needn't be any Train's Stations. */
export interface FeedBus {
  id: string;
  line: string;
  calls: { station: Station; arrival: number; departure: number }[];
}

/**
 * A Station is on a Trip's track where the track passes within 300 m of it. Renfe's Stations are
 * within 70 m of their traced track, and the ones off it are kilometres away.
 */
export const REACH = 300;

/** A Trip that can't be placed on its track: why, in words, and the Stations the reason names, or else its first. */
interface Unplaced {
  trip: FeedTrip;
  why: Cause;
  reason: string;
  at: Station[];
}

/**
 * Places each Trip's Stations along its track. Where the track passes a Station more than once, a
 * Station goes where the Trip travels least to reach it and carry on: a Trip can turn back at a
 * Station, but not in between. A Trip calling at a Station off its track, or that would have to run
 * faster than its Line's top speed (`topSpeed`, by the Line's ID, in m/s) between two Stations, is
 * left out and logged rather than drawn wrong, and reported with the Stations its log names, or else
 * its first.
 */
export function placeTrips(
  trips: FeedTrip[],
  shapes: Shape[],
  stations: Station[],
  topSpeed: (line: string) => number,
  log = console.log,
  report: (found: Found) => void = () => {},
): Trip[] {
  return place(trips, shapes, stations, topSpeed).flatMap((p) => {
    if (!('why' in p)) return [p];
    leave(p, log, report);
    return [];
  });
}

/** What a Trip that's left out logs and reports. */
function leave({ trip, why, reason, at }: Unplaced, log: (line: string) => void, report: (found: Found) => void) {
  const text = `${trip.id} is left out: ${reason}`;
  log(text);
  report({ kind: 'trip', why, trip: trip.id, line: trip.line, stations: at, text: [text] });
}

/**
 * Why a Trip doesn't fit its shape, to be traced through its own Stations instead (placeDays()): a Station
 * off its track, or a stretch faster than its Line's top speed along it. Not one that calls at fewer
 * than two Stations, nor whose shape has no track, which no trace of its own would mend.
 * ponytail: a stretch its timetable gives no time, as Asturias' C4 Trips from Candás to Candás-Apeadero
 * (6–7 a day on 11–13 Oct 2026), is traced and left out all the same: each run takes milliseconds, so skip
 * a Trip whose stretch no distance fits if that ever adds up.
 */
const UNFIT: Cause[] = ['off', 'fast'];

/**
 * Each day's Trips placed on their tracks, as placeTrips() places them, but where a Trip doesn't fit its
 * shape (UNFIT), `retrace` traces it through its own Stations, once for every Trip that calls at the
 * same ones, and it's placed on that trace, where its times fit it (#280). One that doesn't fit that
 * either, or has no trace, is left out and reported, as placeTrips() does. Gives each day's Trips in the
 * order they came, and the traces, those that have a Trip placed on them.
 */
export function placeDays(
  days: FeedTrip[][],
  shapes: Shape[],
  stations: Station[],
  topSpeed: (line: string) => number,
  retrace: (unfit: FeedTrip[][]) => { shapes: Shape[]; days: FeedTrip[][] },
  log = console.log,
  report: (found: Found) => void = () => {},
): { days: Trip[][]; shapes: Shape[] } {
  const first = days.map((trips) => place(trips, shapes, stations, topSpeed));
  const unfit = first.map((day) => day.flatMap((p) => ('why' in p && UNFIT.includes(p.why) ? [p.trip] : [])));
  const own = unfit.some((day) => day.length) ? retrace(unfit) : { shapes: [], days: unfit.map((): FeedTrip[] => []) };
  const second = own.days.map((trips) => new Map(place(trips, own.shapes, stations, topSpeed, true).map((p) => ['why' in p ? p.trip.id : p.id, p])));
  const used = new Set<string>(); // the traces a Trip is placed on
  const placed = first.map((day, i) =>
    day.flatMap((p): Trip[] => {
      if (!('why' in p)) return [p];
      // Where it doesn't fit its shape, what its trace made of it is its fate: nothing where retrace() left it out and said so.
      const last = UNFIT.includes(p.why) ? second[i]?.get(p.trip.id) : p;
      if (!last) return [];
      if ('why' in last) {
        leave(last, log, (found) => report({ ...found, day: i }));
        return [];
      }
      used.add(last.shape);
      return [last];
    }),
  );
  return { days: placed, shapes: own.shapes.filter((s) => used.has(s.id)) };
}

/**
 * Each day's Trips of a timetable with no shapes, as Renfe's long-distance one, placed on the traces of
 * their runs (traceRuns(), #259), which, made through their own Stations, they run from start to end, as
 * placeDays() places a Trip on a trace of its own (#280): one that doesn't fit its trace is left out and
 * reported on its day. Gives each day's Trips, and the traces, those that have a Trip placed on them.
 */
export function placeRuns(
  runs: { shapes: Shape[]; days: FeedTrip[][] },
  stations: Station[],
  topSpeed: (line: string) => number,
  log = console.log,
  report: (found: Found) => void = () => {},
): { days: Trip[][]; shapes: Shape[] } {
  const days = runs.days.map((trips, day) =>
    place(trips, runs.shapes, stations, topSpeed, true).flatMap((p) => {
      if (!('why' in p)) return [p];
      leave(p, log, (found) => report({ ...found, day }));
      return [];
    }),
  );
  const used = new Set(days.flat().map((t) => t.shape));
  return { days, shapes: runs.shapes.filter((s) => used.has(s.id)) };
}

/**
 * Each Trip placed on its shape's track, or why it can't be, in the order they came. `onward` is for a
 * trace made through the Trips' own Stations (placeDays()), which they run from its start to its end.
 */
function place(trips: FeedTrip[], shapes: Shape[], stations: Station[], topSpeed: (line: string) => number, onward = false): (Trip | Unplaced)[] {
  const byId = new Map(stations.map((s) => [s.id, s]));
  const byShape = new Map(shapes.map((s) => [s.id, s]));
  const cached = new Map<string, Pass[]>();
  const passesOf = (shape: Shape, station: Station) => {
    const key = `${shape.id} ${station.id}`;
    const found = cached.get(key) ?? passes(shape, [station.lon, station.lat]);
    cached.set(key, found);
    return found;
  };

  return trips.map((feed): Trip | Unplaced => {
    const { calls, ...trip } = feed;
    const shape = byShape.get(trip.shape);
    const calledAt = calls.map((c) => byId.get(c.station) ?? { id: c.station, name: c.station, lon: NaN, lat: NaN });
    const leave = (why: Cause, reason: string, at = calledAt.slice(0, 1)): Unplaced => ({ trip: feed, why, reason, at });
    if (!shape) return leave('notrack', `its shape ${trip.shape} has no track`);
    if (calls.length < 2) return leave('fewer', 'it calls at fewer than two Stations');
    const options = calledAt.map((s) => passesOf(shape, s));
    const off = calledAt.find((_, i) => !options[i]?.length);
    if (off) return leave('off', `${off.name} is ${(nearest(shape.coords, [off.lon, off.lat]).metres / 1000).toFixed(1)} km off its track`, [off]);
    const dist = leastTravel(options, onward);
    // A stretch faster than its Line's top speed is placed on the wrong track, say one that runs back past a Station.
    const speed = (i: number) => Math.abs((dist[i] ?? 0) - (dist[i - 1] ?? 0)) / ((calls[i]?.arrival ?? 0) - (calls[i - 1]?.departure ?? 0));
    const fast = calls.findIndex((_, i) => i > 0 && speed(i) > topSpeed(trip.line));
    if (fast > 0) return leave('fast', `it would run ${calledAt[fast - 1]?.name} → ${calledAt[fast]?.name} at ${Math.round(speed(fast) * 3.6)} km/h along its track`, calledAt.slice(fast - 1, fast + 1));
    return { ...trip, calls: calls.map((c, i) => ({ ...c, dist: Math.round(dist[i] ?? 0) })) };
  });
}

/**
 * The Closures a day's replacement buses make (ADR-0012): each bus closes its Line, with buses in its
 * Trains' place, only where none of the Line's Trains runs that day (`trips`). Its run on the Line's
 * track, from the first to the last of its stops that are the Line's Stations on its track, is cut
 * into parts at each of its stops between them that one of the Line's Trains calls at that day, and
 * it closes each part that none of those Trains calls at both ends of, either way, whatever it calls
 * at between them. So on 7 Oct 2026 R13's buses from Lleida to La Plana-Picamoixons close only Les
 * Borges Blanques – La Plana-Picamoixons, as R13's Trains shuttle from Lleida to Les Borges Blanques,
 * and R3's, which run beside R3's Trains, close nothing. A bus closes a part from its departure
 * from the one Station to its arrival at the other, and buses over the same part, either way, make one
 * Closure, from the first bus to the last. A part that lies wholly inside another of the Line's
 * Closures, at stops that Closure's buses call at and within its hours, joins it, as San Sebastián's
 * one early bus from Irun to Lezo-Rentería joins C1's Hernani – Irun on 9–12 Oct 2026. The Line's
 * Stations on its track are those its Trains serve on any day (`shapes`), and a bus's calls at those
 * beyond Spain's border, which aren't the bundle's (`stations`), go, as its Trains leave the map there
 * (crop()). Where a bus runs off the Line's track, before its first such Station, after its last, or
 * all its way, as R3's ran from Fabra i Puig to La Garriga, where no R3 Train runs in the whole
 * timetable, the map has no track to draw that part on, and it's logged, once however many buses run
 * there, and reported.
 * ponytail: a part counts as run only where one Train calls at both its ends, so it's closed though
 * Trains run it where they all pass one of its ends without calling, or each run only some of it,
 * turning back or branching off at a Station the bus passes without calling, as R13's 04:48 bus from
 * Lleida would close Juneda – La Plana-Picamoixons had it passed Les Borges Blanques. None did on 7–12
 * Oct 2026. Check the part against where the Trains run along the track if one ever does.
 */
export function closuresOf(buses: FeedBus[], trips: FeedTrip[], shapes: FeedShape[], stations: Station[], log = console.log, report: (found: Found) => void = () => {}): Closure[] {
  const inside = new Set(stations.map((s) => s.id));
  const own = new Map<string, Set<string>>();
  for (const s of shapes) own.set(s.line, new Set([...(own.get(s.line) ?? []), ...s.stations]));
  const trains = new Map<string, Set<string>[]>(); // the Stations each of a Line's Trains calls at that day
  for (const t of trips) trains.set(t.line, [...(trains.get(t.line) ?? []), new Set(t.calls.map((c) => c.station))]);
  const closures = new Map<string, Closure>();
  const stops = new Map<string, Set<string>>(); // the stops each Closure's buses call at, from one of its Stations to the other
  const logged = new Set<string>();
  for (const { id, line, calls: all } of buses) {
    const ours = own.get(line) ?? new Set();
    // Whether one of the Line's Trains calls at each of these Stations that day.
    const calledAt = (...at: string[]) => trains.get(line)?.some((t) => at.every((s) => t.has(s)));
    const calls = all.filter((c) => inside.has(c.station.id) || !ours.has(c.station.id));
    const on = calls.map((c) => ours.has(c.station.id));
    const [first, last] = [on.indexOf(true), on.lastIndexOf(true)];
    // The parts of its run off the track, each to or from the Station where it joins it.
    for (const part of first < 0 ? [calls] : [calls.slice(0, first + 1), calls.slice(last)]) {
      const [start, end] = [part[0]?.station, part.at(-1)?.station];
      if (part.length < 2 || !start || !end) continue;
      const text = `${line}'s buses ${start.name} → ${end.name} make no Closure: the Line has no track there`;
      if (!logged.has(text)) log(text);
      logged.add(text);
      report({ kind: 'bus', line, trip: id, stations: [start, end], text: [text] });
    }
    // Its run on the track, cut at the Stations the Line's Trains call at that day.
    const cuts = calls.filter((c, i) => on[i] && (i === first || i === last || calledAt(c.station.id)));
    for (const [i, b] of cuts.entries()) {
      const a = cuts[i - 1];
      if (!a || calledAt(a.station.id, b.station.id)) continue;
      const ends = [a.station.id, b.station.id].sort() as [string, string];
      const key = `${line} ${ends.join(' ')}`;
      const known = closures.get(key);
      closures.set(key, { line, stations: ends, from: Math.min(a.departure, known?.from ?? Infinity), to: Math.max(b.arrival, known?.to ?? -Infinity), kind: 'buses' });
      stops.set(key, new Set([...(stops.get(key) ?? []), ...calls.slice(calls.indexOf(a), calls.indexOf(b) + 1).map((c) => c.station.id)]));
    }
  }
  // A part that lies wholly inside another Closure of its Line, at stops its buses call at and within its hours, joins it.
  return [...closures.values()].filter((c) => ![...closures].some(([key, o]) => o !== c && o.line === c.line && o.from <= c.from && c.to <= o.to && c.stations.every((s) => stops.get(key)?.has(s))));
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
 * its Stations. Along a trace made through the Trip's own Stations it's `onward`: the Trip runs it
 * from its start to its end, so a Station is at the pass it can be reached by going on, as R15's from
 * Ulldecona by Tortosa back to L'Aldea is at the trace's end, not at the way out's, which the least
 * travel would take by a few metres of track (#280).
 * ponytail: a Station that's a little behind the one before it, as two at one place can be, and has a
 * later pass too, goes to that one, and a Trip it doesn't fit is left out as too fast. Allow it some
 * slack, a hundred metres or so, if a Trip is ever left out so.
 */
function leastTravel(options: Pass[][], onward = false): number[] {
  const better = <T extends { travel: number; off: number }>(a: T, b: T) => (b.travel < a.travel || (b.travel === a.travel && b.off < a.off) ? b : a);
  let ways = (options[0] ?? []).map((p) => ({ travel: 0, off: p.metres, dist: [p.along] }));
  const go = (p: Pass, from: typeof ways) => {
    const best = from.map((way) => ({ ...way, travel: way.travel + Math.abs(p.along - (way.dist.at(-1) ?? 0)) })).reduce(better);
    return { travel: best.travel, off: best.off + p.metres, dist: [...best.dist, p.along] };
  };
  for (const passes of options.slice(1)) {
    // Only the passes it can go on to, where it can go on to any.
    const onwards = onward
      ? passes.flatMap((p) => {
          const from = ways.filter((way) => p.along >= (way.dist.at(-1) ?? 0));
          return from.length ? [go(p, from)] : [];
        })
      : [];
    ways = onwards.length ? onwards : passes.map((p) => go(p, ways));
  }
  return ways.reduce(better).dist;
}
