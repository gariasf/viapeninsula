// Where each Train is. The timetable drives motion (ADR-0002); the browser and the tests share this.

import { closestOnSegment, DEGREE, direction, pointAt, profiled, type Bundle, type Call, type Closure, type Freshness, type LiveTraits, type Network, type Point, type Report, type Shape, type Skipped, type Snapshot, type SpeedProfile, type Trip } from './bundle.ts';

/**
 * A Train on the map: its Trip, how far along the Trip's shape it is, in metres, where that is, and
 * which way it heads there, in degrees clockwise from north. It's Live while live data has placed it
 * within about its feed's last three updates, and Scheduled otherwise.
 */
export interface Train {
  /** Its Trip, as it runs it where its operator has said it won't stop at some of its Stations (cutTrip()). */
  trip: Trip;
  dist: number;
  lon: number;
  lat: number;
  heading: number;
  live: boolean;
  /**
   * Whether its Network's live data is available but hasn't reported it lately: it has no live data,
   * and may not be running. Not where that live data names Blocks but none on its Line, as on L9, nor
   * on a Line its Network's live traits list as one it names none of the Trips of (`unnamed`), as
   * FGC's list FV (#489).
   */
  unreported: boolean;
  /** The Station it stands at, while it stands at one: from when it comes in there until it leaves. */
  standsAt?: string;
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
 * Stations it accelerates, cruises and brakes, as its Line's speed profile has it (#260), so that it
 * leaves and arrives exactly on time. A Train its operator has cancelled leaves the map, by a report
 * naming only its Train number once its Trip is due to leave its first Station (#429), and one it
 * has said won't stop at some Stations runs its Trip as cutTrip() has it (#346). One that
 * live data stops reporting stays Live through two of its feed's updates and turns Scheduled at the
 * third, and it keeps its last Delay for CARRY before it's back on its plain timetable. One of the
 * Metro's whose Block goes on to run another Trip turns Scheduled at once, but not while TMB has the
 * Block coming to that Trip's last Station, as it runs into the end of its Line. A Live one short of
 * its Trip's first Station, as while its Block waits at the end of its Line, stands there, unless the
 * Trip its Block ran in on is still on the map, and a Live one at that Station stays there until a
 * report has it gone, and once out, stays out. A Scheduled one on a Line whose live data names Blocks
 * waits there for its Block while that live data is available, for up to WAIT past when it's due to
 * leave, and then catches up with its timetable. A Scheduled one within a closed Closure that hides
 * Trains, between its two Stations, isn't drawn, but a Live one is: live data wins (#345).
 * One of Renfe's that its reports have named at one Station for 10 minutes or more stands there, unless
 * it's its Trip's last (#485).
 */
export function trainsAt(bundle: Bundle, at: number, received: Received[] = [], closures: readonly ShownClosure[] = []): Train[] {
  const { of } = onMap(bundle, at, received, closures);
  return bundle.trips.flatMap((trip) => of(trip)?.train ?? []);
}

/**
 * A Station a Train has still to leave, as the follow panel lists it: when it's expected to arrive at it
 * and leave it, in ms since 1970, and that its Train doesn't stop there, as at a Station within a closed
 * Closure that hides Trains, where a board shows it not stopping too (#345, #420).
 */
export interface Upcoming {
  station: string;
  arrival: number;
  departure: number;
  skipped?: true;
}

/** A Train as the follow panel shows it: where it's going, when it'll get there, and how far to trust where it's drawn. */
export interface Followed extends Train {
  /** Its Delay, in seconds, as live data last gave it: early where it's negative. A Train drawn off it eases to it by the next snapshot. None to show for a Metro Train (#103). */
  delay?: number;
  /**
   * The Stations it has still to leave as it's drawn, the one it stands at first, and when it's
   * expected to arrive at and leave each, in ms since 1970, running its Delay late, or held or waiting
   * for its Block at its first Station after that has it leave, as late as it's held.
   */
  upcoming: Upcoming[];
  /** How long ago live data last placed it, in ms, as of when its operator reported it there: none where the snapshots kept don't. */
  since?: number;
  /** How fast it's drawn running, in m/s, as its speed profile has it: an estimate, not a measurement. */
  speed: number;
  /** The type of Unit it runs as, where its operator reports one, as FGC does. */
  unitType?: string;
}

/** One Train, as the follow panel shows it, at a moment by the device's clock (ms since 1970), given the snapshots received by then and the Closures that hide Trains: as trainsAt() has it, if it's on the map. */
export function trainAt(bundle: Bundle, at: number, received: Received[], id: string, closures: readonly ShownClosure[] = []): Followed | undefined {
  const trip = bundle.trips.find((t) => t.id === id);
  const on = trip && onMap(bundle, at, received, closures).of(trip);
  if (!on?.train) return undefined;
  const { train, now, time, timeAt, calls, profile, said, network, delay } = on;
  // When it's expected at a moment of its timetable, running its Delay late.
  const expected = (seconds: number) => bundle.noonMinus12h + (seconds + delay) * 1000;
  // How far along its shape it's drawn at a moment, in seconds into the service day.
  const drawn = (moment: number) => place(calls, profile, timeAt(moment)) ?? train.dist;
  // Which of its Stations lie within a closed Closure that hides Trains, which it doesn't stop at (#420).
  const shut = on.closed && closedCalls(calls, on.closed, train.trip.shape);
  return {
    ...train,
    delay: shown(network, delay),
    upcoming: calls.flatMap((c, i): Upcoming[] => (toLeave(c, time) ? [{ station: c.station, arrival: expected(c.arrival), departure: expected(c.departure), ...(shut?.at[i] && { skipped: true }) }] : [])),
    since: said?.confirmed === undefined ? undefined : bundle.noonMinus12h + now * 1000 - said.confirmed,
    speed: Math.abs(drawn(now + 0.5) - drawn(now - 0.5)),
    unitType: said?.report.unitType,
  };
}

/**
 * A Trip whose Train isn't on the map, as the follow panel shows it: yet to start, or within a closed
 * Closure that hides Trains (#420). When it leaves each Station it has still to leave, and how far to
 * trust that.
 */
export interface Coming {
  trip: Trip;
  /** Each Station of the Trip it has still to leave, as trainAt()'s `upcoming` has them, running its Delay late: for one yet to start, the first, when it leaves, in both. */
  upcoming: Upcoming[];
  /** Its Delay, in seconds, as live data last gave it: none to show for a Metro Train (#103). */
  delay?: number;
  live: boolean;
  /** The closed Closure that hides Trains which its Train is within, where it's there: it runs on and comes out at its far Station, as its timetable has it, but isn't drawn between them (#420). */
  within?: ShownClosure;
}

/**
 * A Trip whose Train isn't on the map: one that has yet to leave its first Station, as a Train comes
 * onto it only a few seconds before it leaves (#322), or one that has left and is within a closed
 * Closure that hides Trains, which a Scheduled Train isn't drawn within (#345), until it comes out of
 * it or lifts it (#420): to follow it as a Trip still to come. None for one that's on the map, that has
 * ended or is Cancelled, or that isn't in the days given.
 */
export function comingAt(bundle: Bundle, at: number, received: Received[], id: string, closures: readonly ShownClosure[] = []): Coming | undefined {
  const trip = bundle.trips.find((t) => t.id === id);
  const on = trip && onMap(bundle, at, received, closures).of(trip);
  const first = on?.calls[0];
  if (!on || on.train || on.cancelled || !first || (!on.within && on.time >= first.departure)) return undefined;
  const expected = (seconds: number) => bundle.noonMinus12h + (seconds + on.delay) * 1000;
  // Which of its Stations lie within a closed Closure that hides Trains, which it doesn't stop at.
  const shut = on.closed && closedCalls(on.calls, on.closed, on.trip.shape);
  return {
    trip: on.trip,
    // All of them for one yet to start, the first when it leaves.
    upcoming: on.calls.flatMap((c, i): Upcoming[] => (toLeave(c, on.time) ? [{ station: c.station, arrival: expected(i ? c.arrival : c.departure), departure: expected(c.departure), ...(shut?.at[i] && { skipped: true }) }] : [])),
    delay: shown(on.network, on.delay),
    live: on.live,
    ...(on.within && { within: on.within.closure }),
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
  /** Whether, drawn on the map, it has no live data though its Network's live data is available, as Train.unreported has it. Not before it's on the map, when no feed reports it yet. */
  unreported: boolean;
  /** Whether its operator has announced that it won't run, by a report naming only its Train number once its Trip is due to leave its first Station (#429): then it's expected when its timetable has it leave. */
  cancelled: boolean;
  /**
   * Whether it won't stop at the Station: as its operator has said, where it's cut short or starts late
   * (#346), or as it's at a Station within a closed Closure, but for one Live within it (#345). Then
   * it's shown when its timetable has it leave.
   */
  skipped: boolean;
}

/** How many departures a Station's board lists. */
const BOARD = 10;

/**
 * The next departures from some Stations, soonest first, at a moment by the device's clock (ms since
 * 1970), given the snapshots received by then and the Closures that hide Trains: each Train still to
 * leave one of them, but not one that ends its Trip there, expected as it's drawn on the map, and a
 * Cancelled one as its timetable has it, as is one at a Station its operator has said it won't stop at
 * (#346), and one at a Station within a closed Closure, but for one Live within it, which it doesn't
 * run within, nor leaves either of the Closure's Stations into, as if its Trip ended there (#345).
 */
export function boardAt(bundle: Bundle, at: number, received: Received[], stations: string[], closures: readonly ShownClosure[] = []): Departure[] {
  const { of, now } = onMap(bundle, at, received, closures);
  const here = new Set(stations);
  return bundle.trips
    .flatMap((trip): Departure[] => {
      if (!trip.calls.some((c) => here.has(c.station))) return [];
      const on = of(trip);
      if (!on) return [];
      const { cancelled } = on;
      const [time, delay] = cancelled ? [now, 0] : [on.time, on.delay];
      const shut = !cancelled && on.closed ? closedCalls(on.calls, on.closed, trip.shape) : undefined;
      // Where it calls there more than once, as turning back, the first time it's still to leave: within a closed Closure, by its timetable.
      const i = on.calls.findIndex((c, i) => i < on.calls.length - 1 && toLeave(c, shut?.at[i] ? now : time) && here.has(c.station));
      const call = on.calls[i];
      if (call && shut?.at[i]) return [{ trip: on.trip, station: call.station, departure: bundle.noonMinus12h + call.departure * 1000, live: false, unreported: false, cancelled: false, skipped: true }];
      if (call && (shut?.after[i] || shut?.into[i])) return [];
      if (call) {
        const departure = bundle.noonMinus12h + (call.departure + delay) * 1000;
        return [{ trip: on.trip, station: call.station, departure, delay: shown(on.network, delay), live: on.live && !cancelled, unreported: !!on.train?.unreported, cancelled, skipped: false }];
      }
      // Not at the Station its timetable ends at, where it would only arrive.
      const skip = on.skips.find((c) => c !== trip.calls.at(-1) && toLeave(c, now) && here.has(c.station));
      return skip ? [{ trip: on.trip, station: skip.station, departure: bundle.noonMinus12h + skip.departure * 1000, live: false, unreported: false, cancelled: false, skipped: true }] : [];
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
 * moment by the device's clock (ms since 1970), given the snapshots received by then and the Closures
 * that hide Trains: each whose track still ahead of it comes within the radius, or that's within it,
 * listed once, for when it next comes within it, expected within the window, as it's drawn on the
 * map. Not one that's Cancelled, nor one near only Stations its operator has said it won't stop at,
 * which it runs past (#346), nor one near only where it runs within a closed Closure, but for one Live
 * within it (#345).
 */
export function nearbyAt(bundle: Bundle, at: number, received: Received[], point: Point, radius: number, window: number, closures: readonly ShownClosure[] = []): Pass[] {
  const { of, now } = onMap(bundle, at, received, closures);
  // Most track comes nowhere near: each shape is looked over once, for the stretches of it within the radius.
  const within = new Map(bundle.shapes.map((s) => [s.id, stretchesWithin(s, point, radius)]));
  return bundle.trips
    .flatMap((trip): Pass[] => {
      const stretches = within.get(trip.shape);
      if (!stretches?.length) return [];
      const on = of(trip);
      if (!on || on.cancelled) return [];
      const { delay } = on;
      // Where in its timetable the window ends.
      const until = now + window / 1000 - delay;
      const has = ([from, to]: [number, number]) => (c: Call) => from <= c.dist && c.dist <= to;
      const passes = stretches.filter((s) => !on.skips.some(has(s)) || on.calls.some(has(s)));
      const shut = on.closed && closedCalls(on.calls, on.closed, trip.shape);
      const comes = whenWithin(on.calls, on.profile, outside(passes, shut?.along ?? []), shut)
        .filter(([enters, leaves]) => leaves >= on.time && enters <= until)
        .map(([enters]) => Math.max(enters, on.time));
      if (!comes.length) return [];
      return [{ trip: on.trip, at: bundle.noonMinus12h + (Math.min(...comes) + delay) * 1000, delay: shown(on.network, delay), live: on.live }];
    })
    .sort((a, b) => a.at - b.at);
}

/**
 * A Train's Delay, in seconds, as the follow panel, boards and Nearby give it: none where its
 * Network's live data has none shown, as the Metro's: TMB runs the Metro by headway, and its
 * timetable names no Blocks, so a Metro Train's Delay is only against whichever Trip its Block runs,
 * which can be minutes off its own time (#103).
 */
const shown = (network: Network, delay: number) => (network.live?.delay === 'none' ? undefined : delay);

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
  /** Its Trip as it runs it, where its operator has said it won't stop at some of its Stations (cutTrip()), and otherwise as its timetable has it. */
  trip: Trip;
  /** Whether its operator has said it won't run, by a report naming only its Train number once its Trip is due to leave its first Station (#429), or would stop at one of its Stations or none. */
  cancelled: boolean;
  /** The calls its timetable has that it doesn't make, at Stations its operator has said it won't stop at, as cutTrip() has them. */
  skips: Call[];
  /** The closed Closures on its Line that hide Trains, which it isn't drawn within, but none while it's Live within one: live data wins (#345). */
  closed?: Shut[];
  /** The one of them it's within, where it isn't drawn for it: none where it's drawn, within one Live or not (#420). */
  within?: Shut;
  now: number;
  time: number;
  /** Where in its timetable it's drawn at a moment, both in seconds into the service day: `time` at `now`. */
  timeAt: (moment: number) => number;
  /**
   * How late its times run, in seconds: as live data last had it, or while it's held at its first
   * Station, or let out and catching up, as late as it's drawn, where that's later (#107). One live
   * data hasn't shifted runs as late as it's drawn, waiting for its Block or catching up after (#125).
   */
  delay: number;
  calls: Call[];
  network: Network;
  profile: SpeedProfile;
  ease?: Ease;
  said?: Heard;
  /** Whether live data has placed it recently, on the map or off it. */
  live: boolean;
}

/**
 * Where trainsAt() has each Trip's Train at a moment by the device's clock, that moment in seconds
 * into the service day by the fetcher's clock, and the Networks whose live data is available then.
 */
function onMap(bundle: Bundle, at: number, received: Received[], closures: readonly ShownClosure[] = []): { of: (trip: Trip) => OnMap | undefined; now: number; available: Set<string> } {
  const clock = behind(received);
  const now = (at + clock - bundle.noonMinus12h) / 1000;
  const shapes = new Map(bundle.shapes.map((s) => [s.id, s]));
  const networks = new Map(bundle.networks.map((n) => [n.id, n]));
  const lines = new Map(bundle.lines.map((l) => [l.id, profiled(networks.get(l.network), l)]));
  // What live data last said about each Trip. A report that matches no Trip is dropped.
  const { eases, heard, reported } = replay(bundle, received, clock, lines, shapes);
  // Where the latest snapshot says Trains won't stop at some Stations, the Trips as they run them.
  const cuts = cutsIn(bundle, received.at(-1)?.snapshot);
  // The closed Closures that hide Trains, by their Lines.
  const closedOn = closedIn(bundle, closures);
  // How far into live data the device has got by now, and by when the map last looked for it. A
  // Train is Live only on recent confirmation, however long since the map looked, but live data is
  // unavailable only where the map has looked and found none.
  const [upToNow, upTo] = [heardTo(received, at + clock), heardTo(received, (received.at(-1)?.at ?? -Infinity) + clock)];
  const feeds = received.at(-1)?.snapshot.feeds ?? {};
  // How many of each quiet Network's Trains its timetable has on the map now, counted as far as
  // RUNNING: each one whose feed works but has had none of its Trains in it for three of its updates.
  // Most Trips aren't on the map at any one moment, whatever their dwell: those are skipped first.
  const quietOnMap = new Map<string, number>(Object.entries(feeds).flatMap(([id, feed]): [string, number][] => (works(feed, upTo) && stale(reported.get(id), upTo, feed.every) ? [[id, 0]] : [])));
  for (const trip of quietOnMap.size ? bundle.trips : []) {
    const [network, first, last] = [lines.get(trip.line), trip.calls[0], trip.calls.at(-1)];
    const count = network && quietOnMap.get(network.id);
    if (!network || count === undefined || count >= RUNNING || !first || !last || now < first.arrival - network.profile.dwell || now > last.departure + network.profile.dwell) continue;
    const shape = shapes.get(trip.shape);
    if (shape && onTrack(shape, place(withDwell(trip, network.profile), network.profile, now))) quietOnMap.set(network.id, count + 1);
  }
  // The Networks whose live data is available: each one's feed works, and has had one of its Trains
  // in it within three of its updates, unless its timetable has fewer than RUNNING of them on the
  // map, as at night, when a feed is rightly empty (#124).
  const available = new Set(Object.entries(feeds).flatMap(([id, feed]) => (works(feed, upTo) && (quietOnMap.get(id) ?? 0) < RUNNING ? [id] : [])));
  // The Lines the snapshots kept name Blocks on, and so the Networks they name Blocks for: the
  // Metro's. TMB publishes no predictions for L9, L10 or the funicular, so their Trains have no live
  // data without being left out of it.
  const blockLines = new Set(received.flatMap((r) => linesByBlock(r.snapshot)));
  const blockNetworks = new Set([...blockLines].map((line) => lines.get(line)?.id));
  // The Lines whose Network's live data names none of their Trips, as Geotren names none of FV's
  // (#489): their Trains have no live data without being left out of it either.
  // ponytail: by configuration, so were Geotren to start naming FV's Trips, one it then left out would
  // still not be marked. Go by whether the snapshots kept name any of the Line's Trips, as the Metro's
  // go by their Blocks, if a feed does.
  const unnamed = new Set(bundle.lines.flatMap((l) => (networks.get(l.network)?.live?.unnamed?.includes(l.name) ? [l.id] : [])));
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
    const said = heard.get(trip.id);
    // Cancelled outright, it runs none of its Trip, as its timetable has it. By a report naming its Train
    // number, only once its Trip is due to leave its first Station: Renfe's long-distance trip update that
    // says only CANCELED has no stops, and its trip_id's date is its calendar's, so it can't say which run,
    // and before then the Train can run after all, as FEVE's 71832 did on 10 October 2026, CANCELED from
    // 13:47 and running out of Oviedo from 14:45 (#429).
    // ponytail: once its Trip is due, an update about another run of its number cancels it all the same,
    // as one Renfe still lists from the day before would: it still listed R15 15007's, due at 10:45, at
    // 18:42 that day. Have the fetcher keep when Renfe first listed each, as it does a Trip's skipped
    // Stations, and go by that if that shows.
    const cancels = !!said?.report.cancelled && (!said.report.number || now >= (trip.calls[0]?.departure ?? -Infinity));
    const cut = cancels ? undefined : cuts.get(trip.id);
    const asRun = cut?.trip ?? trip;
    const [network, shape, first, last, ease] = [lines.get(trip.line), shapes.get(trip.shape), asRun.calls[0], asRun.calls.at(-1), eases.get(trip.id)];
    if (!network || !shape) return undefined;
    const { profile } = network;
    const dwelt = withDwell(asRun, profile);
    const feed = feeds[network.id];
    // A Train running late is where its timetable had it that long ago, once it has eased there. One
    // live data hasn't shifted is where unshifted() has it.
    const timeAt = (moment: number) => (ease ? eased(dwelt, profile, ease, moment) : unshifted(dwelt, profile, moment, blockLines.has(trip.line) && available.has(network.id)));
    const time = timeAt(now);
    const live = isLive(said, feed, upToNow);
    const delay = ease?.hold !== undefined || ease?.leaving ? Math.max(ease.delay, now - time) : (ease?.delay ?? now - time);
    // A Live Metro Train short of its Trip's first Station, as TMB has it while its Block waits at the
    // end of its Line, has come in there already, and stands there from now on (#105): unless the Trip
    // its Block ran in on is still on the map, and so at once where live data knows none, as on a map
    // just opened. Whether that Trip is on the map is judged without this rule, as it has long left
    // its own first Station: with the rule, where it hadn't, the two could each wait on the other.
    const block = live ? said?.report.block : undefined;
    const waits = !nested && block && first && time < (dwelt[0]?.arrival ?? -Infinity) && !ranBy(block).some((t) => t !== trip && t.calls.at(-1)?.station === first.station && of(t, true)?.train);
    const calls = waits ? dwelt.map((c, i) => (i ? c : { ...c, arrival: time })) : dwelt;
    const cancelled = cancels || (!!cut && !cut.trip);
    const off = { trip: asRun, cancelled, skips: cut?.skips ?? [], closed: closedOn.get(trip.line), now, time, timeAt, delay, calls, network, profile, ease, said, live };
    if (cancelled) return off;
    // Most Trips aren't on the map at any one moment, whatever their dwell: skip those first.
    if (!first || !last || (!waits && time < first.arrival - profile.dwell) || time > last.departure + profile.dwell) return off;
    const dist = place(calls, profile, time);
    if (!onTrack(shape, dist)) return off;
    const [lon, lat] = pointAt(shape, dist);
    const unreported = available.has(network.id) && !recent(said, upTo) && (!blockNetworks.has(network.id) || blockLines.has(trip.line)) && !unnamed.has(trip.line);
    // The first Station it has still to leave, where it has come in there already.
    const next = calls.findIndex((c) => toLeave(c, time));
    const call = calls[next];
    const standsAt = call && call.arrival <= time ? call.station : undefined;
    const train = { trip: asRun, dist, lon, lat, heading: headingAt(shape, calls, time, dist), live, unreported, standsAt };
    // Within a closed Closure, standing at a Station between its two or running from one of its
    // Stations to the next, or between them along its shape, as where it runs past them, a Scheduled
    // Train isn't drawn, and a Live one is, its Closures set aside (#345).
    const shut = off.closed && closedCalls(calls, off.closed, trip.shape);
    if (!(standsAt ? shut?.at[next] : shut?.after[next - 1] || inside(shut?.along ?? [], dist))) return { ...off, train };
    if (live) return { ...off, closed: undefined, train };
    // Which of them it's within, which the follow panel names (#420).
    const within = off.closed?.find((s) => {
      const part = closedCalls(calls, [s], trip.shape);
      return standsAt ? part.at[next] : part.after[next - 1] || inside(part.along, dist);
    });
    return { ...off, within };
  };
  return { of, now, available };
}

/**
 * A Trip as its Train runs it, where its operator has said it won't stop at some of its Stations, and
 * the calls its timetable has that it doesn't make: none to run where it would stop at one Station or none (#346).
 */
interface Cut {
  trip?: Trip;
  skips: Call[];
}

/** No Trip cut, as where a snapshot says no Train won't stop at a Station. */
const NO_CUTS = new Map<string, Cut>();

/** Each snapshot's Cuts, for a bundle, worked out once: the map asks for them each time it moves its Trains. */
const cutsOf = new WeakMap<Snapshot, { bundle: Bundle; cuts: Map<string, Cut> }>();

/**
 * Where a snapshot says Trains won't stop at some Stations, each Trip as its Train runs it, by the
 * Trip's ID: the Trip of the ID the snapshot names on the days joined whose timetable runs nearest
 * when its operator first said so.
 */
function cutsIn(bundle: Bundle, snapshot: Snapshot | undefined): Map<string, Cut> {
  if (!snapshot?.skipped?.length) return NO_CUTS;
  const known = cutsOf.get(snapshot);
  if (known?.bundle === bundle) return known.cuts;
  const [names, named, cuts] = [new Map(bundle.stations.map((s) => [s.id, s.name])), namedIn(bundle), new Map<string, Cut>()];
  for (const skipped of snapshot.skipped) {
    const trip = closest(named.get(skipped.trip) ?? [], (skipped.since - bundle.noonMinus12h) / 1000);
    const cut = trip && cutTrip(trip, skipped, bundle.noonMinus12h, names);
    if (trip && cut) cuts.set(trip.id, cut);
  }
  cutsOf.set(snapshot, { bundle, cuts });
  return cuts;
}

/**
 * A Trip as its Train runs it, given the Stations its operator has said it won't stop at, as it first
 * did at `since`, and the Stations' names: none where it calls at none of them (#346). It starts at
 * its first Station after those it skips at its start, and ends at its last before those it skips at
 * its end, headed there, each as at any Trip's first Station and last, and runs on through those it
 * skips between them, stopping at none. Renfe lists only the Stations a Trip's timetable hasn't left
 * yet, so Stations it skips that it first listed once the timetable had left the Station before them
 * are taken to be where the Trip starts: on 7 October 2026 it listed an R4 from Manresa at 13:15,
 * skipping Barberà del Vallès to Plaça de Catalunya, and none that ran the Stations before those it
 * skipped. Skipping every Station but one, or all, it's Cancelled.
 * ponytail: by the timetable alone, so a Train running late, first listed skipping Stations further
 * on once its timetable had left the one before them, would be taken to start after them. Go by its
 * Delay as well if one shows.
 */
function cutTrip(trip: Trip, { stations, since }: Skipped, noonMinus12h: number, names: Map<string, string>): Cut | undefined {
  const skip = new Set(stations);
  const skipped = trip.calls.map((c) => skip.has(c.station));
  const [firstSkipped, lastKept, end] = [skipped.indexOf(true), skipped.lastIndexOf(false), trip.calls.length - 1];
  if (firstSkipped < 0) return undefined;
  const late = firstSkipped < lastKept && (firstSkipped === 0 || (trip.calls[firstSkipped - 1]?.departure ?? Infinity) <= (since - noonMinus12h) / 1000);
  const start = late ? skipped.indexOf(false, firstSkipped) : 0;
  const makes = (i: number) => i >= start && i <= lastKept && !skipped[i];
  const calls = trip.calls.filter((_, i) => makes(i));
  const [from, to] = [calls[0], calls.at(-1)];
  // Left with fewer than two Stations to call at, it doesn't run.
  if (!from || !to || from === to) return { skips: trip.calls };
  // As at any Trip's first Station and last, it's due at the first as it leaves, and leaves the last as it's due there.
  if (start > 0) calls[0] = { ...from, arrival: from.departure };
  if (lastKept < end) calls[calls.length - 1] = { ...to, departure: to.arrival };
  return { trip: { ...trip, headsign: lastKept < end ? (names.get(to.station) ?? to.station) : trip.headsign, calls }, skips: trip.calls.filter((_, i) => !makes(i)) };
}

/** A Closure the map shows, as closuresAt() gives it (#341): its Line, its two Stations, either way round, and whether it's closed, or down to a single track, which hides no Train (#345). */
export type ShownClosure = Pick<Closure, 'line' | 'stations'> & { kind: 'closed' | 'single' };

/** A closed Closure, the Stations between its two, and where it lies along their shapes, as the Trips of its Line that call at both have them (#345). */
interface Shut {
  closure: ShownClosure;
  between: Set<string>;
  /** From the one Station to the other, in metres along each shape such a Trip runs on. */
  along: Map<string, [from: number, to: number]>;
}

/** No Closure closed, as where the map shows none. */
const NONE_CLOSED = new Map<string, Shut[]>();

/** Each list of Closures' closed ones, for a bundle, worked out once: the map asks for them each time it moves its Trains. */
const closedOf = new WeakMap<readonly ShownClosure[], { bundle: Bundle; closed: Map<string, Shut[]> }>();

/**
 * The closed Closures among these, by their Lines' IDs, each with the Stations between
 * its two, and where it lies along their shapes, as its Line's Trips that call at both have them: its
 * Trains on the part of their Line it closes don't run there, unless live data says they do (#345).
 * ponytail: only as a Trip that calls at both has them, so on a day none does, a Trip that runs into
 * it from one of them, as R3's from Ripoll to Ribes de Freser would, is drawn there, as is one that
 * runs through it without calling at both, on a shape none of those Trips runs on. Place them on the
 * Line's shapes, as placeOn() does, if that shows.
 */
function closedIn(bundle: Bundle, closures: readonly ShownClosure[]): Map<string, Shut[]> {
  if (!closures.some((c) => c.kind === 'closed')) return NONE_CLOSED;
  const known = closedOf.get(closures);
  if (known?.bundle === bundle) return known.closed;
  const closed = new Map<string, Shut[]>();
  for (const closure of closures) {
    const { line, stations, kind } = closure;
    if (kind !== 'closed') continue;
    const [between, along] = [new Set<string>(), new Map<string, [number, number]>()];
    for (const { line: of, shape, calls } of bundle.trips) {
      const [a = -1, b = -1] = of === line ? stations.map((s) => calls.findIndex((c) => c.station === s)) : [];
      const [from, to] = [calls[Math.min(a, b)], calls[Math.max(a, b)]];
      if (!from || !to) continue;
      for (const c of calls.slice(Math.min(a, b) + 1, Math.max(a, b))) between.add(c.station);
      along.set(shape, [Math.min(from.dist, to.dist), Math.max(from.dist, to.dist)]);
    }
    closed.set(line, [...(closed.get(line) ?? []), { closure, between, along }]);
  }
  closedOf.set(closures, { bundle, closed });
  return closed;
}

/**
 * Where a Trip on a shape is within closed Closures of its Line (#345): which of its calls are at a
 * Station between one's two Stations, which legs, from each call to the next, run within one, from one
 * of its Stations to another, or to or from one between them, and which run into one from one of its
 * Stations though they call at nothing in it, as where a faster Train runs past them; and where they
 * lie along its shape, between whose ends it's within, whatever it calls at.
 */
function closedCalls(calls: Call[], closed: Shut[], shape: string) {
  const on = ({ closure, between }: Shut, call?: Call) => !!call && (between.has(call.station) || closure.stations.includes(call.station));
  const along = closed.flatMap((s): [from: number, to: number][] => {
    const part = s.along.get(shape);
    return part ? [part] : [];
  });
  return {
    at: calls.map((c) => closed.some((s) => s.between.has(c.station))),
    after: calls.map((c, i) => closed.some((s) => on(s, c) && on(s, calls[i + 1]))),
    into: calls.map(({ dist }, i) => {
      const next = calls[i + 1];
      return !!next && along.some(([from, to]) => (dist === from && next.dist > from) || (dist === to && next.dist < to));
    }),
    along,
  };
}

/** Whether a point so far along a shape, in metres, is within one of these parts of it: between its ends, not at either (#345). */
const inside = (parts: [from: number, to: number][], dist: number) => parts.some(([from, to]) => from < dist && dist < to);

/** As much of these stretches of a shape, in metres along it, as lies outside these parts of it, their ends included (#345). */
const outside = (stretches: [from: number, to: number][], parts: [from: number, to: number][]) =>
  parts.reduce((left, [from, to]) => left.flatMap(([a, b]) => ([[a, Math.min(b, from)], [Math.max(a, to), b]] as [number, number][]).filter(([x, y]) => x <= y)), stretches);

/**
 * How far within a closed Closure a report has to put a Train for it to be seen there, in metres along
 * its track from either of the Closure's Stations, and how near that track its GPS has to be (#345). On
 * 7 October 2026, from 13:00 to 13:45, Renfe's GPS had 3 of 467 Trains coming into a Station past it,
 * by up to 5 m, just before Renfe pinned them there (and 9 by 1–11 km, pinned after they had gone by),
 * and Rodalies' Trains leaving one within 13 m short of it. It had them within 45 m of their track in
 * 99% of 1,131 reports, and one 26 km off. TRAM's distance put its trams within 74 m of their
 * Station's on the bundle's track. So a Train standing at either Station, or coming into it, isn't seen
 * within, and one running in is this far in within a report or two. T1–T3's Stations nearest Francesc
 * Macià and Montesa within their Closure, L'Illa and La Sardana, are 583 m and 432 m in. It's also how
 * much further along its Trip a report has to put a Train than its report before for it to have moved
 * (movedOn()).
 */
const MARGIN = 200;

/**
 * The closed Closures among these that the latest snapshot received has a Live Train of their Line
 * within, at a moment by the device's clock (ms since 1970), given the snapshots received by then
 * (#345): where a report of a Train not Cancelled, and Live then as trainsAt() has it, so not once its
 * feed has failed, nor once the map has received no snapshot for a while, as a tab hidden meanwhile, by
 * when an Alert may have changed, pins it to a Station between the Closure's two, or its GPS, no
 * further than MARGIN from its Trip's track, or TRAM's distance, puts it on that track between them,
 * more than MARGIN from either, as its Line's Trips that call at both have them (closedIn()).
 * ponytail: by the Trip a report names, as Renfe's and TRAM's do, so never a Metro Train, which TMB
 * names by its Block, nor one of FGC's rack Trains, named by its Line, while only Renfe's and TRAM's
 * Alerts make Closures (ADR-0012). Match reports as the replay does (reportsByTrip()) once others do.
 */
export function seenWithin<C extends ShownClosure>(bundle: Bundle, at: number, received: Received[], closures: readonly C[]): C[] {
  const snapshot = received.at(-1)?.snapshot;
  if (!snapshot) return [];
  const closedOn = closedIn(bundle, closures);
  const [named, shapes, networks] = [namedIn(bundle), new Map(bundle.shapes.map((s) => [s.id, s])), new Map(bundle.lines.map((l) => [l.id, l.network]))];
  // How far into live data the device has got by now, and the Trips as their Trains run them where the
  // snapshot says they won't stop at some Stations, as onMap() has both.
  const [upTo, cuts] = [heardTo(received, at + behind(received)), cutsIn(bundle, snapshot)];
  const seen = new Set<ShownClosure>();
  for (const { trip: id, at: reported, position, cancelled } of snapshot.reports) {
    const trip = id && !cancelled ? closest(named.get(id) ?? [], (reported - bundle.noonMinus12h) / 1000) : undefined;
    const [shape, closed, cut] = [trip && shapes.get(trip.shape), trip && closedOn.get(trip.line), trip && cuts.get(trip.id)];
    // Not one Cancelled, as one its operator has said won't stop at more than one of its Stations is too (cutTrip()).
    if (!trip || (cut && !cut.trip) || !shape || !closed || !position || !works(snapshot.feeds[networks.get(trip.line) ?? ''], upTo)) continue;
    const [d, off] = 'lon' in position || 'along' in position ? placedBy(trip.calls, shape, position) : [NaN, NaN];
    for (const { closure, between, along } of closed) {
      const [from = NaN, to = NaN] = along.get(trip.shape) ?? [];
      if (('near' in position && between.has(position.near)) || (off <= MARGIN && inside([[from + MARGIN, to - MARGIN]], d))) seen.add(closure);
    }
  }
  return closures.filter((c) => seen.has(c));
}

/** Whether a Train so far along its shape, in metres, is on the map: not where it's off it, before its first Station or after its last, nor beyond where its track starts or ends, as past Spain's border. */
const onTrack = (shape: Shape, dist: number | undefined): dist is number => dist !== undefined && dist >= (shape.dist[0] ?? 0) && dist <= (shape.dist.at(-1) ?? 0);

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
  // How far a day's clock is behind the last day's, in seconds: a day, or on the nights the clocks change, an hour more or less.
  const behind = (day: Bundle) => (latest.noonMinus12h - day.noonMinus12h) / 1000;
  return {
    ...latest,
    networks: each((d) => d.networks),
    lines: each((d) => d.lines),
    stations: each((d) => d.stations),
    shapes: each((d) => d.shapes),
    trips: days.flatMap((day) => {
      if (day === latest) return day.trips;
      return day.trips.map((trip) => ({
        ...trip,
        id: `${day.serviceDay}/${trip.id}`,
        calls: trip.calls.map((c) => ({ ...c, arrival: c.arrival - behind(day), departure: c.departure - behind(day) })),
      }));
    }),
    // Each day's Closures, as its Trips (#340), where it has any: a day file built before #340 has none.
    closures: days.flatMap((day) => (day.closures ?? []).map((c) => (day === latest ? c : { ...c, from: c.from - behind(day), to: c.to - behind(day) }))),
  };
}

/**
 * The Networks whose live data is unavailable at a moment by the device's clock (ms since 1970),
 * given the snapshots received by then, as the latest has their feeds: each has missed about three
 * of its updates, or works but has had none of its Trains in it for about three of them while its
 * timetable has RUNNING or more on the map (#124). Before the day's Trips have come, it goes by the
 * feeds alone. Their Trains run as Scheduled meanwhile, and the map says so.
 */
export function unavailable(bundle: Bundle | undefined, at: number, received: Received[]): string[] {
  const { available } = onMap(bundle ?? NO_TRIPS, at, received);
  return Object.keys(received.at(-1)?.snapshot.feeds ?? {}).filter((network) => !available.has(network));
}

/** A service day with no Trips, as the map has before the day's have come. */
const NO_TRIPS: Bundle = { serviceDay: '', noonMinus12h: 0, networks: [], lines: [], stations: [], shapes: [], strokes: [], rails: [], slots: [], tracks: [], trips: [] };

/**
 * How many of a Network's Trains its timetable has to have on the map for a feed that works but has
 * had none of them in it for about three of its updates to count as failing, as Renfe's did on 28
 * September (#124). With fewer, as at night, it's rightly empty, and the day's first Trains come onto
 * the map before their first report.
 */
const RUNNING = 5;

/**
 * Whether a feed whose updates come `every` ms apart has missed three of them since a moment, as
 * far into live data as a device has got, both by the fetcher's clock in ms. Never is long ago.
 */
const stale = (since: number | undefined, upTo: number, every: number) => upTo - (since ?? -Infinity) >= MISSES * every;

/** Whether a Network's feed works, as far into live data as a device has got: it hasn't missed three of its updates. */
const works = (feed: Freshness | undefined, upTo: number) => feed !== undefined && !stale(feed.lastSuccess, upTo, feed.every);

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
  /**
   * When its Network's own feed last reported it, as `got` has it: not in a report by its Train number,
   * as Renfe's long-distance live data sends, which says nothing of its Network's feed (#124, #261), but
   * where its Network's live data names its Trains by number, as AVE y Larga Distancia's does (#262).
   */
  own?: number;
  /** The report's own Delay, in seconds, as delayOf() has it: for Renfe's, Renfe's own figure. */
  delay: number;
  /** For Renfe's: the last Delay its GPS gave it. */
  gps?: GpsDelay;
  /** For Renfe's: the last Delay its GPS gave it that counts. */
  counted?: GpsDelay;
  /** For Renfe's: the last two different GPS fixes it reported for it, newest first, as first reported, whether hear() took them as positions or not. */
  fixes?: Fix[];
  /** For Renfe's: the Station its reports have named it at, as `near`, and when its operator first did, in ms since 1970, where none since has named another or given GPS (replay() holds it there from LONG_PIN on). */
  pin?: { station: string; since: number };
}

/** A Delay Renfe's GPS gave a Train, in seconds, and when the fetcher got the report that did, as Heard's `got` has it. */
interface GpsDelay {
  delay: number;
  got: number;
  /** Where it was over GATE from the figure Renfe gave in the report that gave it, as delayOf() reads it, not the latest, which delayBy() puts aside. */
  far?: true;
}

/** A GPS fix Renfe reported for a Train, as reported: where, when its operator says (`at`), and when the fetcher got it, as Heard's `got` has it. */
interface Fix {
  lon: number;
  lat: number;
  at: number;
  got: number;
}

/**
 * A Train's Delay, in seconds, by what live data last said about it, as far into live data as a
 * device has got. For Renfe's, it's the last Delay its GPS gave it that counts, or where none does,
 * the last its GPS gave it, until each is CARRY old, and failing both, Renfe's own figure. That one,
 * no report before it supported, goes only where it was within GATE of Renfe's own figure in the
 * report that gave it, or where Renfe gave none: it's GPS of another Train's, or of a Train far off,
 * that puts one a quarter of an hour or an hour early, and it's mostly a Train's first GPS reports
 * that go by one (#410, #565). By the figure of the report that gave it, not the latest, as the figure
 * moves on while a position holds, and a Train would be drawn by it where its GPS had it, as ADR-0002
 * has it. Nor does a GPS fix that no report of the Train within FOLLOWS could have run to give a
 * Delay: hear() takes it as no position. Going by the figure wherever none counts, not by the last
 * its GPS gave it, was tried and rejected: it drew more Trains ahead of their GPS and then standing
 * (ADR-0002, #410).
 */
const delayBy = (said: Heard, upTo: number) => {
  const gps = recent(said.gps, upTo);
  return (recent(said.counted, upTo) ?? (gps?.far ? undefined : gps) ?? said).delay;
};

/** How far a Renfe Train's GPS can put its Delay from where its GPS report before put it and still count, in seconds. */
const CONFIRM = 120;

/** How far a GPS Delay no report before it supported can be from Renfe's own figure, in the report that gave it, and still be gone by, in seconds: hear() marks it, delayBy() goes by that. */
const GATE = 10 * 60;

/** How much further a GPS fix can be from the Train's last two than it could have run in the time between them, in metres: GPS error, and a Train that runs a little over its Line's speed (hear()). */
const SLACK = 300;

/**
 * How long Renfe's reports can name a Train at one Station, as `near`, for it to stand there, in ms.
 * They pin a Train coming into a Station too, and late, and from one Station to the next, so a minute or
 * two says little (#8), but one named there for this long is more often at it than not: of the 27 GPS
 * fixes in the 15 minutes after a pin of 10 minutes or more, in 4 recordings of Rodalies' and the
 * núcleos' Trains, that the map had drawn 3 km or more from the pin, 17 were at it, 7 near where the map
 * had the Train and 3 at neither (#485).
 * ponytail: one length for every Line and núcleo, and a Train unreported for FOLLOWS starts it again.
 * Give the fetcher the first time it named the Station (`since`), so that a Train pinned before the map
 * opened is held at once, and not from 10 minutes after, if that matters. Nor can it tell Renfe's
 * INCOMING_AT from STOPPED_AT, so a Train named as coming in to a Station for the whole run in is held at
 * it before it has got there: 25 of the 410 Train-minutes it moves in #233's four recordings, as RL4
 * 33526's 6.5 minutes of 25 September 2026. Keep `currentStatus` in the report, once a Record has it,
 * and go by that if that matters.
 */
const LONG_PIN = 10 * 60_000;

/** Whether a Train's latest report names it at a Station its reports have named it at for LONG_PIN or more: it stands there. */
const stands = (pin: Heard['pin'], report: Report) => !!pin && report.at - pin.since >= LONG_PIN;

/**
 * How soon after a Train's report the next has to come to go on from it, in ms: for one of Renfe's,
 * to be judged against it, as GPS unchanged since it or far off it, and for a Metro Block, to keep
 * the Trip it ran. It's under KEEP less CARRY and LAG, so that replaying only the snapshots kept
 * judges each Delay still in use as replaying them all did.
 */
const FOLLOWS = 2 * 60_000;

/**
 * What live data says about a Train each time a snapshot reports it, given what it said before,
 * when the fetcher got the report, by its clock in ms since 1970, the snapshot, how its Network's
 * live data reads, as whether it carries the GPS Delay, as Renfe's does, how to work out a report's
 * own Delay, as delayOf() does, and its Line's top speed, in m/s. A Train Renfe pins to a Station or
 * gives no position for carries on from the last Delay its GPS gave it that counts, until that's
 * CARRY old: Renfe's own figure moves in whole minutes and is often minutes off, so going by it made
 * Trains jump each time Renfe switched between the two (#33). Renfe's GPS unchanged since the Train's
 * report before is as old as that report, and counts as no position. And GPS counts only where it
 * follows on from the Train's GPS report before, within CONFIRM of the Delay that one gave it: now and
 * then Renfe's GPS has a Train, for a report or two, at a Station it's nowhere near, such as
 * Barcelona-Sants, often just after Renfe has pinned it to Stations a while. A fix is no position
 * either where it's further from each of the Train's last two GPS fixes within FOLLOWS than it could
 * have run in the time between them, at its Line's top speed and 5% over, as jumps() has it, and a
 * second at the least, with SLACK more: GPS that has a Train where no report of it a minute or two
 * before could have run to is another Train's, as a C5's put it 23 minutes ahead on 7 October 2026
 * and back at its next report, or a Train's far off (#565). The two fixes are the reports' as
 * reported, whether taken as positions or not, and a fix reported again isn't another, so that a
 * fix between two good ones doesn't take the good one after it with it, as it would were each judged
 * by the one before alone. Not a report by Train number, as Renfe's long-distance files make: it has
 * no time of its own, its feed's header stands for it, and its position holds for minutes and then
 * moves kilometres, so the time between two says nothing of how far a Train could have run: of the 7
 * fixes it would take as none in 10 October 2026's long-distance replay, each was its Train's real
 * position, and one would leave its Train drawn 7 to 8 km behind for 5 minutes. It keeps where the
 * Train's reports have named it at one Station, and since when, which holds it there from LONG_PIN on (#485).
 */
function hear(before: Heard | undefined, report: Report, got: number, from: Received, live: LiveTraits | undefined, ownDelay: (report: Report) => OwnDelay, topSpeed: number): Heard {
  const carriesGpsDelay = live?.delay === 'gps';
  const follows = <T extends { got: number }>(earlier: T | undefined): earlier is T => earlier !== undefined && got - earlier.got < FOLLOWS;
  // The same report again, as in a snapshot the map records twice or a feed's last good response the fetcher keeps, is unchanged too.
  const frozen = carriesGpsDelay && follows(before) && sameSpot(before.report.position, report.position);
  // ponytail: not a report by Train number, so a long-distance glitch passes as before, as the stale first
  // position of 12694 did, back twice in 10 October's replay: judge it by its Trip's track (OFF_TRACK, #486)
  // or by Renfe's figure if that matters.
  const fix: Fix | undefined = carriesGpsDelay && !report.number && report.position && 'lon' in report.position ? { ...report.position, at: report.at, got } : undefined;
  // ponytail: two fixes back, as the ticket has it: a glitch that is a Train's only fix within FOLLOWS, as its
  // first GPS after a pin often is, takes the real fix after it with it, and the one after that counts.
  const prior = (before?.fixes ?? []).filter((f) => follows(f));
  const unreachable = !!fix && prior.length > 0 && prior.every((f) => metresBetween(f, fix) > topSpeed * 1.05 * Math.max(1, Math.abs(fix.at - f.at) / 1000) + SLACK);
  const taken = frozen || unreachable ? { ...report, position: undefined } : report;
  const { position } = taken;
  const [newest] = before?.fixes ?? [];
  const fixes = fix && !sameSpot(newest, fix) ? [fix, ...(newest ? [newest] : [])] : before?.fixes;
  // Where its reports have named it at one Station since, until one names another or gives GPS: one with no position doesn't. A gap of FOLLOWS or more ends it.
  const near = report.position && 'near' in report.position ? report.position.near : undefined;
  const kept = follows(before) ? before.pin : undefined;
  const pin = !carriesGpsDelay ? undefined : near !== undefined ? (kept?.station === near ? kept : { station: near, since: report.at }) : report.position ? undefined : kept;
  const heard = { report, got, placed: position ? got : before?.placed, confirmed: position ? report.at : before?.confirmed, from, own: report.number && !live?.numbers ? before?.own : got, fixes, pin };
  if (!carriesGpsDelay) return { ...heard, delay: ownDelay(taken).delay };
  const figure = ownDelay({ ...taken, position: undefined }).delay;
  const { gps, counted } = before ?? {};
  // GPS gives a Delay only where it puts the Train running between Stations, not standing at its first before it leaves.
  const { delay, measured } = ownDelay(taken);
  if (!measured) return { ...heard, delay: figure, gps, counted };
  const agrees = follows(gps) && Math.abs(delay - gps.delay) <= CONFIRM;
  // Against the figure as delayOf() reads it: a day back where it's more than 12 hours off (#566).
  const far = report.delay !== undefined && Math.abs(delay - figure) > GATE;
  return { ...heard, delay: figure, gps: { delay, got, ...(far && { far }) }, counted: agrees ? { delay, got } : counted };
}

/** Whether two positions are the same coordinates. */
const sameSpot = (a: Report['position'], b: Report['position']) => !!a && !!b && 'lon' in a && 'lon' in b && a.lon === b.lon && a.lat === b.lat;

/** How far apart two GPS positions are, in metres, flat around the second as nearest() has the ground. */
const metresBetween = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) =>
  Math.hypot((b.lon - a.lon) * DEGREE * Math.cos((b.lat * Math.PI) / 180), (b.lat - a.lat) * DEGREE);

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

/** How far a Train can be drawn from where live data has it before it jumps there: a minute of its timetable, or 1 km, or more where its Network's live data says so (`snap`, #260). */
const [JUMP_TIME, JUMP_DIST] = [60, 1000];

/**
 * The last replay, which the map asks for again each time it moves its Trains until its next
 * snapshot arrives, and then folds that snapshot into.
 */
let last: { bundle: Bundle; received: Received[]; clock: number; eases: Map<string, Ease>; heard: Map<string, Heard>; dwelt: Map<string, Call[]>; reported: Map<string, number> } | undefined;

/**
 * How each Train live data has shifted in time is drawn, snapshot by snapshot, so that it never
 * runs back along its track (ADR-0002), what live data last said about it, and when each Network's
 * own feed last had one of its Trains in it, by the fetcher's clock in ms since 1970, as it got the
 * report. The first snapshot places every Train outright, and after that a Train drawn far from
 * where a snapshot has it jumps there.
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
function replay(bundle: Bundle, received: Received[], clock: number, lines: Map<string, Network | undefined>, shapes: Map<string, Shape>): { eases: Map<string, Ease>; heard: Map<string, Heard>; reported: Map<string, number> } {
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
    const { reports, ran, refused } = reportsByTrip(bundle, r.snapshot, lines, shapes, received[i - 1]?.snapshot);
    // A Train whose Block can't keep it, as TMB's ETA has the Block out of its first Station too early,
    // turns Scheduled at once and drops its Delay, as early as the Block's last report for it was: it
    // waits for a Block as one live data never placed does (#125, #152).
    for (const id of refused) if (!reports.has(id)) [heard, eases, dwelt].forEach((m) => m.delete(id));
    // A Train whose Block has gone on to run another Trip turns Scheduled at once too, rather than staying
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
      // How far off where live data has it a Train is drawn before it jumps there: a kilometre, or where its
      // positions have no age, so many seconds at its top speed.
      const jumpDist = Math.max(JUMP_DIST, (network.live?.snap ?? 0) * profile.topSpeed);
      const calls = dwelt.get(id) ?? withDwell(trip, profile);
      dwelt.set(id, calls);
      const [feed, first, second] = [r.snapshot.feeds[network.id], calls[0], calls[1]];
      const was = isLive(heard.get(id), feed, upTo);
      if (report) {
        // A report the fetcher kept from a feed's last good response is as old as that response.
        // ponytail: one by Train number, from Renfe's long-distance feed, goes by its Trip's
        // Network's feed, not its own, so it's Live only within three of that feed's updates, and
        // kept while its own feed fails, it never ages. Give such a report its own feed's freshness
        // if either shows (#261).
        const got = feed?.lastSuccess ?? NaN;
        heard.set(id, hear(heard.get(id), report, got, r, network.live, (given) => delayOf(trip, calls, shape, network, given, bundle.noonMinus12h), profile.topSpeed));
      }
      // A Train live data stops reporting keeps its last Delay until that's CARRY old.
      const said = recent(heard.get(id), upTo);
      const [live, carried] = [isLive(said, feed, upTo), said ? delayBy(said, upTo) : 0];
      // One of Renfe's that its reports have named at a Station for LONG_PIN stands there (#485), as FGC's
      // do (#39): drawn at it, its times as late as that, however far its Delay had it run on, until a
      // report has it elsewhere. Not at its Trip's last Station, where it has ended its run, and at its
      // first only held from leaving, as FGC's, each as it runs the Trip (cutTrip()). Its Delay goes on
      // as before once the pin ends.
      const stop = live && said && stands(said.pin, said.report) ? calls.findIndex((c) => c.station === said.pin?.station) : -1;
      const ran = stop >= 0 ? (cutsIn(bundle, r.snapshot).get(id)?.trip ?? trip).calls : [];
      const pinned = stop >= 0 && calls[stop]?.station !== ran.at(-1)?.station ? calls[stop] : undefined;
      const delay = pinned && pinned.station !== ran[0]?.station ? arrived - pinned.departure : carried;
      // Until live data first shifts it, a Train runs on its timetable, but for one of the Metro's that
      // waits for its Block (#125). It's in this snapshot, so its Network's feed has one of its Trains
      // in it: its live data is available where that feed works (#124).
      const drawn = ease ? eased(calls, profile, ease, arrived) : unshifted(calls, profile, arrived, linesByBlock(r.snapshot).includes(trip.line) && works(feed, upTo));
      const [there, dist] = [arrived - delay, (t: number) => place(calls, profile, t) ?? NaN];
      // Held at its first Station, or let out and still drawn behind, it eases out however far behind,
      // and jumps only where live data has it a long way on, or off its Trip (#107).
      const leaving = (ease?.hold !== undefined || !!ease?.leaving) && drawn < there;
      // A Live Metro Train out of its first Station stays out: TMB's ETA for a Block that has left the
      // end of its Line can move later again, as while it waited, and have it back at that Station, or
      // behind where the Train is drawn on its first stretch. It stands where it's drawn until its
      // Delay catches up, since it can't run back (ADR-0002), rather than jumping back (#125). Not one
      // live data places only now: its timetable had it out.
      const out = was && live && !!said?.report.block && !!first && !!second && drawn > first.departure && there < Math.min(drawn, second.arrival);
      // Short of its first Station, one leaving is drawn standing there (#105).
      const off = Math.abs(dist(leaving ? Math.max(drawn, first?.arrival ?? drawn) : drawn) - dist(there));
      const far = leaving ? !(off <= jumpDist) : !out && (Math.abs(drawn - there) > JUMP_TIME || off > jumpDist);
      const time = i === 0 || far ? there : drawn;
      // A Live Metro Train at its Trip's first Station stays there until a report has it gone, by its
      // Delay, when it was reported: TMB's ETA for a Block waiting at the end of its Line keeps moving
      // later, so one drawn leaving when an ETA said was drawn out on its track, where it can't run
      // back, or jumped back (#107). Not one already drawn out of that Station, as its timetable had it
      // before live data first placed it: holding it there would run it back.
      const held = live && said?.report.block && first && (said.report.at - bundle.noonMinus12h) / 1000 - delay <= first.departure && (i === 0 || far || time <= first.departure);
      eases.set(id, { at: arrived, time, delay, hold: held ? first.departure : pinned?.departure, leaving: !held && leaving && !far ? true : undefined });
    }
  }
  const reported = new Map<string, number>();
  for (const [id, said] of heard) {
    const network = lines.get(trips.get(id)?.line ?? '');
    if (network && said.own !== undefined && said.own > (reported.get(network.id) ?? -Infinity)) reported.set(network.id, said.own);
  }
  last = { bundle, received: [...received], clock, eases, heard, dwelt, reported };
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

/**
 * What a replay makes of a snapshot, for a bundle: its reports by the Trip each is about, the Trip each
 * of the Metro's Blocks in it runs, by blockOf(), the Trips their Blocks can't keep, as TMB's ETA
 * has each Block out of its Trip's first Station too early (#152), and where its Network's live data
 * lingers on Trips that ended, each Trip's report and the report before it of another time (#487).
 */
interface Matched {
  bundle: Bundle;
  reports: Map<string, Report>;
  ran: Map<string, string>;
  refused: Set<string>;
  moves: Map<string, [report: Report, earlier?: Report]>;
}

/**
 * What a replay makes of each snapshot, for a bundle, worked out once, as a replay first comes to it.
 * It's more than a cache: each Block goes on from the Trip it ran in the snapshot before it then, and
 * a report of a Trip that ended is judged against the Trip's report before it (#487), so a later replay
 * of the snapshots kept, with none before the oldest, matches their Blocks, and keeps those reports, as
 * the fold did only by going by this. Matching the Metro's Blocks to Trips is slow, too.
 * ponytail: a snapshot keeps what it first made of the one before it, whatever a later replay puts
 * there, and a Block goes on only from the snapshot just before, so one missing from that, or matched
 * to no Trip there, is matched afresh. Keep the Trip each Block last ran in the replay, beside
 * `heard`, if either matters.
 */
const matched = new WeakMap<Snapshot, Matched>();

/** A Block, as the matching knows it: by its Line and TMB's number for it, which another Line's can share. */
const blockOf = ({ line, number }: NonNullable<Report['block']>) => `${line} ${number}`;

/** Each bundle's Trips by their IDs as their operators name them, without the service day joinDays leads an earlier day's ID with: worked out once. */
const namedOf = new WeakMap<Bundle, Map<string, Trip[]>>();

/**
 * A bundle's Trips by their IDs as their operators name them, those of one ID on each of the days joined,
 * and each by the IDs of the Trips it was made one with (`joined`, #467) too.
 * ponytail: two reports in one snapshot that name a Train by two of its IDs are both about its Trip, and
 * the later in the snapshot is the one it has (reportsByTrip()). Renfe's Cercanías files list a Train by
 * the one Trip it runs (10 Oct 2026's recordings of 33527: R4's ID at 16:35, as it left Manresa, RL4's
 * from 17:57, past Tàrrega, and in none of their 980 snapshots two IDs of one R4 or RL4 Train number);
 * prefer the report that has a position if one ever lists both.
 */
export function namedIn(bundle: Bundle): Map<string, Trip[]> {
  const known = namedOf.get(bundle) ?? new Map<string, Trip[]>();
  if (!namedOf.has(bundle)) {
    for (const trip of bundle.trips) for (const id of [trip.id.replace(/^\d{4}-\d{2}-\d{2}\//, ''), ...(trip.joined ?? [])]) add(known, id, trip);
    namedOf.set(bundle, known);
  }
  return known;
}

/** Lists a Trip under a key, after those listed there already. */
const add = (to: Map<string, Trip[]>, key: string, trip: Trip) => to.set(key, [...(to.get(key) ?? []), trip]);

/**
 * A bundle's Trips by their Train numbers, where they have one, those of one number in any Network
 * and on each of the days joined: the Trips a report that names a Train by its number alone can be
 * about, of which the one whose timetable runs nearest when it was reported is (reportsByTrip()).
 */
export function numberedIn(bundle: Bundle): Map<string, Trip[]> {
  return bundle.trips.reduce((numbered, trip) => (trip.number ? add(numbered, trip.number, trip) : numbered), new Map<string, Trip[]>());
}

/**
 * How far apart when TMB expects a Block at its next Station and when a Trip's timetable has it there
 * can be for the Block to be running that Trip, in seconds: half an hour, well over half the longest
 * the Metro's timetable leaves between two Trains, 19 minutes. A Block further from every Trip, such
 * as one still running the night before, runs none of the day's.
 */
const MATCH = 30 * 60;

/**
 * How long before a Trip is due to leave its first Station a Block TMB has out of there already can
 * run it, in seconds. Before the Metro opens, TMB names Blocks out along their Lines with ETAs well
 * ahead of any Trip, and matched, they were drawn Live up to 9 km along Trips due 5–24 minutes later
 * (#146). By day TMB often has a Block leave the end of its Line 3–7 minutes before its Trip is due:
 * with 3 minutes here, those went undrawn a minute or two.
 * ponytail: one margin for every Line and hour, so before the Metro opens a Block up to 8 minutes
 * early is still drawn out along its Trip; give the night its own margin if that shows.
 */
const EARLY = 8 * 60;

/**
 * Whether a Block reported at a moment, in ms since 1970, and expected at a Station, can run a Trip:
 * not where that has it out of the Trip's first Station already, left as long before as the Trip's
 * timetable runs from there to that Station, while the Trip is due to leave there more than EARLY
 * later. One waiting at the end of its Line, expected at the Station after, hasn't left (#105).
 */
const canRun = (trip: Trip, next: NonNullable<Report['expected']>, reported: number, noonMinus12h: number) => {
  const [first, call] = [trip.calls[0], trip.calls.find((c) => c.station === next.station)];
  const [now, expected] = [reported, next.at].map((ms) => (ms - noonMinus12h) / 1000) as [number, number];
  return !first || !call || expected - (call.arrival - first.departure) >= now || first.departure - now <= EARLY;
};

/**
 * How long after its Trip ended, by its timetable, a report can still be about it, in seconds, where
 * its Network's live data lingers on Trips that ended, unless it puts the Train further along the Trip
 * than the Trip's report before it did (movedOn()). At 13:46 on 4 October 2026, Geotren named 12 rack
 * Trips that had ended 38 minutes to 5 hours before, standing near their Stations, and their Trains
 * were drawn Live, up to 5½ hours late, beside the two running (#232). A Train that moves along its
 * Trip is one running late, however late, as RL1's 15:52 from Lleida was on 7 October, which Geotren
 * named from 17:46 to 18:02, 88 to 104 minutes after it ended, as its Unit ran 12.2 km on along it at
 * the timetable's pace to Balaguer by 17:58 (#487).
 * ponytail: by the timetable and the Trip's report before. A report with none before it, as a Unit's
 * first, on a map just opened, or after a snapshot that lacked it, is dropped until the next of its
 * feed's updates shows the Train moving: up to 2 minutes, FGC's, or 5 while the fetcher slows it. A
 * Unit seen moving whose reports then have it standing for longer than an update, as at a crossing
 * loop, is drawn running on along its Trip on its last Delay meanwhile, and back once a report has it
 * moving again: 8 km on and 5 km back for 6 minutes standing, made up, though in October's recordings
 * a late Unit stood so only where its Trip ends. Keep a Trip's reports from when it's seen moving until
 * it arrives if that shows. A Unit running on along an ended Trip is taken for its Train, as no other
 * RL1 Trip was due where RL1's Unit ran: one named by an ended Trip while it ran a later Trip of its
 * Line the same way would be drawn twice, Scheduled on the later Trip and Live on the ended one, that
 * late. Check that no Trip of the Line is due there too if that shows. And a report whose Trip ended
 * less than this before it is kept, as Geotren's naming 652dc7e000 was at 13:46, 11 minutes after it
 * ended.
 */
const ENDED = 30 * 60;

/**
 * Whether a report puts a Train further along its Trip than an earlier one did, the way the Trip runs,
 * by more than MARGIN, a Station's reach: by its GPS or TRAM's distance, or at the Station it's near.
 * One standing hasn't: near the same Station, or at the same GPS, as Geotren repeats a standing Unit's
 * to the decimal. Of FGC's reports in October's ten recordings that came after another of their
 * Trip's, about 2 minutes on, 866 had the Train where it was, 83 further on within MARGIN, as coming
 * into or leaving a Station, and 4,054 further on than that (#487).
 */
function movedOn(trip: Trip, shape: Shape | undefined, earlier: Report, report: Report): boolean {
  const along = ({ position }: Report) => (!position || 'next' in position ? NaN : 'near' in position ? (trip.calls.find((c) => c.station === position.near)?.dist ?? NaN) : shape ? placedBy(trip.calls, shape, position)[0] : NaN);
  const way = Math.sign((trip.calls.at(-1)?.dist ?? 0) - (trip.calls[0]?.dist ?? 0));
  return (along(report) - along(earlier)) * way > MARGIN;
}

/** A day, in seconds. */
const DAY = 86_400;

/**
 * A snapshot's reports by the Trip each is about, the Trip each of the Metro's Blocks runs, and those they can't keep, given
 * the snapshot before it the first time a replay comes to it (`matched`). TMB's timetable names no
 * Blocks, so each of the Metro's keeps the Trip it ran in the snapshot before, where TMB reported it
 * there under FOLLOWS earlier, while that Trip, headed its way, still calls at the Station the Block
 * comes to next: matched afresh each time, a Block running about halfway between two Trips' times
 * moved from one to the other and back, and its Train jumped (#45). Each of the rest runs the Trip
 * on its Line headed its way that no Block keeps whose timetable has it at the Block's next Station
 * closest to when TMB expects it there, within MATCH, and where two come closest to one Trip, the
 * closer runs it. A Block neither keeps nor runs a Trip that TMB's ETA has it out of the first Station of
 * already, while that Trip is due to leave there more than EARLY after the report: unmatched, it
 * isn't drawn, and the Trip waits there Scheduled (#146), as one it ran does (`refused`, #152). A report that names a Line, as FGC's for
 * its rack Trains do, runs that Line's Trip whose trip_id ends as its own does, after the `|`. A
 * report naming a Trip that runs on more than one of the days joined is about the one whose
 * timetable runs nearest when it was reported, and so is one naming a Train number, as Renfe's
 * long-distance ones do, of the Trips with that number in any Network, but for one a report naming
 * it has: its Network's own feed goes first (#261). One naming a Trip whose timetable runs more than 12
 * hours from when it was reported, as Renfe names a Train running through midnight by the next day's
 * Trip from 00:00, is about its Line's Trip of that Train number, on the days joined, that runs nearest
 * then (#566). A report that matches no Trip is dropped, and so is one
 * whose Trip ended more than ENDED before it, where its Network's live data lingers on Trips that
 * ended, as FGC's does (#232), unless it puts the Train further along the Trip than the Trip's report
 * before it, of another time, did (movedOn(), #487).
 */
function reportsByTrip(bundle: Bundle, snapshot: Snapshot, lines: Map<string, Network | undefined>, shapes: Map<string, Shape>, before?: Snapshot): Matched {
  const known = matched.get(snapshot);
  if (known?.bundle === bundle) return known;
  const prior = before && matched.get(before);
  const [ran, earlierMoves] = prior?.bundle === bundle ? [prior.ran, prior.moves] : [new Map<string, string>(), new Map<string, [Report, Report?]>()];
  const [reports, offs, headed, named, numbered, kept] = [new Map<string, Report>(), new Map<string, number>(), new Map<string, Trip[]>(), namedIn(bundle), numberedIn(bundle), new Set<string>()];
  const [refused, moves] = [new Set<string>(), new Map<string, [Report, Report?]>()];
  for (const trip of bundle.trips) add(headed, `${trip.line} ${trip.headsign}`, trip);
  // The Metro's Blocks that don't keep their Trip, each with the Trips headed its way and its next Station.
  const rest: [Report, Trip[], NonNullable<Report['expected']>][] = [];
  for (const report of snapshot.reports) {
    const { block, headsign, position } = report;
    const end = report.line && report.trip?.split('|')[1];
    const candidates = end ? bundle.trips.filter((t) => t.line === report.line && t.id.endsWith(`|${end}`)) : report.trip ? (named.get(report.trip) ?? []) : (numbered.get(report.number ?? '') ?? []);
    const reported = (report.at - bundle.noonMinus12h) / 1000;
    const nearest = closest(candidates, reported);
    const trip = nearest?.number && apart(nearest, reported) > DAY / 2 ? closest((numbered.get(nearest.number) ?? []).filter((t) => t.line === nearest.line), reported) : nearest;
    const lingers = trip && lines.get(trip.line)?.live?.lingers;
    // Its Trip's report before it, of another time: Geotren's stays in each snapshot until FGC's next update.
    const [latest, previous] = (lingers && earlierMoves.get(trip.id)) || [];
    const earlier = latest?.at === report.at ? previous : latest;
    if (lingers) moves.set(trip.id, [report, earlier]);
    const lingering = lingers && reported - (trip.calls.at(-1)?.departure ?? Infinity) > ENDED && !(earlier && movedOn(trip, shapes.get(trip.shape), earlier, report));
    // A Train its Network's own feed reports by its Trip goes by that report, not one naming its Train number.
    const taken = trip && report.number && reports.get(trip.id)?.trip;
    if (trip && !lingering && !taken) reports.set(trip.id, report);
    if (!block || !position || !('next' in position)) continue;
    const [trips, id] = [headed.get(`${block.line} ${headsign}`) ?? [], ran.get(blockOf(block))];
    // Not after a gap in TMB's data, or in what the map received, as while its tab was hidden: by
    // then the Block may have run its Trip to the end and come back along it.
    const follows = id !== undefined && report.at - (prior?.reports.get(id)?.at ?? -Infinity) < FOLLOWS;
    const running = follows ? trips.find((t) => t.id === id && t.calls.some((c) => c.station === position.next.station)) : undefined;
    const keeps = running && canRun(running, position.next, report.at, bundle.noonMinus12h) ? running : undefined;
    if (running && !keeps) refused.add(running.id);
    if (!keeps) rest.push([report, trips, position.next]);
    else {
      reports.set(keeps.id, report);
      kept.add(keeps.id);
    }
  }
  for (const [report, trips, next] of rest) {
    let [found, off]: [string | undefined, number] = [undefined, MATCH];
    for (const trip of trips) {
      if (kept.has(trip.id) || !canRun(trip, next, report.at, bundle.noonMinus12h)) continue;
      const late = Math.abs(expectedDelay(trip, next, bundle.noonMinus12h) ?? Infinity);
      if (late < off) [found, off] = [trip.id, late];
    }
    if (found && off < (offs.get(found) ?? Infinity)) {
      reports.set(found, report);
      offs.set(found, off);
    }
  }
  const decided = { bundle, reports, ran: new Map([...reports].flatMap(([id, { block }]) => (block ? [[blockOf(block), id] as const] : []))), refused, moves };
  matched.set(snapshot, decided);
  return decided;
}

/** Of some Trips, as those of one ID on the days joined, the one whose timetable runs nearest a time, in seconds into the service day. */
function closest(trips: Trip[], time: number): Trip | undefined {
  return trips.reduce<Trip | undefined>((best, trip) => (!best || apart(trip, time) < apart(best, time) ? trip : best), undefined);
}

/** How far a time, in seconds into the service day, is from when a Trip's timetable runs, from its first Station to its last: none while it does. */
const apart = ({ calls }: Trip, time: number) => Math.max(0, (calls[0]?.arrival ?? Infinity) - time, time - (calls.at(-1)?.departure ?? -Infinity));

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
 * How long a Scheduled Metro Train waits at its Trip's first Station for its Block, past when its
 * timetable has it leave, in seconds: on #100's weekday morning, the latest TMB first listed a Block
 * for a Trip was 141 s after it was due to leave.
 */
const WAIT = 180;

/**
 * Where in its timetable a Train live data hasn't shifted is drawn at a moment, both in seconds into
 * the service day: where its timetable has it, or where it waits for its Block, as on a Line whose
 * live data names Blocks while that's available, at its Trip's first Station for up to WAIT past
 * when it's due to leave. Drawn leaving on time, it snapped back as its Block was first listed for
 * it, a minute or two late (#125). A report placing it takes over from where it's drawn. With none by
 * then, it leaves as late as it waited, and catches up with its timetable at up to line speed, as
 * eased() has a Train drawn behind do: run that late to the end, it was drawn 3 minutes back once the
 * snapshots that placed it had gone.
 * ponytail: it goes by the live data the map has now, not what it had as the Train was due to leave,
 * so on a map just opened one that left minutes before, which no Block has run yet, is drawn as if it
 * had waited, and one waiting or catching up snaps to its timetable and back as the Metro's live data
 * turns unavailable and available again. Keep the wait in the replay's eases if that shows.
 */
function unshifted(calls: Call[], profile: SpeedProfile, moment: number, waits: boolean): number {
  const [departure = moment, end = Infinity] = [calls[0]?.departure, calls.at(-1)?.departure];
  // Past its last Station however late it waited, it's off the map, as most of the day's Trips are.
  if (!waits || moment <= departure || moment - WAIT > end) return moment;
  return moment <= departure + WAIT ? departure : unheld(calls, profile, { at: departure + WAIT, time: departure, delay: 0 }, moment);
}

/**
 * The map's time, in ms since 1970, at a moment by the device's clock, given the snapshots received
 * by then: the fetcher's, which the map places Trains by, once the snapshots show how far the
 * device's clock is off (behind()), and until then the device's own.
 */
export function mapTime(at: number, received: Received[]): number {
  return at + behind(received);
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
 * puts it on its Trip's track, or how far along it TRAM has it, and otherwise, standing at or
 * pinned to a Station or with no position, its operator's figure, or how late it is where its
 * operator expects it at a Station, as TMB does at the one each of the Metro's comes to next,
 * though never so late that it's drawn short of the Station before that. One standing at a Station,
 * but where its Network's live data names a Station a Train may still be coming into or have left, as
 * Renfe's and TRAM's do, is drawn there when it was reported, but at its Trip's first Station only
 * held from leaving.
 */
function delayOf(trip: Trip, calls: Call[], shape: Shape, { profile, live }: Network, report: Report, noonMinus12h: number): OwnDelay {
  const known = delays.get(report);
  if (known?.trip === trip) return known;
  const [reported, { position }] = [(report.at - noonMinus12h) / 1000, report];
  let delay = report.delay ?? expectedDelay(trip, position && 'next' in position ? position.next : report.expected, noonMinus12h) ?? 0;
  // More than 12 hours off, it's a day off: from about 23:35, Renfe's figure for a Train running through
  // midnight is its Delay less a day, as on 6 October 2026 C4b 20520's −86,040 s at 23:59:50, 6 minutes
  // late, and an R2S's −77,520 s, 2 h 28 min late (#566).
  // ponytail: a day of 24 hours, so on a night the clocks change, if Renfe's day is then 23 or 25, it's
  // an hour off. Take the day from the days joined if that shows.
  if (Math.abs(delay) > DAY / 2) delay -= Math.sign(delay) * DAY;
  if (position && 'next' in position) {
    // It's no further back than the Station before the one it comes to next, however long it's held
    // short of that, as at the end of its Line. Short of its Trip's first Station, standing there as it
    // turns back, TMB's time is all there is to go by, and the map draws it standing there (onMap()).
    const i = calls.findIndex((c) => c.station === position.next.station);
    const before = calls[i - 1];
    if (before && i > 1) delay = Math.min(delay, reported - before.arrival);
  }
  if (position && 'near' in position && live?.near !== 'pinned') {
    // Standing at a Station, as Geotren has FGC's, it's there when it was reported, however long ago
    // the trip updates have it leave. Not Renfe's: it pins Trains coming into a Station too, and late.
    // Nor TRAM's: it names the stop a Train is at or has just left, and held there, a Train would stand
    // 40–80 s and then jump a whole stretch (#42). At its Trip's first Station it can stand long before
    // it leaves, off the map, so there it's only held from leaving.
    const i = calls.findIndex((c) => c.station === position.near);
    const call = calls[i];
    if (call) delay = Math.max(delay, reported - call.departure);
    if (call && i > 0) delay = Math.min(delay, reported - call.arrival);
  }
  if (position && ('lon' in position || 'along' in position)) {
    const [d, off] = placedBy(calls, shape, position);
    // A Train named by its Train number can be on a part of its run its Trip doesn't cover (#261).
    const passed = report.number && off > OFF_TRACK ? undefined : passing(calls, profile, d, reported - delay);
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

/**
 * How far along its Trip's shape a report puts a Train, in metres, by its GPS or by TRAM's distance, and
 * how far from that track its GPS is. TRAM counts from a Trip's first Station, whichever way along its
 * track the Trip runs.
 */
function placedBy(calls: Call[], shape: Shape, position: { lon: number; lat: number } | { along: number }): [d: number, off: number] {
  const dists = calls.map((c) => c.dist);
  const [first = 0, last = 0] = [dists[0], dists.at(-1)];
  return 'lon' in position ? nearest(shape, Math.min(...dists), Math.max(...dists), position) : [first + Math.sign(last - first) * position.along, 0];
}

/** How far along a shape the point of it nearest a position is, in metres, between two distances along it, and how far that point is from the position. */
function nearest({ coords, dist }: Shape, from: number, to: number, { lon, lat }: { lon: number; lat: number }): [d: number, metres: number] {
  const [p, kx]: [Point, number] = [[lon, lat], DEGREE * Math.cos((lat * Math.PI) / 180)];
  let [closest, found] = [Infinity, from];
  for (let i = 1; i < coords.length; i++) {
    const [a, b, start = 0, stop = 0] = [coords[i - 1], coords[i], dist[i - 1], dist[i]];
    if (!a || !b || stop < from || start > to) continue;
    const [t, metres] = closestOnSegment(a, b, p, kx);
    if (metres < closest) [closest, found] = [metres, start + t * (stop - start)];
  }
  return [Math.max(from, Math.min(to, found)), closest];
}

/**
 * How far from its Trip's track a Train's GPS can be, in metres, and still measure its Delay, where its
 * report names its Train number: Renfe's long-distance live data has a Train on any part of its run,
 * which its Trip may cover only some of. GPS nearest an end of the track measures none anyway, as for
 * Zaragoza's 18073, running on up to 8.7 km past Casetas at 14:59 on 10 October 2026. That day, GPS
 * nearest a point within the track was within 40 m of it, in 410 positions from 13:47 to 13:59 and
 * 14:54 to 15:00, or over 20 km off, in 81, as R16 18093's near Orpesa: it came nearest its Trip's
 * track short of L'Aldea, where the Trip had ended 77 minutes before, and drew it back there 83
 * minutes late (#261).
 */
const OFF_TRACK = 1000;

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
 * in metres. Beyond where its track starts or ends, as past Spain's border, a Train is off the map.
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
 * it makes them: each time it gets onto one, and when it leaves it, standing at a Station on one or
 * running along one, but not where it doesn't run, within a closed Closure (closedCalls(), #345).
 */
function whenWithin(calls: Call[], profile: SpeedProfile, stretches: [from: number, to: number][], shut?: ReturnType<typeof closedCalls>): [enters: number, leaves: number][] {
  return calls.flatMap((call, i): [number, number][] => {
    const next = calls[i + 1];
    const standing: [number, number][] = !shut?.at[i] && stretches.some(([from, to]) => from <= call.dist && call.dist <= to) ? [[call.arrival, call.departure]] : [];
    if (!next || shut?.after[i]) return standing;
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
