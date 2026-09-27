// Where each Train is. The timetable drives motion (ADR-0002); the browser and the tests share this.

import { closestOnSegment, DEGREE, direction, pointAt, type Bundle, type Call, type Freshness, type Network, type Point, type Report, type Shape, type Snapshot, type SpeedProfile, type Trip } from './bundle.ts';

/**
 * A Train on the map: its Trip, how far along the Trip's shape it is, in metres, where that is, and
 * which way it heads there, in degrees clockwise from north. It's Live while live data has placed it
 * within about its feed's last three updates, and Scheduled otherwise.
 */
export interface Train {
  trip: Trip;
  dist: number;
  lon: number;
  lat: number;
  heading: number;
  live: boolean;
  /**
   * Whether its Network's live data works but hasn't reported it lately: it has no live data, and may
   * not be running. Not where that live data names Blocks but none on its Line, as on L9.
   */
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
 * third, and it keeps its last Delay for CARRY before it's back on its plain timetable. One of the
 * Metro's whose Block goes on to run another Trip turns Scheduled at once, but not while TMB has the
 * Block coming to that Trip's last Station, as it runs into the end of its Line. A Live one short of
 * its Trip's first Station, as while its Block waits at the end of its Line, stands there, unless the
 * Trip its Block ran in on is still on the map, and a Live one at that Station stays there until a
 * report has it gone.
 */
export function trainsAt(bundle: Bundle, at: number, received: Received[] = []): Train[] {
  const { of } = onMap(bundle, at, received);
  return bundle.trips.flatMap((trip) => of(trip)?.train ?? []);
}

/** A Train as the follow panel shows it: where it's going, when it'll get there, and how far to trust where it's drawn. */
export interface Followed extends Train {
  /** Its Delay, in seconds, as live data last gave it: early where it's negative. A Train drawn off it eases to it by the next snapshot. None to show for a Metro Train (#103). */
  delay?: number;
  /**
   * The Stations it has still to leave as it's drawn, the one it stands at first, and when it's
   * expected to arrive at and leave each, in ms since 1970, running its Delay late, or held at its
   * first Station after that has it leave, as late as it's held.
   */
  upcoming: { station: string; arrival: number; departure: number }[];
  /** Whether it stands at the first of them. */
  standing: boolean;
  /** How long ago live data last placed it, in ms, as of when its operator reported it there: none where the snapshots kept don't. */
  since?: number;
  /** How fast it's drawn running, in m/s, as its speed profile has it: an estimate, not a measurement. */
  speed: number;
  /** The type of Unit it runs as, where its operator reports one, as FGC does. */
  unitType?: string;
}

/** One Train, as the follow panel shows it, at a moment by the device's clock (ms since 1970), given the snapshots received by then: as trainsAt() has it, if it's on the map. */
export function trainAt(bundle: Bundle, at: number, received: Received[], id: string): Followed | undefined {
  const trip = bundle.trips.find((t) => t.id === id);
  const on = trip && onMap(bundle, at, received).of(trip);
  if (!on?.train) return undefined;
  const { train, now, time, calls, profile, ease, said, network, delay } = on;
  // When it's expected at a moment of its timetable, running its Delay late.
  const expected = (seconds: number) => bundle.noonMinus12h + (seconds + delay) * 1000;
  // How far along its shape it's drawn at a moment, in seconds into the service day.
  const drawn = (moment: number) => place(calls, profile, ease ? eased(calls, profile, ease, moment) : moment) ?? train.dist;
  const upcoming = calls.filter((c) => toLeave(c, time));
  return {
    ...train,
    delay: shown(network, delay),
    upcoming: upcoming.map((c) => ({ station: c.station, arrival: expected(c.arrival), departure: expected(c.departure) })),
    standing: (upcoming[0]?.arrival ?? Infinity) <= time,
    since: said?.confirmed === undefined ? undefined : bundle.noonMinus12h + now * 1000 - said.confirmed,
    speed: Math.abs(drawn(now + 0.5) - drawn(now - 0.5)),
    unitType: said?.report.unitType,
  };
}

/** A Train on a Station's board: when it's expected to leave the Station, and how far to trust that. */
export interface Departure {
  trip: Trip;
  station: string;
  /** When it's expected to leave, in ms since 1970, running its Delay late: as trainAt() has it, where it's on the map. */
  departure: number;
  /** Its Delay, in seconds, as live data last gave it: early where it's negative. None to show for a Metro Train (#103). */
  delay?: number;
  live: boolean;
  /** Whether, drawn on the map, it has no live data though its Network's live data works, as Train.unreported has it. Not before it's on the map, when no feed reports it yet. */
  unreported: boolean;
  /** Whether its operator has announced that it won't run: then it's expected when its timetable has it leave. */
  cancelled: boolean;
}

/** How many departures a Station's board lists. */
const BOARD = 10;

/**
 * The next departures from some Stations, soonest first, at a moment by the device's clock (ms since
 * 1970), given the snapshots received by then: each Train still to leave one of them, but not one
 * that ends its Trip there, expected as it's drawn on the map, and a Cancelled one as its timetable has it.
 */
export function boardAt(bundle: Bundle, at: number, received: Received[], stations: string[]): Departure[] {
  const { of, now } = onMap(bundle, at, received);
  const here = new Set(stations);
  return bundle.trips
    .flatMap((trip): Departure[] => {
      if (!trip.calls.some((c) => here.has(c.station))) return [];
      const on = of(trip);
      if (!on) return [];
      const cancelled = !!on.said?.report.cancelled;
      const [time, delay] = cancelled ? [now, 0] : [on.time, on.delay];
      // Where it calls there more than once, as turning back, the first time it's still to leave.
      const call = on.calls.find((c, i) => i < on.calls.length - 1 && toLeave(c, time) && here.has(c.station));
      if (!call) return [];
      return [{ trip, station: call.station, departure: bundle.noonMinus12h + (call.departure + delay) * 1000, delay: shown(on.network, delay), live: on.live && !cancelled, unreported: !!on.train?.unreported, cancelled }];
    })
    .sort((a, b) => a.departure - b.departure)
    .slice(0, BOARD);
}

/** A Train passing near a point: when it's expected to come within the radius asked about. */
export interface Pass {
  trip: Trip;
  /**
   * When it's expected to come within the radius, in ms since 1970, running its Delay late: as
   * trainAt() has it, where it's on the map, and now, while it's within it.
   */
  at: number;
  /** Its Delay, in seconds, as live data last gave it: early where it's negative. None to show for a Metro Train (#103). */
  delay?: number;
  live: boolean;
}

/**
 * The Trains passing within `radius` metres of a point in the next `window` ms, soonest first, at a
 * moment by the device's clock (ms since 1970), given the snapshots received by then: each whose
 * track still ahead of it comes within the radius, or that's within it, listed once, for when it
 * next comes within it, expected within the window, as it's drawn on the map. Not one that's Cancelled.
 */
export function nearbyAt(bundle: Bundle, at: number, received: Received[], point: Point, radius: number, window: number): Pass[] {
  const { of, now } = onMap(bundle, at, received);
  // Most track comes nowhere near: each shape is looked over once, for the stretches of it within the radius.
  const within = new Map(bundle.shapes.map((s) => [s.id, stretchesWithin(s, point, radius)]));
  return bundle.trips
    .flatMap((trip): Pass[] => {
      const stretches = within.get(trip.shape);
      if (!stretches?.length) return [];
      const on = of(trip);
      if (!on || on.said?.report.cancelled) return [];
      const { delay } = on;
      // Where in its timetable the window ends.
      const until = now + window / 1000 - delay;
      const comes = whenWithin(on.calls, on.profile, stretches)
        .filter(([enters, leaves]) => leaves >= on.time && enters <= until)
        .map(([enters]) => Math.max(enters, on.time));
      if (!comes.length) return [];
      return [{ trip, at: bundle.noonMinus12h + (Math.min(...comes) + delay) * 1000, delay: shown(on.network, delay), live: on.live }];
    })
    .sort((a, b) => a.at - b.at);
}

/**
 * A Train's Delay, in seconds, as the follow panel, boards and Nearby give it: none for the Metro's.
 * TMB runs the Metro by headway, and its timetable names no Blocks, so a Metro Train's Delay is only
 * against whichever Trip its Block runs, which can be minutes off its own time (#103).
 */
const shown = (network: Network, delay: number) => (network.id === 'metro' ? undefined : delay);

/** Whether a Train drawn at a time in its timetable has a call still to leave: the one it stands at too, as it leaves, or while it's held there (#107). */
const toLeave = (call: Call, time: number) => call.departure >= time;

/**
 * A Train on the map, if it is, and how it got there: the moment and where in its timetable it's drawn, both
 * in seconds into the service day by the fetcher's clock, its calls as it makes them, its Network, how
 * it eases towards where live data has it, and what live data last said about it.
 */
interface OnMap {
  /** None while it's off the map, as before its first Station, after its last, or Cancelled. */
  train?: Train;
  now: number;
  time: number;
  /** How late its times run, in seconds: as live data last had it, or while it's held at its first Station, or let out and catching up, as late as it's drawn, where that's later (#107). */
  delay: number;
  calls: Call[];
  network: Network;
  profile: SpeedProfile;
  ease?: Ease;
  said?: Heard;
  /** Whether live data has placed it recently, on the map or off it. */
  live: boolean;
}

/** Where trainsAt() has each Trip's Train at a moment by the device's clock, and that moment in seconds into the service day by the fetcher's clock. */
function onMap(bundle: Bundle, at: number, received: Received[]): { of: (trip: Trip) => OnMap | undefined; now: number } {
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
  // The Lines the snapshots kept name Blocks on, and so the Networks they name Blocks for: the
  // Metro's. TMB publishes no predictions for L9, L10 or the funicular, so their Trains have no live
  // data without being left out of it.
  const blockLines = new Set(received.flatMap((r) => linesByBlock(r.snapshot)));
  const blockNetworks = new Set([...blockLines].map((line) => lines.get(line)?.id));
  // The Trips live data last had each of the Metro's Blocks run, by blockOf(): worked out only once a Block waits at the end of its Line.
  let blocks: Map<string, Trip[]> | undefined;
  const ranBy = (block: NonNullable<Report['block']>) => {
    blocks ??= bundle.trips.reduce((m, t) => {
      const b = heard.get(t.id)?.report.block;
      return b ? add(m, blockOf(b), t) : m;
    }, new Map<string, Trip[]>());
    return blocks.get(blockOf(block)) ?? [];
  };
  const of = (trip: Trip, nested = false): OnMap | undefined => {
    const [said, network, shape, first, last, ease] = [heard.get(trip.id), lines.get(trip.line), shapes.get(trip.shape), trip.calls[0], trip.calls.at(-1), eases.get(trip.id)];
    if (!network || !shape) return undefined;
    const { profile } = network;
    const dwelt = withDwell(trip, profile);
    // A Train running late is where its timetable had it that long ago, once it has eased there.
    const time = ease ? eased(dwelt, profile, ease, now) : now;
    const feed = feeds[network.id];
    const live = isLive(said, feed, upToNow);
    const delay = ease?.hold !== undefined || ease?.leaving ? Math.max(ease.delay, now - time) : (ease?.delay ?? 0);
    // A Live Metro Train short of its Trip's first Station, as TMB has it while its Block waits at the
    // end of its Line, has come in there already, and stands there from now on (#105): unless the Trip
    // its Block ran in on is still on the map, and so at once where live data knows none, as on a map
    // just opened. Whether that Trip is on the map is judged without this rule, as it has long left
    // its own first Station: with the rule, where it hadn't, the two could each wait on the other.
    const block = live ? said?.report.block : undefined;
    const waits = !nested && block && first && time < (dwelt[0]?.arrival ?? -Infinity) && !ranBy(block).some((t) => t !== trip && t.calls.at(-1)?.station === first.station && of(t, true)?.train);
    const calls = waits ? dwelt.map((c, i) => (i ? c : { ...c, arrival: time })) : dwelt;
    const off = { now, time, delay, calls, network, profile, ease, said, live };
    if (said?.report.cancelled) return off;
    // Most Trips aren't on the map at any one moment, whatever their dwell: skip those first.
    if (!first || !last || (!waits && time < first.arrival - profile.dwell) || time > last.departure + profile.dwell) return off;
    const dist = place(calls, profile, time);
    // Beyond where its track starts or ends, as past Catalonia's border, it's off the map.
    if (dist === undefined || dist < (shape.dist[0] ?? 0) || dist > (shape.dist.at(-1) ?? 0)) return off;
    const [lon, lat] = pointAt(shape, dist);
    const unreported = feed !== undefined && !recent(said, upTo) && !stale(feed.lastSuccess, upTo, feed.every) && (!blockNetworks.has(network.id) || blockLines.has(trip.line));
    return { ...off, train: { trip, dist, lon, lat, heading: headingAt(shape, calls, time, dist), live, unreported } };
  };
  return { of, now };
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

/** Whether a Train is Live, by what live data last said about it and its feed, as far into live data as a device has got. */
const isLive = (said: Heard | undefined, feed: Freshness | undefined, upTo: number) => feed !== undefined && said?.placed !== undefined && !stale(said.placed, upTo, feed.every);

/** What live data last said about a Train, or a Delay its GPS gave it, while that's recent enough to go by: under CARRY old, as far into live data as a device has got. */
const recent = <T extends { got: number }>(said: T | undefined, upTo: number) => (said && upTo - said.got < CARRY ? said : undefined);

/**
 * What live data last said about a Train: its latest report, when the fetcher got that, and when
 * it last got one that placed the Train, in ms since 1970 by the fetcher's clock.
 */
interface Heard {
  report: Report;
  got: number;
  /** None once the Metro's Block that last placed it runs another Trip, but for one it's running in on to the end of its Line, which its Block's reports place there (#108). */
  placed?: number;
  /** When its operator reported the last of those, in ms since 1970. */
  confirmed?: number;
  /** The snapshot, as received, that it was last in. */
  from: Received;
  /** The report's own Delay, in seconds, as delayOf() has it: for Renfe's, Renfe's own figure. */
  delay: number;
  /** For Renfe's: the last Delay its GPS gave it. */
  gps?: GpsDelay;
  /** For Renfe's: the last Delay its GPS gave it that counts. */
  counted?: GpsDelay;
}

/** A Delay Renfe's GPS gave a Train, in seconds, and when the fetcher got the report that did, as Heard's `got` has it. */
interface GpsDelay {
  delay: number;
  got: number;
}

/**
 * A Train's Delay, in seconds, by what live data last said about it, as far into live data as a
 * device has got. For Renfe's, it's the last Delay its GPS gave it that counts, or where none does,
 * the last its GPS gave it, until each is CARRY old, and failing both, Renfe's own figure.
 */
const delayBy = (said: Heard, upTo: number) => (recent(said.counted, upTo) ?? recent(said.gps, upTo) ?? said).delay;

/** How far a Renfe Train's GPS can put its Delay from where its GPS report before put it and still count, in seconds. */
const CONFIRM = 120;

/**
 * How soon after a Train's report the next has to come to go on from it, in ms: for one of Renfe's,
 * to be judged against it, as GPS unchanged since it or far off it, and for a Metro Block, to keep
 * the Trip it ran. It's under KEEP less CARRY and LAG, so that replaying only the snapshots kept
 * judges each Delay still in use as replaying them all did.
 */
const FOLLOWS = 2 * 60_000;

/**
 * What live data says about a Train each time a snapshot reports it, given what it said before,
 * when the fetcher got the report, by its clock in ms since 1970, the snapshot, whether it's one of
 * Renfe's, and how to work out a report's own Delay, as delayOf() does. A Train Renfe pins to a
 * Station or gives no position for carries on from the last Delay its GPS gave it that counts,
 * until that's CARRY old: Renfe's own figure moves in whole minutes and is often minutes off, so
 * going by it made Trains jump each time Renfe switched between the two (#33). Renfe's GPS
 * unchanged since the Train's report before is as old as that report, and counts as no position.
 * And GPS counts only where it follows on from the Train's GPS report before, within CONFIRM of
 * the Delay that one gave it: now and then Renfe's GPS has a Train, for a report or two, at a
 * Station it's nowhere near, such as Barcelona-Sants, often just after Renfe has pinned it to
 * Stations a while.
 */
function hear(before: Heard | undefined, report: Report, got: number, from: Received, renfe: boolean, ownDelay: (report: Report) => OwnDelay): Heard {
  const follows = <T extends { got: number }>(earlier: T | undefined): earlier is T => earlier !== undefined && got - earlier.got < FOLLOWS;
  // The same report again, as in a snapshot the map records twice or a feed's last good response the fetcher keeps, is unchanged too.
  const frozen = renfe && follows(before) && sameSpot(before.report.position, report.position);
  const taken = frozen ? { ...report, position: undefined } : report;
  const { position } = taken;
  const heard = { report, got, placed: position ? got : before?.placed, confirmed: position ? report.at : before?.confirmed, from };
  if (!renfe) return { ...heard, delay: ownDelay(taken).delay };
  const figure = ownDelay({ ...taken, position: undefined }).delay;
  const { gps, counted } = before ?? {};
  // GPS gives a Delay only where it puts the Train running between Stations, not standing at its first before it leaves.
  const { delay, measured } = ownDelay(taken);
  if (!measured) return { ...heard, delay: figure, gps, counted };
  const agrees = follows(gps) && Math.abs(delay - gps.delay) <= CONFIRM;
  return { ...heard, delay: figure, gps: { delay, got }, counted: agrees ? { delay, got } : counted };
}

/** Whether two positions are the same coordinates. */
const sameSpot = (a: Report['position'], b: Report['position']) => !!a && !!b && 'lon' in a && 'lon' in b && a.lon === b.lon && a.lat === b.lat;

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
 * into the service day by the fetcher's clock, how late that snapshot has it, in seconds, and where
 * in its timetable it's held until the next: as it would leave its Trip's first Station, for one of
 * the Metro's that snapshot still has there. Let out of there, it's `leaving` until it has caught up.
 */
interface Ease {
  at: number;
  time: number;
  delay: number;
  hold?: number;
  leaving?: true;
}

/** How long a Train drawn off where live data has it takes to ease back, in seconds: until the next snapshot. */
const EASE = 20;

/** How far a Train can be drawn from where live data has it before it jumps there: a minute of its timetable, or 1 km. */
const [JUMP_TIME, JUMP_DIST] = [60, 1000];

/**
 * The last replay, which the map asks for again each time it moves its Trains until its next
 * snapshot arrives, and then folds that snapshot into.
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
    const { reports, ran } = reportsByTrip(bundle, r.snapshot, received[i - 1]?.snapshot);
    // A Train whose Block has gone on to run another Trip turns Scheduled at once, rather than staying
    // Live for two more of its feed's updates where the Block was, beside the Block's new Train. But
    // TMB lists a Block under its way back as it passes the Station before the end of its Line, naming
    // the end as the Station it comes to next, so the Trip it runs in on stays Live, on its last Delay,
    // while TMB names that Trip's last Station, on a Trip from there (#108): each such report places it,
    // as it runs in there.
    for (const [id, said] of heard) {
      const runs = said.report.block && ran.get(blockOf(said.report.block));
      if (!runs || runs === id) continue;
      const [trip, report] = [trips.get(id), reports.get(runs)];
      const [network, end, position] = [trip && lines.get(trip.line), trip?.calls.at(-1), report?.position];
      const runsIn = report && network && end && position && 'next' in position && position.next.station === end.station && trips.get(runs)?.calls[0]?.station === end.station;
      heard.set(id, runsIn ? { ...said, placed: r.snapshot.feeds[network.id]?.lastSuccess, confirmed: report.at } : { ...said, placed: undefined });
    }
    for (const id of new Set([...eases.keys(), ...reports.keys()])) {
      const [trip, report, ease] = [trips.get(id), reports.get(id), eases.get(id)];
      const [network, shape] = [trip && lines.get(trip.line), trip && shapes.get(trip.shape)];
      if (!trip || !network || !shape) continue;
      const { profile } = network;
      const calls = dwelt.get(id) ?? withDwell(trip, profile);
      dwelt.set(id, calls);
      if (report) {
        // A report the fetcher kept from a feed's last good response is as old as that response.
        const got = r.snapshot.feeds[network.id]?.lastSuccess ?? NaN;
        heard.set(id, hear(heard.get(id), report, got, r, network.id === 'rodalies', (given) => delayOf(trip, calls, shape, network, given, bundle.noonMinus12h)));
      }
      // A Train live data stops reporting keeps its last Delay until that's CARRY old.
      const said = recent(heard.get(id), upTo);
      const delay = said ? delayBy(said, upTo) : 0;
      // Until live data first shifts it, a Train runs on its timetable.
      const drawn = ease ? eased(calls, profile, ease, arrived) : arrived;
      const [there, dist] = [arrived - delay, (t: number) => place(calls, profile, t) ?? NaN];
      // Held at its first Station, or let out and still drawn behind, it eases out however far behind,
      // and jumps only where live data has it a long way on, or off its Trip (#107).
      const leaving = (ease?.hold !== undefined || !!ease?.leaving) && drawn < there;
      // Short of its first Station, one leaving is drawn standing there (#105).
      const off = Math.abs(dist(leaving ? Math.max(drawn, calls[0]?.arrival ?? drawn) : drawn) - dist(there));
      const far = leaving ? !(off <= JUMP_DIST) : Math.abs(drawn - there) > JUMP_TIME || off > JUMP_DIST;
      const time = i === 0 || far ? there : drawn;
      // A Live Metro Train at its Trip's first Station stays there until a report has it gone, by its
      // Delay, when it was reported: TMB's ETA for a Block waiting at the end of its Line keeps moving
      // later, so one drawn leaving when an ETA said was drawn out on its track, where it can't run
      // back, or jumped back (#107). Not one already drawn out of that Station, as its timetable had it
      // before live data first placed it: holding it there would run it back.
      const first = calls[0];
      const held = isLive(said, r.snapshot.feeds[network.id], upTo) && said?.report.block && first && (said.report.at - bundle.noonMinus12h) / 1000 - delay <= first.departure && (i === 0 || far || time <= first.departure);
      eases.set(id, { at: arrived, time, delay, hold: held ? first.departure : undefined, leaving: !held && leaving && !far ? true : undefined });
    }
  }
  last = { bundle, received: [...received], clock, eases, heard, dwelt };
  return last;
}

/** Each snapshot's Lines it names Blocks on, worked out once: the map asks for them each time it moves its Trains. */
const blockLinesOf = new WeakMap<Snapshot, string[]>();

/** The Lines a snapshot names Blocks on, as the Metro's live data names its Trains. */
function linesByBlock(snapshot: Snapshot): string[] {
  const known = blockLinesOf.get(snapshot) ?? [...new Set(snapshot.reports.flatMap((r) => (r.block ? [r.block.line] : [])))];
  blockLinesOf.set(snapshot, known);
  return known;
}

/** What a replay makes of a snapshot, for a bundle: its reports by the Trip each is about, and the Trip each of the Metro's Blocks in it runs, by blockOf(). */
interface Matched {
  bundle: Bundle;
  reports: Map<string, Report>;
  ran: Map<string, string>;
}

/**
 * What a replay makes of each snapshot, for a bundle, worked out once, as a replay first comes to it.
 * It's more than a cache: each Block goes on from the Trip it ran in the snapshot before it then, so
 * a later replay of the snapshots kept, with none before the oldest, matches their Blocks as the fold
 * did only by going by this. Matching the Metro's Blocks to Trips is slow, too.
 * ponytail: a snapshot keeps what it first made of the one before it, whatever a later replay puts
 * there, and a Block goes on only from the snapshot just before, so one missing from that, or matched
 * to no Trip there, is matched afresh. Keep the Trip each Block last ran in the replay, beside
 * `heard`, if either matters.
 */
const matched = new WeakMap<Snapshot, Matched>();

/** A Block, as the matching knows it: by its Line and TMB's number for it, which another Line's can share. */
const blockOf = ({ line, number }: NonNullable<Report['block']>) => `${line} ${number}`;

/** Lists a Trip under a key, after those listed there already. */
const add = (to: Map<string, Trip[]>, key: string, trip: Trip) => to.set(key, [...(to.get(key) ?? []), trip]);

/**
 * How far apart when TMB expects a Block at its next Station and when a Trip's timetable has it there
 * can be for the Block to be running that Trip, in seconds: half an hour, well over half the longest
 * the Metro's timetable leaves between two Trains, 19 minutes. A Block further from every Trip, such
 * as one still running the night before, runs none of the day's.
 */
const MATCH = 30 * 60;

/**
 * A snapshot's reports by the Trip each is about, and the Trip each of the Metro's Blocks runs, given
 * the snapshot before it the first time a replay comes to it (`matched`). TMB's timetable names no
 * Blocks, so each of the Metro's keeps the Trip it ran in the snapshot before, where TMB reported it
 * there under FOLLOWS earlier, while that Trip, headed its way, still calls at the Station the Block
 * comes to next: matched afresh each time, a Block running about halfway between two Trips' times
 * moved from one to the other and back, and its Train jumped (#45). Each of the rest runs the Trip
 * on its Line headed its way that no Block keeps whose timetable has it at the Block's next Station
 * closest to when TMB expects it there, within MATCH, and where two come closest to one Trip, the
 * closer runs it. A report that names a Line, as FGC's for its rack Trains do, runs that Line's Trip
 * whose trip_id ends as its own does, after the `|`. A report naming a Trip that runs on more than
 * one of the days joined is about the one whose timetable runs nearest when it was reported. A
 * report that matches no Trip is dropped.
 */
function reportsByTrip(bundle: Bundle, snapshot: Snapshot, before?: Snapshot): Matched {
  const known = matched.get(snapshot);
  if (known?.bundle === bundle) return known;
  const prior = before && matched.get(before);
  const ran = prior?.bundle === bundle ? prior.ran : new Map<string, string>();
  const [reports, offs, headed, named, kept] = [new Map<string, Report>(), new Map<string, number>(), new Map<string, Trip[]>(), new Map<string, Trip[]>(), new Set<string>()];
  for (const trip of bundle.trips) {
    add(headed, `${trip.line} ${trip.headsign}`, trip);
    // As its operator names it, without the service day joinDays leads an earlier day's ID with.
    add(named, trip.id.replace(/^\d{4}-\d{2}-\d{2}\//, ''), trip);
  }
  // The Metro's Blocks that don't keep their Trip, each with the Trips headed its way and its next Station.
  const rest: [Report, Trip[], NonNullable<Report['expected']>][] = [];
  for (const report of snapshot.reports) {
    const { block, headsign, position } = report;
    const end = report.line && report.trip?.split('|')[1];
    const candidates = end ? bundle.trips.filter((t) => t.line === report.line && t.id.endsWith(`|${end}`)) : report.trip ? (named.get(report.trip) ?? []) : [];
    const trip = closest(candidates, (report.at - bundle.noonMinus12h) / 1000);
    if (trip) reports.set(trip.id, report);
    if (!block || !position || !('next' in position)) continue;
    const [trips, id] = [headed.get(`${block.line} ${headsign}`) ?? [], ran.get(blockOf(block))];
    // Not after a gap in TMB's data, or in what the map received, as while its tab was hidden: by
    // then the Block may have run its Trip to the end and come back along it.
    const follows = id !== undefined && report.at - (prior?.reports.get(id)?.at ?? -Infinity) < FOLLOWS;
    const keeps = follows ? trips.find((t) => t.id === id && t.calls.some((c) => c.station === position.next.station)) : undefined;
    if (!keeps) rest.push([report, trips, position.next]);
    else {
      reports.set(keeps.id, report);
      kept.add(keeps.id);
    }
  }
  for (const [report, trips, next] of rest) {
    let [found, off]: [string | undefined, number] = [undefined, MATCH];
    for (const trip of trips) {
      if (kept.has(trip.id)) continue;
      const late = Math.abs(expectedDelay(trip, next, bundle.noonMinus12h) ?? Infinity);
      if (late < off) [found, off] = [trip.id, late];
    }
    if (found && off < (offs.get(found) ?? Infinity)) {
      reports.set(found, report);
      offs.set(found, off);
    }
  }
  const decided = { bundle, reports, ran: new Map([...reports].flatMap(([id, { block }]) => (block ? [[blockOf(block), id] as const] : []))) };
  matched.set(snapshot, decided);
  return decided;
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
 * and leaves a Station as soon as reality has. Held at its first Station, it goes no further.
 */
function eased(calls: Call[], profile: SpeedProfile, ease: Ease, now: number): number {
  return Math.min(unheld(calls, profile, ease, now), ease.hold ?? Infinity);
}

/** Where eased() has a Train drawn at a moment, were it not held. */
function unheld(calls: Call[], profile: SpeedProfile, { at, time, delay }: Ease, now: number): number {
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
const delays = new WeakMap<Report, { trip: Trip } & OwnDelay>();

/** A report's own Delay for its Train, in seconds, and whether its position measured it: where its GPS, or TRAM's distance, puts it running between Stations. */
interface OwnDelay {
  delay: number;
  measured: boolean;
}

/**
 * A report's Delay for its Train, in seconds: while it runs between Stations, from where its GPS
 * puts it on its Trip's track, or how far along it TRAM has it, and otherwise, standing at or pinned
 * to a Station or with no position, its operator's figure, or how late it is where its operator
 * expects it at a Station, as TMB does at the one each of the Metro's comes to next, though never
 * so late that it's drawn short of the Station before that. One standing at a Station, but for
 * Renfe's, is drawn there when it was reported, but at its Trip's first Station only held from
 * leaving.
 */
function delayOf(trip: Trip, calls: Call[], shape: Shape, { id, profile }: Network, report: Report, noonMinus12h: number): OwnDelay {
  const known = delays.get(report);
  if (known?.trip === trip) return known;
  const [reported, { position }] = [(report.at - noonMinus12h) / 1000, report];
  let delay = report.delay ?? expectedDelay(trip, position && 'next' in position ? position.next : report.expected, noonMinus12h) ?? 0;
  if (position && 'next' in position) {
    // It's no further back than the Station before the one it comes to next, however long it's held
    // short of that, as at the end of its Line. Short of its Trip's first Station, standing there as it
    // turns back, TMB's time is all there is to go by, and the map draws it standing there (onMap()).
    const i = calls.findIndex((c) => c.station === position.next.station);
    const before = calls[i - 1];
    if (before && i > 1) delay = Math.min(delay, reported - before.arrival);
  }
  if (position && 'near' in position && id !== 'rodalies') {
    // Standing at a Station, as Geotren has FGC's, it's there when it was reported, however long ago
    // the trip updates have it leave. Not Renfe's: it pins Trains coming into a Station too, and late.
    // At its Trip's first Station it can stand long before it leaves, off the map, so there it's
    // only held from leaving.
    const i = calls.findIndex((c) => c.station === position.near);
    const call = calls[i];
    if (call) delay = Math.max(delay, reported - call.departure);
    if (call && i > 0) delay = Math.min(delay, reported - call.arrival);
  }
  if (position && ('lon' in position || 'along' in position)) {
    const dists = calls.map((c) => c.dist);
    // TRAM counts from a Trip's first Station, whichever way along its track the Trip runs.
    const [first = 0, last = 0] = [dists[0], dists.at(-1)];
    const d = 'lon' in position ? nearest(shape, Math.min(...dists), Math.max(...dists), position) : first + Math.sign(last - first) * position.along;
    const passed = passing(calls, profile, d, reported - delay);
    if (passed !== undefined) {
      delays.set(report, { trip, delay: reported - passed, measured: true });
      return { delay: reported - passed, measured: true };
    }
  }
  delays.set(report, { trip, delay, measured: false });
  return { delay, measured: false };
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
 * Which way a Train drawn at a time in its timetable heads, `d` metres along its shape, in degrees
 * clockwise from north: the way it runs the stretch it's on, or standing at a Station the one it runs
 * next, or at its last the one it came by, forwards or back along its shape, as R11's run back from
 * Cerbère to Portbou. Over the metre ahead, or where its track ends first, the metre before.
 */
function headingAt(shape: Shape, calls: Call[], time: number, d: number): number {
  const i = calls.findLastIndex((c) => c.arrival <= time);
  const [call, next] = calls[i + 1] ? [calls[i], calls[i + 1]] : [calls[i - 1], calls[i]];
  const way = call && next && next.dist < call.dist ? -1 : 1;
  const from = way > 0 ? Math.min(d, (shape.dist.at(-1) ?? 0) - 1) : Math.max(d, (shape.dist[0] ?? 0) + 1);
  const [east, north] = direction(shape, from, from + way);
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
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
    const t = call.departure + reaching(call, next, profile, d);
    if (found === undefined || Math.abs(t - around) < Math.abs(found - around)) found = t;
  }
  return found;
}

/**
 * The stretches of a shape within `radius` metres of a point, from and to how far along it they are,
 * in metres. Beyond where its track starts or ends, as past Catalonia's border, a Train is off the map.
 */
function stretchesWithin({ coords, dist }: Shape, point: Point, radius: number): [from: number, to: number][] {
  const kx = DEGREE * Math.cos((point[1] * Math.PI) / 180);
  const stretches: [number, number][] = [];
  for (let i = 1; i < coords.length; i++) {
    const [a, b, start = 0, stop = 0] = [coords[i - 1], coords[i], dist[i - 1], dist[i]];
    if (!a || !b) continue;
    // Where along the segment, from 0 to 1, it's `radius` from the point, flat around it.
    const [ax, ay, dx, dy] = [(a[0] - point[0]) * kx, (a[1] - point[1]) * DEGREE, (b[0] - a[0]) * kx, (b[1] - a[1]) * DEGREE];
    const [qa, qb, qc] = [dx * dx + dy * dy, 2 * (ax * dx + ay * dy), ax * ax + ay * ay - radius * radius];
    const root = qb * qb - 4 * qa * qc;
    if (root < 0 || !qa) continue;
    const [t0, t1] = [Math.max(0, (-qb - Math.sqrt(root)) / (2 * qa)), Math.min(1, (-qb + Math.sqrt(root)) / (2 * qa))];
    if (t0 > t1) continue;
    const [from, to] = [start + t0 * (stop - start), start + t1 * (stop - start)];
    const last = stretches.at(-1);
    if (last && last[1] >= from) last[1] = to;
    else stretches.push([from, to]);
  }
  return stretches;
}

/**
 * When a Trip's Train is on stretches of its shape, in seconds into the service day, by its calls as
 * it makes them: each time it gets onto one, and when it leaves it, standing at a Station on one or running along one.
 */
function whenWithin(calls: Call[], profile: SpeedProfile, stretches: [from: number, to: number][]): [enters: number, leaves: number][] {
  return calls.flatMap((call, i): [number, number][] => {
    const next = calls[i + 1];
    const standing: [number, number][] = stretches.some(([from, to]) => from <= call.dist && call.dist <= to) ? [[call.arrival, call.departure]] : [];
    if (!next) return standing;
    const [low, high] = [Math.min(call.dist, next.dist), Math.max(call.dist, next.dist)];
    const running = stretches.flatMap(([from, to]): [number, number][] => {
      const [lo, hi] = [Math.max(from, low), Math.min(to, high)];
      if (lo > hi) return [];
      // Which end it gets onto the stretch at depends which way it runs.
      const [entry, exit] = next.dist > call.dist ? [lo, hi] : [hi, lo];
      return [[call.departure + reaching(call, next, profile, entry), call.departure + reaching(call, next, profile, exit)]];
    });
    return [...standing, ...running];
  });
}

/** How long after it leaves one Station a Train running on to the next gets to a point `d` metres along its shape between them, in seconds. */
function reaching(call: Call, next: Call, profile: SpeedProfile, d: number): number {
  const [length, time] = [Math.abs(next.dist - call.dist), next.arrival - call.departure];
  // It only ever runs on along a stretch, so halving finds when it gets there.
  let [early, late] = [0, time];
  while (late - early > 1e-6) {
    const mid = (early + late) / 2;
    if (covered(length, time, mid, profile) < Math.abs(d - call.dist)) early = mid;
    else late = mid;
  }
  return (early + late) / 2;
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
