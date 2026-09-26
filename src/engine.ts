// Where each Train is. The timetable drives motion (ADR-0002); the browser and the tests share this.

import { closestOnSegment, DEGREE, pointAt, type Bundle, type Call, type Network, type Point, type Report, type Shape, type Snapshot, type SpeedProfile, type Trip } from './bundle.ts';

/**
 * A Train on the map: its Trip, how far along the Trip's shape it is, in metres, and where that is.
 * It's Live while live data has placed it within about its feed's last three updates, and Scheduled otherwise.
 */
export interface Train {
  trip: Trip;
  dist: number;
  lon: number;
  lat: number;
  live: boolean;
  /** Whether its Network's live data works but hasn't reported it lately: it has no live data, and may not be running. */
  unreported: boolean;
}

/**
 * A snapshot of live data, and when the map had it, by the device's clock in ms since 1970. The map
 * records one each time it looks for live data: the snapshot it gets, or where it gets none, the last
 * it had. So a feed misses updates only while the map looks for them.
 */
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
 * How long a device can go without a newer snapshot while the fetcher is running, in ms: one can
 * be MAX_AGE old when it arrives, and the map fetches the next 20 s later.
 */
const LAG = MAX_AGE + 20_000;

/** How many of its feed's updates in a row a Live Train misses as it turns Scheduled, and a feed as its live data turns unavailable. */
const MISSES = 3;

/** How long a Train keeps the last Delay live data gave it once live data stops reporting it, in ms. */
const CARRY = 30 * 60_000;

/**
 * How long the map keeps each snapshot it receives, in ms: a little longer than CARRY, so that a
 * Train's last Delay runs out as the replay eases it back, before the snapshot that gave it goes.
 */
export const KEEP = CARRY + 5 * 60_000;

/**
 * Every Train on the map at a moment by the device's clock (ms since 1970), given the snapshots
 * received by then, where its Trip's timetable puts it, shifted in time by live data (ADR-0002):
 * eased towards as late or early as live data has it, or where that's far, jumping there. Between
 * Stations it accelerates, cruises and brakes, as its Network's speed profile has it, so that it
 * leaves and arrives exactly on time. A Train its operator has cancelled leaves the map. One that
 * live data stops reporting stays Live through two of its feed's updates and turns Scheduled at the
 * third, and it keeps its last Delay for CARRY before it's back on its plain timetable.
 */
export function trainsAt(bundle: Bundle, at: number, received: Received[] = []): Train[] {
  const clock = behind(received);
  const now = (at + clock - bundle.noonMinus12h) / 1000;
  const shapes = new Map(bundle.shapes.map((s) => [s.id, s]));
  const networks = new Map(bundle.networks.map((n) => [n.id, n]));
  const lines = new Map(bundle.lines.map((l) => [l.id, networks.get(l.network)]));
  // What live data last said about each Trip. A report that matches no Trip is dropped.
  const { eases, heard } = replay(bundle, received, clock, lines, shapes);
  // How far into live data the device has got by now, and by when the map last looked for it. A
  // Train is Live only on recent confirmation, however long since the map looked, but live data is
  // unavailable only where the map has looked and found none.
  const [upToNow, upTo] = [heardTo(received, at + clock), heardTo(received, (received.at(-1)?.at ?? -Infinity) + clock)];
  const feeds = received.at(-1)?.snapshot.feeds ?? {};
  return bundle.trips.flatMap((trip): Train[] => {
    const said = heard.get(trip.id);
    if (said?.report.cancelled) return [];
    const [network, shape, first, last, ease] = [lines.get(trip.line), shapes.get(trip.shape), trip.calls[0], trip.calls.at(-1), eases.get(trip.id)];
    if (!network || !shape) return [];
    const { profile } = network;
    // A Train running late is where its timetable had it that long ago, once it has eased there.
    const time = ease ? eased(withDwell(trip, profile), profile, ease, now) : now;
    // Most Trips aren't on the map at any one moment, whatever their dwell: skip those first.
    if (!first || !last || time < first.arrival - profile.dwell || time > last.departure + profile.dwell) return [];
    const dist = place(withDwell(trip, profile), profile, time);
    // Beyond where its track starts or ends, as past Catalonia's border, it's off the map.
    if (dist === undefined || dist < (shape.dist[0] ?? 0) || dist > (shape.dist.at(-1) ?? 0)) return [];
    const [lon, lat] = pointAt(shape, dist);
    const feed = feeds[network.id];
    const live = feed !== undefined && said?.placed !== undefined && !stale(said.placed, upToNow, feed.every);
    const unreported = feed !== undefined && !recent(said, upTo) && !stale(feed.lastSuccess, upTo, feed.every);
    return [{ trip, dist, lon, lat, live, unreported }];
  });
}

/**
 * Consecutive service days' bundles as one, on the last day's clock, so that around midnight a Train
 * still running from the day before and the new day's first Trains are on the map together. The
 * earlier days' Trips run on it too, their IDs led by their service day, as in `2026-09-25/<id>`: an
 * operator can give one day's Trip the same ID as the next's. Networks, Lines, Stations and track are
 * the last day's, and the earlier days' where it has none of them. The engine goes over a bundle it
 * hasn't seen before from scratch, so join the days once for as long as they're the ones shown.
 * ponytail: an earlier day's Trips run on the last day's track where both have a shape of that ID,
 * which is the same track unless the operator redrew it between the two builds.
 */
export function joinDays(days: Bundle[]): Bundle {
  const latest = days.at(-1);
  if (!latest) throw new Error('No service day to show');
  if (days.length === 1) return latest;
  const each = <T extends { id: string }>(of: (day: Bundle) => T[]) => [...new Map(days.flatMap(of).map((x) => [x.id, x])).values()];
  return {
    ...latest,
    networks: each((d) => d.networks),
    lines: each((d) => d.lines),
    stations: each((d) => d.stations),
    shapes: each((d) => d.shapes),
    trips: days.flatMap(({ serviceDay, noonMinus12h, trips }) => {
      if (serviceDay === latest.serviceDay) return trips;
      // How far the day's clock is behind the last day's, in seconds: a day, or on the nights the clocks change, an hour more or less.
      const behind = (latest.noonMinus12h - noonMinus12h) / 1000;
      return trips.map((trip) => ({
        ...trip,
        id: `${serviceDay}/${trip.id}`,
        calls: trip.calls.map((c) => ({ ...c, arrival: c.arrival - behind, departure: c.departure - behind })),
      }));
    }),
  };
}

/**
 * The Networks whose live data is unavailable, given the snapshots received, as the latest has their
 * feeds: each has missed about three of its updates. Their Trains run as Scheduled meanwhile, and
 * the map says so.
 */
export function unavailable(received: Received[]): string[] {
  const upTo = heardTo(received, (received.at(-1)?.at ?? -Infinity) + behind(received));
  return Object.entries(received.at(-1)?.snapshot.feeds ?? {}).flatMap(([network, feed]) => (stale(feed.lastSuccess, upTo, feed.every) ? [network] : []));
}

/**
 * Whether a feed whose updates come `every` ms apart has missed three of them since a moment, as
 * far into live data as a device has got, both by the fetcher's clock in ms. Never is long ago.
 */
const stale = (since: number | undefined, upTo: number, every: number) => upTo - (since ?? -Infinity) >= MISSES * every;

/** What live data last said about a Train, while that's recent enough to go by: under CARRY old, as far into live data as a device has got. */
const recent = (said: Heard | undefined, upTo: number) => (said && upTo - said.got < CARRY ? said : undefined);

/**
 * What live data last said about a Train: its latest report, when the fetcher got that, and when
 * it last got one that placed the Train, in ms since 1970 by the fetcher's clock.
 */
interface Heard {
  report: Report;
  got: number;
  placed?: number;
  /** The snapshot, as received, that it was last in. */
  from: Received;
}

/**
 * How far into live data a device has got by a moment, both by the fetcher's clock in ms: to when
 * the fetcher wrote the newest snapshot received, or where a running fetcher's would be newer by
 * then, to LAG before it. So a snapshot that's slow to come never turns Trains Scheduled, and one
 * that never comes does.
 */
function heardTo(received: Received[], moment: number): number {
  return Math.max(moment - LAG, ...received.map((r) => r.snapshot.generated));
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
 * The last replay, which the map asks for again every frame until its next snapshot arrives, and
 * then folds that snapshot into.
 */
let last: { bundle: Bundle; received: Received[]; clock: number; eases: Map<string, Ease>; heard: Map<string, Heard>; dwelt: Map<string, Call[]> } | undefined;

/**
 * How each Train live data has shifted in time is drawn, snapshot by snapshot, so that it never
 * runs back along its track (ADR-0002), and what live data last said about it. The first snapshot
 * places every Train outright, and after that a Train drawn far from where a snapshot has it jumps there.
 *
 * Snapshots received since the last replay are folded into it, and those it had that have since
 * gone take what only they said with them. The rest of what they did stays: a Train has long caught
 * up with live data, and its last Delay has run out, by the time the snapshot that gave it goes
 * (KEEP). Otherwise every snapshot is replayed: where they don't carry on from the last replay's, or
 * they correct the device's clock differently.
 * ponytail: a device whose clock is behind the fetcher's corrects it anew each time a snapshot comes
 * fresher than any before, or the freshest goes, and replays everything then. Fold with the old
 * correction if those devices stutter.
 */
function replay(bundle: Bundle, received: Received[], clock: number, lines: Map<string, Network | undefined>, shapes: Map<string, Shape>): { eases: Map<string, Ease>; heard: Map<string, Heard> } {
  // How many of the last replay's snapshots have gone, and so which of these it had.
  const gone = last?.bundle === bundle && last.clock === clock ? (received.length ? last.received.indexOf(received[0] as Received) : 0) : -1;
  const had = (last?.received.length ?? 0) - gone;
  const folding = last && gone >= 0 && had <= received.length && last.received.slice(gone).every((r, i) => r === received[i]) ? last : undefined;
  if (folding && !gone && had === received.length) return folding;
  const { eases, heard, dwelt } = folding ?? { eases: new Map<string, Ease>(), heard: new Map<string, Heard>(), dwelt: new Map<string, Call[]>() };
  if (folding && gone > 0) {
    const kept = new Set(received);
    for (const [id, said] of heard) if (!kept.has(said.from)) [heard, eases, dwelt].forEach((m) => m.delete(id));
  }
  const trips = new Map(bundle.trips.map((t) => [t.id, t]));
  for (let i = folding ? had : 0; i < received.length; i++) {
    const r = received[i] as Received;
    const [arrived, upTo] = [(r.at + clock - bundle.noonMinus12h) / 1000, heardTo(received.slice(0, i + 1), r.at + clock)];
    const reports = reportsByTrip(bundle, r.snapshot);
    for (const id of new Set([...eases.keys(), ...reports.keys()])) {
      const [trip, report, ease] = [trips.get(id), reports.get(id), eases.get(id)];
      const [network, shape] = [trip && lines.get(trip.line), trip && shapes.get(trip.shape)];
      if (!trip || !network || !shape) continue;
      const { profile } = network;
      if (report) {
        // A report the fetcher kept from a feed's last good response is as old as that response.
        const got = r.snapshot.feeds[network.id]?.lastSuccess ?? NaN;
        heard.set(id, { report, got, placed: report.position ? got : heard.get(id)?.placed, from: r });
      }
      const calls = dwelt.get(id) ?? withDwell(trip, profile);
      dwelt.set(id, calls);
      // A Train live data stops reporting keeps its last Delay until that's CARRY old.
      const said = recent(heard.get(id), upTo);
      const delay = said ? delayOf(trip, calls, shape, network, said.report, bundle.noonMinus12h) : 0;
      // Until live data first shifts it, a Train runs on its timetable.
      const drawn = ease ? eased(calls, profile, ease, arrived) : arrived;
      const [there, dist] = [arrived - delay, (time: number) => place(calls, profile, time) ?? NaN];
      const far = Math.abs(drawn - there) > JUMP_TIME || Math.abs(dist(drawn) - dist(there)) > JUMP_DIST;
      eases.set(id, { at: arrived, time: i === 0 || far ? there : drawn, delay });
    }
  }
  last = { bundle, received: [...received], clock, eases, heard, dwelt };
  return last;
}

/** Each snapshot's reports by the Trip each is about, worked out once for each bundle: matching the Metro's Blocks to Trips is slow. */
const matched = new WeakMap<Snapshot, { bundle: Bundle; reports: Map<string, Report> }>();

/**
 * How far apart when TMB expects a Block at its next Station and when a Trip's timetable has it there
 * can be for the Block to be running that Trip, in seconds: half an hour, well over half the longest
 * the Metro's timetable leaves between two Trains, 19 minutes. A Block further from every Trip, such
 * as one still running the night before, runs none of the day's.
 */
const MATCH = 30 * 60;

/**
 * A snapshot's reports by the Trip each is about. TMB's timetable names no Blocks, so each of the
 * Metro's runs the Trip on its Line headed its way whose timetable has it at the Block's next
 * Station closest to when TMB expects it there, within MATCH, and where two Blocks come closest to
 * one Trip, the closer runs it. A report that names a Line, as FGC's for its rack Trains do, runs
 * that Line's Trip whose trip_id ends as its own does, after the `|`. A report naming a Trip that
 * runs on more than one of the days joined is about the one whose timetable runs nearest when it
 * was reported. A report that matches no Trip is dropped.
 */
function reportsByTrip(bundle: Bundle, snapshot: Snapshot): Map<string, Report> {
  const known = matched.get(snapshot);
  if (known?.bundle === bundle) return known.reports;
  const [reports, offs, headed, named] = [new Map<string, Report>(), new Map<string, number>(), new Map<string, Trip[]>(), new Map<string, Trip[]>()];
  const add = (to: Map<string, Trip[]>, key: string, trip: Trip) => to.set(key, [...(to.get(key) ?? []), trip]);
  for (const trip of bundle.trips) {
    add(headed, `${trip.line} ${trip.headsign}`, trip);
    // As its operator names it, without the service day joinDays leads an earlier day's ID with.
    add(named, trip.id.replace(/^\d{4}-\d{2}-\d{2}\//, ''), trip);
  }
  for (const report of snapshot.reports) {
    const { block, headsign, position } = report;
    const end = report.line && report.trip?.split('|')[1];
    const candidates = end ? bundle.trips.filter((t) => t.line === report.line && t.id.endsWith(`|${end}`)) : report.trip ? (named.get(report.trip) ?? []) : [];
    const trip = closest(candidates, (report.at - bundle.noonMinus12h) / 1000);
    if (trip) reports.set(trip.id, report);
    if (!block || !position || !('next' in position)) continue;
    let [found, off]: [string | undefined, number] = [undefined, MATCH];
    for (const trip of headed.get(`${block.line} ${headsign}`) ?? []) {
      const late = Math.abs(expectedDelay(trip, position.next, bundle.noonMinus12h) ?? Infinity);
      if (late < off) [found, off] = [trip.id, late];
    }
    if (found && off < (offs.get(found) ?? Infinity)) {
      reports.set(found, report);
      offs.set(found, off);
    }
  }
  matched.set(snapshot, { bundle, reports });
  return reports;
}

/** Of the Trips of one ID on the days joined, the one whose timetable runs nearest a time, in seconds into the service day. */
function closest(trips: Trip[], time: number): Trip | undefined {
  const off = ({ calls }: Trip) => Math.max(0, (calls[0]?.arrival ?? Infinity) - time, time - (calls.at(-1)?.departure ?? -Infinity));
  return trips.reduce<Trip | undefined>((best, trip) => (!best || off(trip) < off(best) ? trip : best), undefined);
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
 * puts it on its Trip's track, or how far along it TRAM has it, and otherwise, standing at or pinned
 * to a Station or with no position, its operator's figure, or how late it is where its operator
 * expects it at a Station, as TMB does at the one each of the Metro's comes to next, though never
 * so late that it's drawn short of the Station before that. One standing at a Station, but for
 * Renfe's, is drawn there when it was reported.
 */
function delayOf(trip: Trip, calls: Call[], shape: Shape, { id, profile }: Network, report: Report, noonMinus12h: number): number {
  const known = delays.get(report);
  if (known?.trip === trip) return known.delay;
  const [reported, { position }] = [(report.at - noonMinus12h) / 1000, report];
  let delay = report.delay ?? expectedDelay(trip, position && 'next' in position ? position.next : report.expected, noonMinus12h) ?? 0;
  if (position && 'next' in position) {
    // It's no further back than the Station before the one it comes to next, however long it's held
    // short of that, as at the end of its Line. Short of its Trip's first Station it's off the map,
    // standing there as it turns back, and TMB's time is all there is to go by.
    const i = calls.findIndex((c) => c.station === position.next.station);
    const before = calls[i - 1];
    if (before && i > 1) delay = Math.min(delay, reported - before.arrival);
  }
  if (position && 'near' in position && id !== 'rodalies') {
    // Standing at a Station, as Geotren has FGC's, it's there when it was reported, however long ago
    // the trip updates have it leave. Not Renfe's: it pins Trains coming into a Station too, and late.
    // At its Trip's first Station it can stand long before it leaves, off the map.
    const i = calls.findIndex((c) => c.station === position.near);
    const call = calls[i];
    if (call && i > 0) delay = Math.min(Math.max(delay, reported - call.departure), reported - call.arrival);
  }
  if (position && ('lon' in position || 'along' in position)) {
    const dists = calls.map((c) => c.dist);
    // TRAM counts from a Trip's first Station, whichever way along its track the Trip runs.
    const [first = 0, last = 0] = [dists[0], dists.at(-1)];
    const d = 'lon' in position ? nearest(shape, Math.min(...dists), Math.max(...dists), position) : first + Math.sign(last - first) * position.along;
    const passed = passing(calls, profile, d, reported - delay);
    if (passed !== undefined) delay = reported - passed;
  }
  delays.set(report, { trip, delay });
  return delay;
}

/**
 * A Train's Delay by when its operator expects it at a Station, in seconds: against when its Trip's
 * timetable has it arrive there. FGC's Trips call at each Station once.
 */
function expectedDelay(trip: Trip, expected: Report['expected'], noonMinus12h: number): number | undefined {
  if (!expected) return undefined;
  const call = trip.calls.find((c) => c.station === expected.station);
  return call && (expected.at - noonMinus12h) / 1000 - call.arrival;
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
