// The fetcher step: each run's raw responses in, the live snapshot out (ADR-0003). It's pure, so
// the Worker around it stays thin and tests replay recorded responses through it. It never loads
// timetable data: matching reports to Trips is the engine's work.

import { PbfReader } from 'pbf';
import type { Freshness, Report, Snapshot } from '../bundle.ts';

/** How often the fetcher runs, in ms. */
export const EVERY = 20_000;

/** How long the Worker waits for an answer to a request before it gives up, in ms. */
export const TIMEOUT = 10_000;

/**
 * How often FGC is fetched, in ms: every 2 minutes, about as often as FGC updates its live data, or
 * every 5 while its API has fewer than 1,000 requests left today. The API allows 5,000 a day to each
 * IP, and others on Cloudflare's IPs may share them.
 */
const [FGC_EVERY, FGC_SLOW, FGC_FEW] = [120_000, 300_000, 1000];

/** A day in ms. FGC's API counts its requests by day in UTC. */
const DAY = 86_400_000;

/** A live feed, by the Network whose Trains it reports. */
export type Feed = 'rodalies' | 'fgc' | 'tram';

/** TRAM's two halves, Trambaix and Trambesòs, as its timetable's feeds name them. */
const HALVES = ['TBX', 'TBS'] as const;
type Half = (typeof HALVES)[number];

/** What one request got back: its HTTP status, its body, and how many requests its API has left today where it says; or why it got nothing. */
export type Fetched<Body = string> = { status: number; body: Body; remaining?: number } | { error: string };

/** This run's raw responses, for each feed that was due. */
export interface Responses {
  /** Renfe's Cercanías vehicle positions and trip updates, as JSON. */
  rodalies?: { positions: Fetched; updates: Fetched };
  /** FGC's positions from Geotren, as JSON, and its trip updates, as GTFS-RT; and where the run looked up the trip-updates file, if it had to. */
  fgc?: { positions: Fetched; updates: Fetched<Uint8Array>; lookup?: Fetched };
  /**
   * For each of TRAM's halves, where its Units are, from activevehicles, as JSON, and its trip updates,
   * as GTFS-RT, which name the Trip each Unit runs; and the access token the run asked for, if it had to.
   */
  tram?: { token?: Fetched } & Record<Half, { positions: Fetched; updates: Fetched<Uint8Array> }>;
}

/** What the step keeps between runs: each feed's freshness, its reports from the last run it worked, and what fetching FGC and TRAM needs. */
export interface State {
  feeds: Record<string, Freshness>;
  reports: Record<string, Report[]>;
  fgc?: {
    /** Where its trip-updates file is, until it has to be looked up again. */
    file?: string;
    /** When FGC last wrote the file, in seconds since 1970. */
    written?: number;
    /** The time the file stayed at even as it was looked up again: it isn't looked up again until FGC writes it again. */
    stalled?: number;
    /** How many requests its API had left today, as its last answers said. */
    remaining?: number;
  };
  /** TRAM's access token, and when it runs out, in ms since 1970, until a run has to ask for another. */
  tram?: { token: string; expires: number };
}

/** What the fetcher stores between runs: the step's state, and the feeds due on the next run. */
export interface Stored {
  state: State;
  due: Feed[];
}

/** What the fetcher starts from. */
export const START: Stored = { state: { feeds: {}, reports: {} }, due: ['rodalies', 'fgc', 'tram'] };

/**
 * One run: the stored state, this run's raw responses and the time now (ms since 1970) go in; the
 * snapshot, the next stored state and the feeds due on the next run come out.
 */
export function step(state: State, responses: Responses, now: number): Stored & { snapshot: Snapshot } {
  // A response that fails never replaces the last good one: that feed's reports stay as they were.
  const [feeds, reports] = [{ ...state.feeds }, { ...state.reports }];
  /** Reads a feed's reports from this run's responses where they can be, and gives its freshness after this try. */
  const refresh = (feed: Feed, every: number, reported: () => Report[]): Freshness => {
    let freshness: Freshness;
    try {
      reports[feed] = reported();
      freshness = { lastSuccess: now, lastAttempt: now, status: 'ok', every };
    } catch (error) {
      freshness = { ...feeds[feed], lastAttempt: now, status: (error as Error).message, every };
    }
    return (feeds[feed] = freshness);
  };
  let fgc = state.fgc;
  if (responses.rodalies) {
    const { positions, updates } = responses.rodalies;
    refresh('rodalies', EVERY, () => rodalies(read('vehicle_positions', positions), read('trip_updates', updates)));
  }
  if (responses.fgc) {
    const { positions, updates, lookup } = responses.fgc;
    const tripUpdates = readTripUpdates(state.fgc, updates, lookup);
    // Where no answer says how many requests are left, the last count holds until 00:00 UTC.
    const remaining = requestsLeft([lookup, positions, updates]) ?? leftToday(state, now);
    fgc = { ...tripUpdates.fgc, remaining };
    // With none left, its Trains were last placed as often as before, and it isn't tried again.
    const every = remaining === 0 ? (state.feeds.fgc?.every ?? FGC_EVERY) : fgcEvery(remaining);
    const freshness = refresh('fgc', every, () => {
      const trains = read<Geotren>('geotren', positions);
      if (!tripUpdates.feed) throw tripUpdates.error;
      return fgcReports(trains, tripUpdates.feed);
    });
    if (remaining === 0) freshness.status = 'no requests left until 00:00 UTC';
  }
  // A token the run asked for replaces the last, or where TRAM didn't issue one, the next run asks again.
  let tram = responses.tram?.token ? undefined : state.tram;
  if (responses.tram) {
    const { token, ...halves } = responses.tram;
    refresh('tram', EVERY, () => {
      if (token) tram = issued(token, now);
      return HALVES.flatMap((half) => tramReports(half, halves[half], now));
    });
    // The token is kept for as long as it lasts through the next run's answers, and TRAM accepts it.
    const refused = HALVES.some((half) => [halves[half].positions, halves[half].updates].some((f) => 'status' in f && f.status === 401));
    if (refused || (tram && tram.expires < now + EVERY + TIMEOUT)) tram = undefined;
  }
  const next: State = { feeds, reports, fgc, tram };
  const due: Feed[] = ['rodalies', 'tram'];
  if (fgcDue(next, now + EVERY)) due.push('fgc');
  return { snapshot: { generated: now, feeds, reports: Object.values(reports).flat() }, state: next, due };
}

/**
 * Whether FGC is due on the run at a moment: every 2 minutes, or 5 while its API has few requests
 * left today, and while it has none, not until its quota resets at 00:00 UTC.
 */
function fgcDue(state: State, at: number): boolean {
  const tried = state.feeds.fgc?.lastAttempt;
  if (tried === undefined) return true;
  const left = leftToday(state, at);
  // On the run nearest its time: runs come about EVERY apart, each ending when its slowest answer comes.
  return left !== 0 && at - tried > fgcEvery(left) - EVERY / 2;
}

/** How many requests FGC's API has left on the day of a moment, as its last answers said: its quota resets at 00:00 UTC. */
function leftToday({ feeds, fgc }: State, at: number): number | undefined {
  const tried = feeds.fgc?.lastAttempt;
  return tried !== undefined && Math.floor(tried / DAY) === Math.floor(at / DAY) ? fgc?.remaining : undefined;
}

/** How often FGC is fetched while its API has so many requests left today, in ms. */
const fgcEvery = (left: number | undefined) => (left !== undefined && left < FGC_FEW ? FGC_SLOW : FGC_EVERY);

/** How many requests an API has left today, by the fewest its answers say. */
function requestsLeft(answers: (Fetched<unknown> | undefined)[]): number | undefined {
  const counts = answers.flatMap((a) => (a && 'status' in a && a.remaining !== undefined ? [a.remaining] : []));
  return counts.length ? Math.min(...counts) : undefined;
}

/** A response's body, or an error that says why there's none to read. */
function body<Body extends string | Uint8Array>(file: string, fetched: Fetched<Body>): Body {
  if ('error' in fetched) throw new Error(`${file}: ${fetched.error}`);
  if (fetched.status !== 200) throw new Error(`${file}: HTTP ${fetched.status}`);
  if (typeof fetched.body === 'string' ? !fetched.body.trim() : !fetched.body.length) throw new Error(`${file}: empty`);
  return fetched.body;
}

/** One of a feed's JSON files, read from its response, or an error that says why it can't be. */
function read<T>(file: string, fetched: Fetched): T {
  const text = body(file, fetched);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${file}: not JSON`);
  }
}

/** GTFS-RT as Renfe's JSON has it, with times in seconds since 1970: the parts the step reads. */
interface GtfsRt {
  header: { timestamp: string };
  entity?: { vehicle?: Vehicle; tripUpdate?: { trip?: { tripId?: string; scheduleRelationship?: string }; delay?: number } }[];
}

interface Vehicle {
  trip?: { tripId?: string };
  position?: { latitude: number; longitude: number };
  currentStatus?: 'INCOMING_AT' | 'STOPPED_AT' | 'IN_TRANSIT_TO';
  stopId?: string;
  timestamp?: string;
}

/**
 * Rodalies' Trains from Renfe's Cercanías feeds, which cover every núcleo: Rodalies' Trips' IDs
 * start with its own, 51. Each Train gets one report, with its Delay from its trip update, and its
 * position from the vehicle positions.
 */
function rodalies(positions: GtfsRt, updates: GtfsRt): Report[] {
  const reports = new Map<string, Report>();
  // Renfe's timetable pads its IDs with spaces, and untrimmed they don't join.
  for (const { tripUpdate: update } of updates.entity ?? []) {
    const id = update?.trip?.tripId?.trim() ?? '';
    if (!id.startsWith('51')) continue;
    const cancelled = update?.trip?.scheduleRelationship === 'CANCELED' || undefined;
    // Renfe's trip updates carry no time of their own, only the feed's.
    reports.set(id, { trip: `rodalies:${id}`, at: ms(updates.header.timestamp), delay: update?.delay, cancelled });
  }
  for (const { vehicle } of positions.entity ?? []) {
    const id = vehicle?.trip?.tripId?.trim() ?? '';
    if (id.startsWith('51')) reports.set(id, { ...reports.get(id), trip: `rodalies:${id}`, at: ms(vehicle?.timestamp), position: position(vehicle ?? {}) });
  }
  return [...reports.values()];
}

/**
 * Where a Train is, in Renfe's own terms: its GPS while it runs between Stations, and otherwise
 * only at or near the Station it stands at or is coming into, since Renfe pins those to the
 * Station's coordinates (ADR-0002). Renfe gives a stop it doesn't know as 00000.
 */
function position(vehicle: Vehicle): Report['position'] {
  const { currentStatus, position: gps } = vehicle;
  if (currentStatus === 'IN_TRANSIT_TO') return gps && { lon: gps.longitude, lat: gps.latitude };
  const stop = vehicle.stopId?.trim();
  return stop && stop !== '00000' ? { near: `adif:${stop}` } : undefined;
}

const ms = (seconds: string | undefined) => Number(seconds) * 1000;

/** Geotren's records, as the Worker asks for them: each Train's Trip, where it is, the Station it stands at, its Unit type, and when FGC last updated them. */
interface Geotren {
  results?: { id: string; geo_point_2d?: { lon: number; lat: number } | null; estacionat_a?: string | null; tipus_unitat?: string | null; record_timestamp: string }[];
}

/**
 * A feed of trip updates, as FGC and TRAM publish them: when it was written, in seconds since 1970,
 * and for each Trip, when it was updated, the Unit running it where it says, and the first stop it
 * gives a time for, by its platform, such as FGC's PC1, with when the Train is expected there.
 */
interface TripUpdates {
  written: number;
  trips: { id: string; updated?: number; unit?: string; platform?: string; expected?: number }[];
}

/**
 * FGC's Trains from Geotren and its trip updates, which both name each by its Trip. Each gets one
 * report: from Geotren, where it is and its Unit type, as of when FGC last updated Geotren, and
 * from its trip update, when FGC expects it at the Station it stands at or comes to next.
 */
function fgcReports(positions: Geotren, updates: TripUpdates): Report[] {
  const reports = new Map<string, Report>();
  for (const { id, updated, platform, expected } of updates.trips) {
    // A platform is named for its Station, such as PC1 at Plaça Catalunya (PC): the Station's code, then the platform's number.
    const station = platform?.replace(/\d+$/, '');
    reports.set(id, { trip: `fgc:${id}`, at: (updated ?? updates.written) * 1000, expected: station && expected ? { station: `fgc:${station}`, at: expected * 1000 } : undefined });
  }
  for (const { id, geo_point_2d: gps, estacionat_a: standing, tipus_unitat: unitType, record_timestamp } of positions.results ?? []) {
    // Its Delay is measured from when it was where Geotren has it.
    const at = Date.parse(record_timestamp);
    if (Number.isNaN(at)) throw new Error('geotren: no record_timestamp');
    // One standing at a Station is only there, as Renfe's are (ADR-0002).
    const position = standing ? { near: `fgc:${standing}` } : gps ? { lon: gps.lon, lat: gps.lat } : undefined;
    reports.set(id, { ...reports.get(id), trip: `fgc:${id}`, at, position, unitType: unitType || undefined });
  }
  return [...reports.values()];
}

/**
 * FGC's trip updates, read from this refresh's download, and where the file is for the next refresh:
 * where this one found it, unless its download failed, or FGC wrote it no later than last time, since
 * it may have moved. Then it's looked up again, though not twice while the file stays at one time.
 */
function readTripUpdates(fgc: State['fgc'] = {}, updates: Fetched<Uint8Array>, lookup: Fetched | undefined): { fgc: NonNullable<State['fgc']>; feed?: TripUpdates; error?: unknown } {
  let feed: TripUpdates;
  try {
    feed = gtfsRt('trip_updates', updates);
  } catch (error) {
    return { fgc: { ...fgc, file: undefined }, error };
  }
  const stopped = feed.written <= (fgc.written ?? -Infinity);
  const stalled = stopped && lookup ? feed.written : fgc.stalled;
  const file = stopped && stalled !== feed.written ? undefined : lookup ? address(lookup) : fgc.file;
  return { fgc: { ...fgc, file, written: Math.max(feed.written, fgc.written ?? -Infinity), stalled }, feed };
}

/** Where FGC's trip-updates file is, as its lookup found it. */
export function address(lookup: Fetched): string | undefined {
  try {
    return read<{ results?: { file?: { url?: string } }[] }>('lookup', lookup).results?.[0]?.file?.url;
  } catch {
    return undefined;
  }
}

/** The access token TRAM issued in answer to a request for one, if it did. */
export function accessToken(answer: Fetched): string | undefined {
  try {
    return issued(answer, 0).token;
  } catch {
    return undefined;
  }
}

/** The access token TRAM issued a run that asked for one, and when it runs out, in ms since 1970, or an error that says why there's none. */
function issued(answer: Fetched, now: number): NonNullable<State['tram']> {
  const { access_token: token, expires_in: lasts } = read<{ access_token?: string; expires_in?: number } | null>('token', answer) ?? {};
  if (!token || !lasts) throw new Error('token: none issued');
  return { token, expires: now + lasts * 1000 };
}

/**
 * One of TRAM's Units, as its activevehicles has it: the parts the step reads. Its line is 0 while
 * it's out of service. Its position is how far its Train has come since its Trip's first Station, in
 * metres, and 0 while it stands at a Station: the one it's at or has just left, by TRAM's number for
 * the platform. Its delay is in seconds, early where it's negative.
 */
interface ActiveVehicle {
  vehicleId: number;
  lineName: string;
  originStopCode: number;
  vehiclePosition: number;
  delay: number;
}

/**
 * The Trains one of TRAM's halves has in service, from where it has its Units and its trip updates,
 * which name the Trip each Unit runs. A Train whose Trip they don't name, as before it starts, gets
 * no report. Each report is as of the run, since TRAM's figures carry no time of their own.
 */
function tramReports(half: Half, { positions, updates }: NonNullable<Responses['tram']>[Half], now: number): Report[] {
  const trips = new Map(gtfsRt(`${half} gtfsrealtime`, updates).trips.map((t) => [t.unit, t.id]));
  const units = read<ActiveVehicle[]>(`${half} activevehicles`, positions);
  if (!Array.isArray(units)) throw new Error(`${half} activevehicles: not a list`);
  return units.flatMap(({ vehicleId, lineName, originStopCode, vehiclePosition, delay }) => {
    const trip = trips.get(String(vehicleId));
    const position = vehiclePosition ? { along: vehiclePosition } : { near: `tram:${originStopCode}` };
    return trip && lineName !== '0' ? [{ trip: `tram:${half}:${trip}`, at: now, position, delay }] : [];
  });
}

/**
 * The parts of a GTFS-RT feed of trip updates the step reads, from its protocol buffers in a response:
 * its header's time, and each trip update's Trip, time, Unit and first stop with a time (field
 * numbers as GTFS-RT's). Or an error that says why it can't be read.
 */
function gtfsRt(file: string, fetched: Fetched<Uint8Array>): TripUpdates {
  const bytes = body(file, fetched);
  try {
    return new PbfReader(bytes).readFields(feedMessage, { written: 0, trips: [] });
  } catch {
    throw new Error(`${file}: not GTFS-RT`);
  }
}

function feedMessage(field: number, feed: TripUpdates, pbf: PbfReader) {
  if (field === 1) feed.written = pbf.readMessage((field, header: { timestamp: number }) => {
    if (field === 3) header.timestamp = pbf.readVarint();
  }, { timestamp: 0 }).timestamp;
  if (field === 2) pbf.readMessage((field) => {
    if (field === 3) feed.trips.push(pbf.readMessage(tripUpdate, { id: '' }));
  }, null);
}

function tripUpdate(field: number, update: TripUpdates['trips'][number], pbf: PbfReader) {
  if (field === 1) update.id = pbf.readMessage((field, trip: { id: string }) => {
    if (field === 1) trip.id = pbf.readString();
  }, { id: '' }).id;
  if (field === 4) update.updated = pbf.readVarint();
  if (field === 3) update.unit = pbf.readMessage((field, vehicle: { id?: string }) => {
    if (field === 1) vehicle.id = pbf.readString();
  }, {}).id;
  if (field === 2 && !update.expected) {
    const stop = pbf.readMessage<Stop>(stopTimeUpdate, {});
    if (stop.time) [update.platform, update.expected] = [stop.platform, stop.time];
  }
}

/** A stop, by its platform, and when the Train is expected there, in seconds since 1970: at its arrival, or where it gives none, its departure. */
type Stop = { platform?: string; time?: number };

function stopTimeUpdate(field: number, stop: Stop, pbf: PbfReader) {
  if (field === 4) stop.platform = pbf.readString();
  if ((field === 2 || field === 3) && !stop.time) stop.time = pbf.readMessage((field, event: { time?: number }) => {
    if (field === 2) event.time = pbf.readVarint(true);
  }, {}).time;
}
