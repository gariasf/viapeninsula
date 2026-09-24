// Where each Train is. The timetable drives motion (ADR-0002); the browser and the tests share this.

import { pointAt, type Bundle, type Call, type Snapshot, type SpeedProfile, type Trip } from './bundle.ts';

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
 * received by then, where its Trip's timetable puts it, as late or early as its operator last said.
 * Between Stations it accelerates, cruises and brakes, as its Network's speed profile has it, so
 * that it leaves and arrives exactly on time. A Train its operator has cancelled leaves the map.
 */
export function trainsAt(bundle: Bundle, at: number, received: Received[] = []): Train[] {
  const now = (at + behind(received) - bundle.noonMinus12h) / 1000;
  const shapes = new Map(bundle.shapes.map((s) => [s.id, s]));
  const profiles = new Map(bundle.networks.map((n) => [n.id, n.profile]));
  const lines = new Map(bundle.lines.map((l) => [l.id, profiles.get(l.network)]));
  // What the latest snapshot reports about each Trip. A report that matches no Trip is dropped.
  const reports = new Map(received.at(-1)?.snapshot.reports.map((r) => [r.trip, r]));
  return bundle.trips.flatMap((trip): Train[] => {
    const report = reports.get(trip.id);
    if (report?.cancelled) return [];
    // A Train running late is where its timetable had it that long ago.
    const time = now - (report?.delay ?? 0);
    const [profile, shape, first, last] = [lines.get(trip.line), shapes.get(trip.shape), trip.calls[0], trip.calls.at(-1)];
    // Most Trips aren't on the map at any one moment, whatever their dwell: skip those first.
    if (!profile || !shape || !first || !last || time < first.arrival - profile.dwell || time > last.departure + profile.dwell) return [];
    const calls = withDwell(trip, profile);
    const i = calls.findLastIndex((c) => c.arrival <= time);
    const [call, next] = [calls[i], calls[i + 1]];
    if (!call || (!next && time > call.departure)) return [];
    let dist = call.dist;
    if (next && time > call.departure) {
      const length = next.dist - call.dist;
      dist += Math.sign(length) * covered(Math.abs(length), next.arrival - call.departure, time - call.departure, profile);
    }
    const [lon, lat] = pointAt(shape, dist);
    return [{ trip, dist, lon, lat, live: report?.position !== undefined }];
  });
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
 * How far a Train has gone t seconds into a stretch of `length` metres that its timetable gives
 * `time` seconds, cruising at the lowest speed that arrives on time. On a stretch quicker than the
 * profile allows, it accelerates and brakes harder instead, cruising at top speed, or where the
 * stretch is too short to reach it, braking as soon as it has accelerated.
 */
function covered(length: number, time: number, t: number, profile: SpeedProfile): number {
  if (t >= time) return length;
  const { acceleration, braking, topSpeed } = profile;
  // Cruising at v covers v·time − k·v² metres.
  const k = 1 / (2 * acceleration) + 1 / (2 * braking);
  let [v, harder] = [(time - Math.sqrt(Math.max(0, time * time - 4 * k * length))) / (2 * k), 1];
  if (time < quickest(length, profile)) {
    // Braking as soon as it has accelerated, it peaks at twice its average speed.
    v = Math.max(length / time, Math.min(topSpeed, (2 * length) / time));
    harder = (k * v * v) / (v * time - length);
  }
  const [a, b] = [acceleration * harder, braking * harder];
  if (t < v / a) return (a * t * t) / 2;
  if (t > time - v / b) return length - (b * (time - t) ** 2) / 2;
  return (v * v) / (2 * a) + v * (t - v / a);
}
