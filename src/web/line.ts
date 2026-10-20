// A Line's screen (#473, #328's pick): its Stations as one strip, marked where its Trips start or end and where a spur
// goes on, its Trains as rows between them, and its state now. Pure, with nothing from the page, so that Node tests it.

import type { Trip } from '../bundle.ts';
import type { TripNow } from '../engine.ts';

/** How many of a day's Trips start or end at a Station for the strip to mark it with a hollow bar across the Line. */
const TURNS = 4;

/**
 * How few of a day's Trips a run of Stations beyond the last Station the Line's other Trips reach can have, against
 * that Station's, to be a spur: a quarter, as R16's 3 Trips on to Ulldecona of Tortosa's 20 and more, and R2S's 2
 * on to Flix of Sant Vicenç de Calders' 68.
 */
const SPUR = 1 / 4;

/**
 * A Station on a Line's strip: how many of the day's Trips call there, and how many start or end there; and how the
 * strip marks it: a solid bar at the Line's own `end`, a hollow one where TURNS or more Trips start or end (`turn`),
 * or dashed, beyond an end, on a `spur`. The end a spur goes on from says how many Trains go on and to where
 * (`goOn`), and the spur's own end how many end there (`endsHere`).
 */
export interface StripStation {
  station: string;
  calls: number;
  turns: number;
  mark?: 'end' | 'turn' | 'spur';
  goOn?: { n: number; to: string };
  endsHere?: number;
}

/**
 * A Line's Stations in order, as one strip (#473), from its Trips of the day: along its longest Trip, each other
 * Trip's Stations it doesn't call at put where that Trip has them, between those it shares, and those beyond a
 * Station where it leaves the strip, as R16's to Ulldecona from L'Aldea-Amposta-Tortosa, at the strip's nearer end,
 * as a spur. A Trip that calls at a Station twice, as one that turns back, counts it once. One strip, never two
 * columns: a run beyond an end whose Trips are no more than SPUR of the Station before it is a spur, dashed.
 */
export function lineStrip(trips: Pick<Trip, 'calls'>[]): StripStation[] {
  const runs = trips.map((t) => [...new Set(t.calls.map((c) => c.station))]).sort((a, b) => b.length - a.length);
  const order = [...(runs[0] ?? [])];
  for (const run of runs.slice(1)) {
    const at = (s: string) => order.indexOf(s);
    const shared = run.filter((s) => at(s) >= 0);
    const oriented = shared.length > 1 && at(shared[0] ?? '') > at(shared.at(-1) ?? '') ? run.toReversed() : run;
    let [prev, buffer]: [number | undefined, string[]] = [undefined, []];
    for (const s of oriented) {
      const k = at(s);
      if (k < 0) {
        buffer.push(s);
        continue;
      }
      if (buffer.length) {
        // Before the strip's first Station, or off it from within, at its nearer end, the far one outermost.
        if (prev !== undefined) order.splice(prev + 1, 0, ...buffer);
        else if (k === 0 || k < order.length / 2) order.unshift(...buffer);
        else order.push(...buffer.toReversed());
        buffer = [];
      }
      prev = order.indexOf(s);
    }
    if (prev === undefined || prev >= order.length / 2 - 1) order.push(...buffer);
    else order.unshift(...buffer.toReversed());
  }
  const strip: StripStation[] = order.map((station) => ({ station, calls: 0, turns: 0 }));
  const byId = new Map(strip.map((s) => [s.station, s]));
  for (const run of runs) {
    for (const s of run) byId.get(s)!.calls++;
    for (const s of new Set([run[0], run.at(-1)])) if (s) byId.get(s)!.turns++;
  }
  // The Line's own ends, inside any spur.
  const spurFrom = (stations: StripStation[]) => {
    let from = stations.length;
    for (let i = stations.length - 1; i > 1; i--) {
      const beyond = Math.max(...stations.slice(i).map((s) => s.calls));
      if (beyond <= (stations[i - 1]?.calls ?? 0) * SPUR) from = i;
    }
    return from;
  };
  const last = spurFrom(strip) - 1;
  const first = last + 1 - spurFrom(strip.slice(0, last + 1).toReversed());
  strip.forEach((s, i) => {
    if (i === first || i === last) s.mark = 'end';
    else if (i < first || i > last) s.mark = 'spur';
    else if (s.turns >= TURNS) s.mark = 'turn';
  });
  for (const [end, next, far] of [[last, last + 1, strip.length - 1], [first, first - 1, 0]] as const) {
    const [from, on, to] = [strip[end], strip[next], strip[far]];
    if (!from || !on || !to) continue;
    // As far as all of them go, where fewer go on further, as 11 of R2's go on to Sant Celoni and 3 of them to Maçanet-Massanes.
    const spur = next < end ? strip.slice(0, next + 1).toReversed() : strip.slice(next);
    from.goOn = { n: on.calls, to: (spur.findLast((s) => s.calls === on.calls) ?? on).station };
    to.endsHere = to.calls;
  }
  return strip;
}

/** A Train as its row on a Line's strip has it: its Trip, the Stations it has still to leave, the one it stands at, and its Delay. */
type OnLine = { trip: Pick<Trip, 'calls'>; upcoming: { station: string }[]; standsAt?: string };

/**
 * Where each of a Line's Trains goes on its strip (#473): after the Station it stands at, or of the two it's between,
 * the one the strip lists first, and the way it goes along the strip, down it (1) or up it (-1), in the strip's order.
 * None for a Train whose Stations the strip hasn't got.
 */
export function onStrip<T extends OnLine>(strip: StripStation[], trains: T[]): { train: T; after: number; way: 1 | -1 }[] {
  const at = new Map(strip.map((s, i) => [s.station, i]));
  return trains
    .flatMap((train) => {
      const { calls } = train.trip;
      const left = calls[calls.length - train.upcoming.length - 1]?.station;
      const [from, to] = train.standsAt ? [train.standsAt, train.upcoming[1]?.station ?? ''] : [left ?? '', train.upcoming[0]?.station ?? ''];
      const [a, b] = [at.get(from), at.get(to)];
      if (a === undefined) return [];
      const way: 1 | -1 = b === undefined || b > a ? 1 : -1;
      return [{ train, after: train.standsAt || b === undefined ? a : Math.min(a, b), way }];
    })
    .sort((x, y) => x.after - y.after);
}

/** How late a Train has to be, in seconds, for a Line's state to count it late: 5 minutes, as Now counts it (#328's pick 3). */
const LATE = 300;

/**
 * A Line's state now (#473): how many of its Trains are on the map, how many are LATE or more, and the worst of
 * those, in whole minutes, only where some are; and whether any is Live, as none is where its Network's live data
 * is unavailable, its Trains all Scheduled.
 */
export function lineState(trains: { delay?: number; live: boolean }[]): { trains: number; late: number; worst?: number; live: boolean } {
  const late = trains.flatMap((t) => (t.delay !== undefined && t.delay >= LATE ? [t.delay] : []));
  return { trains: trains.length, late: late.length, ...(late.length && { worst: Math.round(Math.max(...late) / 60) }), live: trains.some((t) => t.live) };
}

/**
 * A Line's Cancelled Trains (#473): of where its Trips' Trains are now (tripsAt()), those Cancelled whose runs haven't
 * ended by their timetable, given when the day's timetable reads 00:00 and the time now, in ms since 1970, so that
 * the 14:36 still shows at 15:09. In the order given.
 */
export function cancelledNow<N extends Pick<TripNow, 'trip'>>(nows: N[], noonMinus12h: number, at: number): N[] {
  return nows.filter((now) => 'cancelled' in now && noonMinus12h + (now.trip.calls.at(-1)?.arrival ?? -Infinity) * 1000 > at);
}
