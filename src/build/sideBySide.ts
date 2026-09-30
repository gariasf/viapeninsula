// How the map draws each Line: where Lines share track, side by side, as a transit map does.

import { DEGREE, pointAt, STRETCH, type Line, type Point, type Shape, type Stroke } from '../bundle.ts';
import { order, type Node } from './order.ts';
import { distances, nearest } from './track.ts';

/** Tracks less than this far apart, in metres, look like one zoomed out, so the Lines on them go side by side. */
const NEAR = 45;
/** How far to each side of a track to look for others, in metres. */
const WIDE = 3 * NEAR;
/** Tracks closer to parallel than this (a cosine) run alongside each other rather than cross. */
const PARALLEL = Math.cos(Math.PI / 6);
/** Longer segments are judged in pieces this long, in metres, by what runs beside each. */
const STEP = 50;
/** A Line doesn't shift over for less than this, in metres: another's track is only brushing past. */
const SHORT = 150;
/**
 * How many pieces either side a stretch's centreline is evened out over: how far it is from each
 * piece's tracks jitters with their points, which folds Lines drawn far off it zoomed out.
 */
const EVEN = 2;
/** How far along an edge from a node, in metres, the way it leaves the node is judged. */
const ANGLE = 300;

/** A piece of track: where its middle is and which way it points, in local metres, and the Lines on it. */
interface Piece {
  x: number;
  y: number;
  ux: number;
  uy: number;
  length: number;
  /** Each Line on it: 1 where it runs the way the piece points, going the way its first shape does, -1 the other way. */
  on: Map<number, number>;
}

/** One Line's run over a piece, along one of its shapes, from one distance along it to another. */
interface Step {
  line: number;
  piece: number;
  shape: string;
  /** 1 where the shape runs the way the piece points, -1 the other way. */
  way: number;
  from: number;
  to: number;
}

/** A Line on or beside a piece: the piece it's on, how far left of it, in metres (right if negative), whether on it or alongside it, and which way it runs. */
interface Neighbour {
  line: number;
  piece: number;
  left: number;
  on: boolean;
  alongside: boolean;
  way: number;
}

/**
 * The strokes that draw each Line. Where Lines share track, or run on tracks too close together to
 * tell apart zoomed out, those tracks are one stretch, drawn along one line between them, its
 * centreline: its Lines go side by side along it, a line width apart, in one order all along, and
 * each is drawn once, whichever way and whichever of its tracks it runs (ADR-0006). The centrelines
 * are shapes of their own. `rails` draws each Line on its own track instead, its shapes' track once,
 * for zoomed right in. And the sides of every one of each Line's shapes, all along it, where its
 * stroke on its own track would be drawn, for the map to put the Line's Trains on it.
 */
export async function sideBySide(lines: Line[], shapes: Shape[]): Promise<{ strokes: Stroke[]; centrelines: Shape[]; rails: Stroke[]; sides: Stroke[] }> {
  const { pieces, runs, every, kx } = walk(lines, shapes);
  const cells = grid(pieces);
  const nearby = pieces.map((_, i) => neighbours(i, pieces, cells));
  const turned = turn(lines.length, pieces, nearby.map((n) => byLine(cluster(n))));
  const tracks = nearby.map((n) => cluster(n, turned));
  const beside = tracks.map(byLine);
  const left = sides(lines.length, pieces, nearby, turned);
  const place = rank(left);
  const sideOf = (s: Step) => side(s, beside[s.piece] ?? new Map(), turned, left, place);
  const draw = (run: Step[], by = sideOf) => {
    const line = lines[run[0]?.line ?? -1]?.id ?? '';
    return strokes(run, by, pieces).map((s) => ({ line, ...s }));
  };
  const kept = lasting(every, pieces, tracks);
  const keptBeside = kept.map(byLine);
  const { centrelines, stretches: found, drawer } = stretches(pieces, every, kept, keptBeside, kx);
  // Each drawn piece's Stretch, the line graph's edge it's on, and how far along its centreline its middle is.
  const edgeOf = new Map(found.flatMap(({ steps }, e) => steps.map((s): [number, [edge: number, at: number]] => [s.piece, [e, (s.from + s.to) / 2]])));
  const most = (metres: Map<number, number>) => [...metres].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  // Where nothing else decides, a Stretch's Lines go in the order of the sides they take on it piece
  // by piece, for most of it.
  const prior = found.map(({ steps, lines: onIt }) => {
    const usual = (line: number) => {
      const metres = new Map<number, number>(); // at each side
      for (const s of steps) {
        if (!keptBeside[s.piece]?.has(line)) continue;
        const at = side({ ...s, line }, keptBeside[s.piece] ?? new Map(), turned, left, place);
        metres.set(at, (metres.get(at) ?? 0) + (pieces[s.piece]?.length ?? 0));
      }
      return most(metres);
    };
    return onIt.toSorted((a, b) => usual(a) - usual(b) || a - b);
  });
  const orders = await order(prior, graph(found, every, pieces, drawer, edgeOf, new Map(centrelines.map((c) => [c.id, c]))));
  // Each Line on each Stretch, a run for each time it's there, all at one side: its place in the
  // Stretch's order among the Lines there, for most of it. A SHORT Stretch merged into another brings
  // its Lines, but only there.
  const drawn = found.flatMap(({ steps, lines: onIt }, e) =>
    onIt.flatMap((line) => {
      const [list, metres] = [[] as Step[][], new Map<number, number>()];
      let run: Step[] | undefined;
      for (const s of steps) {
        if (!keptBeside[s.piece]?.has(line)) {
          run = undefined;
          continue;
        }
        if (!run) list.push((run = []));
        run.push({ ...s, line });
        const here = orders[e]?.filter((l) => keptBeside[s.piece]?.has(l)) ?? [];
        const at = here.indexOf(line) - (here.length - 1) / 2;
        metres.set(at, (metres.get(at) ?? 0) + (pieces[s.piece]?.length ?? 0));
      }
      const at = most(metres);
      return list.flatMap((run) => draw(run, () => at));
    }),
  );
  // Not flatMap(draw): that would pass each run's index as its sides.
  return { strokes: drawn, centrelines, rails: runs.flatMap((run) => draw(run)), sides: every.flatMap((run) => draw(run)) };
}

/**
 * The line graph's nodes, where the edges meet: where one follows another along a centreline, and
 * where a Line's shapes go from one edge to another. Each of a Line's shapes goes along the edges
 * its pieces are drawn on, in and out at their ends.
 */
function graph(edges: Stretch[], every: Step[][], pieces: Piece[], drawer: number[], edgeOf: Map<number, [edge: number, at: number]>, byId: Map<string, Shape>): Node[] {
  const parent = new Map<string, string>(); // each edge's end, `<edge> <end>`, towards its node's
  const root = (key: string): string => {
    const up = parent.get(key) ?? key;
    if (up === key) return key;
    const top = root(up);
    parent.set(key, top);
    return top;
  };
  const join = (a: string, b: string) => {
    const [ra, rb] = [root(a), root(b)];
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  };
  for (const [e, { steps }] of edges.entries()) {
    if (steps[0] && edges[e - 1]?.steps.at(-1)?.shape === steps[0].shape) join(`${e - 1} 1`, `${e} 0`);
  }
  const passes: { line: number; from: string; to: string }[] = [];
  for (const shape of every) {
    // The edges the shape goes along, and where along each it comes in and goes out.
    // Those it's on for under SHORT it's only brushing past, or crossing a node on.
    const visits: { edge: number; first: number; last: number; length: number }[] = [];
    for (const s of shape) {
      const [edge, middle] = edgeOf.get(drawer[s.piece] ?? s.piece) ?? [];
      if (edge === undefined || middle === undefined) continue;
      const v = visits.at(-1);
      if (v?.edge === edge) [v.last, v.length] = [middle, v.length + (pieces[s.piece]?.length ?? 0)];
      else visits.push({ edge, first: middle, last: middle, length: pieces[s.piece]?.length ?? 0 });
    }
    for (let i = visits.length - 1; i >= 0; i--) {
      const [v, w] = [visits[i], visits[i + 1]];
      if (v && v.length < SHORT) visits.splice(i, 1);
      else if (v && w && v.edge === w.edge) visits.splice(i, 2, { ...v, last: w.last, length: v.length + w.length });
    }
    for (const [i, v] of visits.entries()) {
      const w = visits[i + 1];
      if (!w) continue;
      const [out, into] = [end(v, edges, false), end(w, edges, true)];
      join(`${v.edge} ${out}`, `${w.edge} ${into}`);
      passes.push({ line: shape[0]?.line ?? -1, from: `${v.edge} ${out}`, to: `${w.edge} ${into}` });
    }
  }
  const nodes = new Map<string, Node>();
  const endOf = new Map<string, number>(); // each end's index in its node's
  const points = new Map<Node, [at: Point, ahead: Point][]>(); // each end's point, and where its edge is ANGLE on
  const node = (key: string) => {
    const top = root(key);
    const n = nodes.get(top) ?? { ends: [], passes: [] };
    nodes.set(top, n);
    if (!endOf.has(key)) {
      const [edge = 0, at = 0] = key.split(' ').map(Number);
      const steps = edges[edge]?.steps ?? [];
      const shape = byId.get(steps[0]?.shape ?? '') ?? { coords: [], dist: [] };
      const [from, to] = [steps[0]?.from ?? 0, steps.at(-1)?.to ?? 0];
      const inward = Math.min(ANGLE, to - from);
      points.set(n, [...(points.get(n) ?? []), at ? [pointAt(shape, to), pointAt(shape, to - inward)] : [pointAt(shape, from), pointAt(shape, from + inward)]]);
      endOf.set(key, n.ends.push({ edge, end: at ? 1 : 0, angle: 0 }) - 1);
    }
    return n;
  };
  for (const { line, from, to } of passes) {
    const n = node(from);
    node(to);
    n.passes.push({ line, from: endOf.get(from) ?? -1, to: endOf.get(to) ?? -1 });
  }
  // The way each edge leaves its node: from the middle of the node's ends, so that edges that leave
  // it side by side, the same way, are told apart by which side each is on.
  for (const [n, list] of points) {
    const [x, y] = [list.reduce((sum, [p]) => sum + p[0], 0) / list.length, list.reduce((sum, [p]) => sum + p[1], 0) / list.length];
    const cos = Math.cos((y * Math.PI) / 180);
    for (const [i, [, [lon, lat]]] of list.entries()) {
      const end = n.ends[i];
      if (end) end.angle = Math.atan2(lat - y, (lon - x) * cos);
    }
  }
  return [...nodes.values()];
}

/** Which end of its edge a shape goes out at (or comes in at): 1 at its end, 0 at its start. */
function end({ edge, first, last }: { edge: number; first: number; last: number }, edges: Stretch[], into: boolean): 0 | 1 {
  const steps = edges[edge]?.steps ?? [];
  const [from, to] = [steps[0]?.from ?? 0, steps.at(-1)?.to ?? 0];
  if (first === last) return last - from > to - last ? 1 : 0; // the nearer
  return last > first !== into ? 1 : 0;
}

/** A Stretch: its steps along its centreline, and the Lines on it. */
interface Stretch {
  steps: Step[];
  lines: number[];
}

/**
 * The stretches' centrelines, and the Stretches along them, for the Lines on or beside each piece
 * (`beside`), and the piece each piece is drawn with (`drawer`). Each piece is drawn with the lowest
 * of those on other tracks beside it whose Lines include all its own, or else it draws them itself,
 * with the Lines beside it: along the line halfway between the outermost tracks beside it. A
 * centreline is a Stretch wherever the set of Lines along it stays the same, and one Stretch after
 * another where it changes.
 */
function stretches(pieces: Piece[], every: Step[][], tracks: Neighbour[][], beside: Map<number, Neighbour>[], kx: number): { centrelines: Shape[]; stretches: Stretch[]; drawer: number[] } {
  const mates = mated(pieces, every);
  const across = tracks.map((list, p) => list.filter((n) => !mates[p]?.has(n.piece)));
  const drawer: number[] = [];
  for (const [p, piece] of pieces.entries()) {
    const lines = [...piece.on.keys()];
    // Only drawn with a piece beside it, so that it's never drawn further than NEAR or so off its track.
    const near = new Set((across[p] ?? []).map((n) => n.piece));
    const lower = [...near].map((n) => drawer[n] ?? p).filter((d) => d < p && near.has(d));
    drawer[p] = lower.sort((a, b) => a - b).find((d) => lines.every((l) => beside[d]?.has(l))) ?? p;
  }
  const drawn = new Set<number>();
  const chains: Step[][] = [];
  for (const steps of every) {
    let chain: Step[] | undefined;
    for (const s of steps) {
      if (drawer[s.piece] !== s.piece || drawn.has(s.piece)) {
        chain = undefined;
        continue;
      }
      drawn.add(s.piece);
      if (!chain) chains.push((chain = []));
      chain.push(s);
    }
  }
  const [centrelines, found]: [Shape[], Stretch[]] = [[], []];
  for (const chain of chains) {
    const id = `${STRETCH}${centrelines.length}`;
    // Each piece's ends, the way the chain runs, moved over to halfway between its outermost tracks,
    // evened out along the chain.
    const centres = chain.map(({ piece }) => {
      const lefts = (across[piece] ?? []).map((n) => n.left);
      return (Math.min(0, ...lefts) + Math.max(0, ...lefts)) / 2;
    });
    const ends = chain.map(({ piece, way }, i) => {
      const p = pieces[piece] ?? { x: 0, y: 0, ux: 0, uy: 0, length: 0 };
      const near = centres.slice(Math.max(0, i - EVEN), i + EVEN + 1);
      const centre = near.reduce((a, b) => a + b, 0) / near.length;
      const [cx, cy, hx, hy] = [p.x - p.uy * centre, p.y + p.ux * centre, (p.ux * p.length * way) / 2, (p.uy * p.length * way) / 2];
      return [[cx - hx, cy - hy], [cx + hx, cy + hy]] as const;
    });
    const points = ends.map(([start], i) => {
      const [x, y] = ends[i - 1]?.[1] ?? start;
      return [(x + start[0]) / 2, (y + start[1]) / 2] as const;
    });
    points.push(ends.at(-1)?.[1] ?? [0, 0]);
    const round = (degrees: number) => Math.round(degrees * 1e5) / 1e5;
    const coords = points.map(([x, y]): Point => [round(x / kx), round(y / DEGREE)]);
    const dist = distances(coords).map(Math.round);
    centrelines.push({ id, coords, dist });
    // A Stretch for each length of it one set of Lines takes, the SHORT ones merged into their
    // neighbours. Each set is keyed by its Lines, in order, so that the same set has the same key.
    const onIt = chain.map(({ piece, way }, i) => ({ line: -1, piece, shape: id, way, from: dist[i] ?? 0, to: dist[i + 1] ?? 0 }));
    const parts: Span<string>[] = [];
    for (const s of onIt) {
      const [key, last] = [`${[...(beside[s.piece]?.keys() ?? [])].sort((a, b) => a - b)}`, parts.at(-1)];
      if (last?.key === key) last.steps.push(s);
      else parts.push({ key, steps: [s] });
    }
    for (const { steps } of merge(parts, pieces)) {
      found.push({ steps, lines: [...new Set(steps.flatMap(({ piece }) => [...(beside[piece]?.keys() ?? [])]))].sort((a, b) => a - b) });
    }
  }
  return { centrelines, stretches: found, drawer };
}

/**
 * The Lines on or beside each piece, less those on another track that stays beside it for under
 * SHORT along every shape that runs it: that track is only brushing past.
 */
function lasting(every: Step[][], pieces: Piece[], tracks: Neighbour[][]): Neighbour[][] {
  const kept = new Set<string>(); // `<piece> <line>`
  for (const steps of every) {
    const open = new Map<number, number[]>(); // each Line beside the shape here, and the pieces it's been beside since it came
    const close = (line: number) => {
      const run = open.get(line) ?? [];
      if (run.reduce((sum, p) => sum + (pieces[p]?.length ?? 0), 0) >= SHORT) for (const p of run) kept.add(`${p} ${line}`);
      open.delete(line);
    };
    for (const { piece } of steps) {
      const here = new Set((tracks[piece] ?? []).filter((n) => !n.on).map((n) => n.line));
      for (const line of open.keys()) if (!here.has(line)) close(line);
      for (const line of here) {
        const run = open.get(line);
        if (run) run.push(piece);
        else open.set(line, [piece]);
      }
    }
    for (const line of [...open.keys()]) close(line);
  }
  return tracks.map((beside, p) => beside.filter((n) => n.on || kept.has(`${p} ${n.line}`)));
}

/**
 * The pieces on each piece's own track: itself, and those ahead or behind it less than STEP along any
 * shape that runs it, where rounding and curves can put them a metre or two to its side.
 */
function mated(pieces: Piece[], every: Step[][]): Set<number>[] {
  const mates = pieces.map((_, i) => new Set([i]));
  for (const steps of every) {
    for (const [i, { piece }] of steps.entries()) {
      for (let [j, gone] = [i + 1, 0]; j < steps.length && gone < STEP; j++) {
        const next = steps[j]?.piece ?? piece;
        gone += pieces[next]?.length ?? 0;
        mates[piece]?.add(next);
        mates[next]?.add(piece);
      }
    }
  }
  return mates;
}

/**
 * The pieces of track the Lines' shapes run on, and each Line's runs over them, a piece once each,
 * and every one of its shapes over them, all along each.
 */
function walk(lines: Line[], shapes: Shape[]): { pieces: Piece[]; runs: Step[][]; every: Step[][]; kx: number } {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  const all = shapes.flatMap((s) => s.coords);
  const kx = DEGREE * Math.cos(((all.reduce((sum, p) => sum + p[1], 0) / (all.length || 1)) * Math.PI) / 180);
  const metres = ([lon, lat]: Point): [x: number, y: number] => [lon * kx, lat * DEGREE];

  const pieces: Piece[] = [];
  const cut = new Map<string, number[]>(); // the pieces from one point to another
  /** The pieces from a to b: 1 for each that points that way, -1 for each that points back. */
  const between = (a: Point, b: Point): [piece: number, way: number][] => {
    const known = cut.get(`${a} ${b}`);
    if (known) return known.map((p) => [p, 1]);
    const back = cut.get(`${b} ${a}`);
    if (back) return back.map((p): [number, number] => [p, -1]).reverse();
    const [[ax, ay], [bx, by]] = [metres(a), metres(b)];
    const length = Math.hypot(bx - ax, by - ay);
    const [ux, uy, n] = [(bx - ax) / (length || 1), (by - ay) / (length || 1), Math.ceil(length / STEP) || 1];
    const list = Array.from({ length: n }, (_, k) => {
      const t = (k + 0.5) / n;
      return pieces.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t, ux, uy, length: length / n, on: new Map() }) - 1;
    });
    cut.set(`${a} ${b}`, list);
    return list.map((p) => [p, 1]);
  };

  const [runs, every]: [Step[][], Step[][]] = [[], []];
  for (const [l, line] of lines.entries()) {
    const done = new Set<number>(); // the pieces this Line runs over already
    const first = byId.get(line.shapes[0] ?? '')?.coords ?? [];
    for (const [n, id] of line.shapes.entries()) {
      const { coords = [], dist = [] } = byId.get(id) ?? {};
      // A Line's other shapes mostly run its first one's track back the other way.
      const way = n === 0 ? 1 : sameWay(coords, first, kx);
      let run: Step[] | undefined;
      const all: Step[] = [];
      every.push(all);
      for (const [i, b] of coords.entries()) {
        const a = coords[i - 1];
        if (!a) continue;
        const [from, to] = [dist[i - 1] ?? 0, dist[i] ?? 0];
        const legs = between(a, b);
        for (const [k, [piece, pieceWay]] of legs.entries()) {
          const part = (to - from) / legs.length;
          const step = { line: l, piece, shape: id, way: pieceWay, from: from + part * k, to: from + part * (k + 1) };
          all.push(step);
          if (done.has(piece)) {
            run = undefined;
            continue;
          }
          done.add(piece);
          pieces[piece]?.on.set(l, pieceWay * way);
          if (!run) runs.push((run = []));
          run.push(step);
        }
      }
    }
  }
  return { pieces, runs, every, kx };
}

/**
 * 1 where a line mostly runs the same way as another alongside it, -1 where it mostly runs back the
 * other way, judged at about 50 of its points; 1 where they're nowhere near each other.
 */
function sameWay(a: Point[], b: Point[], kx: number): number {
  let votes = 0;
  const every = Math.max(1, Math.floor(a.length / 50));
  for (let i = every; i < a.length; i += every) {
    const [p, q] = [a[i - 1], a[i]];
    if (!p || !q) continue;
    const n = nearest(b, p);
    const [c, d] = [b[n.i], b[n.i + 1]];
    if (c && d && n.metres <= NEAR) votes += Math.sign((q[0] - p[0]) * (d[0] - c[0]) * kx * kx + (q[1] - p[1]) * (d[1] - c[1]) * DEGREE * DEGREE);
  }
  return votes < 0 ? -1 : 1;
}

/** The pieces in each WIDE-sized cell, by their middles. */
function grid(pieces: Piece[]): Map<string, number[]> {
  const cells = new Map<string, number[]>();
  for (const [i, p] of pieces.entries()) {
    const list = cells.get(cell(p.x, p.y));
    if (list) list.push(i);
    else cells.set(cell(p.x, p.y), [i]);
  }
  return cells;
}

function cell(x: number, y: number): string {
  return `${Math.floor(x / WIDE)} ${Math.floor(y / WIDE)}`;
}

/** The Lines on a piece and beside it within WIDE, from its right to its left. */
function neighbours(index: number, pieces: Piece[], cells: Map<string, number[]>): Neighbour[] {
  const p = pieces[index] ?? { x: 0, y: 0, ux: 0, uy: 0, length: 0, on: new Map() };
  const found = [...p.on].map(([line, way]) => ({ line, piece: index, left: 0, on: true, alongside: true, way }));
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      for (const k of cells.get(cell(p.x + i * WIDE, p.y + j * WIDE)) ?? []) {
        const o = pieces[k];
        if (!o || o === p) continue;
        // Where the other piece comes closest to this one's middle: it counts if that's beside it, not ahead or behind.
        const along = Math.max(-o.length / 2, Math.min(o.length / 2, (p.x - o.x) * o.ux + (p.y - o.y) * o.uy));
        const [dx, dy] = [o.x + along * o.ux - p.x, o.y + along * o.uy - p.y];
        const left = p.ux * dy - p.uy * dx;
        if (Math.abs(dx * p.ux + dy * p.uy) > STEP / 2 || Math.abs(left) > WIDE) continue;
        const cos = p.ux * o.ux + p.uy * o.uy;
        for (const [line, way] of o.on) found.push({ line, piece: k, left, on: false, alongside: Math.abs(cos) >= PARALLEL, way: way * Math.sign(cos) });
      }
    }
  }
  return found.sort((a, b) => a.left - b.left);
}

/**
 * The Lines beside a piece, on each piece of theirs there: on it, alongside it NEAR it, or NEAR
 * those. Once Lines are `turned`, those on another track that run the other way to the piece's own
 * aren't beside it: that's another line of route passing by, as R1 and R4 pass the Lines for
 * Estació de França, and moving either over for the other only makes them jump.
 */
function cluster(nearby: Neighbour[], turned?: number[]): Neighbour[] {
  const way = (n: Neighbour) => n.way * (turned?.[n.line] ?? 1);
  const ahead = Math.sign(nearby.reduce((sum, n) => sum + (n.on ? way(n) : 0), 0)) || 1;
  const found = nearby.filter((n) => n.alongside && (n.on || !turned || way(n) === ahead));
  let [from, to] = [found.findIndex((n) => n.on), found.findLastIndex((n) => n.on)];
  while (from > 0 && (found[from]?.left ?? 0) - (found[from - 1]?.left ?? 0) <= NEAR) from--;
  while (to >= 0 && (found[to + 1]?.left ?? Infinity) - (found[to]?.left ?? 0) <= NEAR) to++;
  return found.slice(from, to + 1);
}

/** Each Line among these, where it's nearest the piece. */
function byLine(beside: Neighbour[]): Map<number, Neighbour> {
  const lines = new Map<number, Neighbour>();
  for (const n of beside.toSorted((a, b) => Math.abs(a.left) - Math.abs(b.left))) {
    if (!lines.has(n.line)) lines.set(n.line, n);
  }
  return lines;
}

/**
 * Which way round to take each Line, 1 or -1, so that Lines side by side run the same way: then
 * left and right mean the same to each. Where they can't all, those side by side longest win.
 */
function turn(count: number, pieces: Piece[], beside: Map<number, Neighbour>[]): number[] {
  const same = square(count); // how far each pair of Lines runs side by side the same way, less the other way
  for (const [i, p] of pieces.entries()) {
    for (const [l, way] of p.on) {
      for (const [m, n] of beside[i] ?? []) {
        const row = same[Math.min(l, m)];
        if (row && l !== m) row[Math.max(l, m)] = (row[Math.max(l, m)] ?? 0) + way * n.way * p.length;
      }
    }
  }
  const pairs = same.flatMap((row, l) => row.flatMap((w, m) => (w ? [{ l, m, w }] : [])));
  const parent = Array.from({ length: count }, (_, i) => i);
  const flip = parent.map(() => 1); // against its parent
  const root = (i: number): [root: number, flip: number] => {
    let f = 1;
    for (; parent[i] !== i; i = parent[i] ?? i) f *= flip[i] ?? 1;
    return [i, f];
  };
  for (const { l, m, w } of pairs.sort((a, b) => Math.abs(b.w) - Math.abs(a.w))) {
    const [[rl, fl], [rm, fm]] = [root(l), root(m)];
    if (rl === rm) continue;
    parent[rm] = rl;
    flip[rm] = fl * fm * Math.sign(w);
  }
  return parent.map((_, i) => root(i)[1]);
}

/**
 * How far each Line runs left of each other, less how far right, looking the way each is turned:
 * where their tracks run side by side, or apart after they part.
 */
function sides(count: number, pieces: Piece[], nearby: Neighbour[][], turned: number[]): number[][] {
  const left = square(count);
  for (const [i, p] of pieces.entries()) {
    for (const [l, way] of p.on) {
      for (const n of nearby[i] ?? []) {
        const row = left[n.line];
        if (row && n.line !== l && Math.abs(n.left) >= 1) row[l] = (row[l] ?? 0) + Math.sign(n.left) * way * (turned[l] ?? 1) * p.length;
      }
    }
  }
  return left;
}

function square(count: number): number[][] {
  return Array.from({ length: count }, () => new Array<number>(count).fill(0));
}

/**
 * Each item's place in the order that best agrees with how much each should go before each other
 * (`before[a][b]`): sorted by how many others each should go before, then improved by moving one
 * item at a time for as long as that helps.
 */
function rank(before: number[][]): number[] {
  const pull = (a: number, b: number) => (before[a]?.[b] ?? 0) - (before[b]?.[a] ?? 0);
  const items = [...before.keys()];
  const wins = items.map((a) => items.reduce((sum, b) => sum + Math.sign(pull(a, b)), 0));
  const order = items.sort((a, b) => (wins[b] ?? 0) - (wins[a] ?? 0) || a - b);
  for (let moved = true; moved; ) {
    moved = false;
    for (const [i, item] of order.entries()) {
      // How much better the order gets with this item moved to each other place, keeping the best
      // by more than a metre, so that rounding can't move items back and forth for ever.
      let [best, gain] = [i, 1];
      for (let [j, sum] = [i - 1, 0]; j >= 0; j--) {
        sum += pull(item, order[j] ?? item);
        if (sum > gain) [best, gain] = [j, sum];
      }
      for (let [j, sum] = [i + 1, 0]; j < order.length; j++) {
        sum += pull(order[j] ?? item, item);
        if (sum > gain) [best, gain] = [j, sum];
      }
      if (best !== i) {
        order.splice(i, 1);
        order.splice(best, 0, item);
        moved = true;
        break;
      }
    }
  }
  const place: number[] = [];
  for (const [i, item] of order.entries()) place[item] = i;
  return place;
}

/**
 * How many line widths right of its shape a step goes. Looking the way most of the Lines beside its
 * piece run, they go left to right in order. Any that run the other way, as R4 runs past the Lines
 * for Estació de França, go as a group of their own: on the side their track is on, or where they
 * share the others' track, on the side they keep to (`left`, as for `rank`).
 */
function side(s: Step, beside: Map<number, Neighbour>, turned: number[], left: number[][], place: number[]): number {
  const members = [...beside.values()].map((n) => ({ ...n, way: n.way * (turned[n.line] ?? 1) }));
  members.sort((a, b) => (place[a.line] ?? 0) - (place[b.line] ?? 0));
  const ahead = Math.sign(members.reduce((sum, m) => sum + m.way, 0)) || (members[0]?.way ?? 1);
  const along = members.filter((m) => m.way === ahead);
  const against = members.filter((m) => m.way !== ahead).reverse();
  const where = (group: Neighbour[]) => (group.reduce((sum, m) => sum + m.left, 0) / (group.length || 1)) * ahead;
  const apart = where(against) - where(along);
  const kept = against.reduce((sum, a) => sum + along.reduce((sum, b) => sum + (left[a.line]?.[b.line] ?? 0), 0), 0);
  const order = against.length && (Math.abs(apart) >= 1 ? apart > 0 : kept > 0) ? [...against, ...along] : [...along, ...against];
  return (order.findIndex((m) => m.line === s.line) - (order.length - 1) / 2) * ahead * s.way;
}

/** Steps that go together: a run's steps at one side, or a centreline's with one set of Lines. */
interface Span<Key = number> {
  key: Key;
  steps: Step[];
}

/** A run's strokes: its steps at each side, the SHORT ones merged into their neighbours. */
function strokes(run: Step[], sideOf: (s: Step) => number, pieces: Piece[]): Omit<Stroke, 'line'>[] {
  const spans: Span[] = [];
  for (const s of run) {
    const [side, last] = [sideOf(s), spans.at(-1)];
    if (last?.key === side) last.steps.push(s);
    else spans.push({ key: side, steps: [s] });
  }
  return merge(spans, pieces).flatMap(({ key: side, steps: [first, ...rest] }) => {
    const last = rest.at(-1) ?? first;
    return first && last ? [{ shape: first.shape, from: Math.round(first.from), to: Math.round(last.to), side }] : [];
  });
}

/**
 * Spans, each SHORT one merged into a neighbour, shortest first: into the one it interrupts, or else
 * the longer. Ties go by where the spans are rather than the way the run goes, so that Lines running
 * a track either way merge alike.
 */
function merge<Key>(spans: Span<Key>[], pieces: Piece[]): Span<Key>[] {
  const length = (s: Span<Key>) => Math.round(s.steps.reduce((sum, t) => sum + (pieces[t.piece]?.length ?? 0), 0));
  const where = (s: Span<Key>) => Math.min(...s.steps.map((t) => t.piece));
  const before = (a: Span<Key>, b: Span<Key>) => length(a) - length(b) || where(a) - where(b);
  const joined = (key: Key, ...parts: Span<Key>[]): Span<Key> => ({ key, steps: parts.flatMap((p) => p.steps) });
  for (;;) {
    const short = spans.filter((s) => length(s) < SHORT).sort(before)[0];
    const i = short ? spans.indexOf(short) : -1;
    const [prev, next] = [spans[i - 1], spans[i + 1]];
    if (!short || (!prev && !next)) return spans;
    if (prev && next && prev.key === next.key) spans = spans.toSpliced(i - 1, 3, joined(prev.key, prev, short, next));
    else if (prev && (!next || before(next, prev) < 0)) spans = spans.toSpliced(i - 1, 2, joined(prev.key, prev, short));
    else if (next) spans = spans.toSpliced(i, 2, joined(next.key, short, next));
  }
}
