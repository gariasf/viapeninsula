// The track each Line's Trains run on, traced along OpenStreetMap's rails (ADR-0004).

import { along, closestOnSegment, DEGREE, EARTH, type Network, type Point, type Shape, type Station } from '../bundle.ts';
import type { OsmWay } from './osm.ts';

/** A shape as the feed draws it, and the Stations its Trips serve. */
export interface FeedShape {
  id: string;
  coords: Point[];
  stations: string[];
}

/** A Trip, by its shape and its first and last Stations. */
interface Run {
  shape: string;
  from: string;
  to: string;
}

/**
 * Each shape once for each way its Trips run it, so that each way is traced on its own track: the
 * way the feed draws it keeps its ID, and the way back, its points reversed, is `<id>:back`. A Trip
 * runs its shape back where its last Station comes before its first along it. Gives those shapes,
 * given every Trip on any day, and the one each Trip runs on.
 */
export function eachWay(shapes: FeedShape[], stations: Station[], trips: Run[]): { shapes: FeedShape[]; shapeOf: (trip: Run) => string } {
  const [byId, feeds] = [new Map(stations.map((s) => [s.id, s])), new Map(shapes.map((s) => [s.id, s]))];
  const known = new Map<string, boolean>();
  const back = ({ shape, from, to }: Run) => {
    const key = `${shape} ${from} ${to}`;
    const found = known.get(key);
    if (found !== undefined) return found;
    const [coords, a, b] = [feeds.get(shape)?.coords ?? [], byId.get(from), byId.get(to)];
    const order = (s: Station) => orderAlong(coords, nearest(coords, [s.lon, s.lat]));
    const is = !!a && !!b && order(b) < order(a);
    known.set(key, is);
    return is;
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

/** What setting off back the way it came costs a trace at a Station, as at a terminus. */
const REVERSE = 2000;

/** How much dearer than the cheapest path to a Station another can be and still be weighed for the next stretch. */
const SLACK = 1000;

/**
 * Traces each shape along the rails, through the Stations its Trips serve in order along the shape,
 * the way its Trips run it. Between Stations it takes the shortest path a train can, except that a
 * trace keeps to its track rather than change tracks for a few metres, to the track of a double
 * track on the Network's running side, and to the track Lines traced before it take the same way.
 */
export function traceShapes(shapes: FeedShape[], stations: Station[], rails: OsmWay[], side: Network['runningSide'], log = console.log): Shape[] {
  const byId = new Map(stations.map((s) => [s.id, s]));
  const graph = railGraph(rails, [...new Set(shapes.flatMap((s) => s.stations))].flatMap((id) => byId.get(id) ?? []));
  graph.keep = side === 'left' ? 1 : -1;
  const wrong: string[] = [];
  const traced = shapes.map((feed) => {
    const { shape, length } = traceShape(graph, feed, feed.stations.flatMap((id) => byId.get(id) ?? []), log);
    if (length.feed) {
      const [total, km, feedKm] = [shape.dist.at(-1) ?? 0, length.traced, length.feed].map((m) => (m / 1000).toFixed(1));
      const off = `${length.traced >= length.feed ? '+' : ''}${((length.traced / length.feed - 1) * 100).toFixed(1)}%`;
      log(`${feed.id}: ${total} km long. Where the feed has the track: ${km} km traced against its ${feedKm} km (${off})`);
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
 * One shape traced, and its length where both of a stretch's Stations are on the feed's shape, as
 * traced and in the feed: there the two should be about as long.
 */
function traceShape(graph: Graph, feed: FeedShape, stations: Station[], log: (line: string) => void) {
  const all = inOrder(feed, stations);
  // A Station off the feed's shape partway along it is on a branch. Running out to it and back would
  // send every other Trip there too, so it's left out: its Trips can't place it on their shape.
  const branch = (w: Waypoint) => w.metres > ON_FEED && w.order === w.along;
  for (const w of all.filter(branch)) log(`${feed.id} leaves out ${w.station.name}: it lies off the feed's shape, on a branch`);
  const waypoints = all.filter((w) => !branch(w));
  const length = { traced: 0, feed: 0 };
  if (waypoints.length < 2) {
    log(`${feed.id} keeps the feed's shape: its Trips serve fewer than two Stations`);
    return { shape: shape(feed.id, feed.coords), length };
  }
  const coords: Point[] = [];
  const starts = (i: number): Arrival[] =>
    (graph.near.get(waypoints[i]?.station.id ?? '') ?? []).map((vertex) => ({ vertex, edge: -1, cost: 0, waypoint: i, edges: [] }));
  // Draws the cheapest path traced to the last Station reached, and counts its length.
  const draw = (reached: Arrival[]) => {
    const stretches = cheapest(reached);
    const edges = stretches.flatMap((a) => a.edges);
    const [first] = edges;
    if (first !== undefined) coords.push(...[source(graph, first), ...edges.map((e) => target(graph, e))].map((v) => point(graph, v)));
    for (const e of edges) graph.shared.add(e);
    for (const a of stretches) {
      const [from, to] = [waypoints[a.waypoint - 1], waypoints[a.waypoint]];
      if (!from || !to || from.metres > ON_FEED || to.metres > ON_FEED) continue;
      length.traced += a.edges.reduce((sum, e) => sum + (graph.metres[e] ?? 0), 0);
      length.feed += to.along - from.along;
    }
  };

  let reached = starts(0);
  for (const [i, b] of waypoints.entries()) {
    const a = waypoints[i - 1];
    if (!a) continue;
    // A path much longer than the crow flies is no path: most likely the rails between them are missing.
    const limit = 3 * metres([a.station.lon, a.station.lat], [b.station.lon, b.station.lat]) + 10_000;
    const next = paths(graph, reached, new Set(graph.near.get(b.station.id)), limit).map((arrival) => ({ ...arrival, waypoint: i }));
    if (next.length) {
      reached = next;
      continue;
    }
    draw(reached);
    // Beyond either end of the feed's shape it has no track to keep: it would only jump back to that end.
    if (a.along !== b.along) coords.push(...piece(feed.coords, a.along, b.along));
    const off = [a, b].find((w) => !graph.near.has(w.station.id));
    const why = off ? `${off.station.name} is off the network` : 'no path along the rails';
    log(`${feed.id}: ${a.station.name} → ${b.station.name} keeps the feed's shape: ${why}`);
    reached = starts(i);
  }
  draw(reached);
  return { shape: shape(feed.id, coords), length };
}

/** A Station a shape's Trips serve, placed on the feed's shape: how far along it, and how far from it, in metres. */
interface Waypoint {
  station: Station;
  along: number;
  metres: number;
  /** Where it comes in the shape: along it, or before or after it by how far beyond its end it is. */
  order: number;
}

/** The Stations a shape's Trips serve, in order along the feed's shape. */
function inOrder(feed: FeedShape, stations: Station[]): Waypoint[] {
  return stations
    .map((station) => {
      const n = nearest(feed.coords, [station.lon, station.lat]);
      return { station, along: n.along, metres: n.metres, order: orderAlong(feed.coords, n) };
    })
    .sort((a, b) => a.order - b.order);
}

/**
 * Where a point comes along a line, given where nearest() found it closest. Trips can run beyond a
 * shape, so a point beyond either end comes by how far beyond that end it is.
 */
export function orderAlong(polyline: Point[], n: ReturnType<typeof nearest>): number {
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
  /**
   * For each edge, which track of a double track it is, looking the way it runs: 1 the left, -1
   * the right, 0 where it runs on no double track.
   */
  side: number[];
  /** The side of double track the Network's Trains keep to: 1 left, -1 right. */
  keep: number;
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

/** The rails as a graph, with a vertex where each Station is closest to each way near it. */
function railGraph(rails: OsmWay[], stations: Station[]): Graph {
  const graph: Graph = { at: [], to: [], metres: [], out: [], near: new Map(), shared: new Set(), side: [], keep: 0 };
  const vertices = new Map<number, number>(); // each OpenStreetMap node's vertex
  const add = (p: Point) => {
    graph.at.push(p);
    graph.out.push([]);
    return graph.at.length - 1;
  };
  const link = (a: number, b: number) => {
    const d = metres(point(graph, a), point(graph, b));
    for (const [from, to] of [[a, b], [b, a]] as const) {
      graph.out[from]?.push(graph.to.length);
      graph.to.push(to);
      graph.metres.push(d);
    }
  };

  // Where each Station comes closest to each way near it: segment i, a fraction t along it.
  const cuts = new Map<OsmWay, { i: number; t: number; station: string }[]>();
  const polylines = rails.map((way) => ({ way, polyline: way.geometry.map((g): Point => [g.lon, g.lat]) }));
  const boxes = polylines.map(({ polyline }) => [0, 1].map((k) => [Math.min(...polyline.map((p) => p[k] ?? 0)), Math.max(...polyline.map((p) => p[k] ?? 0))]));
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
    if (first > REACH) continue;
    for (const c of closest) {
      if (c.metres <= first + BAND) cuts.set(c.way, [...(cuts.get(c.way) ?? []), { i: c.i, t: c.t, station: s.id }]);
    }
  }

  for (const way of rails) {
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
          link(prev, v);
          prev = v;
        }
        graph.near.set(cut.station, [...(graph.near.get(cut.station) ?? []), v]);
      }
      link(prev, v1);
    }
  }
  graph.side = sides(graph);
  return graph;
}

/**
 * Which track of a double track each edge is, looking the way it runs: 1 the left, -1 the right, 0
 * on no double track. Where more tracks run side by side, they pair off from one side, so that each
 * way keeps to its side of the pair it runs on; of an odd number, a track pairs with its nearest.
 * Judged at each edge's middle, across the tracks there that are each TWIN to APART from the next.
 */
function sides(graph: Graph): number[] {
  // Flat metres, at the rails' middle latitude: across Catalonia that's no more than 4% off.
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
  const side = new Array<number>(graph.to.length).fill(0);
  for (let e = 0; e < graph.to.length; e += 2) {
    const [[ax, ay], [bx, by]] = ends(e);
    const length = Math.hypot(bx - ax, by - ay);
    if (!length) continue;
    const [ux, uy, mx, my] = [(bx - ax) / length, (by - ay) / length, (ax + bx) / 2, (ay + by) / 2];
    // How far left of this edge's middle each track alongside it is, this one's at 0.
    const across = [0];
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
          if (Math.abs(qx * ux + qy * uy) <= 1) across.push(ux * qy - uy * qx);
        }
      }
    }
    // The tracks, from right to left, each as how far left its nearest and furthest edges are.
    const tracks: [number, number][] = [];
    for (const d of across.sort((a, b) => a - b)) {
      const last = tracks.at(-1);
      if (last && d - last[1] < TWIN) last[1] = d;
      else tracks.push([d, d]);
    }
    // This one's, and those beside it each within APART of the next.
    let i = tracks.findIndex(([right, left]) => right <= 0 && 0 <= left);
    let [from, to] = [i, i];
    while (from > 0 && (tracks[from]?.[0] ?? 0) - (tracks[from - 1]?.[1] ?? 0) <= APART) from--;
    while (to < tracks.length - 1 && (tracks[to + 1]?.[0] ?? 0) - (tracks[to]?.[1] ?? 0) <= APART) to++;
    const count = to - from + 1;
    if (count < 2) continue;
    i -= from;
    const gap = (k: number) => Math.abs((tracks[from + k]?.[0] ?? Infinity) - (tracks[from + i]?.[0] ?? 0));
    const partner = count % 2 === 0 ? i ^ 1 : gap(i - 1) < gap(i + 1) ? i - 1 : i + 1;
    side[e] = partner > i ? -1 : 1;
    side[e + 1] = -(side[e] ?? 0);
  }
  return side;
}

/**
 * The paths from any of the arrivals `from` to the vertices `to`: the cheapest, and any others
 * within SLACK of it, which may suit the next stretch better. None if every one costs over `limit`.
 */
function paths(graph: Graph, from: Arrival[], to: Set<number>, limit: number): Omit<Arrival, 'waypoint'>[] {
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
    for (const f of next) relax(f, c + price(graph, f) + (f === ahead ? 0 : DIVERGE), e, start);
  }
  return found;
}

/** The edges a train on edge e can go on along, and which of them is straight ahead. */
function onward(graph: Graph, e: number): { next: number[]; ahead: number } {
  const next = (graph.out[target(graph, e)] ?? []).filter((f) => f !== (e ^ 1) && runsOn(graph, e, f));
  const ahead = next.reduce((best, f) => (bend(graph, e, f) > bend(graph, e, best) ? f : best), next[0] ?? -1);
  return { next, ahead };
}

/** What running along an edge costs: its length, less where another Line already runs it that way, more on the wrong side of a double track. */
function price(graph: Graph, e: number): number {
  return (graph.metres[e] ?? 0) * (graph.shared.has(e) ? SHARED : 1) * (graph.side[e] === -graph.keep ? WRONG_SIDE : 1);
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

/** The part of a line from one distance along it to another. */
function piece(polyline: Point[], from: number, to: number): Point[] {
  return along({ coords: polyline, dist: distances(polyline) }, from, to);
}

/** A Shape from its points, with the distance along it at each. */
function shape(id: string, all: Point[]): Shape {
  const points: Point[] = [];
  for (const p of all) {
    const last = points.at(-1);
    if (!last || metres(last, p) > 0.5) points.push(p);
  }
  return { id, coords: points.map(([lon, lat]) => [round(lon), round(lat)]), dist: distances(points).map(Math.round) };
}

/** The great-circle distance along a line at each of its points, in metres. */
function distances(polyline: Point[]): number[] {
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
function metres(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b[1] - a[1]) * rad) / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(((b[0] - a[0]) * rad) / 2) ** 2;
  return 2 * EARTH * Math.asin(Math.sqrt(h));
}

/** Five decimals is about a metre. */
function round(degrees: number): number {
  return Math.round(degrees * 1e5) / 1e5;
}
