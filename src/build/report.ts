// What the daily build reports, for a person to review: each spot its log names, once, by a key the
// next build names it by too, so that it can tell what's new (docs/research/build-report.md). The
// daily build writes them to out/report.json and publishes it, and the next build diffs its own
// against it (diff()), and tells the maintainer of the problem spots that are new (comment()).

import { DEGREE, pixelMetres, type Point, type Station } from '../bundle.ts';
import { round } from './track.ts';

/** A spot in out/report.json. */
export interface Spot {
  /**
   * A run of a Line's legs between Stations that keep the feed's shape, a Station a Line's trace turns
   * back at, Stations left out on a branch, Trips left out, replacement buses where their Line has no
   * track, a Network with no Trips on a day, a Network's Trips on each day of the week, a Network's
   * Closures today, a Network built from the copy of its timetables that last built it, a traced
   * shape's length against the feed's, one of the largest nodes at a zoom, or the line measures.
   */
  kind: 'kept' | 'turn' | 'branch' | 'trip' | 'bus' | 'notrips' | 'trips' | 'closures' | 'copy' | 'length' | 'node' | 'measures';
  /** What the next build knows it by too (keyOf()): never a Trip's ID nor a date. */
  key: string;
  network?: string;
  line?: string;
  /** The Stations it names, in order. */
  stations?: { id: string; name: string }[];
  /** Where it is, to about a metre. */
  point?: Point;
  /** The zoom the map shows it at, as docs/research/build-report.md's section 2 sets out. */
  zoom?: number;
  /** The OpenStreetMap ways its Stations are on, of its Network's rails. */
  ways?: number[];
  /** Each line the log prints for it, once: for a node, its zoom's. */
  text: string[];
  /**
   * A length's percentage off the feed's, the most Trips left out, or buses, on any one day, a
   * Network's Trips on each day of the week, its Closures today, a node's size in line widths, or each
   * of the measures.
   */
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
  /** The Trip left out, or the bus. */
  trip?: string;
  /** The day a Network has no Trips, a Trip is left out or a bus runs, as days after today. */
  day?: number;
  /** The zoom a node is at, which keys it, and which the map shows it at. */
  zoom?: number;
  /** What the map fits in view to show it, where its Stations don't say: a shape. */
  extent?: Point[];
  stations?: Station[];
}

/** The zoom the map shows a turn-back at, and Stations left out on a branch. */
const ZOOM: Partial<Record<Spot['kind'], number>> = { turn: 16, branch: 15 };

/** How many pixels across the map fits a run of legs kept, a shape's length or a Trip's Stations in: a phone's, less a margin. */
const FIT = 300;

/** The map, which keeps its view in its link, and OpenStreetMap. */
const [MAP, OSM] = ['https://viapeninsula.gariasf.com', 'https://www.openstreetmap.org'];

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
      const zoom = point && (found.zoom ?? ZOOM[kind] ?? fit(found.extent ?? stations?.map((s): Point => [s.lon, s.lat]) ?? []));
      let known = spots.get(key);
      if (!known) {
        known = { spot: { kind, key, network, line, stations: stations?.map(({ id, name }) => ({ id, name })), point: point && [round(point[0]), round(point[1])], zoom, text: [] }, trips: new Map() };
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
    bus: [line, ...ends],
    notrips: [network, day],
    trips: [network],
    closures: [network],
    copy: [network],
    length: [line, shape?.replace(/:back$/, '')],
    node: [zoom, point?.[1].toFixed(3), point?.[0].toFixed(3)],
    measures: [],
  }[kind];
  return [kind, ...parts].join(' ');
}

/** The closest zoom, at most 15, that fits these points across FIT pixels. */
function fit(points: Point[]): number {
  const [w, s, e, n] = points.reduce(([w, s, e, n], [lon, lat]) => [Math.min(w, lon), Math.min(s, lat), Math.max(e, lon), Math.max(n, lat)], [Infinity, Infinity, -Infinity, -Infinity]);
  const lat = (s + n) / 2;
  const across = Math.max((e - w) * Math.cos((lat * Math.PI) / 180), n - s) * DEGREE;
  return Math.min(15, Math.floor(Math.log2((FIT * pixelMetres(0, lat)) / across)));
}

/** Halfway between the first and last of some Stations. */
function halfway(stations: Station[] = []): Point | undefined {
  const [a, b] = [stations[0], stations.at(-1)];
  return a && b ? [(a.lon + b.lon) / 2, (a.lat + b.lat) / 2] : undefined;
}

/**
 * What changed in the report since the last build's, in Markdown for the run's job summary: spots new
 * since it, then those gone, then those whose numbers moved (moved()), each with its links and its
 * lines of the log; or one line where none did.
 * With no last report, every spot is new.
 * ponytail: a spot is gone the first build without it, so one that comes and goes shows each time it
 * does; count it gone only after two builds without it if one ever does (build-report.md, section 3).
 */
export function diff(last: Spot[] | undefined, spots: Spot[]): string {
  const [before, now] = [new Map(last?.map((s) => [s.key, s])), new Set(spots.map((s) => s.key))];
  const groups: [string, string[]][] = [
    ['New', spots.filter((s) => !before.has(s.key)).map((s) => item(s))],
    ['Gone', (last ?? []).filter((s) => !now.has(s.key)).map((s) => item(s))],
    ['Changed', spots.flatMap((s) => {
      const moves = moved(before.get(s.key), s);
      return moves ? [item(s, moves)] : [];
    })],
  ];
  const [added, gone, changed] = groups.map(([, items]) => items.length);
  if (!added && !gone && !changed) return 'Nothing in the build report is new, gone or changed since the last build.';
  return [
    `### Build report: ${last ? `${added} new, ${gone} gone, ${changed} changed since the last build` : `no last report to diff against, so all ${added} spots are new`}`,
    ...groups.flatMap(([title, items]) => (items.length ? ['', `#### ${title}`, '', ...items] : [])),
  ].join('\n');
}

/**
 * Whether a kind of spot is a problem on the map: not a Network's Trips, which the summary names where
 * they dropped (moved()), nor its Closures, nor buses where their Line has no track, which no fix
 * upstream draws (ADR-0012), nor a length, a node or the measures, which move with any change to it.
 */
const PROBLEM: Record<Spot['kind'], boolean> = { kept: true, turn: true, branch: true, trip: true, bus: false, notrips: true, trips: false, closures: false, copy: true, length: false, node: false, measures: false };

/** The most characters a GitHub comment holds, counted here as UTF-8's bytes, which are never fewer however GitHub counts them. */
const COMMENT = 65536;

/**
 * The comment that tells the maintainer of the problem spots new since the last build, on the
 * standing "Build report" issue: how many, with a link to the run, whose summary has the whole diff,
 * then as many as a comment holds, each with its links and its first line of the log, which names
 * its Stations, so that one with many Trips left out doesn't push the others out, and how many more
 * there are. Nothing where none is new. With no last report, every one is new.
 * ponytail: measures the whole comment again for each spot it cuts, 0.2 s for a thousand new spots
 * and 1.4 s for three thousand; add up each spot's size if a build ever finds many more.
 */
export function comment(last: Spot[] | undefined, spots: Spot[], run: string): string | undefined {
  const before = new Set(last?.map((s) => s.key));
  const items = spots
    .filter((s) => PROBLEM[s.kind] && !before.has(s.key))
    .map((s) => item({ ...s, text: [...s.text.slice(0, 1), ...(s.text.length > 1 ? [`…and ${s.text.length - 1} more like it, in the run's summary`] : [])] }));
  if (!items.length) return undefined;
  const count = `${items.length} new problem spot${items.length === 1 ? '' : 's'}`;
  const head = `${last ? `${count} since the last build` : `${count}: with no last report to diff against, every spot is new`}. The whole diff is in [the run's summary](${run}).`;
  const body = (n: number) => [head, '', ...items.slice(0, n), ...(n < items.length ? [`- …and ${items.length - n} more, in the run's summary`] : [])].join('\n');
  let n = items.length;
  while (Buffer.byteLength(body(n)) > COMMENT) n--;
  return body(n);
}

/**
 * The share of a Network's Trips on a day of the week that it can lose against the last report before
 * the summary names it: a guess (#252), to tune after a week of reports.
 */
const DROP = 0.25;

/**
 * How a spot's numbers moved since the last report, as `name (was → now)`, or nothing where none did:
 * a length's by more than a point, a Network's Trips on a day of the week only where they dropped by
 * more than DROP, any other by any. Compared in tenths, which every number is rounded to, so 0.1 to
 * 1.1 is a point.
 */
function moved(was: Spot | undefined, spot: Spot): string {
  if (!was) return '';
  const leeway = spot.kind === 'length' ? 10 : 0;
  const names = new Set([...Object.keys(was.numbers ?? {}), ...Object.keys(spot.numbers ?? {})]);
  return [...names]
    .filter((name) => {
      const [a, b] = [was.numbers?.[name], spot.numbers?.[name]];
      // A day first counted isn't a change: each report carries over the last one's other days of the week.
      if (spot.kind === 'trips') return a !== undefined && b !== undefined && b < a * (1 - DROP);
      return a === undefined || b === undefined || Math.abs(Math.round(a * 10) - Math.round(b * 10)) > leeway;
    })
    .map((name) => `${name} (${was.numbers?.[name] ?? 'none'} → ${spot.numbers?.[name] ?? 'none'})`)
    .join(', ');
}

/** A spot in the summary: its key, how its numbers moved, its links, and its lines of the log. */
function item(spot: Spot, moves = ''): string {
  const head = [`\`${spot.key}\`${moves && `: ${moves}`}`, ...links(spot)].join(' · ');
  return [`- ${head}`, ...spot.text.map((line) => `  - ${line}`)].join('\n');
}

/**
 * Links to a spot on the map, which rings it (#254), and on OpenStreetMap, to see it and to edit it,
 * and to the ways its Stations are on. A Trip left out at a Station its feed doesn't list is nowhere:
 * NaN where it's found, null once read back.
 */
function links({ point: [lon, lat] = [NaN, NaN], zoom, ways = [] }: Spot): string[] {
  return [
    ...(Number.isFinite(lon) && Number.isFinite(lat) && zoom !== undefined
      ? [`[map](${MAP}/#map=${zoom}/${lat}/${lon}&mark=${lat},${lon})`, `[OpenStreetMap](${OSM}/#map=17/${lat}/${lon})`, `[edit](${OSM}/edit#map=18/${lat}/${lon})`]
      : []),
    ...(ways.length ? [`ways ${ways.map((id) => `[${id}](${OSM}/way/${id})`).join(', ')}`] : []),
  ];
}
