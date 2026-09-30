// How the map draws each Line: where Lines share track, side by side, as a transit map does.

import { DEGREE, STRETCH, type Line, type Point, type Shape, type Stroke } from '../bundle.ts';
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

/** A Line's run along a Stretch, and all its steps on that Stretch, where a SHORT one merged into it may have it come and go. */
interface Along {
  steps: Step[];
  all: Step[];
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
export function sideBySide(lines: Line[], shapes: Shape[]): { strokes: Stroke[]; centrelines: Shape[]; rails: Stroke[]; sides: Stroke[] } {
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
  const { centrelines, runs: along } = stretches(pieces, every, kept, keptBeside, kx);
  const stretchSide = (s: Step) => side(s, keptBeside[s.piece] ?? new Map(), turned, left, place);
  // Each Line at one side all along a Stretch: the side it takes for most of it.
  const once = ({ steps, all }: Along) => {
    const most = new Map<number, number>();
    for (const s of all) most.set(stretchSide(s), (most.get(stretchSide(s)) ?? 0) + (pieces[s.piece]?.length ?? 0));
    const side = [...most].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
    return draw(steps, () => side);
  };
  // Not flatMap(draw): that would pass each run's index as its sides.
  return { strokes: along.flatMap(once), centrelines, rails: runs.flatMap((run) => draw(run)), sides: every.flatMap((run) => draw(run)) };
}

/**
 * The stretches' centrelines, and each Line's runs along the Stretches on them, for the Lines on or
 * beside each piece (`beside`). Each piece is drawn with the lowest of those on other tracks beside
 * it whose Lines include all its own, or else it draws them itself, with the Lines beside it: along
 * the line halfway between the outermost tracks beside it. A centreline is a Stretch wherever the
 * set of Lines along it stays the same, and one Stretch after another where it changes.
 */
function stretches(pieces: Piece[], every: Step[][], tracks: Neighbour[][], beside: Map<number, Neighbour>[], kx: number): { centrelines: Shape[]; runs: Along[] } {
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
  const [centrelines, runs]: [Shape[], Along[]] = [[], []];
  for (const chain of chains) {
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
    const id = `${STRETCH}${centrelines.length}`;
    const dist = distances(coords).map(Math.round);
    centrelines.push({ id, coords, dist });
    // A Stretch for each length of it one set of Lines takes, the SHORT ones merged into their
    // neighbours: into the one they interrupt, or else the longer.
    const lines = (i: number) => `${[...(beside[chain[i]?.piece ?? -1]?.keys() ?? [])].sort((a, b) => a - b)}`;
    let parts: { from: number; to: number; lines: string; length: number }[] = [];
    for (const [i, { piece }] of chain.entries()) {
      const [last, length] = [parts.at(-1), pieces[piece]?.length ?? 0];
      if (last?.lines === lines(i)) [last.to, last.length] = [i + 1, last.length + length];
      else parts.push({ from: i, to: i + 1, lines: lines(i), length });
    }
    for (;;) {
      const short = parts.filter((s) => s.length < SHORT).sort((a, b) => a.length - b.length || a.from - b.from)[0];
      const i = short ? parts.indexOf(short) : -1;
      const [prev, next] = [parts[i - 1], parts[i + 1]];
      if (!short || (!prev && !next)) break;
      const [a, b] = prev && next && prev.lines === next.lines ? [i - 1, i + 2] : prev && (!next || prev.length >= next.length) ? [i - 1, i + 1] : [i, i + 2];
      const joined = parts.slice(a, b);
      const lines = (a < i ? prev : next)?.lines ?? short.lines;
      parts = parts.toSpliced(a, b - a, { from: joined[0]?.from ?? 0, to: joined.at(-1)?.to ?? 0, lines, length: joined.reduce((sum, s) => sum + s.length, 0) });
    }
    // Each Line on each, a run for each time it's there.
    for (const { from, to } of parts) {
      const steps = chain.slice(from, to).map(({ piece, way }, k) => ({ piece, way, from: dist[from + k] ?? 0, to: dist[from + k + 1] ?? 0 }));
      for (const line of new Set(steps.flatMap(({ piece }) => [...(beside[piece]?.keys() ?? [])]))) {
        const all: Step[] = [];
        let run: Step[] | undefined;
        for (const step of steps) {
          if (!beside[step.piece]?.has(line)) run = undefined;
          else {
            const on = { line, shape: id, ...step };
            if (!run) runs.push({ steps: (run = []), all });
            run.push(on);
            all.push(on);
          }
        }
      }
    }
  }
  return { centrelines, runs };
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

/** A run's steps at one side. */
interface Span {
  side: number;
  steps: Step[];
}

/** A run's strokes: its steps at each side, the SHORT ones merged into their neighbours. */
function strokes(run: Step[], sideOf: (s: Step) => number, pieces: Piece[]): Omit<Stroke, 'line'>[] {
  const spans: Span[] = [];
  for (const s of run) {
    const [side, last] = [sideOf(s), spans.at(-1)];
    if (last?.side === side) last.steps.push(s);
    else spans.push({ side, steps: [s] });
  }
  return merge(spans, pieces).flatMap(({ side, steps: [first, ...rest] }) => {
    const last = rest.at(-1) ?? first;
    return first && last ? [{ shape: first.shape, from: Math.round(first.from), to: Math.round(last.to), side }] : [];
  });
}

/**
 * Spans, each SHORT one merged into a neighbour, shortest first: into the one it interrupts, or else
 * the longer. Ties go by where the spans are rather than the way the run goes, so that Lines running
 * a track either way merge alike.
 */
function merge(spans: Span[], pieces: Piece[]): Span[] {
  const length = (s: Span) => Math.round(s.steps.reduce((sum, t) => sum + (pieces[t.piece]?.length ?? 0), 0));
  const where = (s: Span) => Math.min(...s.steps.map((t) => t.piece));
  const before = (a: Span, b: Span) => length(a) - length(b) || where(a) - where(b);
  const joined = (side: number, ...parts: Span[]): Span => ({ side, steps: parts.flatMap((p) => p.steps) });
  for (;;) {
    const short = spans.filter((s) => length(s) < SHORT).sort(before)[0];
    const i = short ? spans.indexOf(short) : -1;
    const [prev, next] = [spans[i - 1], spans[i + 1]];
    if (!short || (!prev && !next)) return spans;
    if (prev && next && prev.side === next.side) spans = spans.toSpliced(i - 1, 3, joined(prev.side, prev, short, next));
    else if (prev && (!next || before(next, prev) < 0)) spans = spans.toSpliced(i - 1, 2, joined(prev.side, prev, short));
    else if (next) spans = spans.toSpliced(i, 2, joined(next.side, short, next));
  }
}
