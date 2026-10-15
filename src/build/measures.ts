// Yardsticks for how the Lines are drawn side by side, the same before and after a change: how often
// they break up (#138), and how faithfully they follow their track (#160).

import { along, APART, atZoom, bandAt, BANDS, beside, cutIn, DEGREE, direction, drawnIn, EARTH, inBand, LENGTH, LINK, pieces, pixelMetres, pointAt, STRETCH, type Line, type Point, type Shape, type Stroke, type Track } from '../bundle.ts';
import { decodeTrack, type TrackFile } from '../pieces.ts';
import { folded, offset, simplify, TOLERANCE } from './offset.ts';
import type { Found } from './report.ts';
import { aside, KX, lanes, LATITUDE, room, sideBySide, type Front, type Part } from './sideBySide.ts';
import { metres } from './track.ts';

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
/** Within how many line widths a curve that turns and turns back, or turns back on itself, wiggles (#206). */
const WIGGLE = 6;
/** How far, in degrees, a curve's heading turns one way and then back to wiggle: more than easing from one side to another turns it, at most about 21°. */
const TURN = 30;
/** How many times a line width a curve's heading is looked at, each across a line width: from LOOKS / 2 looks back to as many on. */
const LOOKS = 4;
/** How far apart, in degrees, a curve's first and last segments head, at the least, for it to turn back on itself: a hairpin (#353). More than a branch or a change of side turns one. */
const HAIRPIN = 120;
/**
 * Where a Line's own Trains turn back, so that its curve there turns back too, as a hairpin does: left out of
 * `hairpins`, and listed in the report as turn-backs, with why (#622). Each by its Line and how far from its Station,
 * as a curve's middle can be hundreds of metres from it: Santiago's are 302 m away. Only where the curve is where they
 * turn: Reg.Exp.'s Trains turn back at L'Aldea too, and E1's Trips from Eibar end at Ermua, but their hairpins there
 * are the touch by L'Aldea's Station that Avant Exp's curve has too below zoom 10, and the curve across Ermua's
 * horseshoe that FCC's has too, neither of which those Trains turn on, so they aren't named.
 */
const TURN_BACKS: { line: string; at: Point; within: number; why: string }[] = [
  ...['AVE', 'Alvia', 'Avlo'].map((name) => ({
    line: `ave-larga-distancia:${name}`,
    at: [-8.5447, 42.87084] as Point,
    within: 600,
    why: "Santiago de Compostela-Daniel Castelao: AVE's, Alvia's and Avlo's Trains between Vigo and Madrid turn back here, as AVE 04254, 04464, 04475 and 04565, Alvia 00621 and 00622 and Avlo 04494 and 04975 did on 15 Oct 2026",
  })),
  { line: 'media-distancia-avant:MD', at: [-3.20574, 39.39563], within: 600, why: 'Alcázar de San Juan: MD 18081, 18083, 18181 and 18183 turned back here on 15 Oct 2026' },
];

/**
 * How the Lines are drawn. `breaks`: how often they break up. `twice`: metres where a Line shows
 * twice, its strokes on two of its shapes within TWIN of each other, alongside, but drawn at least
 * half a line width apart. `alone`: metres of Line drawn off a track no other Line's is beside,
 * within NEAR and alongside. `over`: metres where two Lines on one track are drawn on top of each
 * other, less than half a line width apart. These four on the line graph from GRAPH_BAND on. `folds`:
 * at each zoom in BANDS, where a stroke's offset turns back on itself, on the inside of a curve
 * tighter than its offset. `covered`: at each zoom in BANDS, metres where a Line is drawn over
 * another's, alongside it less than half the band's line width apart, as tracks further apart than
 * NEAR are, zoomed out (ADR-0007). In `over` and `covered`, the Lines given of one Network and one
 * colour count as one Line (#303): sideBySide() gives them one lane (lanes()), their strokes lying on
 * each other on purpose (#283). `dangling`: stroke
 * ends drawn at LOOSE_ZOOM further than LOOSE from any other stroke of their Line, not counting the one
 * that goes on from the stroke's other end, as a stub's curve does (#353), and not at a terminus (#172).
 * Links (LINK), the curves that join a Line's stroke on one Stretch to its next, count only
 * there, in LOOSE_ZOOM's band, and in the measures of nodes, at each zoom in BANDS (ADR-0007, #186).
 * `kinks`: curves shorter than LENGTH × their side change × the band's line width. `weaves`: a Line's
 * strokes shorter than the room() of the nodes at their ends, where it changes side at either.
 * `hidden`: strokes still drawn along a Stretch a node absorbed, read as those within another Line's stroke
 * on their centreline that isn't drawn in the band (#708): a Stretch none of whose strokes is cut isn't seen.
 * `wiggles`: curves that, drawn with the strokes they join, turn TURN degrees one way and back the
 * other, an S-bend, or turn back on themselves, within WIGGLE line widths, where they turn on the curve (#206).
 * `hairpins`: curves whose first and last segments, those of at least ROUNDING, head HAIRPIN degrees or
 * more apart, so that they run back along themselves, hooking onto the Stretch they leave or the one
 * they come onto (#353), but where their Line's Trains turn back (TURN_BACKS, #622).
 * `inside`: metres of curve drawn further off its Line's own track, by more than half a line width,
 * than at either of its ends. `largest`: the LARGEST largest nodes, how far apart their fronts are in
 * the band's line widths, and where their middle is, so that a node that absorbed too much shows (#187).
 * `curves`: each curve that wiggles, and each hairpin, which the report lists one by one (#520).
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
  hidden: Record<number, number>;
  wiggles: Record<number, number>;
  hairpins: Record<number, number>;
  inside: Record<number, number>;
  largest: Record<number, { size: number; at: Point }[]>;
  curves: Curve[];
}

/**
 * A curve that wiggles or is a hairpin, in its band: its zoom, its Line, where its middle is, and how far its chain
 * steps aside, in the band's line widths (aside()). A hairpin where its Line's Trains turn back is a turn-back, with why (#622).
 */
export interface Curve {
  kind: 'wiggle' | 'hairpin' | 'turnback';
  why?: string;
  zoom: number;
  line: string;
  at: Point;
  aside: number;
}

/** The measures of a day's track; `inside` only for the Lines given, and in `over` and `covered`, the Lines given in one lane as one Line. */
export function measures({ shapes, strokes: pieces, lines = [] }: Pick<Track, 'shapes' | 'strokes'> & Partial<Pick<Track, 'lines'>>): Measures {
  const strokes = joined(pieces);
  const drawn = strokes.filter((s) => !s.shape.startsWith(LINK));
  const graph = drawn.filter((s) => s.band === undefined);
  // Each Line given, by ID, as the first Line in its lane; any other as itself.
  const lane = lanes(lines);
  const first = new Map(lines.map((l, i) => [l.id, lines[lane[i] ?? i]?.id ?? l.id]));
  const one = (line: string) => first.get(line) ?? line;
  const curves = [...wiggles(strokes, shapes), ...hairpins(strokes, shapes)];
  const count = (kind: Curve['kind']) => Object.fromEntries(BANDS.map((zoom) => [zoom, curves.filter((c) => c.kind === kind && c.zoom === zoom).length]));
  return { breaks: breaks(graph, shapes), ...faithful(graph, shapes, one), folds: folds(drawn, shapes), covered: covered(strokes, shapes, one), dangling: dangling(strokes, shapes), ...nodes(strokes, shapes, lines), wiggles: count('wiggle'), hairpins: count('hairpin'), curves };
}

/**
 * Strokes joined up again where sideBySide() cut them at a tunnel's ends (#178), as they're drawn the same
 * either side. split() gave each piece the part of the stroke's cut that's in it, so that a cut longer than
 * a piece is the whole of it and goes on in the next: in each band, the joined stroke is drawn from where
 * the first piece that's drawn begins to where the last one's ends, and is cut whole where none is (#386).
 * A piece with no `cut`, as sideBySide() gives none a stroke that no band cuts, is cut by none at either end (#540).
 */
function joined(strokes: Stroke[]): Stroke[] {
  const same = (a: Stroke, b: Stroke) => a.line === b.line && a.shape === b.shape && a.side === b.side && a.shared === b.shared && a.to === b.from && a.band === b.band && !a.shape.startsWith(LINK);
  return strokes.reduce<Stroke[]>((all, s) => {
    const last = all.at(-1);
    if (last && same(last, s)) {
      // A stroke that no band cuts has no `cut`: that's none at either end, not a cut to forget (#540).
      const cut = (last.cut ?? s.cut)?.map((_, band): [number, number] => {
        const [start = 0, end = 0] = last.cut?.[band] ?? [];
        const [next = 0, stop = 0] = s.cut?.[band] ?? [];
        const from = start + end >= last.to - last.from ? s.from + next : last.from + start;
        const to = next + stop >= s.to - s.from ? last.to - end : s.to - stop;
        return from < to ? [from - last.from, s.to - to] : [s.to - last.from, 0];
      });
      all[all.length - 1] = { ...last, to: s.to, ...(cut && { cut }) };
    } else all.push(s);
    return all;
  }, []);
}

/** Measures in a line for the build's log. */
export function summary({ breaks: b, twice, alone, over, folds: f, covered, dangling: loose, kinks, weaves, hidden, wiggles, hairpins, inside, largest }: Measures): string {
  const km = (m: number) => `${(m / 1000).toFixed(1)} km`;
  const per = (found: Record<number, number>, as: (n: number) => string = String) => Object.entries(found).map(([zoom, n]) => `${as(n)} at zoom ${zoom}`).join(', ');
  return `${total(b)} breaks (${b.steps} steps, ${b.stubs} stubs, ${b.swaps} swaps, ${b.joins} joins), ${km(twice)} drawn twice, ${km(alone)} off a track they have alone, ${Math.round(over)} m over each other, folds ${per(f)}, covered ${per(covered, (m) => `${(m / 1000).toFixed(1)} km`)}, ${loose} dangling ends, kinks ${per(kinks)}, weaves ${per(weaves)}, hidden strokes drawn ${per(hidden)}, wiggles ${per(wiggles)}, hairpins ${per(hairpins)}, off track inside nodes ${per(inside, (m) => `${Math.round(m)} m`)}${Object.entries(largest).map(([zoom, list]) => `\n  largest nodes at zoom ${zoom}, in line widths: ${list.map(({ size, at: [lon, lat] }) => `${size.toFixed(1)} at ${lat.toFixed(5)},${lon.toFixed(5)}`).join(', ')}`).join('')}`;
}

/**
 * The measures as the build reports them, given the log's text of them, which ends in summary()'s:
 * one spot with each of their numbers, in whole metres where they're metres, and its first line, one
 * for each of the largest nodes, with its zoom's line, and one for each curve that wiggles and each
 * hairpin, with how far its chain steps aside, which the log doesn't print (#520), and each turn-back, with why (#622).
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
    ...each('hidden', m.hidden),
    ...each('wiggles', m.wiggles),
    ...each('hairpins', m.hairpins),
    ...each('inside', m.inside),
  ]);
  // summary() gives the largest nodes a line for each zoom, in order, after its first.
  const nodes = Object.entries(m.largest).flatMap(([zoom, list], i) =>
    list.map(({ size, at }): Found => ({ kind: 'node', zoom: Number(zoom), point: at, text: [zooms[i]?.trim() ?? ''], numbers: { size } })),
  );
  const curves = m.curves.map(({ kind, zoom, line, at, aside, why }): Found => ({ kind, zoom, line, point: at, text: why ? [why] : [], numbers: { aside } }));
  return [{ kind: 'measures', text: [first], numbers }, ...nodes, ...curves];
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

/**
 * The metres drawn twice, alone and over each other (see Measures), each counted once, judged every
 * EVERY along each stroke: over each other only for Lines in different lanes, given by `one`.
 */
function faithful(strokes: Stroke[], shapes: Shape[], one: (line: string) => string): Pick<Measures, 'twice' | 'alone' | 'over'> {
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
        else [beside, over] = [true, over || (across <= SAME && drawn < 0.25 && one(o.line) !== one(m.line))];
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
  // cut back where its curves take over; with the ends of each along its centreline.
  const band = bandAt(LOOSE_ZOOM);
  const byLine = new Map<string, { drawn: [number, number][]; ends: [number, number][] }[]>();
  for (const s of strokes.flatMap(pieces)) {
    const shape = inBand(byId, s.shape, band);
    if (!shape || !drawnIn(s, band)) continue;
    const [start, end] = cutIn(s, band);
    // Not drawn in the band: a node absorbed its Stretch.
    if (start + end >= s.to - s.from) continue;
    const points = along(shape, s.from + start, s.to - end).map(flat);
    const width = atZoom(APART, LOOSE_ZOOM) * pixelMetres(LOOSE_ZOOM, LATITUDE);
    byLine.set(s.line, [...(byLine.get(s.line) ?? []), { drawn: offset(points, s.side * width), ends: [points[0] ?? [0, 0], points.at(-1) ?? [0, 0]] }]);
  }
  // ponytail: every stroke end against every segment of its Line, about 2 s for the map; a grid if it grows.
  let found = 0;
  for (const own of byLine.values()) {
    for (const [i, { drawn: points, ends }] of own.entries()) {
      for (const [e, p] of [points[0], points.at(-1)].entries()) {
        if (!p || termini.some(([x, y]) => Math.hypot(x - p[0], y - p[1]) < TERMINUS)) continue;
        // Not the strokes that go on from its other end: a stub's far end is as near its curve as the stub is long (#353).
        const [bx = 0, by = 0] = ends[e ? 0 : 1] ?? [];
        const near = own.some(({ drawn: other, ends: [first = [0, 0], last = [0, 0]] }, j) => j !== i && Math.min(Math.hypot(first[0] - bx, first[1] - by), Math.hypot(last[0] - bx, last[1] - by)) > ROUNDING && other.some((b, k) => {
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

/** At each zoom in BANDS, the metres where a Line is drawn over another's in another lane, given by `one` (see Measures), judged every EVERY along each of its strokes as drawn there: each point once however many it's over, and halved, as two Lines over each other are found from both. */
function covered(strokes: Stroke[], shapes: Shape[], one: (line: string) => string): Record<number, number> {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  const flat = ([lon, lat]: Point): [x: number, y: number] => [lon * KX, lat * DEGREE];
  const found: Record<number, number> = {};
  for (const [band, zoom] of BANDS.entries()) {
    const width = atZoom(APART, zoom) * pixelMetres(zoom, LATITUDE);
    // Each Line's strokes as drawn in the band, cut back where its curves take over, and its curves, in their pieces, by its lane.
    const lines = strokes.filter((s) => drawnIn(s, band)).flatMap((s) => {
      const [start, end] = cutIn(s, band);
      const shape = inBand(byId, s.shape, band);
      if (!shape || start + end >= s.to - s.from) return [];
      return pieces({ ...s, from: s.from + start, to: s.to - end }).map((p) => ({ line: one(s.line), points: offset(along(shape, p.from, p.to).map(flat), p.side * width) }));
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

/** At each zoom in BANDS, the kinks, weaves, hidden strokes drawn and metres off track inside nodes (see Measures). */
function nodes(strokes: Stroke[], shapes: Shape[], lines: Line[]): Pick<Measures, 'kinks' | 'weaves' | 'hidden' | 'inside' | 'largest'> {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  const flat = ([lon, lat]: Point): [x: number, y: number] => [lon * KX, lat * DEGREE];
  const own = new Map(lines.map((l) => [l.id, l.shapes.flatMap((id) => byId.get(id)?.coords.map(flat) ?? [])]));
  const offOwn = new Map([...own].map(([id, track]) => [id, offTrack(track)]));
  const found: Pick<Measures, 'kinks' | 'weaves' | 'hidden' | 'inside' | 'largest'> = { kinks: {}, weaves: {}, hidden: {}, inside: {}, largest: {} };
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
    // A stroke within one a node absorbed, of another Line along the same centreline, is one it absorbed too, and isn't drawn.
    const cutOn = new Map<string, Stroke[]>();
    for (const s of [...hidden.values()].flat()) cutOn.set(s.shape, [...(cutOn.get(s.shape) ?? []), s]);
    found.hidden[zoom] = drawn.filter((s) => !hidden.get(`${s.line} ${s.shape}`)?.includes(s) && cutOn.get(s.shape)?.some((t) => t.from - 1 <= s.from && s.to <= t.to + 1)).length;
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

    found.inside[zoom] = 0;
    for (const c of curves) {
      const [shape, off] = [byId.get(c.shape), offOwn.get(c.line)];
      if (!shape || !own.get(c.line)?.length || !off) continue;
      const drawnAt = pieces(c);
      const at = (d: number) => {
        const piece = drawnAt.find((p) => d <= p.to) ?? drawnAt.at(-1) ?? c;
        return off(flat(beside(shape, d, piece.side * width)));
      };
      const ends = Math.max(at(c.from), at(c.to));
      for (let d = c.from + LOOK / 2; d < c.to; d += LOOK) if (at(d) - ends > width / 2) found.inside[zoom] += Math.min(LOOK, c.to - d + LOOK / 2);
    }
  }
  return found;
}

/** How many of a track's segments offTrack() looks at as one run, by the box their points lie in. */
const RUN = 128;

/**
 * How far points are from a track, through its points in turn: from the nearest of its segments, looked
 * for first in the run of RUN of them whose box is nearest, then in each other run whose box is no
 * further off than the nearest segment found yet, give or take a millimetre's rounding. So it's the
 * nearest that looking at every segment finds, quickly on a track as long as long distance's AVE's,
 * 342,148 points, whose curves nodes() looks at every LOOK (#262).
 * ponytail: every run's box at each point, 2,700 of them for AVE; runs of runs if a track grows tenfold.
 */
export function offTrack(track: [number, number][]): (p: [number, number]) => number {
  const runs = Array.from({ length: Math.ceil(track.length / RUN) }, (_, j) => {
    const points = track.slice(Math.max(0, j * RUN - 1), (j + 1) * RUN);
    return [Math.min(...points.map((q) => q[0])), Math.min(...points.map((q) => q[1])), Math.max(...points.map((q) => q[0])), Math.max(...points.map((q) => q[1]))];
  });
  return (p) => {
    let best = Infinity;
    const look = (j: number) => {
      for (let k = j * RUN; k < Math.min(track.length, (j + 1) * RUN); k++) {
        const b = track[k] ?? p;
        const a = track[k - 1] ?? b;
        const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
        best = Math.min(best, Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]));
      }
    };
    const far = runs.map(([w = 0, s = 0, e = 0, n = 0]) => Math.hypot(Math.max(0, w - p[0], p[0] - e), Math.max(0, s - p[1], p[1] - n)));
    const nearest = far.indexOf(Math.min(...far));
    if (nearest >= 0) look(nearest);
    for (const [j, d] of far.entries()) if (j !== nearest && d <= best + 0.001) look(j);
    return best;
  };
}

/**
 * At each zoom in BANDS, the curves that wiggle (see Measures), each as the map draws it in the band:
 * in pieces, simplified by TOLERANCE px, offset along its joins' miters, from WIGGLE line widths along the
 * stroke it leaves to WIGGLE widths along the one it comes onto. Its heading is looked at LOOKS times
 * a line width.
 */
function wiggles(strokes: Stroke[], shapes: Shape[]): Curve[] {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  const flat = ([lon, lat]: Point): [x: number, y: number] => [lon * KX, lat * DEGREE];
  const found: Curve[] = [];
  for (const [band, zoom] of BANDS.entries()) {
    const px = pixelMetres(zoom, LATITUDE);
    const width = atZoom(APART, zoom) * px;
    /** Along a shape from one distance to another, `side` line widths right of it, as the map draws it in the band. */
    const drawn = (id: string, from: number, to: number, side: number) => {
      const shape = inBand(byId, id, band);
      const points = shape ? offset(simplify(along(shape, Math.min(from, to), Math.max(from, to)).map(flat), TOLERANCE * px), side * width) : [];
      return from > to ? points.toReversed() : points;
    };
    const byShape = new Map<string, Stroke[]>();
    for (const s of strokes) if (!s.shape.startsWith(LINK) && drawnIn(s, band)) byShape.set(`${s.line} ${s.shape}`, [...(byShape.get(`${s.line} ${s.shape}`) ?? []), s]);
    /**
     * The Line's stroke a curve leaves, where `leaves`, or comes onto, from where its part of the curve
     * (`across`) starts or ends, as far as WIGGLE line widths, the way the Line goes: on the far side of
     * the part, or where the part has no length, wherever the stroke drawn up to that point is.
     */
    const joining = (line: string, [id, start, end]: [string, number, number], leaves: boolean): [number, number][] => {
      const at = leaves ? start : end;
      const away = Math.sign(end - start) * (leaves ? -1 : 1);
      for (const s of byShape.get(`${line} ${id}`) ?? []) {
        const [from, to] = [s.from + cutIn(s, band)[0], s.to - cutIn(s, band)[1]];
        const lies = from >= to ? 0 : Math.abs(from - at) <= 1 ? 1 : Math.abs(to - at) <= 1 ? -1 : 0;
        if (!lies || (away && lies !== away)) continue;
        const far = lies > 0 ? Math.min(to, at + WIGGLE * width) : Math.max(from, at - WIGGLE * width);
        return leaves ? drawn(id, far, at, s.side) : drawn(id, at, far, s.side);
      }
      return [];
    };
    for (const c of strokes) {
      const [first, last] = [c.across?.[0], c.across?.at(-1)];
      if (!c.shape.startsWith(LINK) || c.band !== band || !first || !last) continue;
      const [before = [], curve = [], after = []] = [joining(c.line, first, true), pieces(c).flatMap((p) => drawn(c.shape, p.from, p.to, p.side)), joining(c.line, last, false)].map((points) => spaced(points, width / LOOKS));
      const h = headings([...before, ...curve, ...after]);
      // Where the curve is among the headings, which start LOOKS / 2 points along the line.
      if (turnsBack(h, Math.max(0, before.length - LOOKS / 2), Math.min(h.length - 1, before.length + curve.length - 1 - LOOKS / 2), LOOKS * WIGGLE)) found.push(curveOf('wiggle', c, band, byId, byShape));
    }
  }
  return found;
}

/**
 * At each zoom in BANDS, the curves that turn back on themselves (see Measures): their first and last
 * segments, each taken to its first point at least ROUNDING from the end, which the track's rounding of
 * its points would turn any way, head HAIRPIN degrees or more apart.
 */
function hairpins(strokes: Stroke[], shapes: Shape[]): Curve[] {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  const flat = ([lon, lat]: Point): [x: number, y: number] => [lon * KX, lat * DEGREE];
  const found: Curve[] = [];
  // Each Line's strokes on each shape, in every band, for how far a curve's chain steps aside.
  const byShape = new Map<string, Stroke[]>();
  for (const s of strokes) if (!s.shape.startsWith(LINK)) byShape.set(`${s.line} ${s.shape}`, [...(byShape.get(`${s.line} ${s.shape}`) ?? []), s]);
  /** Which way a line through points heads from its first, in degrees anticlockwise from east: none where it's all within ROUNDING of it. */
  const heading = (points: [number, number][]) => {
    const [p = [0, 0]] = points;
    const q = points.find((r) => Math.hypot(r[0] - p[0], r[1] - p[1]) >= ROUNDING);
    return q && (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
  };
  for (const c of strokes) {
    const shape = byId.get(c.shape);
    if (!c.shape.startsWith(LINK) || c.band === undefined || !c.across || !shape) continue;
    const points = along(shape, c.from, c.to).map(flat);
    // Looking back from its end, it heads half a turn the other way to the way it goes there.
    const [start, back] = [heading(points), heading(points.toReversed())];
    if (start === undefined || back === undefined) continue;
    if (Math.abs(((back + 180 - start + 540) % 360) - 180) < HAIRPIN) continue;
    const curve = curveOf('hairpin', c, c.band, byId, byShape);
    const why = turnBack(curve.line, curve.at)?.why;
    found.push(why ? { ...curve, kind: 'turnback', why } : curve);
  }
  return found;
}

/** Why a Line's curve whose middle is at a point turns back, where its Trains do (TURN_BACKS). */
export function turnBack(line: string, at: Point): { why: string } | undefined {
  return TURN_BACKS.find((t) => t.line === line && metres(at, t.at) <= t.within);
}

/**
 * A curve that wiggles or is a hairpin as the measures report it (see Curve): where the middle of its
 * line is, and how far its chain steps aside (aside()), read off its `across` and the strokes of its
 * Line, by Line and shape, that the band draws. A part of the stroke it leaves or comes onto that's cut
 * back by nothing has no length, so the chain goes along that stroke the way the stroke lies from it.
 */
function curveOf(kind: Curve['kind'], c: Stroke, band: number, byId: Map<string, Shape>, byShape: Map<string, Stroke[]>): Curve {
  const zoom = BANDS[band] ?? 0;
  const width = atZoom(APART, zoom) * pixelMetres(zoom, LATITUDE);
  const parts = (c.across ?? []).map(([id, start, end], i): Part => {
    const [line, own] = [inBand(byId, id, band) ?? { coords: [], dist: [] }, (byShape.get(`${c.line} ${id}`) ?? []).filter((s) => drawnIn(s, band))];
    // A stroke the node absorbed is cut whole (#708).
    if (start !== end) return { line, from: start, to: end, hidden: own.some((s) => cutIn(s, band)[0] + cutIn(s, band)[1] >= s.to - s.from && s.from - 1 <= Math.min(start, end) && Math.max(start, end) <= s.to + 1) };
    const s = own.find((s) => Math.abs(s.from - start) <= 1 || Math.abs(s.to - start) <= 1);
    const other = !s ? start : Math.abs(s.from - start) <= 1 ? s.to : s.from;
    return { line, from: i ? start : other, to: i ? other : start, hidden: false };
  });
  const [lon = 0, lat = 0] = pointAt(byId.get(c.shape) ?? { coords: [], dist: [] }, (c.from + c.to) / 2);
  return { kind, zoom, line: c.line, at: [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5], aside: Math.round((aside(parts, width) / width) * 10) / 10 };
}

/** Points along a line through points, from its first, every `step` metres. */
function spaced(points: [number, number][], step: number): [number, number][] {
  const found = points.slice(0, 1);
  let next = step; // how far along the segment the next point is
  for (const [i, b] of points.entries()) {
    const a = points[i - 1];
    if (!a) continue;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (; next <= length; next += step) found.push([a[0] + ((b[0] - a[0]) * next) / length, a[1] + ((b[1] - a[1]) * next) / length]);
    next -= length;
  }
  return found;
}

/** Which way a line through points heads at each but the LOOKS / 2 at either end, in degrees anticlockwise from east, from LOOKS / 2 points back to as many on, without jumps of a full turn. */
function headings(points: [number, number][]): number[] {
  const found: number[] = [];
  for (let i = LOOKS / 2; i < points.length - LOOKS / 2; i++) {
    const [p = [0, 0], q = [0, 0]] = [points[i - LOOKS / 2], points[i + LOOKS / 2]];
    const was = found.at(-1);
    const h = (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
    found.push(was === undefined ? h : h - 360 * Math.round((h - was) / 360));
  }
  return found;
}

/**
 * Whether a line's headings, looked at every so often, turn TURN degrees one way and then back the
 * other, or turn back on themselves, all within `within` looks, where they turn at a look from `start`
 * to `stop`.
 */
function turnsBack(h: number[], start: number, stop: number, within: number): boolean {
  for (let j = start; j <= stop; j++) {
    const at = h[j] ?? 0;
    for (const way of [1, -1]) {
      // The nearest look before it where the heading was TURN short of it, and after it, where it's TURN back.
      let i = j - 1;
      while (i >= Math.max(0, j - within) && way * (at - (h[i] ?? at)) < TURN) i--;
      let k = j + 1;
      while (k < Math.min(h.length, j + within + 1) && way * (at - (h[k] ?? at)) < TURN) k++;
      if (i >= Math.max(0, j - within) && k < Math.min(h.length, j + within + 1) && k - i <= within) return true;
    }
  }
  // Or half a turn, within as many looks of one where they turn.
  for (let i = Math.max(0, start - within); i <= stop; i++) {
    const looks = h.slice(i, i + within + 1);
    if (Math.max(...looks) - Math.min(...looks) >= 180) return true;
  }
  return false;
}

// Run as `node src/build/measures.ts <track.json>`, on a day's track the daily build wrote or the map
// downloads: the measures of its strokes, and of the strokes sideBySide() draws from its Lines now.
if (import.meta.main) {
  const { readFile } = await import('node:fs/promises');
  const track = decodeTrack(JSON.parse(await readFile(process.argv[2] ?? '', 'utf8')) as TrackFile);
  console.log('drawn:', summary(measures(track)));
  const shapes = track.shapes.filter((s) => !s.id.startsWith(STRETCH));
  const now = await sideBySide(track.lines, shapes);
  console.log('now:  ', summary(measures({ shapes: [...shapes, ...now.centrelines], strokes: now.strokes, lines: track.lines })));
}
