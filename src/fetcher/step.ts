// The fetcher step: each run's raw responses in, the live snapshot out (ADR-0003). Each live source in
// src/networks.ts is fetched and read by the adapter for its format, which keeps what that format needs
// from one run to the next. The step keeps what's common to them all: each source's freshness, its
// last good reports, the check for files that have stopped updating, and the snapshot. The step is
// pure, and the adapters make their requests through the Worker's `get`, so the Worker around them
// stays thin and tests replay recorded responses through the step. It never loads timetable data:
// matching reports to Trips is the engine's work.

import { PbfReader } from 'pbf';
import type { Freshness, Report, Skipped, Snapshot } from '../bundle.ts';
import { LIVE_SOURCES, type LiveSource } from '../networks.ts';

/** How often the fetcher runs, in ms. */
export const EVERY = 20_000;

/** How long the Worker waits for an answer to a request before it gives up, in ms. */
export const TIMEOUT = 10_000;

/** Why a source wasn't fetched, where the Worker hasn't every secret its config names: it asks it for nothing. */
export const UNSET = 'its credentials are not set';

/** What one request got back: its HTTP status, its body, and how many requests its API has left today where it says; or why it got nothing. */
export type Fetched<Body = string> = { status: number; body: Body; remaining?: number } | { error: string };

/** One request, as the Worker makes it, with its answer's body read by `asText` or `asBytes`. */
export type Get = <Body>(url: string, read: (res: Response) => Promise<Body>, init?: RequestInit) => Promise<Fetched<Body>>;

/** An answer's body as text, as JSON comes. */
const asText = (res: Response) => res.text();
/** An answer's body as bytes, as GTFS-RT's protocol buffers come. */
const asBytes = async (res: Response) => new Uint8Array(await res.arrayBuffer());

/** This run's raw responses, for each source that was due, by its ID: what its adapter fetched. */
export type Responses = Record<string, unknown>;

/**
 * How the fetcher reads one format of live data: what a source of that format is asked for on a run,
 * what its answers say, and when it waits. What the adapter keeps from one run to the next is its own:
 * the step only stores it.
 */
interface LiveAdapter<Source extends LiveSource, Answers, Own = undefined> {
  /** This run's requests, with the secrets the source's config names, where every one is set. */
  fetch(given: Given<Source, Own> & { secrets: Record<string, string> | undefined; get: Get }): Promise<Answers>;
  /** What this run's answers say, given the source's freshness after its last try. */
  read(answers: Answers, given: Given<Source, Own> & { last: Freshness | undefined; now: number }): Reading<Own>;
  /** Whether the adapter holds the source back from the run at a moment, though its `every` makes it due, given its freshness after this run. */
  held?(given: Given<Source, Own> & { last: Freshness | undefined; at: number }): boolean;
  /** The Stations its Trips won't stop at, as the snapshot carries them, from what it keeps: Renfe's (#346). */
  skipped?(own: Own | undefined): Skipped[];
}

/** A source of one format. */
type SourceOf<Format extends LiveSource['format']> = Extract<LiveSource, { format: Format }>;

/** A source, and what its adapter kept from the last run that fetched it. */
interface Given<Source extends LiveSource, Own> {
  source: Source;
  own: Own | undefined;
}

/** What a source's answers say. */
interface Reading<Own> {
  /** Its Trains' reports, saying when each of its files was last updated where it says; or an error that says why they can't be read. */
  reports(said: (file: string, at: number) => void): Report[];
  /** What its adapter keeps until the next run that fetches it, whether or not its reports could be read. */
  own?: Own;
  /** How often it's fetched now, where its adapter has slowed it down. */
  every?: number;
  /** Its status after this try, from the one the step gives it, where its adapter has more to say. */
  status?(status: string): string;
}

/** What the step keeps between runs, for each live source, by its ID. */
export interface State {
  /** Its freshness after its last try, which the snapshot gives as each Network's the source feeds. */
  freshness: Record<string, Freshness>;
  /** Its reports from the last run it worked. */
  reports: Record<string, Report[]>;
  /**
   * When its files said on the last try that they were last updated, in ms since 1970, by the file's
   * name in its statuses: Renfe's headers, Geotren's `record_timestamp` and TRAM's trip updates'
   * headers. A try that finds one unchanged is a failed one, as the source has stopped updating.
   */
  updated?: Record<string, Record<string, number>>;
  /** What its adapter keeps, such as where FGC's trip-updates file is, or TRAM's access token. */
  own?: Record<string, unknown>;
  /** How many runs have passed since it was last fetched, which its `every` counts: none where it never was. */
  waited?: Record<string, number>;
  /**
   * For a source that feeds several Networks, how many of its tries in a row that worked each of them
   * has been missing from, by the Network's ID: while its last reports are kept, and on the try that
   * drops them, the one after KEEP_MISSING.
   */
  missing?: Record<string, Record<string, number>>;
}

/**
 * How many tries in a row that work keep the last reports of a Network whose Trains have all vanished
 * from its source's answers, where that source feeds several Networks: Renfe's Cercanías files drop all
 * of Madrid's now and then, with a fresh header and every other núcleo's Trains, in 15 of 154 fetches
 * on the morning of 5 October 2026, never more than two in a row (#248). A source that feeds one
 * Network can't drop it without dropping all its Trains, which the map tells on its own (#124).
 */
const KEEP_MISSING = 2;

/** What the fetcher stores between runs: the step's state, and the sources due on the next run, by their IDs. */
export interface Stored {
  state: State;
  due: string[];
}

/** What the fetcher starts from: every source is due. */
export const START: Stored = { state: { freshness: {}, reports: {} }, due: LIVE_SOURCES.map((s) => s.id) };

/**
 * This run's raw responses from each source that's due, by its ID, fetched by its adapter with the
 * secrets its config names, which the Worker gives by name.
 */
export async function fetchDue({ state, due }: Stored, secret: (name: string) => string | undefined, get: Get): Promise<Responses> {
  const asked = LIVE_SOURCES.filter((source) => due.includes(source.id)).map(async (source) => {
    const named = Object.entries(source.secrets ?? {});
    const set = named.flatMap(([param, name]) => {
      const value = secret(name);
      return value ? [[param, value] as const] : [];
    });
    const secrets = set.length === named.length ? Object.fromEntries(set) : undefined;
    return [source.id, await adapterOf(source).fetch({ source, own: state.own?.[source.id], secrets, get })] as const;
  });
  return Object.fromEntries(await Promise.all(asked));
}

/**
 * One run: the stored state, this run's raw responses and the time now (ms since 1970) go in; the
 * snapshot, the next stored state, the sources due on the next run, and what this run's tries that
 * worked found missing come out.
 */
export function step(state: State, responses: Responses, now: number, sources = LIVE_SOURCES): Stored & { snapshot: Snapshot; missed: Record<string, Record<string, number>> } {
  const next: Required<State> = { freshness: {}, reports: {}, updated: {}, own: {}, waited: {}, missing: {} };
  // Each source's Networks this run's tries that worked found missing, as State's `missing` counts them, for the Worker's logs.
  const missed: Record<string, Record<string, number>> = {};
  // How fresh each Network's live data is: as fresh as the source that feeds it.
  const feeds: Record<string, Freshness> = {};
  const due: string[] = [];
  for (const source of sources) {
    const { id } = source;
    const adapter = adapterOf(source);
    const fetched = responses[id] !== undefined;
    // A source not fetched this run, or whose answers fail, keeps its last good reports.
    let [freshness, reports, updated, own, missing] = [state.freshness[id], state.reports[id], state.updated?.[id], state.own?.[id], state.missing?.[id]];
    if (fetched) {
      const last = freshness;
      const reading = adapter.read(responses[id], { source, own, last, now });
      const every = reading.every ?? source.every;
      own = reading.own;
      try {
        const said: [string, number][] = [];
        // A file that gives no time, or none that can be read, can't say it's stuck.
        const got = reading.reports((file, at) => {
          if (at > 0) said.push([file, at]);
        });
        // Only once every file is read, so a file that can't be read says so first.
        const before = updated ?? {};
        updated = { ...before, ...Object.fromEntries(said) };
        // Only a time unchanged since the last try is stuck: one earlier, as from a server whose clock is behind, is news.
        const stuck = said.find(([file, at]) => at === before[file]);
        if (stuck) throw new Error(`${stuck[0]}: not updated since ${clock(stuck[1])}`);
        ({ reports, missing } = keepMissing(source, got, reports, missing));
        if (Object.keys(missing).length) missed[id] = missing;
        freshness = { lastSuccess: now, lastAttempt: now, status: 'ok', every };
      } catch (error) {
        freshness = { ...last, lastAttempt: now, status: (error as Error).message, every };
      }
      if (reading.status) freshness.status = reading.status(freshness.status);
    }
    if (freshness) {
      next.freshness[id] = freshness;
      for (const network of Object.values(source.networks)) feeds[network] = freshness;
    }
    if (reports) next.reports[id] = reports;
    if (missing && Object.keys(missing).length) next.missing[id] = missing;
    if (updated) next.updated[id] = updated;
    if (own !== undefined) next.own[id] = own;
    const waitedBefore = state.waited?.[id];
    const waited = fetched ? 0 : waitedBefore === undefined ? undefined : waitedBefore + 1;
    if (waited !== undefined) next.waited[id] = waited;
    // Due once the runs since it was last fetched add up to how often it's fetched, unless its adapter holds it back.
    if (onTime(waited, freshness?.every ?? source.every) && !adapter.held?.({ source, own, last: freshness, at: now + EVERY })) due.push(id);
  }
  const skipped = sources.flatMap((s) => adapterOf(s).skipped?.(next.own[s.id]) ?? []);
  return { snapshot: { generated: now, feeds, reports: sources.flatMap((s) => next.reports[s.id] ?? []), ...(skipped.length ? { skipped } : {}) }, state: next, due, missed };
}

/**
 * Whether what's fetched this often is due on the next run, given how many runs have passed since it
 * was last fetched: none where it never was. Counted in runs, not in time, as a run's `now` comes up
 * to TIMEOUT after it starts.
 */
export const onTime = (waited: number | undefined, every: number) => waited === undefined || (waited + 1) * EVERY >= every;

/**
 * The adapter that reads a source's format, typed for any source and any answers: the step gives each
 * adapter only sources of its own format, and the answers its own `fetch` made.
 */
function adapterOf(source: LiveSource): LiveAdapter<LiveSource, unknown, unknown> {
  return ADAPTERS[source.format];
}

/**
 * A source's reports from answers that worked, keeping the last reports of each of its Networks that
 * has vanished from them for KEEP_MISSING tries, where it feeds several, and how many tries in a row
 * each has been missing from.
 */
function keepMissing(source: LiveSource, got: Report[], last: Report[] = [], missing: Record<string, number> = {}): { reports: Report[]; missing: Record<string, number> } {
  const [reports, still]: [Report[], Record<string, number>] = [[...got], {}];
  const networks = new Set(Object.values(source.networks));
  for (const network of networks.size > 1 ? networks : []) {
    const ofIt = (r: Report) => reportedNetwork(r) === network;
    if (got.some(ofIt)) continue;
    const tries = (missing[network] ?? 0) + 1;
    const kept = last.filter(ofIt);
    // Counted until the try that drops its last reports, the one after KEEP_MISSING. One that had no
    // Trains in the last answers either has none to keep.
    if (tries > KEEP_MISSING + 1 || (tries === 1 && !kept.length)) continue;
    still[network] = tries;
    if (tries <= KEEP_MISSING) reports.push(...kept);
  }
  return { reports, missing: still };
}

/** The Network a report is of, as its adapter named the Trip or Block it reports. */
const reportedNetwork = (report: Report) => (report.trip ?? report.block?.line ?? '').split(':')[0];

/** The Network a source's Train is, by the longest start of the ID the source gives it that the source's config names. */
export function networkOf({ networks }: LiveSource, id: string): string | undefined {
  return Object.entries(networks).sort(([a], [b]) => b.length - a.length).find(([start]) => id.startsWith(start))?.[1];
}

/** A response's body, or an error that says why there's none to read. */
function body<Body extends string | Uint8Array>(file: string, fetched: Fetched<Body>): Body {
  if ('error' in fetched) throw new Error(`${file}: ${fetched.error}`);
  if (fetched.status !== 200) throw new Error(`${file}: HTTP ${fetched.status}`);
  if (typeof fetched.body === 'string' ? !fetched.body.trim() : !fetched.body.length) throw new Error(`${file}: empty`);
  return fetched.body;
}

/** One of a source's JSON files, read from its response, or an error that says why it can't be. */
export function json<T>(file: string, fetched: Fetched): T {
  const text = body(file, fetched);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${file}: not JSON`);
  }
}

/** A time GTFS-RT gives in seconds since 1970, in ms. */
export const ms = (seconds: string | number | undefined) => Number(seconds) * 1000;

/** A moment's time of day in UTC, such as 09:12:40 UTC. */
const clock = (moment: number) => `${new Date(moment).toISOString().slice(11, 19)} UTC`;

/** Renfe's live data, as JSON: its vehicle positions and its trip updates. */
export interface RenfeResponses {
  positions: Fetched;
  updates: Fetched;
}

/**
 * What Renfe's adapter keeps from one run to the next: each Trip's skipped Stations, by the Trip as
 * the bundle names it, when Renfe first said so of any, and when it last listed the Trip, in ms since 1970 (#346).
 */
type RenfeOwn = Record<string, Omit<Skipped, 'trip'> & { listed: number }>;

/**
 * How long Renfe's adapter keeps a Trip's skipped Stations after Renfe last listed the Trip, in ms.
 * Renfe drops a Trip once its Train has ended its run, though its timetable runs on: on 7 October
 * 2026 it dropped the R4 cut short at Sants at 13:05, while its timetable ran to Manresa until 13:57.
 * The R4's Trips run for 3 hours end to end, and Cercanías Madrid's longest for 2.
 * ponytail: R15's to Ascó run for 3 h 34 min, so one cut short in its first half hour could come back,
 * Scheduled, before its timetable ends. Keep them longer if one does.
 */
const KEEP_SKIPPED = 3 * 3_600_000;

/** Renfe's: GTFS-RT as JSON, both files on each run it's due. */
const renfe: LiveAdapter<SourceOf<'renfe'>, RenfeResponses, RenfeOwn> = {
  async fetch({ source: { urls }, get }) {
    const [positions, updates] = await Promise.all([get(urls.positions, asText), get(urls.updates, asText)]);
    return { positions, updates };
  },
  read({ positions, updates }, { source, own, now }) {
    // Read first, so that what the trip updates say of skipped Stations is kept whether or not the positions can be read.
    const got = renfeTripUpdates(source, updates, own, now);
    return {
      own: 'error' in got ? own : got.skipped,
      reports(said) {
        const vehicles = json<GtfsRt>('vehicle_positions', positions);
        if ('error' in got) throw got.error;
        said('vehicle_positions', ms(vehicles.header.timestamp));
        said('trip_updates', ms(got.trips.header.timestamp));
        return renfeReports(source, vehicles, got.trips);
      },
    };
  },
  skipped: (own) => Object.entries(own ?? {}).map(([trip, { stations, since }]) => ({ trip, stations, since })),
};

/** GTFS-RT as Renfe's JSON has it, with times in seconds since 1970: the parts the step reads. */
interface GtfsRt {
  header: { timestamp: string };
  entity?: { vehicle?: Vehicle; tripUpdate?: { trip?: { tripId?: string; scheduleRelationship?: string }; stopTimeUpdate?: { stopId?: string; scheduleRelationship?: string }[]; delay?: number } }[];
}

interface Vehicle {
  trip?: { tripId?: string };
  position?: { latitude: number; longitude: number };
  currentStatus?: 'INCOMING_AT' | 'STOPPED_AT' | 'IN_TRANSIT_TO';
  stopId?: string;
  timestamp?: string;
}

/**
 * The Trains in Renfe's files of the Networks its source names, by their trip_ids. Each Train gets one
 * report, with its Delay from its trip update, and its position from the vehicle positions.
 */
function renfeReports(source: LiveSource, positions: GtfsRt, updates: GtfsRt): Report[] {
  const reports = new Map<string, Report>();
  for (const { tripUpdate: update } of updates.entity ?? []) {
    const trip = renfeTrip(source, update?.trip?.tripId);
    if (!trip) continue;
    const cancelled = update?.trip?.scheduleRelationship === 'CANCELED' || undefined;
    // Renfe's trip updates carry no time of their own, only the feed's.
    reports.set(trip, { trip, at: ms(updates.header.timestamp), delay: update?.delay, cancelled });
  }
  for (const { vehicle } of positions.entity ?? []) {
    const trip = renfeTrip(source, vehicle?.trip?.tripId);
    if (trip) reports.set(trip, { ...reports.get(trip), trip, at: ms(vehicle?.timestamp), position: position(vehicle ?? {}) });
  }
  return [...reports.values()];
}

/** A Trip of Renfe's, as the bundle names it, by its trip_id, where the source names its Network: Renfe's timetable pads its IDs with spaces, and untrimmed they don't join. */
function renfeTrip(source: LiveSource, tripId: string | undefined): string | undefined {
  const id = tripId?.trim() ?? '';
  const network = networkOf(source, id);
  return network && `${network}:${id}`;
}

/**
 * Renfe's trip updates, and each Trip's skipped Stations as they say now and as its adapter kept them
 * (skippedIn()); or why they can't be read, as where Renfe answers with JSON that isn't its feed,
 * such as `{}`. The step tries them in reports(), so that their failing fails Renfe's try alone.
 */
function renfeTripUpdates(source: LiveSource, updates: Fetched, kept: RenfeOwn | undefined, now: number): { trips: GtfsRt; skipped: RenfeOwn } | { error: unknown } {
  try {
    const trips = json<GtfsRt>('trip_updates', updates);
    return { trips, skipped: skippedIn(source, trips, kept, now) };
  } catch (error) {
    return { error };
  }
}

/**
 * Each Trip's skipped Stations, as Renfe's trip updates say now and as its adapter kept them: those
 * Renfe last listed SKIPPED, in the order it lists them. Renfe lists only the Stations a Trip's
 * timetable hasn't left yet, so one it no longer lists stays skipped, and it lists a Trip only until
 * its Train has ended its run, so a Trip it no longer lists keeps them for KEEP_SKIPPED. A Station it
 * lists again, not SKIPPED, is no longer skipped, as C4b's from Las Margaritas to Parla were on 7
 * October 2026, each as its Train ran on to it after all.
 */
function skippedIn(source: LiveSource, updates: GtfsRt, kept: RenfeOwn = {}, now: number): RenfeOwn {
  const skipped = Object.fromEntries(Object.entries(kept).filter(([, { listed }]) => now - listed < KEEP_SKIPPED));
  const at = ms(updates.header.timestamp);
  for (const { tripUpdate: update } of updates.entity ?? []) {
    const trip = renfeTrip(source, update?.trip?.tripId);
    if (!trip) continue;
    const stops = update?.stopTimeUpdate ?? [];
    const station = (stop: (typeof stops)[number]) => `adif:${stop.stopId?.trim()}`;
    // Renfe lists the Station a Train is due at next once more, not SKIPPED, though it skips it.
    const [skips, listed] = [new Set(stops.filter((s) => s.scheduleRelationship === 'SKIPPED').map(station)), new Set(stops.map(station))];
    const before = skipped[trip];
    const stations = [...(before?.stations.filter((s) => !listed.has(s)) ?? []), ...skips];
    if (stations.length) skipped[trip] = { stations, since: before?.since ?? at, listed: at };
    else delete skipped[trip];
  }
  return skipped;
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

/** FGC's live data: its positions from Geotren, as JSON, and its trip updates, as GTFS-RT; and where the run looked up the trip-updates file, if it had to. */
export interface FgcResponses {
  positions: Fetched;
  updates: Fetched<Uint8Array>;
  lookup?: Fetched;
}

/** What FGC's adapter keeps between runs. */
export interface FgcOwn {
  /** Where its trip-updates file is, until it has to be looked up again. */
  file?: string;
  /** When FGC wrote the file, in seconds since 1970, as it said on the last refresh that read it, even where that's earlier than the one before. */
  written?: number;
  /** The time the file stays at even after it was looked up again, in seconds since 1970: it isn't looked up again while it stays at that time, which is forgotten once FGC writes the file again. */
  stalled?: number;
  /** How many requests its API had left today, as its last answers said. */
  remaining?: number;
}

/**
 * How often FGC is fetched while its API has fewer than 1,000 requests left today, in ms: every 5
 * minutes. The API allows 5,000 a day to each IP, and others on Cloudflare's IPs may share them.
 */
const [FGC_SLOW, FGC_FEW] = [300_000, 1000];

/** A day in ms. FGC's API counts its requests by day in UTC. */
const DAY = 86_400_000;

/** FGC's: Geotren, and its trip updates from a file it looks up. */
const fgc: LiveAdapter<SourceOf<'fgc'>, FgcResponses, FgcOwn> = {
  /** Its trip-updates file from where it was last found, or where it's looked up again. */
  async fetch({ source: { urls }, own, get }) {
    const lookup = own?.file ? undefined : await get(urls.lookup, asText);
    const found = lookup ? address(lookup) : own?.file;
    const [positions, updates] = await Promise.all([get(urls.positions, asText), found ? get(found, asBytes) : { error: "couldn't look up where it is" }]);
    return { positions, updates, lookup };
  },
  read({ positions, updates, lookup }, { source, own, last, now }) {
    const tripUpdates = readTripUpdates(own, updates, lookup);
    // Where no answer says how many requests are left, the last count holds until 00:00 UTC.
    const remaining = requestsLeft([lookup, positions, updates]) ?? leftToday(own, last, now);
    return {
      own: { ...tripUpdates.fgc, remaining },
      // With none left, its Trains were last placed as often as before, and it isn't tried again.
      every: remaining === 0 ? (last?.every ?? source.every) : fgcEvery(source, remaining),
      reports(said) {
        const trains = json<Geotren>('geotren', positions);
        if (!tripUpdates.feed) throw tripUpdates.error;
        const got = fgcReports(source, trains, tripUpdates.feed);
        // FGC updates all of Geotren's records at once.
        said('geotren', Math.max(...(trains.results ?? []).map((r) => Date.parse(r.record_timestamp))));
        return got;
      },
      status: remaining === 0 ? () => 'no requests left until 00:00 UTC' : undefined,
    };
  },
  /** While its API has no requests left today, until its quota resets at 00:00 UTC. */
  held: ({ own, last, at }) => leftToday(own, last, at) === 0,
};

/** How many requests FGC's API has left on the day of a moment, as its last answers said: its quota resets at 00:00 UTC. */
function leftToday(own: FgcOwn | undefined, last: Freshness | undefined, at: number): number | undefined {
  const tried = last?.lastAttempt;
  return tried !== undefined && Math.floor(tried / DAY) === Math.floor(at / DAY) ? own?.remaining : undefined;
}

/** How often FGC is fetched while its API has so many requests left today, in ms. */
const fgcEvery = (source: LiveSource, left: number | undefined) => (left !== undefined && left < FGC_FEW ? FGC_SLOW : source.every);

/** How many requests an API has left today, by the fewest its answers say. */
function requestsLeft(answers: (Fetched<unknown> | undefined)[]): number | undefined {
  const counts = answers.flatMap((a) => (a && 'status' in a && a.remaining !== undefined ? [a.remaining] : []));
  return counts.length ? Math.min(...counts) : undefined;
}

/** Geotren's records, as the Worker asks for them: each Train's Trip and Line, where it is, the Station it stands at, its Unit type, and when FGC last updated them. */
interface Geotren {
  results?: { id: string; lin?: string; geo_point_2d?: { lon: number; lat: number } | null; estacionat_a?: string | null; tipus_unitat?: string | null; record_timestamp: string }[];
}

/**
 * A feed of trip updates, as FGC and TRAM publish them: when it was written, in seconds since 1970,
 * and for each Trip, when it was updated, the Unit running it where it says, and the first stop it
 * gives a time for, by its platform, such as FGC's PC1, with when the Train is expected there. And,
 * where the feed is read as of a moment (gtfsRt()), the last stop it has reached by then, where it's
 * still to leave it: its number in the Trip, and when it's due out, in seconds since 1970.
 */
interface TripUpdates {
  written: number;
  trips: { id: string; updated?: number; unit?: string; platform?: string; expected?: number; standing?: { stop: number; leaves: number } }[];
}

/**
 * FGC's Trains from Geotren and its trip updates, which both name each by its Trip. Each gets one
 * report: from Geotren, where it is and its Unit type, as of when FGC last updated Geotren, and
 * from its trip update, when FGC expects it at the Station it stands at or comes to next.
 */
function fgcReports(source: LiveSource, positions: Geotren, updates: TripUpdates): Report[] {
  const reports = new Map<string, Report>();
  for (const { id, updated, platform, expected } of updates.trips) {
    const network = networkOf(source, id);
    if (!network) continue;
    // A platform is named for its Station, such as PC1 at Plaça Catalunya (PC): the Station's code, then the platform's number.
    const station = platform?.replace(/\d+$/, '');
    reports.set(id, { trip: `${network}:${id}`, at: (updated ?? updates.written) * 1000, expected: station && expected ? { station: `fgc:${station}`, at: expected * 1000 } : undefined });
  }
  for (const { id, lin, geo_point_2d: gps, estacionat_a: standing, tipus_unitat: unitType, record_timestamp } of positions.results ?? []) {
    // Its Delay is measured from when it was where Geotren has it.
    const at = Date.parse(record_timestamp);
    if (Number.isNaN(at)) throw new Error('geotren: no record_timestamp');
    const network = networkOf(source, id);
    if (!network) continue;
    // One standing at a Station is only there, as Renfe's are (ADR-0002).
    const position = standing ? { near: `fgc:${standing}` } : gps ? { lon: gps.lon, lat: gps.lat } : undefined;
    // Montserrat's rack Trains run under a calendar the timetable doesn't have, on lines M1 and M2, which it has as one, MM.
    const line = lin === 'M1' || lin === 'M2' ? `${network}:MM` : undefined;
    reports.set(id, { ...reports.get(id), trip: `${network}:${id}`, line, at, position, unitType: unitType || undefined });
  }
  return [...reports.values()];
}

/**
 * FGC's trip updates, read from this refresh's download, and where the file is for the next refresh:
 * where this one found it, unless its download failed, or its time is unchanged since the last refresh,
 * as it may have moved. Then it's looked up again, though not twice while the file stays at one time.
 * Any other time means FGC wrote it again, even one earlier than the last, as from a server whose
 * clock is behind.
 */
function readTripUpdates(fgc: FgcOwn = {}, updates: Fetched<Uint8Array>, lookup: Fetched | undefined): { fgc: FgcOwn; feed?: TripUpdates; error?: unknown } {
  let feed: TripUpdates;
  try {
    feed = gtfsRt('trip_updates', updates);
  } catch (error) {
    return { fgc: { ...fgc, file: undefined }, error };
  }
  const stopped = feed.written === fgc.written;
  const stalled = stopped ? (lookup ? feed.written : fgc.stalled) : undefined;
  const file = stopped && stalled !== feed.written ? undefined : lookup ? address(lookup) : fgc.file;
  return { fgc: { ...fgc, file, written: feed.written, stalled }, feed };
}

/** Where FGC's trip-updates file is, as its lookup found it. */
function address(lookup: Fetched): string | undefined {
  try {
    return json<{ results?: { file?: { url?: string } }[] }>('lookup', lookup).results?.[0]?.file?.url;
  } catch {
    return undefined;
  }
}

/** TRAM's two halves, Trambaix and Trambesòs, as its timetable's feeds name them. */
export const HALVES = ['TBX', 'TBS'] as const;
type Half = (typeof HALVES)[number];

/**
 * For each of TRAM's halves, where its Units are, from activevehicles, as JSON, and its trip updates,
 * as GTFS-RT, which name the Trip each Unit runs; and the access token the run asked for, if it had to.
 */
export type TramResponses = { token?: Fetched } & Record<Half, { positions: Fetched; updates: Fetched<Uint8Array> }>;

/** What TRAM's adapter keeps between runs. */
export interface TramOwn {
  /** Its access token, and when it runs out, in ms since 1970, until a run has to ask for another. */
  access?: { token: string; expires: number };
  /**
   * After a try at TRAM fails, where it answers and issues no access token or refuses it on its
   * data: when it did, in ms since 1970, and how long the fetcher waits from then before it tries
   * again, which doubles with each failed try until TRAM accepts a token. Tries it gives no answer,
   * or a server error, don't count.
   */
  backoff?: { failed: number; wait: number };
}

/** The access token TRAM's adapter keeps in the step's state for a source of TRAM's, where it keeps one, as TRAM's alerts use it (alerts.ts). */
export const tramToken = ({ own }: State, id: string) => (own?.[id] as TramOwn | undefined)?.access?.token;

/** The longest the fetcher waits to try TRAM again after a try fails, where TRAM answers and issues no access token or refuses it, in ms. */
const TRAM_WAIT_MAX = 1_800_000;

/** TRAM's: both its halves' Units and trip updates, with an access token it keeps for as long as it lasts. */
const tram: LiveAdapter<SourceOf<'tram'>, TramResponses, TramOwn> = {
  /** Both halves' live data, with the access token it keeps, or where it keeps none, a new one. */
  async fetch({ source: { urls }, own, secrets, get }) {
    const form = new URLSearchParams({ grant_type: 'client_credentials', ...secrets });
    const token = own?.access ? undefined : secrets ? await get(urls.token, asText, { method: 'POST', body: form }) : { error: UNSET };
    const bearer = token ? accessToken(token) : own?.access?.token;
    // TRAM's API numbers Trambaix 1 and Trambesòs 2.
    const half = async (networkId: number): Promise<TramResponses[Half]> => {
      if (!bearer) return { positions: { error: 'no access token' }, updates: { error: 'no access token' } };
      const init = { headers: { authorization: `Bearer ${bearer}` } };
      const [positions, updates] = await Promise.all([get(`${urls.positions}?networkId=${networkId}`, asText, init), get(`${urls.updates}?networkId=${networkId}`, asBytes, init)]);
      return { positions, updates };
    };
    const [TBX, TBS] = await Promise.all([half(1), half(2)]);
    return { token, TBX, TBS };
  },
  read({ token, ...halves }, { source, own, now }) {
    // A token the run asked for replaces the last, or where TRAM didn't issue one, a later run asks again.
    let access = token ? undefined : own?.access;
    let noToken: unknown;
    if (token) {
      try {
        access = issued(token, now);
      } catch (error) {
        noToken = error;
      }
    }
    // A try fails only where TRAM answers and refuses: it issues no token, or refuses it on its data.
    // The next waits 20 s, then twice as long each time, until TRAM answers its data requests without
    // refusing the token. No answer, a server error, or a run without credentials, which asks for
    // nothing, neither counts nor resets the wait: the next run asks again once any wait under way
    // is over.
    const data = HALVES.flatMap((half) => [halves[half].positions, halves[half].updates]);
    const refused = data.some((f) => 'status' in f && f.status === 401);
    // Where the run asked for a token, it has one only where TRAM issued it, and TRAM refused one only where it judged the request.
    const unissued = token !== undefined && !access && judged(token);
    let backoff = own?.backoff;
    let backingOff: Reading<TramOwn>['status'];
    if (refused || unissued) {
      const wait = Math.min(2 * (own?.backoff?.wait ?? EVERY / 2), TRAM_WAIT_MAX);
      backoff = { failed: now, wait };
      backingOff = (status) => `${status}; backing off, next try at ${clock(now + wait)}`;
    } else if (data.some(judged)) backoff = undefined;
    // The token is kept for as long as it lasts through the next run's answers, and TRAM accepts it.
    if (refused || (access && access.expires < now + EVERY + TIMEOUT)) access = undefined;
    return {
      own: { access, backoff },
      reports(said) {
        if (noToken) throw noToken;
        return HALVES.flatMap((half) => tramReports(source, half, halves[half], now, said));
      },
      status: backingOff,
    };
  },
  /** After a try fails, until its wait is over: on the run nearest its time. */
  held({ own, at }) {
    const backoff = own?.backoff;
    return backoff !== undefined && at <= backoff.failed + backoff.wait - EVERY / 2;
  },
};

/** Whether TRAM judged a request, answering it with a status under 500: no answer, or a server error, says nothing of its credentials or its token. */
const judged = (fetched: Fetched<unknown>) => 'status' in fetched && fetched.status < 500;

/** The access token TRAM issued in answer to a request for one, if it did. */
function accessToken(answer: Fetched): string | undefined {
  try {
    return issued(answer, 0).token;
  } catch {
    return undefined;
  }
}

/** The access token TRAM issued a run that asked for one, and when it runs out, in ms since 1970, or an error that says why there's none. */
function issued(answer: Fetched, now: number): NonNullable<TramOwn['access']> {
  const { access_token: token, expires_in: lasts } = json<{ access_token?: string; expires_in?: number } | null>('token', answer) ?? {};
  if (!token || !lasts) throw new Error('token: none issued');
  return { token, expires: now + lasts * 1000 };
}

/**
 * One of TRAM's Units, as its activevehicles has it: the parts the step reads. Its line is 0 while
 * it's out of service. Its position is how far its Train has come since its Trip's first Station, in
 * metres, but only as it reaches a Station: that Station's distance for about 40 s, and then 0 until
 * it reaches the next. So 0 doesn't mean it stands: its origin stop is the one it's at or has just
 * left, by TRAM's number for the platform (#42). Its delay is in seconds, early where it's negative.
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
 * no report. Each report is as of the run, since TRAM's figures carry no time of their own, though
 * the trip updates say when TRAM wrote them. Where a trip update has the Train at a stop it has
 * reached by the run and is still to leave, its report says which stop, and when it's due out: TRAM's
 * Delay stays what it was as the Train arrived, and its position names the stop it's at or has just
 * left (#42), so nothing else tells a Train standing past its timetable's 10 s from one that has gone (#344).
 */
function tramReports(source: LiveSource, half: Half, { positions, updates }: TramResponses[Half], now: number, said: (file: string, at: number) => void): Report[] {
  const feed = gtfsRt(`${half} gtfsrealtime`, updates, now);
  said(`${half} gtfsrealtime`, feed.written * 1000);
  const trips = new Map(feed.trips.map((t) => [t.unit, t]));
  const units = json<ActiveVehicle[]>(`${half} activevehicles`, positions);
  if (!Array.isArray(units)) throw new Error(`${half} activevehicles: not a list`);
  return units.flatMap(({ vehicleId, lineName, originStopCode, vehiclePosition, delay }) => {
    const update = trips.get(String(vehicleId));
    const network = update && networkOf(source, update.id);
    const position = vehiclePosition ? { along: vehiclePosition } : { near: `tram:${originStopCode}` };
    const standing = update?.standing && { stop: update.standing.stop, leaves: update.standing.leaves * 1000 };
    return update && network && lineName !== '0' ? [{ trip: `${network}:${half}:${update.id}`, at: now, position, delay, standing }] : [];
  });
}

/** TMB's: its predictions for the whole Metro, from iTransit, as JSON. */
const tmb: LiveAdapter<SourceOf<'tmb'>, Fetched> = {
  /** Its key goes in the query string, so it's taken out of any error, which the snapshot's status repeats; the step never sees the URL. */
  async fetch({ source: { urls }, secrets, get }) {
    if (!secrets) return { error: UNSET };
    const fetched = await get(`${urls.predictions}?${new URLSearchParams(secrets)}`, asText);
    return 'error' in fetched ? { error: Object.values(secrets).reduce((error, secret) => error.replaceAll(secret, '…'), fetched.error) } : fetched;
  },
  read: (predictions, { source }) => ({ reports: () => metroReports(source, json('itransit', predictions)) }),
};

/**
 * TMB's predictions for the Metro, as iTransit has them: the parts the step reads. For each Line,
 * each of its Stations each way, and the next trains there, with when each is expected, and each
 * time in ms since 1970.
 */
interface ITransit {
  timestamp: number;
  linies: {
    estacions: {
      /** Which way along the Line: 1 or 2. */
      id_sentit: number;
      codi_estacio: number;
      linies_trajectes: { nom_linia: string; desti_trajecte: string; propers_trens: { codi_servei: string; temps_arribada: number }[] }[];
    }[];
  }[];
}

/**
 * The Metro's Trains from TMB's predictions, which name each by its Block. Each gets one report: its
 * earliest prediction gives the Station it comes to next, `tmb:1.<code>` (ADR-0005), and when, as
 * of when TMB made them. It's headed where its way along its Line goes, which is where most of that
 * way's Stations say: coming into a Line's end, TMB lists a train under its next Trip's headsign.
 */
function metroReports(source: LiveSource, { timestamp, linies }: ITransit): Report[] {
  if (!Array.isArray(linies)) throw new Error('itransit: no Lines');
  const [heading, next] = [new Map<string, Map<string, number>>(), new Map<string, { line: string; way: string; number: string; station: number; at: number }>()];
  for (const { estacions } of linies) for (const { id_sentit, codi_estacio: station, linies_trajectes: trajectes } of estacions) {
    for (const { nom_linia: line, desti_trajecte: headsign, propers_trens: trains } of trajectes) {
      const way = `${line} ${id_sentit}`;
      const votes = heading.get(way) ?? new Map<string, number>();
      heading.set(way, votes.set(headsign, (votes.get(headsign) ?? 0) + 1));
      for (const { codi_servei: number, temps_arribada: at } of trains) {
        const block = `${line} ${number}`;
        if ((next.get(block)?.at ?? Infinity) > at) next.set(block, { line, way, number, station, at });
      }
    }
  }
  const headsign = (way: string) => [...(heading.get(way) ?? [])].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  return [...next.entries()].flatMap(([block, { line, way, number, station, at }]) => {
    const network = networkOf(source, block);
    return network ? [{ block: { line: `${network}:${line}`, number }, headsign: headsign(way), at: timestamp, position: { next: { station: `tmb:1.${station}`, at } } }] : [];
  });
}

/** Each format's adapter. */
const ADAPTERS = { renfe, fgc, tram, tmb };

/**
 * The parts of a GTFS-RT feed of trip updates the step reads, from its protocol buffers in a response:
 * its header's time, and each trip update's Trip, time, Unit and first stop with a time (field
 * numbers as GTFS-RT's). Given a moment (ms since 1970), each trip update's last stop that has
 * been reached by then too, where it's still to leave it, which reads all of its stops. Or an error
 * that says why it can't be read.
 */
function gtfsRt(file: string, fetched: Fetched<Uint8Array>, now?: number): TripUpdates {
  const bytes = body(file, fetched);
  try {
    return new PbfReader(bytes).readFields((field, feed: TripUpdates, pbf) => feedMessage(field, feed, pbf, now === undefined ? undefined : now / 1000), { written: 0, trips: [] });
  } catch {
    throw new Error(`${file}: not GTFS-RT`);
  }
}

function feedMessage(field: number, feed: TripUpdates, pbf: PbfReader, now?: number) {
  if (field === 1) feed.written = pbf.readMessage((field, header: { timestamp: number }) => {
    if (field === 3) header.timestamp = pbf.readVarint();
  }, { timestamp: 0 }).timestamp;
  if (field === 2) pbf.readMessage((field) => {
    if (field === 3) feed.trips.push(pbf.readMessage((field, update: TripUpdates['trips'][number], pbf) => tripUpdate(field, update, pbf, now), { id: '' }));
  }, null);
}

function tripUpdate(field: number, update: TripUpdates['trips'][number], pbf: PbfReader, now?: number) {
  if (field === 1) update.id = pbf.readMessage((field, trip: { id: string }) => {
    if (field === 1) trip.id = pbf.readString();
  }, { id: '' }).id;
  if (field === 4) update.updated = pbf.readVarint();
  if (field === 3) update.unit = pbf.readMessage((field, vehicle: { id?: string }) => {
    if (field === 1) vehicle.id = pbf.readString();
  }, {}).id;
  // FGC's are read to their first stop with a time, and the rest skipped, as most of a feed is stops.
  if (field === 2 && (!update.expected || now !== undefined)) {
    const stop = pbf.readMessage<Stop>(stopTimeUpdate, {});
    const time = stop.arrival ?? stop.departure;
    if (!update.expected && time) [update.platform, update.expected] = [stop.platform, time];
    // Each stop reached by `now` replaces the one before it, so the last one gives where it stands. Not one
    // it skips, nor one TRAM has no data for, whose Trip's call at that number it may not make.
    if (now !== undefined && !stop.relationship && stop.sequence !== undefined && stop.arrival !== undefined && stop.arrival <= now) {
      update.standing = stop.departure !== undefined && stop.departure > now ? { stop: stop.sequence, leaves: stop.departure } : undefined;
    }
  }
}

/** A stop, by its platform and its number in the Trip, how it stands in the timetable (0 where it's as scheduled, 1 skipped), and when the Train is expected there, in seconds since 1970: its arrival and its departure. */
type Stop = { platform?: string; sequence?: number; relationship?: number; arrival?: number; departure?: number };

function stopTimeUpdate(field: number, stop: Stop, pbf: PbfReader) {
  if (field === 1) stop.sequence = pbf.readVarint();
  if (field === 4) stop.platform = pbf.readString();
  if (field === 5) stop.relationship = pbf.readVarint();
  if (field === 2 || field === 3) {
    const { time } = pbf.readMessage((field, event: { time?: number }) => {
      if (field === 2) event.time = pbf.readVarint(true);
    }, {});
    if (field === 2) stop.arrival = time;
    else stop.departure = time;
  }
}
