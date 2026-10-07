// What the cards work out from the days on the map and the engine's Trains: minutes to go, Nearby's rows, how far along its Trip a followed Train is, and a board's Lines (#321).
import type { Call, Trip } from '../bundle.ts';
import type { Pass } from '../engine.ts';

/** The whole minutes from `now` to `at`, both in ms since 1970, as a clock showing minutes reads them, as a board shows times: none for a time this minute, or past. */
export function minutesTo(at: number, now: number): number {
  return Math.max(0, Math.floor(at / 60_000) - Math.floor(now / 60_000));
}

/** How many passes Nearby counts down to in a row. */
const PASSES = 3;

/** One of Nearby's rows: a Line and destination's next Train, and its next passes, in minutes to go, each Live or Scheduled. */
export interface NearbyRow {
  next: Pass;
  passes: { minutes: number; live: boolean }[];
}

/**
 * Nearby's rows, given its passes soonest first: one for each Line and destination, in the order of
 * each one's next Train, with that Train and its next PASSES passes, in minutes from `now`. Passes in
 * the same minute count once, as the first of them.
 */
export function nearbyRows(passes: Pass[], now: number): NearbyRow[] {
  const rows = new Map<string, NearbyRow>();
  for (const pass of passes) {
    const key = `${pass.trip.line} ${pass.trip.headsign}`;
    const row = rows.get(key) ?? { next: pass, passes: [] };
    rows.set(key, row);
    const minutes = minutesTo(pass.at, now);
    if (row.passes.length < PASSES && !row.passes.some((p) => p.minutes === minutes)) row.passes.push({ minutes, live: pass.live });
  }
  return [...rows.values()];
}

/**
 * How far along its Trip a Train is, in metres, and how long the Trip is, by its legs from Station to
 * Station, so that a Trip which runs back along its track adds up both ways: given its calls, how far
 * along its shape it's drawn, and how many Stations it has still to leave, the one it stands at too.
 */
export function progress(calls: Call[], dist: number, toLeave: number): { done: number; length: number } {
  const legs = calls.slice(1).map((call, i) => Math.abs(call.dist - (calls[i]?.dist ?? call.dist)));
  // The leg it's on, which ends at the first Station it has still to leave.
  const on = calls.length - toLeave - 1;
  const sum = (lengths: number[]) => lengths.reduce((total, length) => total + length, 0);
  const length = sum(legs);
  if (on < 0) return { done: 0, length };
  if (on >= legs.length) return { done: length, length };
  return { done: sum(legs.slice(0, on)) + Math.min(Math.abs(dist - (calls[on]?.dist ?? dist)), legs[on] ?? 0), length };
}

/** The Lines whose Trips call at any of `stations`, a place's, as a board names them: of `lines`, in their order. */
export function linesCallingAt(trips: Trip[], stations: string[], lines: string[]): string[] {
  const here = new Set(stations);
  const calling = new Set(trips.filter((trip) => trip.calls.some((c) => here.has(c.station))).map((trip) => trip.line));
  return lines.filter((line) => calling.has(line));
}
