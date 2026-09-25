// Where each Train is. The timetable drives motion (ADR-0002); the browser and the tests share this.

import { closestOnSegment, DEGREE, pointAt, type Bundle, type Call, type Point, type Report, type Shape, type Snapshot, type SpeedProfile, type Trip } from './bundle.ts';

/**
 * A Train on the map: its Trip, how far along the Trip's shape it is, in metres, and where that is.
 * It's Live where the latest snapshot reports where it is, and Scheduled where not.
 */
export interface Train {
  trip: Trip;
  dist: number;
  lon: number;
  lat: number;
  live: boolean;
}

/** A snapshot of live data, and when it arrived by the device's clock, in ms since 1970. */
export interface Received {
  snapshot: Snapshot;
  at: number;
}

/**
 * The oldest a snapshot can be when it arrives, in ms: the fetcher writes one about every 20 s, and
 * the CDN and then the browser can each keep it for 15 s.
 */
const MAX_AGE = 60_000;

/**
 * Every Train on the map at a moment by the device's clock (ms since 1970), given the snapshots
 * received by then, where its Trip's timetable puts it, shifted in time by live data (ADR-0002):
 * eased towards as late or early as live data has it, or where that's far, jumping there. Between
 * Stations it accelerates, cruises and brakes, as its Network's speed profile has it, so that it
 * leaves and arrives exactly on time. A Train its operator has cancelled leaves the map.
 */
export function trainsAt(bundle: Bundle, at: number, received: Received[] = []): Train[] {
  const clock = behind(received);
  const now = (at + clock - bundle.noonMinus12h) / 1000;
  const shapes = new Map(bundle.shapes.map((s) => [s.id, s]));
  const profiles = new Map(bundle.networks.map((n) => [n.id, n.profile]));
  const lines = new Map(bundle.lines.map((l) => [l.id, profiles.get(l.network)]));
  const eases = replay(bundle, received, clock, lines, shapes);
  // What the latest snapshot reports about each Trip. A report that matches no Trip is dropped.
  const reports = new Map(received.at(-1)?.snapshot.reports.map((r) => [r.trip, r]));
  return bundle.trips.flatMap((trip): Train[] => {
    const report = reports.get(trip.id);
    if (report?.cancelled) return [];
    const [profile, shape, first, last, ease] = [lines.get(trip.line), shapes.get(trip.shape), trip.calls[0], trip.calls.at(-1), eases.get(trip.id)];
    if (!profile || !shape) return [];
    // A Train running late is where its timetable had it that long ago, once it has eased there.
    const time = ease ? eased(withDwell(trip, profile), profile, ease, now) : now;
    // Most Trips aren't on the map at any one moment, whatever their dwell: skip those first.
    if (!first || !last || time < first.arrival - profile.dwell || time > last.departure + profile.dwell) return [];
    const dist = place(withDwell(trip, profile), profile, time);
    if (dist === undefined) return [];
    const [lon, lat] = pointAt(shape, dist);
    return [{ trip, dist, lon, lat, live: report?.position !== undefined }];
  });
}

/**
 * When the latest snapshot arrived and where in its timetable a Train was drawn then, in seconds
 * into the service day by the fetcher's clock, and how late that snapshot has it, in seconds.
 */
interface Ease {
  at: number;
  time: number;
  delay: number;
}

/** How long a Train drawn off where live data has it takes to ease back, in seconds: until the next snapshot. */
const EASE = 20;

/** How far a Train can be drawn from where live data has it before it jumps there: a minute of its timetable, or 1 km. */
const [JUMP_TIME, JUMP_DIST] = [60, 1000];

/**
 * The last replay, which the map asks for again every frame until its next snapshot arrives.
 * ponytail: every snapshot kept is replayed each time one arrives, about 8 ms on a laptop for half
 * an hour of Rodalies' 80 Live Trains. Fold each new one into the last replay once more Networks
 * go Live, or if phones stutter.
 */
let last: { bundle: Bundle; received: Received[]; eases: Map<string, Ease> } | undefined;

/**
 * How each Train live data has shifted in time is drawn, snapshot by snapshot, so that it never
 * runs back along its track (ADR-0002). The first snapshot places every Train outright, and after
 * that a Train drawn far from where a snapshot has it jumps there.
 */
function replay(bundle: Bundle, received: Received[], clock: number, lines: Map<string, SpeedProfile | undefined>, shapes: Map<string, Shape>): Map<string, Ease> {
  if (last?.bundle === bundle && last.received.length === received.length && last.received.every((r, i) => r === received[i])) return last.eases;
  const trips = new Map(bundle.trips.map((t) => [t.id, t]));
  const [eases, dwelt] = [new Map<string, Ease>(), new Map<string, Call[]>()];
  for (const [i, { snapshot, at }] of received.entries()) {
    const arrived = (at + clock - bundle.noonMinus12h) / 1000;
    const reports = new Map(snapshot.reports.map((r) => [r.trip, r]));
    for (const id of new Set([...eases.keys(), ...reports.keys()])) {
      const [trip, report, ease] = [trips.get(id), reports.get(id), eases.get(id)];
      const [profile, shape] = [trip && lines.get(trip.line), trip && shapes.get(trip.shape)];
      if (!trip || !profile || !shape) continue;
      const calls = dwelt.get(id) ?? withDwell(trip, profile);
      dwelt.set(id, calls);
      const delay = report ? delayOf(trip, calls, shape, profile, report, bundle.noonMinus12h) : 0;
      // Until live data first shifts it, a Train runs on its timetable.
      const drawn = ease ? eased(calls, profile, ease, arrived) : arrived;
      const [there, dist] = [arrived - delay, (time: number) => place(calls, profile, time) ?? NaN];
      const far = Math.abs(drawn - there) > JUMP_TIME || Math.abs(dist(drawn) - dist(there)) > JUMP_DIST;
      eases.set(id, { at: arrived, time: i === 0 || far ? there : drawn, delay });
    }
  }
  last = { bundle, received: [...received], eases };
  return eases;
}

/**
 * Where in its timetable a Train is drawn at a moment, both in seconds into the service day, by its
 * calls as it makes them. One drawn off where live data has it eases back by the next snapshot, as
 * far as it can. Drawn ahead, it runs slower, holding where it's EASE or more ahead, and holds
 * while it stands at a Station or is off the map. Drawn behind, it runs faster, up to line speed,
 * and leaves a Station as soon as reality has.
 */
function eased(calls: Call[], profile: SpeedProfile, { at, time, delay }: Ease, now: number): number {
  // How far ahead of where live data has it the Train was drawn as the snapshot arrived.
  const gap = time - (at - delay);
  let [t, drawn] = [at, time];
  for (;;) {
    // How far ahead of where live data has it the Train is drawn, in seconds of its timetable.
    const ahead = drawn - (t - delay);
    if (!ahead) return now - delay;
    const i = calls.findLastIndex((c) => c.arrival <= drawn);
    const [call, next] = [calls[i], calls[i + 1]];
    if (!call || !next || drawn < call.departure || next.dist === call.dist) {
      if (ahead > 0) return now - t <= ahead ? drawn : now - delay;
      // When it next moves.
      const end = !call ? (calls[0]?.arrival ?? Infinity) : drawn < call.departure ? call.departure : (next?.arrival ?? Infinity);
      if (t - delay <= end) return now - delay;
      drawn = end;
      continue;
    }
    const [length, span] = [Math.abs(next.dist - call.dist), next.arrival - call.departure];
    // Behind, it's never slower than its timetable, where that asks for more than line speed.
    const rate = ahead > 0 ? Math.max(0, 1 - gap / EASE) : Math.min(1 - gap / EASE, Math.max(1, profile.topSpeed / run(length, span, profile).v));
    // How long until reality catches up, and until it reaches the next Station.
    const [caught, reached] = [Math.abs(ahead / (1 - rate)), (next.arrival - drawn) / rate];
    if (now - t <= Math.min(caught, reached)) return drawn + rate * (now - t);
    if (caught <= reached) return now - delay;
    [t, drawn] = [t + reached, next.arrival];
  }
}

/**
 * How far the device's clock is behind the fetcher's, in ms, going by when each snapshot was
 * written and when it arrived. By a clock that's right, each arrives after it was written, and at
 * most MAX_AGE after. A clock that's off is off by at least what the freshest snapshot shows.
 */
function behind(received: Received[]): number {
  // How far each snapshot's writing is ahead of its arrival, by the two clocks.
  const ahead = received.map((r) => r.snapshot.generated - r.at);
  const freshest = Math.max(...ahead);
  // A snapshot written after it arrived means the device's clock is behind.
  if (freshest > 0) return freshest;
  // One that arrived long after it was written means the clock is ahead, or else that the fetcher
  // has stopped: only a second snapshot, written since, says which.
  const written = new Set(received.map((r) => r.snapshot.generated));
  return written.size > 1 && freshest < -MAX_AGE ? freshest : 0;
}

/**
 * How far along its shape a Trip's Train is at a time into the service day, in metres, by its
 * calls as it makes them: none while it's off the map.
 */
function place(calls: Call[], profile: SpeedProfile, time: number): number | undefined {
  const i = calls.findLastIndex((c) => c.arrival <= time);
  const [call, next] = [calls[i], calls[i + 1]];
  if (!call || (!next && time > call.departure)) return undefined;
  if (!next || time <= call.departure) return call.dist;
  const length = next.dist - call.dist;
  return call.dist + Math.sign(length) * covered(Math.abs(length), next.arrival - call.departure, time - call.departure, profile);
}

/** Each report's Delay for its Train, worked out once: finding a Train's GPS on its track is slow. */
const delays = new WeakMap<Report, { trip: Trip; delay: number }>();

/**
 * A report's Delay for its Train, in seconds: while it runs between Stations, from where its GPS
 * puts it on its Trip's track, and otherwise, standing at or pinned to a Station or with no
 * position, its operator's figure.
 */
function delayOf(trip: Trip, calls: Call[], shape: Shape, profile: SpeedProfile, report: Report, noonMinus12h: number): number {
  const known = delays.get(report);
  if (known?.trip === trip) return known.delay;
  const [reported, { position }] = [(report.at - noonMinus12h) / 1000, report];
  let delay = report.delay ?? 0;
  if (position && 'lon' in position) {
    const dists = calls.map((c) => c.dist);
    const passed = passing(calls, profile, nearest(shape, Math.min(...dists), Math.max(...dists), position), reported - delay);
    if (passed !== undefined) delay = reported - passed;
  }
  delays.set(report, { trip, delay });
  return delay;
}

/** How far along a shape the point of it nearest a position is, in metres, between two distances along it. */
function nearest({ coords, dist }: Shape, from: number, to: number, { lon, lat }: { lon: number; lat: number }): number {
  const [p, kx]: [Point, number] = [[lon, lat], DEGREE * Math.cos((lat * Math.PI) / 180)];
  let [closest, found] = [Infinity, from];
  for (let i = 1; i < coords.length; i++) {
    const [a, b, start = 0, stop = 0] = [coords[i - 1], coords[i], dist[i - 1], dist[i]];
    if (!a || !b || stop < from || start > to) continue;
    const [t, metres] = closestOnSegment(a, b, p, kx);
    if (metres < closest) [closest, found] = [metres, start + t * (stop - start)];
  }
  return Math.max(from, Math.min(to, found));
}

/**
 * When a Trip's Train runs past a point `d` metres along its shape, in seconds into the service
 * day, by its calls as it makes them: the time nearest `around` where it runs past more than once,
 * and none where it's only ever standing there.
 */
function passing(calls: Call[], profile: SpeedProfile, d: number, around: number): number | undefined {
  let found: number | undefined;
  for (const [i, call] of calls.entries()) {
    const next = calls[i + 1];
    if (!next || (d - call.dist) * (d - next.dist) >= 0) continue;
    const [length, time] = [Math.abs(next.dist - call.dist), next.arrival - call.departure];
    // It only ever runs on along a stretch, so halving finds when it gets there.
    let [early, late] = [0, time];
    while (late - early > 1e-6) {
      const mid = (early + late) / 2;
      if (covered(length, time, mid, profile) < Math.abs(d - call.dist)) early = mid;
      else late = mid;
    }
    const t = call.departure + (early + late) / 2;
    if (found === undefined || Math.abs(t - around) < Math.abs(found - around)) found = t;
  }
  return found;
}

/**
 * A Trip's calls as its Train makes them. Where the timetable gives it no time at a Station, it
 * stands there for the profile's dwell, arriving that much before it leaves (at its last Station,
 * leaving that much after it arrives), or for half what its stretch there can spare, if less.
 */
function withDwell({ calls }: Trip, profile: SpeedProfile): Call[] {
  return calls.map((call, i) => {
    const prev = calls[i - 1];
    if (call.arrival !== call.departure) return call;
    if (i === calls.length - 1) return { ...call, departure: call.arrival + profile.dwell };
    const spare = prev ? call.arrival - prev.departure - quickest(Math.abs(call.dist - prev.dist), profile) : Infinity;
    return { ...call, arrival: call.departure - Math.min(profile.dwell, Math.max(0, spare / 2)) };
  });
}

/** The least time a stretch of `length` metres can take within a speed profile, in seconds. */
function quickest(length: number, { acceleration, braking, topSpeed }: SpeedProfile): number {
  // Accelerating to a speed v and braking straight away covers k·v² metres.
  const k = 1 / (2 * acceleration) + 1 / (2 * braking);
  const peak = Math.min(topSpeed, Math.sqrt(length / k));
  return peak ? length / peak + k * peak : 0;
}

/**
 * How a Train runs a stretch of `length` metres that its timetable gives `time` seconds: the speed it
 * cruises at, the lowest that arrives on time, and how hard it accelerates and brakes. On a stretch
 * quicker than the profile allows, it accelerates and brakes harder instead, cruising at top speed,
 * or where the stretch is too short to reach it, braking as soon as it has accelerated.
 */
function run(length: number, time: number, profile: SpeedProfile): { v: number; a: number; b: number } {
  const { acceleration, braking, topSpeed } = profile;
  // Cruising at v covers v·time − k·v² metres.
  const k = 1 / (2 * acceleration) + 1 / (2 * braking);
  let [v, harder] = [(time - Math.sqrt(Math.max(0, time * time - 4 * k * length))) / (2 * k), 1];
  if (time < quickest(length, profile)) {
    // Braking as soon as it has accelerated, it peaks at twice its average speed.
    v = Math.max(length / time, Math.min(topSpeed, (2 * length) / time));
    harder = (k * v * v) / (v * time - length);
  }
  return { v, a: acceleration * harder, b: braking * harder };
}

/** How far a Train has gone t seconds into a stretch of `length` metres that its timetable gives `time` seconds. */
function covered(length: number, time: number, t: number, profile: SpeedProfile): number {
  if (t >= time) return length;
  const { v, a, b } = run(length, time, profile);
  if (t < v / a) return (a * t * t) / 2;
  if (t > time - v / b) return length - (b * (time - t) ** 2) / 2;
  return (v * v) / (2 * a) + v * (t - v / a);
}
