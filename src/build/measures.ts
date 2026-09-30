// Yardsticks for how the Lines are drawn side by side, the same before and after a change: how often
// they break up (#138), and how faithfully they follow their track (#160).

import { along, APART, atZoom, DEGREE, direction, EARTH, pointAt, type Point, type Shape, type Stroke, type Track } from '../bundle.ts';

/** Strokes shorter than this, in metres, are stubs: sideBySide()'s SHORT before #138. */
const STUB = 150;
/** Steps less than this far apart, in metres, are at one place, and tracks this close look like one zoomed out: sideBySide()'s NEAR. */
const NEAR = 45;
/** A Line out of place for less than this, in metres, is in a bundle, or out of it, for a short stretch. */
const JOIN = 1000;
/** How often strokes are looked at, in metres along them. */
const EVERY = 25;
/** A Line's strokes on two of its shapes this close, in metres, are on one track or its twin. */
const TWIN = 30;
/** Strokes of two Lines this close, in metres, are on one track, give or take the rounding of its points. */
const SAME = 2;
/** Tracks closer to parallel than this (a cosine) run alongside each other: sideBySide()'s PARALLEL. */
const PARALLEL = Math.cos(Math.PI / 6);
/** The zooms folds are looked for at: where bundles are widest on the ground. */
const FOLD_ZOOMS = [10, 11, 12, 13];
/** How far MapLibre simplifies a GeoJSON source, in px at each zoom: its default tolerance. */
const TOLERANCE = 0.375;

/**
 * How the Lines are drawn. `breaks`: how often they break up. `twice`: metres where a Line shows
 * twice, its strokes on two of its shapes within TWIN of each other, alongside, but drawn at least
 * half a line width apart. `alone`: metres of Line drawn off a track no other Line's is beside,
 * within NEAR and alongside. `over`: metres where two Lines on one track are drawn on top of each
 * other, less than half a line width apart. `folds`: at each of FOLD_ZOOMS, where a stroke's
 * offset turns back on itself, on the inside of a curve tighter than its offset.
 */
export interface Measures {
  breaks: Breaks;
  twice: number;
  alone: number;
  over: number;
  folds: Record<number, number>;
}

export function measures({ shapes, strokes }: Pick<Track, 'shapes' | 'strokes'>): Measures {
  return { breaks: breaks(strokes, shapes), ...faithful(strokes, shapes), folds: folds(strokes, shapes) };
}

/** Measures in a line for the build's log. */
export function summary({ breaks: b, twice, alone, over, folds: f }: Measures): string {
  const km = (m: number) => `${(m / 1000).toFixed(1)} km`;
  const folds = Object.entries(f).map(([zoom, n]) => `${n} at zoom ${zoom}`).join(', ');
  return `${b.steps + b.stubs + b.swaps + b.joins} breaks (${b.steps} steps, ${b.stubs} stubs, ${b.swaps} swaps, ${b.joins} joins), ${km(twice)} drawn twice, ${km(alone)} off a track they have alone, ${Math.round(over)} m over each other, folds ${folds}`;
}

/**
 * How the strokes break up. A step is a Line changing side from one stroke to the next; a stub is a
 * stroke under STUB; a swap is two Lines stepping past each other at one place; a join is a Line
 * stepping out for under JOIN and back to the side it left. So each swap is two steps too, and
 * each join two steps.
 */
export interface Breaks {
  steps: number;
  stubs: number;
  swaps: number;
  joins: number;
}

export function breaks(strokes: Stroke[], shapes: Shape[]): Breaks {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  const found: Breaks = { steps: 0, stubs: strokes.filter((s) => s.to - s.from < STUB).length, swaps: 0, joins: 0 };
  // Where each step is, in metres, which way is right of its shape there, and its sides before and after.
  const steps: { line: string; x: number; y: number; right: [number, number]; was: number; is: number }[] = [];
  const byShape = new Map<string, Stroke[]>();
  for (const s of strokes) {
    const list = byShape.get(`${s.line} ${s.shape}`);
    if (list) list.push(s);
    else byShape.set(`${s.line} ${s.shape}`, [s]);
  }
  for (const list of byShape.values()) {
    list.sort((a, b) => a.from - b.from);
    const joined = (a?: Stroke, b?: Stroke) => a && b && Math.abs(a.to - b.from) <= 1;
    for (const [i, s] of list.entries()) {
      const [prev, next] = [list[i - 1], list[i + 1]];
      if (prev && next && joined(prev, s) && joined(s, next) && prev.side === next.side && s.side !== prev.side && s.to - s.from < JOIN) found.joins++;
      const shape = byId.get(s.shape);
      if (!shape || !prev || !joined(prev, s) || prev.side === s.side) continue;
      found.steps++;
      const [lon, lat] = pointAt(shape, s.from);
      const [dx, dy] = direction(shape, Math.max(0, s.from - 1), s.from + 1);
      const length = Math.hypot(dx, dy) || 1;
      const kx = DEGREE * Math.cos((lat * Math.PI) / 180);
      steps.push({ line: s.line, x: lon * kx, y: lat * DEGREE, right: [dy / length, -dx / length], was: prev.side, is: s.side });
    }
  }
  // ponytail: every pair of steps, fine for the map's few hundred; a grid as in sideBySide() if it grows.
  for (const [i, a] of steps.entries()) {
    for (const b of steps.slice(i + 1)) {
      if (a.line === b.line || Math.hypot(a.x - b.x, a.y - b.y) > NEAR) continue;
      // Which is right of the other, looking the way a's shape runs, before the steps and after; level
      // where they're under half a line width apart, as their shapes may not quite run alongside.
      const order = (sa: number, sb: number) => {
        const apart = sa - sb * (a.right[0] * b.right[0] + a.right[1] * b.right[1]);
        return Math.abs(apart) < 0.5 ? 0 : Math.sign(apart);
      };
      if (order(a.was, b.was) * order(a.is, b.is) < 0) found.swaps++;
    }
  }
  return found;
}

/** The metres drawn twice, alone and over each other (see Measures), each counted once, judged every EVERY along each stroke. */
function faithful(strokes: Stroke[], shapes: Shape[]): Pick<Measures, 'twice' | 'alone' | 'over'> {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  const flat = ([lon, lat]: Point): [x: number, y: number] => [lon * DEGREE * Math.cos((lat * Math.PI) / 180), lat * DEGREE];
  // Each stroke's segments, in every NEAR-sized cell they come within NEAR of.
  // With how far along its stroke's points each segment starts, and how long they are.
  const cells = new Map<string, { stroke: Stroke; a: [number, number]; b: [number, number]; at: number; length: number }[]>();
  const cell = (x: number, y: number) => `${Math.floor(x / NEAR)} ${Math.floor(y / NEAR)}`;
  for (const stroke of strokes) {
    const shape = byId.get(stroke.shape);
    const points = shape ? along(shape, stroke.from, stroke.to).map(flat) : [];
    const at = points.map((p, i) => Math.hypot(p[0] - (points[i - 1] ?? p)[0], p[1] - (points[i - 1] ?? p)[1]));
    for (let i = 1; i < at.length; i++) at[i] = (at[i] ?? 0) + (at[i - 1] ?? 0);
    const length = at.at(-1) ?? 0;
    for (const [i, b] of points.entries()) {
      const a = points[i - 1];
      if (!a) continue;
      const segment = { stroke, a, b, at: at[i - 1] ?? 0, length };
      for (let x = Math.floor((Math.min(a[0], b[0]) - NEAR) / NEAR); x <= Math.floor((Math.max(a[0], b[0]) + NEAR) / NEAR); x++) {
        for (let y = Math.floor((Math.min(a[1], b[1]) - NEAR) / NEAR); y <= Math.floor((Math.max(a[1], b[1]) + NEAR) / NEAR); y++) {
          const list = cells.get(`${x} ${y}`);
          if (list) list.push(segment);
          else cells.set(`${x} ${y}`, [segment]);
        }
      }
    }
  }
  const found = { twice: 0, alone: 0, over: 0 };
  for (const m of strokes) {
    const shape = byId.get(m.shape);
    if (!shape) continue;
    for (let d = m.from + EVERY / 2; d < m.to; d += EVERY) {
      const [x, y] = flat(pointAt(shape, d));
      const [dx, dy] = direction(shape, Math.max(0, d - 5), d + 5);
      const [rx, ry] = [dy / (Math.hypot(dx, dy) || 1), -dx / (Math.hypot(dx, dy) || 1)];
      let [twice, beside, over] = [false, false, false];
      for (const { stroke: o, a, b, at, length: end } of cells.get(cell(x, y)) ?? []) {
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (o === m || !length) continue;
        const [ux, uy] = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
        // Where the point is level with the segment, with a metre's give for corners, and how far across it.
        // Level with the stroke's very end, it's where the Line changes side, and not beside the point.
        const [ahead, across] = [(x - a[0]) * ux + (y - a[1]) * uy, Math.abs((x - a[0]) * uy - (y - a[1]) * ux)];
        const cos = rx * uy - ry * ux;
        if (ahead < -1 || ahead > length + 1 || at + ahead < 1 || at + ahead > end - 1 || across > NEAR || Math.abs(cos) < PARALLEL) continue;
        // How many line widths apart the two are drawn, a multiple of a half: their sides, looking the way m's shape runs.
        const drawn = Math.abs(m.side - o.side * cos);
        if (o.line === m.line) twice ||= o.shape !== m.shape && across <= TWIN && drawn > 0.25;
        else [beside, over] = [true, over || (across <= SAME && drawn < 0.25)];
      }
      // Each Line drawn twice, and each pair drawn over each other, is found from both of them.
      found.twice += twice ? EVERY / 2 : 0;
      found.over += over ? EVERY / 2 : 0;
      found.alone += !beside && m.side ? EVERY : 0;
    }
  }
  return found;
}

/**
 * At each of FOLD_ZOOMS, how many segments of the strokes, as MapLibre draws them, run back the other
 * way once offset: it simplifies each stroke by TOLERANCE px, then moves each point along its join's
 * miter, as its line shader does.
 */
function folds(strokes: Stroke[], shapes: Shape[]): Record<number, number> {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  const found = Object.fromEntries(FOLD_ZOOMS.map((z) => [z, 0]));
  for (const s of strokes) {
    const shape = byId.get(s.shape);
    if (!s.side || !shape) continue;
    const coords = along(shape, s.from, s.to);
    const lat = coords[0]?.[1] ?? 0;
    const kx = DEGREE * Math.cos((lat * Math.PI) / 180);
    const flat = coords.map(([lon, lat]): [number, number] => [lon * kx, lat * DEGREE]);
    for (const z of FOLD_ZOOMS) {
      const px = (2 * Math.PI * EARTH * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** z);
      const points = simplify(flat, TOLERANCE * px);
      const off = offset(points, s.side * atZoom(APART, z) * px);
      for (let i = 1; i < points.length; i++) {
        const [[ax, ay], [bx, by]] = [points[i - 1] ?? [0, 0], points[i] ?? [0, 0]];
        const [[cx, cy], [dx, dy]] = [off[i - 1] ?? [0, 0], off[i] ?? [0, 0]];
        if ((bx - ax) * (dx - cx) + (by - ay) * (dy - cy) < 0) found[z] = (found[z] ?? 0) + 1;
      }
    }
  }
  return found;
}

/** A line with only the points it needs to stay within a tolerance of itself (Douglas–Peucker, as geojson-vt). */
function simplify(points: [number, number][], tolerance: number): [number, number][] {
  if (points.length < 3) return points;
  const keep = new Set([0, points.length - 1]);
  const stack: [number, number][] = [[0, points.length - 1]];
  for (let next = stack.pop(); next; next = stack.pop()) {
    const [a, b] = next;
    const [[ax, ay], [bx, by]] = [points[a] ?? [0, 0], points[b] ?? [0, 0]];
    const length = Math.hypot(bx - ax, by - ay) || 1;
    let [far, at] = [tolerance, -1];
    for (let i = a + 1; i < b; i++) {
      const [x, y] = points[i] ?? [0, 0];
      const off = Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / length;
      if (off > far) [far, at] = [off, i];
    }
    if (at < 0) continue;
    keep.add(at);
    stack.push([a, at], [at, b]);
  }
  return points.filter((_, i) => keep.has(i));
}

/** A line's points moved so many metres to its right, each along its join's miter. */
function offset(points: [number, number][], metres: number): [number, number][] {
  const right = (a: [number, number], b: [number, number]): [number, number] => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[1] - a[1]) / length, -(b[0] - a[0]) / length];
  };
  return points.map((p, i) => {
    // The segments either side of the point, where an end's missing one comes out as none.
    const [n1, n2] = [right(points[i - 1] ?? p, p), right(p, points[i + 1] ?? p)];
    const join = [n1[0] + n2[0], n1[1] + n2[1]] as const;
    const length = Math.hypot(join[0], join[1]) || 1;
    const [jx, jy] = [join[0] / length, join[1] / length];
    // A floor on the half-angle's cosine, so a hairpin doesn't shoot off.
    const miter = 1 / Math.max(0.05, jx * n1[0] + jy * n1[1], jx * n2[0] + jy * n2[1]);
    return [p[0] + metres * jx * miter, p[1] + metres * jy * miter];
  });
}

// Run as `node src/build/measures.ts <track.json>`, on a day's track the daily build wrote or the map
// downloads: the measures of its strokes, and of the strokes sideBySide() draws from its Lines now.
if (import.meta.main) {
  const { readFile } = await import('node:fs/promises');
  const { sideBySide } = await import('./sideBySide.ts');
  const track = JSON.parse(await readFile(process.argv[2] ?? '', 'utf8')) as Track;
  console.log('drawn:', summary(measures(track)));
  console.log('now:  ', summary(measures({ shapes: track.shapes, strokes: sideBySide(track.lines, track.shapes).strokes })));
}
