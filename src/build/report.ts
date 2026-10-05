// What the daily build reports, for a person to review: each spot its log names, once, by a key the
// next build names it by too, so that it can tell what's new (docs/research/build-report.md). The
// daily build writes them to out/report.json.

import type { Point, Station } from '../bundle.ts';
import { round } from './track.ts';

/** A spot in out/report.json. */
export interface Spot {
  /**
   * A run of a Line's legs between Stations that keep the feed's shape, a Station a Line's trace turns
   * back at, Stations left out on a branch, Trips left out, a Network with no Trips on a day, a traced
   * shape's length against the feed's, one of the largest nodes at a zoom, or the line measures.
   */
  kind: 'kept' | 'turn' | 'branch' | 'trip' | 'notrips' | 'length' | 'node' | 'measures';
  /** What the next build knows it by too (keyOf()): never a Trip's ID nor a date. */
  key: string;
  network?: string;
  line?: string;
  /** The Stations it names, in order. */
  stations?: { id: string; name: string }[];
  /** Where it is, to about a metre. */
  point?: Point;
  /** The OpenStreetMap ways its Stations are on, of its Network's rails. */
  ways?: number[];
  /** Each line the log prints for it, once: for a node, its zoom's. */
  text: string[];
  /** A length's percentage off the feed's, the most Trips left out on any one day, a node's size in line widths, or each of the measures. */
  numbers?: Record<string, number>;
}

/**
 * Why a run of legs keeps the feed's shape (a Station `off` the network, `nopath` along the rails, or
 * `fewer` than two Stations), or a Trip is left out (it calls at `fewer` than two Stations, its shape
 * has `notrack`, a Station is `off` its track, or it would run too `fast`).
 */
export type Cause = 'off' | 'nopath' | 'fewer' | 'notrack' | 'fast';

/** A spot as the build finds it, before it's keyed. */
export interface Found extends Omit<Spot, 'key' | 'stations'> {
  why?: Cause;
  /** The traced shape it's on. */
  shape?: string;
  /** The Trip left out. */
  trip?: string;
  /** The day a Network has no Trips or a Trip is left out, as days after today. */
  day?: number;
  /** The zoom a node is at. */
  zoom?: number;
  stations?: Station[];
}

/**
 * Collects what the build finds as spots, each once: one found again, as a shape traced the other way
 * or a Trip on another day, joins it. Trips are counted by day, as Renfe gives a Train a Trip of its
 * own each day and TMB one Trip for every day.
 */
export function collect() {
  const spots = new Map<string, { spot: Spot; trips: Map<number, Set<string>> }>();
  return {
    add(found: Found) {
      const key = keyOf(found);
      const { kind, network, line, stations, ways, text, numbers, trip, day = 0 } = found;
      const point = found.point ?? halfway(stations);
      let known = spots.get(key);
      if (!known) {
        known = { spot: { kind, key, network, line, stations: stations?.map(({ id, name }) => ({ id, name })), point: point && [round(point[0]), round(point[1])], text: [] }, trips: new Map() };
        spots.set(key, known);
      }
      const { spot } = known;
      spot.text = [...new Set([...spot.text, ...text])];
      if (ways?.length) spot.ways = [...new Set([...(spot.ways ?? []), ...ways])].sort((a, b) => a - b);
      if (trip) known.trips.set(day, (known.trips.get(day) ?? new Set()).add(trip));
      // Of a number found twice, as a shape's length traced each way, the one furthest from 0.
      for (const [name, n] of Object.entries(numbers ?? {})) {
        if (spot.numbers?.[name] === undefined || Math.abs(n) > Math.abs(spot.numbers[name])) spot.numbers = { ...spot.numbers, [name]: n };
      }
    },
    /** Every spot, in order of key. */
    spots(): Spot[] {
      return [...spots.values()]
        .map(({ spot, trips }) => (trips.size ? { ...spot, numbers: { ...spot.numbers, trips: Math.max(...[...trips.values()].map((t) => t.size)) } } : spot))
        .sort((a, b) => (a.key < b.key ? -1 : 1));
    },
  };
}

/**
 * A spot's key, as docs/research/build-report.md's section 3 sets it out: its kind, its Line or
 * Network, and its Stations, those at either end in order of ID, so that the same spot traced the
 * other way, or on the feed's own shape the other way, is keyed the same. A shape traced the other
 * way has the length of the one it's traced from, and a node is known by its zoom and where it is,
 * to about 100 m.
 */
function keyOf({ kind, network, line, why, shape, day, zoom, point, stations = [] }: Found): string {
  const ids = stations.map((s) => s.id);
  const ends = [...new Set([ids[0], ids.at(-1)])].filter((id) => id !== undefined).sort();
  const parts = {
    kept: [line, ...ends, why],
    turn: [line, ...ends],
    branch: [line, ...ends],
    trip: [line, why, ...ends],
    notrips: [network, day],
    length: [line, shape?.replace(/:back$/, '')],
    node: [zoom, point?.[1].toFixed(3), point?.[0].toFixed(3)],
    measures: [],
  }[kind];
  return [kind, ...parts].join(' ');
}

/** Halfway between the first and last of some Stations. */
function halfway(stations: Station[] = []): Point | undefined {
  const [a, b] = [stations[0], stations.at(-1)];
  return a && b ? [(a.lon + b.lon) / 2, (a.lat + b.lat) / 2] : undefined;
}

