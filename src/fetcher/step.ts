// The fetcher step: each run's raw responses in, the live snapshot out (ADR-0003). It's pure, so
// the Worker around it stays thin and tests replay recorded responses through it. It never loads
// timetable data: matching reports to Trips is the engine's work.

import type { Freshness, Report, Snapshot } from '../bundle.ts';

/** A live feed, by the Network whose Trains it reports. */
export type Feed = 'rodalies';

/** What one request got back: its HTTP status and body, or why it got nothing. */
export type Fetched = { status: number; body: string } | { error: string };

/** This run's raw responses, for each feed that was due. */
export interface Responses {
  /** Renfe's Cercanías vehicle positions and trip updates, as JSON. */
  rodalies?: { positions: Fetched; updates: Fetched };
}

/** What the step keeps between runs. */
export interface State {
  feeds: Record<string, Freshness>;
}

/** What the fetcher stores between runs: the step's state, and the feeds due on the next run. */
export interface Stored {
  state: State;
  due: Feed[];
}

/** What the fetcher starts from. */
export const START: Stored = { state: { feeds: {} }, due: ['rodalies'] };

/**
 * One run: the stored state, this run's raw responses and the time now (ms since 1970) go in; the
 * snapshot, the next stored state and the feeds due on the next run come out.
 */
export function step(state: State, responses: Responses, now: number): Stored & { snapshot: Snapshot } {
  const feeds = { ...state.feeds };
  const reports: Report[] = [];
  if (responses.rodalies) {
    try {
      const { positions, updates } = responses.rodalies;
      reports.push(...rodalies(read('vehicle_positions', positions), read('trip_updates', updates)));
      feeds.rodalies = { lastSuccess: now, lastAttempt: now, status: 'ok' };
    } catch (error) {
      feeds.rodalies = { ...feeds.rodalies, lastAttempt: now, status: (error as Error).message };
    }
  }
  return { snapshot: { generated: now, feeds, reports }, state: { feeds }, due: ['rodalies'] };
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

/** One of a feed's files, read from its response, or an error that says why it can't be. */
function read(file: string, fetched: Fetched): GtfsRt {
  if ('error' in fetched) throw new Error(`${file}: ${fetched.error}`);
  if (fetched.status !== 200) throw new Error(`${file}: HTTP ${fetched.status}`);
  try {
    return JSON.parse(fetched.body) as GtfsRt;
  } catch {
    throw new Error(`${file}: not JSON`);
  }
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
