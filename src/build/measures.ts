// Yardsticks for how the Lines are drawn side by side, the same before and after a change: how often
// they break up (#138), and how faithfully they follow their track (#160).

import { along, APART, atZoom, bandAt, BANDS, beside, cutIn, DEGREE, direction, drawnIn, EARTH, inBand, LENGTH, LINK, pieces, pixelMetres, pointAt, STRETCH, type Line, type Point, type Shape, type Stroke, type Track } from '../bundle.ts';
import { folded, offset, simplify, TOLERANCE } from './offset.ts';
import type { Found } from './report.ts';
import { KX, LATITUDE, room, sideBySide, type Front } from './sideBySide.ts';

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
/** The zoom a stroke end is judged loose at: the widest a Line is drawn off its rails, in metres, before APART goes to 0. */
const LOOSE_ZOOM = 14;
/** A stroke end further than this, in metres, from any other stroke of its Line is loose. */
const LOOSE = 20;
/** A stroke end this close, in metres, to where a track ends is at a terminus. */
const TERMINUS = 60;
/** Fronts this close, in metres, are at one node. */
const TOUCH = 5;
/** How much shorter, in metres, a curve or a stroke may be than it needs, as the track rounds where they start and end. */
const ROUNDING = 2;
/** How far apart, in metres, a curve is looked at for how far off its Line's own track it's drawn. */
const LOOK = 5;
/** How many of each band's largest nodes are listed. */
const LARGEST = 10;

/**
 * How the Lines are drawn. `breaks`: how often they break up. `twice`: metres where a Line shows
 * twice, its strokes on two of its shapes within TWIN of each other, alongside, but drawn at least
 * half a line width apart. `alone`: metres of Line drawn off a track no other Line's is beside,
 * within NEAR and alongside. `over`: metres where two Lines on one track are drawn on top of each
 * other, less than half a line width apart. These four on the line graph from GRAPH_BAND on. `folds`:
 * at each zoom in BANDS, where a stroke's offset turns back on itself, on the inside of a curve
 * tighter than its offset. `covered`: at each zoom in BANDS, metres where a Line is drawn over
 * another's, alongside it less than half the band's line width apart, as tracks further apart than
 * NEAR are, zoomed out (ADR-0007). `dangling`: stroke
 * ends drawn at LOOSE_ZOOM further than LOOSE from any other stroke of their Line, and not at a
 * terminus (#172). Links (LINK), the curves that join a Line's stroke on one Stretch to its next, count only
 * there, in LOOSE_ZOOM's band, and in the measures of nodes, at each zoom in BANDS (ADR-0007, #186).
 * `kinks`: curves shorter than LENGTH × their side change × the band's line width. `weaves`: a Line's
 * strokes shorter than the room() of the nodes at their ends, where it changes side at either.
 * `inside`: metres of curve drawn further off its Line's own track, by more than half a line width,
 * than at either of its ends. `largest`: the LARGEST largest nodes, how far apart their fronts are in
 * the band's line widths, and where their middle is, so that a node that absorbed too much shows (#187).
 */
export interface Measures {
  breaks: Breaks;
  twice: number;
  alone: number;
  over: number;
  folds: Record<number, number>;
  covered: Record<number, number>;
  dangling: number;
  kinks: Record<number, number>;
  weaves: Record<number, number>;
  inside: Record<number, number>;
  largest: Record<number, { size: number; at: Point }[]>;
}

/** The measures of a day's track; `inside` only for the Lines given. */
export function measures({ shapes, strokes: pieces, lines = [] }: Pick<Track, 'shapes' | 'strokes'> & Partial<Pick<Track, 'lines'>>): Measures {
  const strokes = joined(pieces);
  const drawn = strokes.filter((s) => !s.shape.startsWith(LINK));
  const graph = drawn.filter((s) => s.band === undefined);
  return { breaks: breaks(graph, shapes), ...faithful(graph, shapes), folds: folds(drawn, shapes), covered: covered(strokes, shapes), dangling: dangling(strokes, shapes), ...nodes(strokes, shapes, lines) };
}

/** Strokes joined up again where sideBySide() cut them at a tunnel's ends (#178), as they're drawn the same either side. */
function joined(strokes: Stroke[]): Stroke[] {
  const same = (a: Stroke, b: Stroke) => a.line === b.line && a.shape === b.shape && a.side === b.side && a.shared === b.shared && a.to === b.from && a.band === b.band && !a.shape.startsWith(LINK);
  return strokes.reduce<Stroke[]>((all, s) => {
    const last = all.at(-1);
    if (last && same(last, s)) {
      const cut = last.cut && s.cut && last.cut.map(([start], band): [number, number] => [start, s.cut?.[band]?.[1] ?? 0]);
      all[all.length - 1] = { ...last, to: s.to, ...(cut && { cut }) };
    } else all.push(s);
    return all;
  }, []);
}

/** Measures in a line for the build's log. */
export function summary({ breaks: b, twice, alone, over, folds: f, covered, dangling: loose, kinks, weaves, inside, largest }: Measures): string {
  const km = (m: number) => `${(m / 1000).toFixed(1)} km`;
  const per = (found: Record<number, number>, as: (n: number) => string = String) => Object.entries(found).map(([zoom, n]) => `${as(n)} at zoom ${zoom}`).join(', ');
  return `${total(b)} breaks (${b.steps} steps, ${b.stubs} stubs, ${b.swaps} swaps, ${b.joins} joins), ${km(twice)} drawn twice, ${km(alone)} off a track they have alone, ${Math.round(over)} m over each other, folds ${per(f)}, covered ${per(covered, (m) => `${(m / 1000).toFixed(1)} km`)}, ${loose} dangling ends, kinks ${per(kinks)}, weaves ${per(weaves)}, off track inside nodes ${per(inside, (m) => `${Math.round(m)} m`)}${Object.entries(largest).map(([zoom, list]) => `\n  largest nodes at zoom ${zoom}, in line widths: ${list.map(({ size, at: [lon, lat] }) => `${size.toFixed(1)} at ${lat.toFixed(5)},${lon.toFixed(5)}`).join(', ')}`).join('')}`;
}

/**
 * The measures as the build reports them, given the log's text of them, which ends in summary()'s:
 * one spot with each of their numbers, in whole metres where they're metres, and its first line, and
 * one for each of the largest nodes, with its zoom's line.
 */
export function reported(m: Measures, text: string): Found[] {
  const [first = '', ...zooms] = text.split('\n');
  const each = (name: string, found: Record<number, number>) => Object.entries(found).map(([zoom, n]) => [`${name} ${zoom}`, Math.round(n)]);
  const numbers = Object.fromEntries([
    ['breaks', total(m.breaks)],
    ...Object.entries(m.breaks),
    ['twice', Math.round(m.twice)],
    ['alone', Math.round(m.alone)],
    ['over', Math.round(m.over)],
    ['dangling', m.dangling],
    ...each('folds', m.folds),
    ...each('covered', m.covered),
    ...each('kinks', m.kinks),
    ...each('weaves', m.weaves),
    ...each('inside', m.inside),
  ]);
  // summary() gives the largest nodes a line for each zoom, in order, after its first.
  const nodes = Object.entries(m.largest).flatMap(([zoom, list], i) =>
    list.map(({ size, at }): Found => ({ kind: 'node', zoom: Number(zoom), point: at, text: [zooms[i]?.trim() ?? ''], numbers: { size } })),
  );
  return [{ kind: 'measures', text: [first], numbers }, ...nodes];
}

/** Every break, of each kind. */
function total(b: Breaks): number {
  return b.steps + b.stubs + b.swaps + b.joins;
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

/** How many stroke ends are loose (see Measures). */
function dangling(strokes: Stroke[], shapes: Shape[]): number {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  const flat = ([lon, lat]: Point): [x: number, y: number] => [lon * KX, lat * DEGREE];
  const termini = shapes.filter((s) => !s.id.startsWith(STRETCH)).flatMap((s) => [s.coords[0], s.coords.at(-1)].flatMap((p) => (p ? [flat(p)] : [])));
  // Each Line's strokes as drawn at LOOSE_ZOOM, a line width to the right for each side: in its band,
  // cut back where its curves take over.
  const band = bandAt(LOOSE_ZOOM);
  const byLine = new Map<string, [number, number][][]>();
  for (const s of strokes.flatMap(pieces)) {
    const shape = inBand(byId, s.shape, band);
    if (!shape || !drawnIn(s, band)) continue;
    const [start, end] = cutIn(s, band);
    // Not drawn in the band: a node absorbed its Stretch.
    if (start + end >= s.to - s.from) continue;
    const points = along(shape, s.from + start, s.to - end).map(flat);
    const width = atZoom(APART, LOOSE_ZOOM) * pixelMetres(LOOSE_ZOOM, LATITUDE);
    byLine.set(s.line, [...(byLine.get(s.line) ?? []), offset(points, s.side * width)]);
  }
  // ponytail: every stroke end against every segment of its Line, about 2 s for the map; a grid if it grows.
  let found = 0;
  for (const drawn of byLine.values()) {
    for (const [i, points] of drawn.entries()) {
      for (const p of [points[0], points.at(-1)]) {
        if (!p || termini.some(([x, y]) => Math.hypot(x - p[0], y - p[1]) < TERMINUS)) continue;
        const near = drawn.some((other, j) => j !== i && other.some((b, k) => {
          const a = other[k - 1] ?? b;
          const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
          const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
          return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]) <= LOOSE;
        }));
        if (!near) found++;
      }
    }
  }
  return found;
}

/**
 * At each zoom in BANDS, how many segments of the strokes, as MapLibre draws them, run back the other
 * way once offset: it simplifies each stroke by TOLERANCE px, then moves each point along its join's
 * miter, as its line shader does.
 */
function folds(strokes: Stroke[], shapes: Shape[]): Record<number, number> {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  const found = Object.fromEntries(BANDS.map((z) => [z, 0]));
  for (const s of strokes) {
    if (!s.side) continue;
    for (const [band, z] of BANDS.entries()) {
      // Along its centreline smoothed for the zoom's band, where it is.
      const shape = inBand(byId, s.shape, band);
      if (!shape || !drawnIn(s, band)) continue;
      const coords = along(shape, s.from, s.to);
      const lat = coords[0]?.[1] ?? 0;
      const kx = DEGREE * Math.cos((lat * Math.PI) / 180);
      const flat = coords.map(([lon, lat]): [number, number] => [lon * kx, lat * DEGREE]);
      const px = (2 * Math.PI * EARTH * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** z);
      const points = simplify(flat, TOLERANCE * px);
      found[z] = (found[z] ?? 0) + folded(points, s.side * atZoom(APART, z) * px).length;
    }
  }
  return found;
}

/** At each zoom in BANDS, the metres where a Line is drawn over another's (see Measures), judged every EVERY along each of its strokes as drawn there: each point once however many it's over, and halved, as two Lines over each other are found from both. */
function covered(strokes: Stroke[], shapes: Shape[]): Record<number, number> {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  const flat = ([lon, lat]: Point): [x: number, y: number] => [lon * KX, lat * DEGREE];
  const found: Record<number, number> = {};
  for (const [band, zoom] of BANDS.entries()) {
    const width = atZoom(APART, zoom) * pixelMetres(zoom, LATITUDE);
    // Each Line's strokes as drawn in the band, cut back where its curves take over, and its curves, in their pieces.
    const lines = strokes.filter((s) => drawnIn(s, band)).flatMap((s) => {
      const [start, end] = cutIn(s, band);
      const shape = inBand(byId, s.shape, band);
      if (!shape || start + end >= s.to - s.from) return [];
      return pieces({ ...s, from: s.from + start, to: s.to - end }).map((p) => ({ line: s.line, points: offset(along(shape, p.from, p.to).map(flat), p.side * width) }));
    });
    // Each segment, in every cell a line width across that it comes within half a line width of.
    const cells = new Map<string, { line: string; a: [number, number]; b: [number, number] }[]>();
    for (const { line, points } of lines) {
      for (const [i, b] of points.entries()) {
        const a = points[i - 1];
        if (!a) continue;
        for (let x = Math.floor((Math.min(a[0], b[0]) - width / 2) / width); x <= Math.floor((Math.max(a[0], b[0]) + width / 2) / width); x++) {
          for (let y = Math.floor((Math.min(a[1], b[1]) - width / 2) / width); y <= Math.floor((Math.max(a[1], b[1]) + width / 2) / width); y++) {
            const list = cells.get(`${x} ${y}`);
            if (list) list.push({ line, a, b });
            else cells.set(`${x} ${y}`, [{ line, a, b }]);
          }
        }
      }
    }
    found[zoom] = 0;
    for (const { line, points } of lines) {
      // From the first point looked at, EVERY / 2 along, every EVERY, segment by segment.
      let next = EVERY / 2;
      for (const [i, q] of points.entries()) {
        const p = points[i - 1];
        const length = p && Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (!p || !length) continue;
        const [ux, uy] = [(q[0] - p[0]) / length, (q[1] - p[1]) / length];
        for (; next < length; next += EVERY) {
          const [x, y] = [p[0] + ux * next, p[1] + uy * next];
          const over = (cells.get(`${Math.floor(x / width)} ${Math.floor(y / width)}`) ?? []).some(({ line: other, a, b }) => {
            const step = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (other === line || !step) return false;
            const [vx, vy] = [(b[0] - a[0]) / step, (b[1] - a[1]) / step];
            const ahead = (x - a[0]) * vx + (y - a[1]) * vy;
            return ahead >= 0 && ahead <= step && Math.abs((x - a[0]) * vy - (y - a[1]) * vx) < width / 2 && Math.abs(ux * vx + uy * vy) >= PARALLEL;
          });
          if (over) found[zoom] += EVERY / 2;
        }
        next -= length;
      }
    }
  }
  return found;
}

/** At each zoom in BANDS, the kinks, weaves and metres off track inside nodes (see Measures). */
function nodes(strokes: Stroke[], shapes: Shape[], lines: Line[]): Pick<Measures, 'kinks' | 'weaves' | 'inside' | 'largest'> {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  const flat = ([lon, lat]: Point): [x: number, y: number] => [lon * KX, lat * DEGREE];
  const own = new Map(lines.map((l) => [l.id, l.shapes.flatMap((id) => byId.get(id)?.coords.map(flat) ?? [])]));
  const found: Pick<Measures, 'kinks' | 'weaves' | 'inside' | 'largest'> = { kinks: {}, weaves: {}, inside: {}, largest: {} };
  for (const [band, zoom] of BANDS.entries()) {
    const width = atZoom(APART, zoom) * pixelMetres(zoom, LATITUDE);
    const drawn = strokes.filter((s) => !s.shape.startsWith(LINK) && drawnIn(s, band));
    const curves = strokes.filter((s) => s.shape.startsWith(LINK) && s.band === band && s.across);
    const change = (c: Stroke) => Math.abs((c.ease ?? c.side) - c.side);
    found.kinks[zoom] = curves.filter((c) => {
      const taken = (c.across ?? []).reduce((sum, [, start, end]) => sum + Math.abs(end - start), 0);
      return taken + ROUNDING < LENGTH * change(c) * width;
    }).length;

    // Each curve's two fronts, by the Stretch, which way from the node, and where along it the node is.
    const fronts = new Map<string, { shape: string; at: number; way: number; change: number }>();
    const changes = new Map<string, number>(); // each Line's, at each front
    const parent = new Map<string, string>();
    const root = (k: string): string => {
      const p = parent.get(k) ?? k;
      return p === k ? k : root(p);
    };
    // The strokes a node absorbed, not drawn in the band: a curve that starts or ends on one has no front there, as its Line ends inside the node.
    const hidden = new Map<string, Stroke[]>();
    for (const s of drawn) if (cutIn(s, band).reduce((a, b) => a + b) >= s.to - s.from) hidden.set(`${s.line} ${s.shape}`, [...(hidden.get(`${s.line} ${s.shape}`) ?? []), s]);
    for (const c of curves) {
      const parts = c.across ?? [];
      const ends = [parts[0], parts.at(-1)].flatMap((part, i) => {
        if (!part) return [];
        const [shape, start, end] = part;
        if (hidden.get(`${c.line} ${shape}`)?.some((s) => s.from - 1 <= Math.min(start, end) && Math.max(start, end) <= s.to + 1)) return [];
        // The node is at the curve's end on the Stretch it leaves, at its start on the one it comes onto.
        const [at, other] = i ? [start, end] : [end, start];
        const way = Math.sign(other - at) || (at < (byId.get(shape)?.dist.at(-1) ?? 0) / 2 ? 1 : -1);
        const key = `${shape} ${way} ${at}`;
        const front = fronts.get(key) ?? { shape, at, way, change: 0 };
        fronts.set(key, { ...front, change: Math.max(front.change, change(c)) });
        changes.set(`${c.line} ${key}`, Math.max(changes.get(`${c.line} ${key}`) ?? 0, change(c)));
        return [key];
      });
      const [a, b] = ends.map(root);
      if (a && b && a !== b) parent.set(a, b);
    }
    // ponytail: every pair of fronts, fine for a few hundred in a band; a grid if the map grows.
    const keys = [...fronts.keys()];
    const placed = new Map(keys.map((k): [string, Front] => {
      const f = fronts.get(k) ?? { shape: '', at: 0, way: 1, change: 0 };
      const shape = inBand(byId, f.shape, band) ?? { coords: [], dist: [] };
      const end = shape.dist.at(-1) ?? 0;
      const points = (f.way > 0 ? along(shape, f.at, end) : along(shape, 0, f.at).toReversed()).map(flat);
      // How far the Lines on it reach, looking the way it goes: from the strokes a metre into it.
      const sides = drawn.filter((s) => s.shape === f.shape && s.from <= f.at + f.way && f.at + f.way <= s.to).map((s) => s.side * f.way);
      return [k, { points, left: 0.5 - Math.min(0, ...sides), right: 0.5 + Math.max(0, ...sides), change: f.change }];
    }));
    for (const [i, a] of keys.entries()) {
      for (const b of keys.slice(i + 1)) {
        const [p = [0, 0], q = [0, 0]] = [placed.get(a)?.points[0], placed.get(b)?.points[0]];
        const [ra, rb] = [root(a), root(b)];
        if (ra !== rb && Math.hypot(p[0] - q[0], p[1] - q[1]) <= TOUCH) parent.set(ra, rb);
      }
    }
    const byNode = new Map<string, string[]>();
    for (const k of keys) byNode.set(root(k), [...(byNode.get(root(k)) ?? []), k]);
    const roomOf = new Map<string, number>();
    const sizes = [...byNode.values()].map((at) => {
      const points = at.map((k) => placed.get(k)?.points[0] ?? [0, 0]);
      const size = Math.max(...points.flatMap((p) => points.map((q) => Math.hypot((p[0] ?? 0) - (q[0] ?? 0), (p[1] ?? 0) - (q[1] ?? 0)))));
      const [x = 0, y = 0] = [0, 1].map((i) => points.reduce((sum, p) => sum + (p[i] ?? 0), 0) / points.length);
      return { size: Math.round((size / width) * 10) / 10, at: [Math.round((x / KX) * 1e5) / 1e5, Math.round((y / DEGREE) * 1e5) / 1e5] as Point };
    });
    found.largest[zoom] = sizes.sort((a, b) => b.size - a.size).slice(0, LARGEST);
    for (const at of byNode.values()) {
      const rooms = room(at.map((k) => placed.get(k) as Front), width);
      for (const [i, k] of at.entries()) roomOf.set(k, rooms[i] ?? 0);
    }
    // Only the strokes drawn in the band: those of a Stretch a node absorbed aren't.
    found.weaves[zoom] = drawn.filter((s) => !hidden.get(`${s.line} ${s.shape}`)?.includes(s)).filter((s) => {
      const ends = [`${s.shape} 1 ${s.from}`, `${s.shape} -1 ${s.to}`];
      const turns = ends.some((k) => (changes.get(`${s.line} ${k}`) ?? 0) > 0);
      return turns && s.to - s.from + ROUNDING < ends.reduce((sum, k) => sum + (roomOf.get(k) ?? 0), 0);
    }).length;

    // ponytail: each look at a curve against every segment of its Line's track, about a second for the
    // map; a grid as in faithful() if it grows.
    const off = (line: [number, number][], p: [number, number]) => {
      let best = Infinity;
      for (const [k, b] of line.entries()) {
        const a = line[k - 1] ?? b;
        const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
        best = Math.min(best, Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]));
      }
      return best;
    };
    found.inside[zoom] = 0;
    for (const c of curves) {
      const [shape, track] = [byId.get(c.shape), own.get(c.line)];
      if (!shape || !track?.length) continue;
      const drawnAt = pieces(c);
      const at = (d: number) => {
        const piece = drawnAt.find((p) => d <= p.to) ?? drawnAt.at(-1) ?? c;
        return off(track, flat(beside(shape, d, piece.side * width)));
      };
      const ends = Math.max(at(c.from), at(c.to));
      for (let d = c.from + LOOK / 2; d < c.to; d += LOOK) if (at(d) - ends > width / 2) found.inside[zoom] += Math.min(LOOK, c.to - d + LOOK / 2);
    }
  }
  return found;
}

// Run as `node src/build/measures.ts <track.json>`, on a day's track the daily build wrote or the map
// downloads: the measures of its strokes, and of the strokes sideBySide() draws from its Lines now.
if (import.meta.main) {
  const { readFile } = await import('node:fs/promises');
  const track = JSON.parse(await readFile(process.argv[2] ?? '', 'utf8')) as Track;
  console.log('drawn:', summary(measures(track)));
  const shapes = track.shapes.filter((s) => !s.id.startsWith(STRETCH));
  const now = await sideBySide(track.lines, shapes);
  console.log('now:  ', summary(measures({ shapes: [...shapes, ...now.centrelines], strokes: now.strokes, lines: track.lines })));
}
