// The track each Line's Trains run on, traced along OpenStreetMap's rails (ADR-0004).

import { along, closestOnSegment, DEGREE, EARTH, pointAt, type Network, type Point, type Shape, type Station } from '../bundle.ts';
import { simplify } from './offset.ts';
import type { OsmWay } from './osm.ts';
import type { Cause, Found } from './report.ts';

/** A shape as the feed draws it, the Line its Trips run, and the Stations they serve. */
export interface FeedShape {
  id: string;
  line: string;
  coords: Point[];
  stations: string[];
}

/** A Trip, by its shape and its first and last Stations. */
interface TripEnds {
  shape: string;
  from: string;
  to: string;
}

/**
 * Each shape once for each way its Trips run it, so that each way is traced on its own track: the
 * way the feed draws it keeps its ID, and the way back, its points reversed, is `<id>:back`. A Trip
 * runs its shape back where its last Station comes before its first in the order the shape's trace
 * takes them, beyond the shape's ends too (inOrder()). Gives those shapes, given every Trip on any
 * day, and the one each Trip runs on.
 */
export function eachWay(shapes: FeedShape[], stations: Station[], trips: TripEnds[]): { shapes: FeedShape[]; shapeOf: (trip: TripEnds) => string } {
  const byId = new Map(stations.map((s) => [s.id, s]));
  const orders = new Map(shapes.map((s) => [s.id, new Map(inOrder(s, s.stations.flatMap((id) => byId.get(id) ?? [])).map((w) => [w.station.id, w.order]))]));
  const back = ({ shape, from, to }: TripEnds) => {
    const [a, b] = [orders.get(shape)?.get(from), orders.get(shape)?.get(to)];
    return a !== undefined && b !== undefined && b < a;
  };
  const ways = new Map<string, Set<boolean>>();
  for (const trip of trips) ways.set(trip.shape, (ways.get(trip.shape) ?? new Set()).add(back(trip)));
  return {
    shapes: shapes.flatMap((s) => {
      const way = ways.get(s.id);
      return [
        ...(!way || way.has(false) ? [s] : []),
        ...(way?.has(true) ? [{ ...s, id: `${s.id}:back`, coords: s.coords.toReversed() }] : []),
      ];
    }),
    shapeOf: (trip) => (back(trip) ? `${trip.shape}:back` : trip.shape),
  };
}

/**
 * A Station is on the rails that pass within 50 m of its nearest one, if that is within 200 m. Renfe's
 * coordinates can sit 130 m from the platforms, and a big station's tracks spread over 50 m.
 */
const REACH = 200;
const BAND = 50;

/** A Station is on the feed's shape within 300 m of it: its Stations are within 160 m, and the ones it lacks are kilometres away. */
const ON_FEED = 300;

/**
 * What leaving the way straight ahead at a switch costs, in metres of track. It keeps a trace on
 * its own track: the other track round the inside of a bend is only a metre or two shorter.
 */
const DIVERGE = 100;

/**
 * What track another Line already runs the same way costs, per metre. Lines traced earlier pull
 * later ones onto their track, so Lines that share track share it exactly rather than each taking
 * whichever of two tracks is a few metres shorter.
 */
const SHARED = 0.9;

/**
 * What the track of a double track that Trains going the other way run on costs, per metre. It
 * outweighs SHARED, and changing to the right track and back again across crossovers, 2 × DIVERGE,
 * on any stretch longer than 400 m.
 */
const WRONG_SIDE = 1.5;

/**
 * Two ways run alongside each other as tracks of a double track where they're 2–8 m apart: in
 * Catalonia 1,140 km of Iberian-gauge running line has another way that far alongside it. Ways
 * closer than 2 m are one track mapped twice, or about to meet at a switch.
 */
const [TWIN, APART] = [2, 8];

/** Tracks closer to parallel than this (a cosine) run alongside each other. */
const ALONGSIDE = 0.95;

/**
 * A bridge or tunnel shorter than this, in metres along a trace, is a bridge over a road or a short
 * underpass, which tracks alongside each other are often mapped crossing at different places: the
 * trace keeps the level either side of it.
 */
const BRIEF = 150;

/** What setting off back the way it came costs a trace at a Station, as at a terminus. */
const REVERSE = 2000;

/** How much dearer than the cheapest path to a Station another can be and still be weighed for the next stretch. */
const SLACK = 1000;

/**
 * Traces each shape along the rails, through the Stations its Trips serve in order along the shape,
 * the way its Trips run it. Between Stations it takes the shortest path a train can, except that a
 * trace keeps to its track rather than change tracks for a few metres, to the track of a double
 * track on the Network's running side, and to the track Lines traced before it take the same way.
 * What it logs, it reports too.
 */
export function traceShapes(
  shapes: FeedShape[],
  stations: Station[],
  rails: OsmWay[],
  side: Network['runningSide'],
  log = console.log,
  report: (found: Found) => void = () => {},
): Shape[] {
  const byId = new Map(stations.map((s) => [s.id, s]));
  const graph = railGraph(rails, [...new Set(shapes.flatMap((s) => s.stations))].flatMap((id) => byId.get(id) ?? []), side);
  const wrong: string[] = [];
  const traced = shapes.map((feed) => {
    const { shape, length } = traceShape(graph, feed, feed.stations.flatMap((id) => byId.get(id) ?? []), log, report);
    if (length.feed) {
      const [total, km, feedKm] = [shape.dist.at(-1) ?? 0, length.traced, length.feed].map((m) => (m / 1000).toFixed(1));
      const percent = (length.traced / length.feed - 1) * 100;
      const off = `${length.traced >= length.feed ? '+' : ''}${percent.toFixed(1)}%`;
      const line = `${feed.id}: ${total} km long. Where the feed has the track: ${km} km traced against its ${feedKm} km (${off})`;
      log(line);
      report({ kind: 'length', line: feed.line, shape: feed.id, point: middle(shape), extent: shape.coords, text: [line], numbers: { percent: Number(percent.toFixed(1)) } });
      // Each end of a trace can stop anywhere on its Station's rails, up to BAND off the feed's: on a
      // shape less than 2 km long, as funiculars are, that's more than 5%.
      if (Math.abs(length.traced - length.feed) > Math.max(0.05 * length.feed, 2 * BAND)) {
        wrong.push(`${feed.id}'s traced track is ${km} km against the feed's ${feedKm} km (${off})`);
      }
    }
    return shape;
  });
  // OpenStreetMap can be wrong too, say with a line mapped on an old alignment.
  if (wrong.length) throw new Error(wrong.join('\n'));
  return traced;
}

/**
 * A Station within 20 m of another Network's is published at its point, or both at one building's,
 * as at Lleida-Pirineus, 40 m from either Network's track. A Station within 20 m of its track is on it.
 */
const SAME_POINT = 20;

/**
 * Each Network's Stations, but where one is published at the point of another Network's Station on
 * that Network's track, and nearer it than its own, as Renfe publishes Martorell Central at FGC's,
 * 60 m from R4 (#158): that one goes onto its own track, where its Trains stop, and the two are one place.
 */
export function onOwnTrack(networks: { stations: Station[]; shapes: Shape[] }[]): Station[][] {
  const closest = (s: Station, shapes: Shape[]) =>
    shapes.map((shape) => ({ shape, ...nearest(shape.coords, [s.lon, s.lat]) })).reduce((a, b) => (b.metres < a.metres ? b : a));
  const [moved, places] = [new Map<string, Station>(), new Map<string, string>()];
  for (const [n, { stations, shapes }] of networks.entries()) {
    if (!shapes.length) continue;
    for (const s of stations) {
      // ponytail: onto the nearest of any of its Network's track, not only its own Lines'; keep to the
      // shapes whose Trips call there if a Line that doesn't passes nearer one day.
      let own: ReturnType<typeof closest> | undefined;
      // Another Network's Station of the same ID is the same Station, where both Networks' Trains stop (#243).
      const onTheirs = (o: Station, other: Shape[]) =>
        o.id !== s.id &&
        metres([s.lon, s.lat], [o.lon, o.lat]) <= SAME_POINT &&
        closest(o, other).metres <= SAME_POINT &&
        closest(s, other).metres < (own ??= closest(s, shapes)).metres;
      const there = networks.flatMap((other, m) => (m === n || !other.shapes.length ? [] : other.stations.filter((o) => onTheirs(o, other.shapes))))[0];
      if (!there || !own) continue;
      const [lon, lat] = lerp(own.shape.coords[own.i] ?? [NaN, NaN], own.shape.coords[own.i + 1] ?? [NaN, NaN], own.t);
      // A second Station published at the same point joins the place the first made.
      const place = there.place ?? places.get(there.id) ?? s.place ?? s.id;
      // ponytail: by ID, so where two Networks share a Station published at a third's, both copies go
      // onto the track of the last to move it. Key the moves by Network too if their tracks lie apart there.
      moved.set(s.id, { ...s, lon: round(lon), lat: round(lat), place });
      places.set(there.id, place);
    }
  }
  return networks.map(({ stations }) =>
    stations.map((s) => {
      const place = places.get(s.id);
      return moved.get(s.id) ?? (place ? { ...s, place } : s);
    }),
  );
}

/**
 * Every Network's Stations, each once, as onOwnTrack() places them: a Station two Networks share, as
 * both Renfe timetables have Sants as `adif:71801`, is one Station, as the first of them has it, naming
 * every Network whose Trains stop there (#243).
 */
export function stationsOf(networks: { network: Pick<Network, 'id'>; stations: Station[]; shapes: Shape[] }[]): Station[] {
  const byId = new Map<string, Station & { networks: string[] }>();
  for (const [n, stations] of onOwnTrack(networks).entries()) {
    const id = networks[n]?.network.id ?? '';
    for (const s of stations) {
      const known = byId.get(s.id);
      if (!known) byId.set(s.id, { ...s, networks: [id] });
      else if (!known.networks.includes(id)) known.networks.push(id);
    }
  }
  return [...byId.values()];
}

/**
 * One shape traced, and its length where both of a stretch's Stations are on the feed's shape, as
 * traced and in the feed: there the two should be about as long. Stations left out one after another
 * on a branch are one spot, as is a run of legs between Stations that keep the feed's shape for one cause.
 */
function traceShape(graph: Graph, feed: FeedShape, stations: Station[], log: (line: string) => void, report: (found: Found) => void) {
  const all = inOrder(feed, stations);
  // A Station off the feed's shape partway along it is on a branch. Running out to it and back would
  // send every other Trip there too, so it's left out: its Trips can't place it on their shape.
  const branch = (w: Waypoint) => w.metres > ON_FEED && w.order === w.along;
  const branches: Waypoint[][] = []; // each run of them, one after another along the shape
  for (const [i, w] of all.entries()) {
    const prev = all[i - 1];
    if (!branch(w)) continue;
    if (prev && branch(prev)) branches.at(-1)?.push(w);
    else branches.push([w]);
  }
  for (const run of branches) {
    const text = run.map((w) => `${feed.id} leaves out ${w.station.name}: it lies off the feed's shape, on a branch`);
    for (const line of text) log(line);
    report({ kind: 'branch', line: feed.line, shape: feed.id, stations: run.map((w) => w.station), text });
  }
  const waypoints = all.filter((w) => !branch(w));
  const length = { traced: 0, feed: 0 };
  if (waypoints.length < 2) {
    const line = `${feed.id} keeps the feed's shape: its Trips serve fewer than two Stations`;
    log(line);
    const asFed = shape(feed.id, feed.coords);
    report({ kind: 'kept', why: 'fewer', line: feed.line, shape: feed.id, stations: waypoints.map((w) => w.station), point: middle(asFed), extent: asFed.coords, text: [line] });
    return { shape: asFed, length };
  }
  const coords: Point[] = [];
  const levels: string[] = []; // of the track up to each point
  const starts = (i: number): Arrival[] =>
    (graph.near.get(waypoints[i]?.station.id ?? '') ?? []).map((vertex) => ({ vertex, edge: -1, cost: 0, waypoint: i, edges: [] }));
  // Draws the cheapest path traced to the last Station reached, and counts its length.
  const draw = (reached: Arrival[]) => {
    const stretches = cheapest(reached);
    const edges = stretches.flatMap((a) => a.edges);
    const [first] = edges;
    if (first !== undefined) {
      coords.push(...[source(graph, first), ...edges.map((e) => target(graph, e))].map((v) => point(graph, v)));
      levels.push(...[first, ...edges].map((e) => graph.level[e] ?? ''));
    }
    for (const e of edges) graph.shared.add(e);
    for (const a of stretches) {
      const [from, to] = [waypoints[a.waypoint - 1], waypoints[a.waypoint]];
      // Where it turns back on the way: where the next edge isn't one a train can carry on along.
      for (const [k, e] of a.edges.entries()) {
        const f = a.edges[k + 1];
        if (f === undefined || onward(graph, e).next.includes(f)) continue;
        const at = waypoints.find((w) => graph.near.get(w.station.id)?.includes(target(graph, e)));
        const line = `${feed.id}: ${from?.station.name} → ${to?.station.name} turns back at ${at?.station.name}`;
        log(line);
        report({ kind: 'turn', line: feed.line, shape: feed.id, stations: at ? [at.station] : [], text: [line] });
      }
      if (!from || !to || from.metres > ON_FEED || to.metres > ON_FEED) continue;
      length.traced += a.edges.reduce((sum, e) => sum + (graph.metres[e] ?? 0), 0);
      length.feed += to.along - from.along;
    }
  };

  // A trace can turn back at any of its Stations, on the way from one to the next too, and says where.
  // ponytail: at any of them, not only where its Trips do; tell them apart if a trace ever turns back
  // where no Trip does.
  const turnBacks = new Set(waypoints.flatMap((w) => graph.near.get(w.station.id) ?? []));
  // The run of legs keeping the feed's shape that the last leg to keep it is in, reported once it ends.
  let keeping: { why: Cause; stations: Station[]; text: string[] } | undefined;
  const reportKept = () => keeping && report({ kind: 'kept', line: feed.line, shape: feed.id, ...keeping });
  let reached = starts(0);
  for (const [i, b] of waypoints.entries()) {
    const a = waypoints[i - 1];
    if (!a) continue;
    // A path much longer than the crow flies is no path: most likely the rails between them are missing.
    const limit = 3 * metres([a.station.lon, a.station.lat], [b.station.lon, b.station.lat]) + 10_000;
    const next = paths(graph, reached, new Set(graph.near.get(b.station.id)), limit, turnBacks).map((arrival) => ({ ...arrival, waypoint: i }));
    if (next.length) {
      reached = next;
      continue;
    }
    draw(reached);
    // Beyond either end of the feed's shape it has no track to keep: it would only jump back to that end.
    if (a.along !== b.along) {
      const kept = piece(feed.coords, a.along, b.along);
      coords.push(...kept);
      levels.push(...kept.map(() => ''));
    }
    const off = [a, b].find((w) => !graph.near.has(w.station.id));
    const line = `${feed.id}: ${a.station.name} → ${b.station.name} keeps the feed's shape: ${off ? `${off.station.name} is off the network` : 'no path along the rails'}`;
    log(line);
    const why = off ? 'off' : 'nopath';
    if (keeping?.why === why && keeping.stations.at(-1) === a.station) {
      keeping.stations.push(b.station);
      keeping.text.push(line);
    } else {
      reportKept();
      keeping = { why, stations: [a.station, b.station], text: [line] };
    }
    reached = starts(i);
  }
  reportKept();
  draw(reached);
  return { shape: shape(feed.id, coords, levels), length };
}

/** A Station a shape's Trips serve, placed on the feed's shape: how far along it, and how far from it, in metres. */
interface Waypoint {
  station: Station;
  along: number;
  metres: number;
  /** Where it comes in the shape: along it, or before or after it by how far out from that end it is, Station by Station. */
  order: number;
}

/**
 * The Stations a shape's Trips serve, in order along the feed's shape. Beyond either end of it, the
 * next is the nearest to the one before, out from that end, as the line beyond needn't head straight
 * away from it: past R15's shape's end at Riba-roja d'Ebre, La Zaida-Sástago is nearer to it than La
 * Puebla de Híjar, the Station before.
 * ponytail: a line beyond that bends back past a Station it has left, as a horseshoe can, still comes
 * out of order, and eachWay() can run a Trip there the wrong way; order by the Trips' calls if one
 * ever does.
 */
function inOrder(feed: FeedShape, stations: Station[]): Waypoint[] {
  const all = stations.map((station) => {
    const n = nearest(feed.coords, [station.lon, station.lat]);
    return { station, along: n.along, metres: n.metres, order: orderAlong(feed.coords, n) };
  });
  const pointOf = (w: Waypoint): Point => [w.station.lon, w.station.lat];
  for (const [end, way] of [[feed.coords.at(-1), 1], [feed.coords[0], -1]] as const) {
    let [at, out] = [end, 0];
    const rest = new Set(all.filter((w) => Math.sign(w.order - w.along) === way));
    while (at && rest.size) {
      const from = at;
      const next = [...rest].reduce((a, b) => (metres(from, pointOf(a)) <= metres(from, pointOf(b)) ? a : b));
      [at, out] = [pointOf(next), out + metres(from, pointOf(next))];
      next.order = next.along + way * out;
      rest.delete(next);
    }
  }
  return all.sort((a, b) => a.order - b.order);
}

/**
 * Where a point comes along a line, given where nearest() found it closest. Trips can run beyond a
 * shape, so a point beyond either end comes by how far beyond that end it is. inOrder() takes from
 * it only which end, and orders the points beyond each end Station by Station.
 */
function orderAlong(polyline: Point[], n: ReturnType<typeof nearest>): number {
  return n.along + (n.i === 0 && n.t === 0 ? -n.metres : n.i === polyline.length - 2 && n.t === 1 ? n.metres : 0);
}

/** One way a trace can reach a vertex beside a waypoint: by which edge (-1 where it starts), at what cost, and from where. */
interface Arrival {
  vertex: number;
  edge: number;
  cost: number;
  /** Which of the shape's waypoints it reaches. */
  waypoint: number;
  /** Where the stretch to it set off, at the waypoint before, and the edges from there. */
  from?: Arrival;
  edges: number[];
}

/** The stretches of the cheapest of these arrivals, from where its trace started. */
function cheapest(reached: Arrival[]): Arrival[] {
  let arrival = reached.reduce<Arrival | undefined>((best, a) => (!best || a.cost < best.cost ? a : best), undefined);
  const stretches: Arrival[] = [];
  for (; arrival?.from; arrival = arrival.from) stretches.unshift(arrival);
  return stretches;
}

/** The rails as vertices joined by edges. */
interface Graph {
  /** Where each vertex is. */
  at: Point[];
  /** Directed edges, in pairs: edge e and edge e ^ 1 join the same two vertices in opposite directions. */
  to: number[];
  metres: number[];
  /** The edges leaving each vertex. */
  out: number[][];
  /** The vertices on the rails beside each Station. */
  near: Map<string, number[]>;
  /** The edges of the shapes traced so far, each the way it was run. */
  shared: Set<number>;
  /** For each edge, whether it's the wrong track of a double track to run the way it runs. */
  wrong: boolean[];
  /** The side of double track the Network's Trains keep to: 1 left, -1 right. */
  keep: number;
  /**
   * For each edge, whether OpenStreetMap tags Trains as running it that way (railway:preferred_direction):
   * 1 they do, -1 they run it the other way, 0 either way or untagged.
   */
  tagged: number[];
  /** For each edge, its way's level (level()). */
  level: string[];
}

function point(graph: Graph, v: number): Point {
  return graph.at[v] ?? [NaN, NaN];
}

/** The vertex an edge runs from. */
function source(graph: Graph, e: number): number {
  return graph.to[e ^ 1] ?? -1;
}

/** The vertex an edge runs to. */
function target(graph: Graph, e: number): number {
  return graph.to[e] ?? -1;
}

/** The rails as a graph, with a vertex where each Station is closest to each way near it, for Trains keeping to one side. */
function railGraph(rails: OsmWay[], stations: Station[], side: Network['runningSide']): Graph {
  const graph: Graph = { at: [], to: [], metres: [], out: [], near: new Map(), shared: new Set(), wrong: [], tagged: [], level: [], keep: side === 'left' ? 1 : -1 };
  const vertices = new Map<number, number>(); // each OpenStreetMap node's vertex
  const add = (p: Point) => {
    graph.at.push(p);
    graph.out.push([]);
    return graph.at.length - 1;
  };
  /** Joins a to b, where Trains run the way from a to b, as OpenStreetMap tags it: 1 mostly, -1 mostly the other way, 0 either or untagged. */
  const link = (a: number, b: number, way: number, onLevel: string) => {
    const d = metres(point(graph, a), point(graph, b));
    for (const [from, to, tagged] of [[a, b, way], [b, a, -way]] as const) {
      graph.out[from]?.push(graph.to.length);
      graph.to.push(to);
      graph.metres.push(d);
      graph.tagged.push(tagged);
      graph.level.push(onLevel);
    }
  };

  // Where each Station comes closest to each way near it: segment i, a fraction t along it.
  const cuts = new Map<OsmWay, { i: number; t: number; station: string }[]>();
  for (const [station, near] of railsBeside(rails, stations)) {
    for (const { way, i, t } of near) cuts.set(way, [...(cuts.get(way) ?? []), { i, t, station }]);
  }

  for (const way of rails) {
    const [tagged, onLevel] = [{ forward: 1, backward: -1 }[way.tags['railway:preferred_direction'] ?? ''] ?? 0, level(way.tags)];
    const nodes = way.nodes.map((id, i) => {
      const g = way.geometry[i] ?? { lon: NaN, lat: NaN };
      const v = vertices.get(id) ?? add([g.lon, g.lat]);
      vertices.set(id, v);
      return v;
    });
    const wayCuts = (cuts.get(way) ?? []).sort((a, b) => a.i - b.i || a.t - b.t);
    for (const [i, v1] of nodes.entries()) {
      const v0 = nodes[i - 1];
      if (v0 === undefined) continue;
      const [a, b] = [point(graph, v0), point(graph, v1)];
      let prev = v0;
      for (const cut of wayCuts.filter((c) => c.i === i - 1)) {
        const p = lerp(a, b, cut.t);
        // A cut within a metre of a vertex is that vertex, so turns at a junction's node keep its rules.
        let v = metres(p, b) < 1 ? v1 : metres(p, point(graph, prev)) < 1 ? prev : -1;
        if (v < 0) {
          v = add(p);
          link(prev, v, tagged, onLevel);
          prev = v;
        }
        graph.near.set(cut.station, [...(graph.near.get(cut.station) ?? []), v]);
      }
      link(prev, v1, tagged, onLevel);
    }
  }
  graph.wrong = wrongTracks(graph);
  return graph;
}

/**
 * The ways each Station is on (see REACH), and where it comes closest to each: segment i, a fraction t
 * along it. A Station off the rails has none.
 */
export function railsBeside(rails: OsmWay[], stations: Station[]): Map<string, ({ way: OsmWay } & ReturnType<typeof nearest>)[]> {
  const polylines = rails.map((way) => ({ way, polyline: way.geometry.map((g): Point => [g.lon, g.lat]) }));
  const boxes = polylines.map(({ polyline }) => [0, 1].map((k) => [Math.min(...polyline.map((p) => p[k] ?? 0)), Math.max(...polyline.map((p) => p[k] ?? 0))]));
  const found = new Map<string, ({ way: OsmWay } & ReturnType<typeof nearest>)[]>();
  for (const s of stations) {
    // Rails further than REACH + BAND can't count, so skip the ways whose bounding box is.
    const lat = (REACH + BAND) / DEGREE;
    const lon = lat / Math.cos((s.lat * Math.PI) / 180);
    const closest = polylines
      .filter((_, i) => {
        const [[west = 0, east = 0] = [], [south = 0, north = 0] = []] = boxes[i] ?? [];
        return s.lon > west - lon && s.lon < east + lon && s.lat > south - lat && s.lat < north + lat;
      })
      .map(({ way, polyline }) => ({ way, ...nearest(polyline, [s.lon, s.lat]) }));
    const first = Math.min(...closest.map((c) => c.metres));
    if (first <= REACH) found.set(s.id, closest.filter((c) => c.metres <= first + BAND));
  }
  return found;
}

/**
 * Whether each edge is the wrong track of a double track to run the way it runs: the one Trains the
 * other way take. Where OpenStreetMap tags which way Trains run both tracks of the pair, opposite
 * ways, that's the one tagged for the other way, as on L2 between Tetuan and Paral·lel, which runs
 * on the left though the rest of the Metro keeps right. Elsewhere it's the one off the Network's
 * running side: where more tracks run side by side, they pair off from one side, so that each way
 * keeps to its side of the pair it runs on, and of an odd number, a track pairs with its nearest. A
 * tag on one track alone counts for nothing: R8 runs both ways over a track tagged one way near
 * Castellbisbal, with another line's track alongside. Judged at each edge's middle, across the
 * tracks there that are each TWIN to APART from the next.
 */
function wrongTracks(graph: Graph): boolean[] {
  // Flat metres, at the rails' middle latitude: across Spain's rails, east to west, up to about 7% off.
  const lat = graph.at.reduce((sum, p) => sum + p[1], 0) / (graph.at.length || 1);
  const kx = DEGREE * Math.cos((lat * Math.PI) / 180);
  const xy = graph.at.map(([lon, la]) => [lon * kx, la * DEGREE] as const);
  const WIDE = 3 * APART; // how far across to look: a double track either side
  const cells = new Map<string, number[]>();
  const cell = (x: number, y: number) => `${Math.floor(x / WIDE)} ${Math.floor(y / WIDE)}`;
  const ends = (e: number) => [xy[graph.to[e + 1] ?? -1] ?? [0, 0], xy[graph.to[e] ?? -1] ?? [0, 0]] as const;
  for (let e = 0; e < graph.to.length; e += 2) {
    const [[ax, ay], [bx, by]] = ends(e);
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / (WIDE / 2)) || 1;
    const seen = new Set<string>();
    for (let k = 0; k <= steps; k++) seen.add(cell(ax + ((bx - ax) * k) / steps, ay + ((by - ay) * k) / steps));
    for (const c of seen) cells.set(c, [...(cells.get(c) ?? []), e]);
  }
  const wrong = new Array<boolean>(graph.to.length).fill(false);
  for (let e = 0; e < graph.to.length; e += 2) {
    const [[ax, ay], [bx, by]] = ends(e);
    const length = Math.hypot(bx - ax, by - ay);
    if (!length) continue;
    const [ux, uy, mx, my] = [(bx - ax) / length, (by - ay) / length, (ax + bx) / 2, (ay + by) / 2];
    // How far left of this edge's middle each track alongside it is, this one's at 0, and which way
    // OpenStreetMap tags Trains as running it, looking this edge's way.
    const across = [{ d: 0, way: graph.tagged[e] ?? 0 }];
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const f of cells.get(cell(mx + i * WIDE, my + j * WIDE)) ?? []) {
          const [[cx, cy], [dx, dy]] = ends(f);
          const [vx, vy] = [dx - cx, dy - cy];
          const l2 = vx * vx + vy * vy;
          if (!l2 || Math.abs(vx * ux + vy * uy) / Math.sqrt(l2) < ALONGSIDE) continue;
          const t = Math.max(0, Math.min(1, ((mx - cx) * vx + (my - cy) * vy) / l2));
          const [qx, qy] = [cx + vx * t - mx, cy + vy * t - my];
          // Only where it runs right beside the middle, not ahead or behind.
          if (Math.abs(qx * ux + qy * uy) <= 1) across.push({ d: ux * qy - uy * qx, way: (graph.tagged[f] ?? 0) * Math.sign(vx * ux + vy * uy) });
        }
      }
    }
    // The tracks, from right to left, each as how far left its nearest and furthest edges are, and its tag.
    const tracks: [right: number, left: number, way: number][] = [];
    for (const { d, way } of across.sort((a, b) => a.d - b.d)) {
      const last = tracks.at(-1);
      if (last && d - last[1] < TWIN) [last[1], last[2]] = [d, last[2] || way];
      else tracks.push([d, d, way]);
    }
    // This one's, and those beside it each within APART of the next.
    let i = tracks.findIndex(([right, left]) => right <= 0 && 0 <= left);
    let [from, to] = [i, i];
    while (from > 0 && (tracks[from]?.[0] ?? 0) - (tracks[from - 1]?.[1] ?? 0) <= APART) from--;
    while (to < tracks.length - 1 && (tracks[to + 1]?.[0] ?? 0) - (tracks[to]?.[1] ?? 0) <= APART) to++;
    const count = to - from + 1;
    if (count < 2) continue;
    i -= from;
    const gap = (k: number) => (k < 0 || k >= count ? Infinity : Math.abs((tracks[from + k]?.[0] ?? 0) - (tracks[from + i]?.[0] ?? 0)));
    const partner = count % 2 === 0 ? i ^ 1 : gap(i - 1) < gap(i + 1) ? i - 1 : i + 1;
    // 1 where Trains going this edge's way take this track, -1 where they take the other.
    const [mine = 0, theirs = 0] = [tracks[from + i]?.[2], tracks[from + partner]?.[2]];
    const take = mine && mine === -theirs ? mine : (partner > i ? -1 : 1) === graph.keep ? 1 : -1;
    [wrong[e], wrong[e + 1]] = [take < 0, take > 0];
  }
  return wrong;
}

/**
 * The paths from any of the arrivals `from` to the vertices `to`: the cheapest, and any others
 * within SLACK of it, which may suit the next stretch better. None if every one costs over `limit`.
 * On the way, a path can turn back at the vertices `turnBacks`, beside the shape's Stations, as it
 * can where it starts: R16's Trains from Tortosa turn back at L'Aldea to go on to Ulldecona.
 */
function paths(graph: Graph, from: Arrival[], to: Set<number>, limit: number, turnBacks: Set<number>): Omit<Arrival, 'waypoint'>[] {
  const cost = new Map<number, number>();
  const pred = new Map<number, number>(); // the edge before each edge, or -1 for the first of a stretch
  const seed = new Map<number, Arrival>();
  const queue = heap();
  const relax = (f: number, c: number, e: number, start: Arrival) => {
    if (c >= (cost.get(f) ?? Infinity)) return;
    cost.set(f, c);
    pred.set(f, e);
    seed.set(f, start);
    queue.push(f, c);
  };
  for (const start of from) {
    // A trace sets off either way where it starts; elsewhere, turning back at the Station costs REVERSE.
    const { next, ahead } = start.edge < 0 ? { next: [], ahead: -1 } : onward(graph, start.edge);
    for (const f of graph.out[start.vertex] ?? []) {
      const extra = start.edge < 0 ? 0 : !next.includes(f) ? REVERSE : f === ahead ? 0 : DIVERGE;
      relax(f, start.cost + price(graph, f) + extra, -1, start);
    }
  }
  const found: Omit<Arrival, 'waypoint'>[] = [];
  let best = Infinity;
  while (queue.size) {
    const [e, c] = queue.pop();
    if (c > (cost.get(e) ?? Infinity)) continue;
    if (c > best + SLACK) break;
    const start = seed.get(e);
    if (!start || c - start.cost > limit) continue;
    const v = target(graph, e);
    if (to.has(v)) {
      const edges = [];
      for (let p = e; p >= 0; p = pred.get(p) ?? -1) edges.push(p);
      found.push({ vertex: v, edge: e, cost: c, from: start, edges: edges.reverse() });
      best = Math.min(best, c);
    }
    const { next, ahead } = onward(graph, e);
    for (const f of turnBacks.has(v) ? (graph.out[v] ?? []) : next) {
      relax(f, c + price(graph, f) + (!next.includes(f) ? REVERSE : f === ahead ? 0 : DIVERGE), e, start);
    }
  }
  return found;
}

/** The edges a train on edge e can go on along, and which of them is straight ahead. */
function onward(graph: Graph, e: number): { next: number[]; ahead: number } {
  const next = (graph.out[target(graph, e)] ?? []).filter((f) => f !== (e ^ 1) && runsOn(graph, e, f));
  const ahead = next.reduce((best, f) => (bend(graph, e, f) > bend(graph, e, best) ? f : best), next[0] ?? -1);
  return { next, ahead };
}

/**
 * What running along an edge costs: its length, less where another Line already runs it that way,
 * and more on the wrong track of a double track.
 */
function price(graph: Graph, e: number): number {
  return (graph.metres[e] ?? 0) * (graph.shared.has(e) ? SHARED : 1) * (graph.wrong[e] ? WRONG_SIDE : 1);
}

/**
 * Whether a train on edge e can carry on along edge f. At a switch or a crossing it can't turn by
 * more than a right angle: going from one of a switch's branches onto the other means reversing.
 * In Catalonia's rails every turn at a junction is under 60° or over 130°.
 */
function runsOn(graph: Graph, e: number, f: number): boolean {
  return (graph.out[target(graph, e)]?.length ?? 0) < 3 || bend(graph, e, f) >= 0;
}

/** The cosine of the turn from edge e onto edge f: 1 straight on, -1 straight back. */
function bend(graph: Graph, e: number, f: number): number {
  const [a, b, c] = [point(graph, source(graph, e)), point(graph, target(graph, e)), point(graph, target(graph, f))];
  const k = Math.cos((b[1] * Math.PI) / 180);
  const [ux, uy, vx, vy] = [(b[0] - a[0]) * k, b[1] - a[1], (c[0] - b[0]) * k, c[1] - b[1]];
  return (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1);
}

/** A binary min-heap of numbers, each with a key. */
function heap() {
  const items: number[] = [];
  const keys: number[] = [];
  return {
    get size() {
      return items.length;
    },
    push(item: number, key: number) {
      let i = items.length;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if ((keys[parent] ?? 0) <= key) break;
        items[i] = items[parent] ?? 0;
        keys[i] = keys[parent] ?? 0;
        i = parent;
      }
      items[i] = item;
      keys[i] = key;
    },
    pop(): [item: number, key: number] {
      const top: [number, number] = [items[0] ?? 0, keys[0] ?? 0];
      const item = items.pop() ?? 0;
      const key = keys.pop() ?? 0;
      if (items.length) {
        let i = 0;
        for (;;) {
          let child = 2 * i + 1;
          if (child >= items.length) break;
          if ((keys[child + 1] ?? Infinity) < (keys[child] ?? Infinity)) child++;
          if ((keys[child] ?? Infinity) >= key) break;
          items[i] = items[child] ?? 0;
          keys[i] = keys[child] ?? 0;
          i = child;
        }
        items[i] = item;
        keys[i] = key;
      }
      return top;
    },
  };
}

/** Where a line comes closest to a point: segment i, a fraction t along it, the distance along the line, and how far away. */
export function nearest(polyline: Point[], p: Point): { i: number; t: number; along: number; metres: number } {
  // Flat metres around p find the closest point; distances along the line are great-circle, as in piece().
  const kx = DEGREE * Math.cos((p[1] * Math.PI) / 180);
  const along = distances(polyline);
  let best = { i: 0, t: 0, along: 0, metres: Infinity };
  for (const [i, b] of polyline.entries()) {
    const a = polyline[i - 1];
    if (!a) continue;
    const [t, d] = closestOnSegment(a, b, p, kx);
    const [start = 0, end = 0] = [along[i - 1], along[i]];
    if (d < best.metres) best = { i: i - 1, t, along: start + t * (end - start), metres: d };
  }
  return best;
}

/** The point halfway along a shape. */
function middle(shape: Shape): Point {
  return pointAt(shape, (shape.dist.at(-1) ?? 0) / 2);
}

/** The part of a line from one distance along it to another. */
function piece(polyline: Point[], from: number, to: number): Point[] {
  return along({ coords: polyline, dist: distances(polyline) }, from, to);
}

/** A Shape from its points, with the distance along it at each, and its levels, given the level of the track up to each point. */
function shape(id: string, all: Point[], levels: string[] = []): Shape {
  const [points, at]: [Point[], string[]] = [[], []];
  for (const [i, p] of all.entries()) {
    const last = points.at(-1);
    if (last && metres(last, p) <= 0.5) continue;
    points.push(p);
    at.push(levels[i] ?? '');
  }
  const dist = distances(points).map(Math.round);
  // Each length of one level, those under BRIEF merged into their neighbours.
  const runs = merged(at.slice(1).map((level, i) => ({ key: level, metres: (dist[i + 1] ?? 0) - (dist[i] ?? 0), from: dist[i] ?? 0 })), BRIEF);
  // The ground at its start goes without saying.
  const found = runs.filter((r, i) => r.key || i).map((r): [number, string] => [r.from, r.key]);
  return { id, coords: points.map(([lon, lat]) => [round(lon, 1e6), round(lat, 1e6)]), dist, ...(found.length && { levels: found }) };
}

/**
 * Each way without the points less than FINE off its line, mostly along straight track; done to
 * the rails rather than to each shape, so Lines on the same rails keep the same points. Its ends,
 * and where it meets another, stay. It pays for the sixth decimal shapes take (#203).
 */
export function fine(rails: OsmWay[]): OsmWay[] {
  const plain = carriesOn(rails);
  return rails.map((way) => {
    const kx = Math.cos(((way.geometry[0]?.lat ?? 0) * Math.PI) / 180);
    const flat = way.geometry.map(({ lon, lat }): Point => [lon * kx * DEGREE, lat * DEGREE]);
    const kept = new Set(simplify(flat, FINE));
    const keep = (_: unknown, i: number) => kept.has(flat[i] as Point) || !plain(way, i);
    return { ...way, nodes: way.nodes.filter(keep), geometry: way.geometry.filter(keep) };
  });
}

/**
 * How far off a way's line a point may be and go, in metres: under a pixel at zoom 18, the rails
 * source's last, where a pixel is 0.45 m in Catalonia.
 */
const FINE = 0.3;

/** Whether a way's i-th node only carries it on: in no other way, or the end of it and of one other. */
function carriesOn(rails: OsmWay[]): (way: OsmWay, i: number) => boolean {
  const ends = new Map<number, boolean[]>(); // for each node, at each of its ways, whether it's that way's end
  for (const way of rails) for (const [i, id] of way.nodes.entries()) ends.set(id, [...(ends.get(id) ?? []), i === 0 || i === way.nodes.length - 1]);
  return (way, i) => {
    const at = ends.get(way.nodes[i] ?? NaN) ?? [];
    return (at.length === 1 && !at[0]) || (at.length === 2 && at.every(Boolean));
  };
}

/** A way's level: `tunnel`, `bridge` or, off the ground, `layer`, and its layer, which OpenStreetMap takes as -1 in a tunnel and 1 on a bridge where it's untagged; or '' on the ground. */
function level(tags: Record<string, string>): string {
  const [tunnel, bridge] = [tags.tunnel, tags.bridge].map((t) => !!t && t !== 'no');
  const tagged = Number.parseInt(tags.layer ?? '', 10);
  const layer = Number.isNaN(tagged) ? (tunnel ? -1 : bridge ? 1 : 0) : tagged;
  return tunnel ? `tunnel ${layer}` : bridge ? `bridge ${layer}` : layer ? `layer ${layer}` : '';
}

/**
 * Lengths of something along a line, each under `short` metres merged into a neighbour, shortest
 * first: into the one it interrupts, or else the longer. The one merged into keeps its key.
 * ponytail: the rule sideBySide's merge() follows for spans of pieces; share one if a third needs it.
 */
function merged<T extends { key: string; metres: number; from: number }>(parts: T[], short: number): T[] {
  let list = parts.reduce<T[]>((all, p) => {
    const last = all.at(-1);
    if (last?.key === p.key) last.metres += p.metres;
    else all.push({ ...p });
    return all;
  }, []);
  for (;;) {
    const s = list.filter((p) => p.metres < short).sort((a, b) => a.metres - b.metres)[0];
    const i = s ? list.indexOf(s) : -1;
    const [prev, next] = [list[i - 1], list[i + 1]];
    if (!s || (!prev && !next)) return list;
    if (prev && next && prev.key === next.key) list = list.toSpliced(i - 1, 3, { ...prev, metres: prev.metres + s.metres + next.metres });
    else if (prev && (!next || prev.metres >= next.metres)) list = list.toSpliced(i - 1, 2, { ...prev, metres: prev.metres + s.metres });
    else if (next) list = list.toSpliced(i, 2, { ...next, from: s.from, metres: s.metres + next.metres });
  }
}

/** The great-circle distance along a line at each of its points, in metres. */
export function distances(polyline: Point[]): number[] {
  let along = 0;
  return polyline.map((p, i) => {
    const prev = polyline[i - 1];
    if (prev) along += metres(prev, p);
    return along;
  });
}

/** The point a fraction t of the way from a to b. */
function lerp(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Great-circle distance, in metres. */
export function metres(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b[1] - a[1]) * rad) / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(((b[0] - a[0]) * rad) / 2) ** 2;
  return 2 * EARTH * Math.asin(Math.sqrt(h));
}

/** Five decimals is about a metre; a shape's points take six, so that the map's curves don't zig-zag zoomed in (#203). */
export function round(degrees: number, places = 1e5): number {
  return Math.round(degrees * places) / places;
}
