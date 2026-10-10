// How the map draws each Line: where Lines share track, side by side, as a transit map does.

import { along, APART, atZoom, BANDS, beside, cutIn, DEGREE, GRAPH_BAND, inBand, LENGTH, LINK, pieces, pixelMetres, pointAt, smoothId, STRETCH, type Line, type Point, type Shape, type Slot, type Stroke } from '../bundle.ts';
import { order, type Node } from './order.ts';
import { folded, simplify, TOLERANCE } from './offset.ts';
import { distances, nearest } from './track.ts';

/** Tracks less than this far apart, in metres, look like one zoomed out, so the Lines on them go side by side: from GRAPH_BAND on, and below it, a line width at the band's zoom (ADR-0007). */
const NEAR = 45;
/** How far to each side of a track to look for others, as many times as tracks are near enough to go side by side. */
const WIDE = 3;
/** Tracks closer to parallel than this (a cosine) run alongside each other rather than cross. */
const PARALLEL = Math.cos(Math.PI / 6);
/** Longer segments are judged in pieces this long, in metres, by what runs beside each. */
const STEP = 50;
/** A Line doesn't shift over for less than this, in metres: another's track is only brushing past. */
const SHORT = 150;
/** How far along an edge from a node, in metres, the way it leaves the node is judged. */
const ANGLE = 300;
/** How far, in metres, a Line's stroke may end from where its shape leaves a Stretch or comes onto it, for a curve to join it there. */
const REACH = 2 * STEP;
/** How many segments a curve is drawn with. */
const SEGMENTS = 8;
/** How far apart, in metres, a centreline is looked at to smooth it. */
const SAMPLE = 5;
/** The most a centreline is moved to smooth it, in line widths at its band's zoom. */
const MOVE = 1;
/** How many times at most a centreline's smoothing is widened where it still folds. */
const ROUNDS = 30;
/** Bundles whose centrelines get further apart by less than this, for each metre on, run side by side rather than part (#196). */
const PART = 0.05;
/** Past this many places side by side, the gap between them narrows, so that a stretch gets no wider (#165). */
const CROWD = 6;
/** How far, in metres along its stroke, a Train may be put from where its own track would put it, so that a Line's slots come in fewer pieces: further on a band's own graph (ADR-0007). */
const ALONG = 25;
/**
 * The latitude the drawing takes flat metres east to west at, and line widths in metres: the mean of
 * every Line's points on 6 Oct 2026, fixed, so that a Line changing anywhere moves no other's (#277).
 * ponytail: one latitude for all of Spain, so a metre east to west is 7% long at Cádiz and 3.4% short
 * in Asturias. Draw in Web Mercator, as the map is, if that shows.
 */
export const LATITUDE = 41.32;
/** Metres in a degree of longitude at LATITUDE. */
export const KX = DEGREE * Math.cos((LATITUDE * Math.PI) / 180);

/** A piece of track: where its middle is and which way it points, in local metres, and the Lines on it. */
interface Piece {
  x: number;
  y: number;
  ux: number;
  uy: number;
  length: number;
  /** Its level, as its track's shape has it (Shape's `levels`): only Lines on the same level go side by side (#165). */
  level: string;
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
 * centreline: its Lines go side by side along it, a line width apart, in one order all along, but
 * those of one Network and one colour in one place, each stroke on the others' (#283); and each is
 * drawn once, whichever way and whichever of its tracks it runs (ADR-0006). The centrelines
 * are shapes of their own. `rails` draws each Line on its own track instead, its shapes' track once,
 * for zoomed right in, marking where another Line runs on that track too (#139). And the slots of
 * every one of each Line's shapes, all along it, where the map puts the Line's Trains zoomed out: on
 * its stroke, along the centreline of the Stretch each piece of it is drawn on (#176). And `tracks`,
 * each Network's track once, for below zoom 7 (#190). Of the Lines of one region, which has its own
 * graph: no Line is drawn beside another region's (ADR-0014), as sharedTrack() finds.
 */
export async function sideBySide(lines: Line[], shapes: Shape[], region = ''): Promise<{ strokes: Stroke[]; centrelines: Shape[]; rails: Stroke[]; slots: Slot[]; tracks: Stroke[] }> {
  const walked = walk(lines, shapes);
  // The centrelines' and curves' IDs start with the region's, where it's given: regions' tracks are built
  // one by one and joined by the map, so each one's IDs are its own (ADR-0014).
  const lead = region && `${region}:`;
  const main = await graphed(walked, lines, { near: NEAR, bands: [...BANDS.keys()].filter((b) => b >= GRAPH_BAND), prefix: lead });
  // Below GRAPH_BAND, a graph for each band, of tracks within about a line width there (ADR-0007).
  const below = [];
  for (const [band, zoom] of BANDS.entries()) {
    if (band >= GRAPH_BAND) continue;
    below.push(await graphed(walked, lines, { near: atZoom(APART, zoom) * pixelMetres(zoom, LATITUDE), bands: [band], own: band, prefix: `${lead}${zoom}-` }));
  }
  const all = [main, ...below];
  return { strokes: all.flatMap((g) => g.strokes), centrelines: all.flatMap((g) => g.centrelines), rails: main.rails, slots: all.flatMap((g) => g.slots), tracks: networkTrack(lines, shapes) };
}

/**
 * Each Network's track once, however many of its Lines run on it (#190): walked as if its Lines were
 * one, each length of it is drawn on its track, along the first of their shapes to run it.
 */
function networkTrack(lines: Line[], shapes: Shape[]): Stroke[] {
  const [owner, networks] = [new Map(lines.flatMap((l) => l.shapes.map((s): [string, string] => [s, l.id]))), new Map<string, Line>()];
  for (const l of lines) {
    const network = networks.get(l.network);
    if (network) network.shapes.push(...l.shapes);
    else networks.set(l.network, { ...l, shapes: [...l.shapes] });
  }
  const { pieces, runs } = walk([...networks.values()], shapes);
  return runs.flatMap((run) => strokes(owner.get(run[0]?.shape ?? '') ?? '', run, () => 0, pieces));
}

/** Where Lines of two regions run along each other's track (sharedTrack()). */
export interface Shared {
  /** The two regions, in the order of their first Lines. */
  regions: [first: string, second: string];
  /** How many separate runs of track there are, and how long they are along the first region's, in metres. */
  stretches: number;
  metres: number;
  /** Where the first piece of them is. */
  at: Point;
  /** The IDs of the Lines of both regions along them. */
  lines: string[];
}

/**
 * Where Lines of different regions run along each other's track: on the same track, or on tracks within
 * NEAR of each other, which one line graph would take for a Stretch of its own and draw side by side
 * (ADR-0006). Each region has a graph of its own (ADR-0014), so there they're drawn over each other.
 * Each pair of regions that has any, with how many runs, how long and where.
 */
export function sharedTrack(lines: Line[], shapes: Shape[], regionOf: (line: Line) => string): Shared[] {
  const { pieces, every } = walk(lines, shapes);
  const [regions, cells] = [lines.map(regionOf), grid(pieces, NEAR)];
  const found = new Map<string, { regions: [string, string]; pieces: Set<number>; lines: Set<number> }>();
  for (const [i, p] of pieces.entries()) {
    const near = cluster(neighbours(i, pieces, cells, NEAR), NEAR);
    // Each pair once, from the side of the region that comes first: the pieces of its track that the other's Lines are along.
    for (const own of new Set([...p.on.keys()].map((l) => regions[l] ?? ''))) {
      for (const n of near) {
        const other = regions[n.line] ?? '';
        if (other === own || regions.indexOf(other) < regions.indexOf(own)) continue;
        const pair = found.get(`${own} ${other}`) ?? { regions: [own, other] as [string, string], pieces: new Set<number>(), lines: new Set<number>() };
        found.set(`${own} ${other}`, pair);
        pair.pieces.add(i);
        pair.lines.add(n.line);
        for (const l of p.on.keys()) if (regions[l] === own) pair.lines.add(l);
      }
    }
  }
  return [...found.values()].map(({ regions: pair, pieces: on, lines: along }) => {
    // Pieces one after another along a shape are one Stretch.
    const next = new Map<number, number[]>();
    for (const steps of every) {
      for (const [k, { piece }] of steps.entries()) {
        const before = steps[k - 1]?.piece;
        if (before === undefined || !on.has(before) || !on.has(piece)) continue;
        next.set(before, [...(next.get(before) ?? []), piece]);
        next.set(piece, [...(next.get(piece) ?? []), before]);
      }
    }
    let stretches = 0;
    const seen = new Set<number>();
    for (const start of on) {
      if (seen.has(start)) continue;
      stretches++;
      for (const stack = [start]; stack.length; ) {
        const i = stack.pop() ?? start;
        if (seen.has(i)) continue;
        seen.add(i);
        stack.push(...(next.get(i) ?? []));
      }
    }
    const first = pieces[Math.min(...on)];
    return {
      regions: pair,
      stretches,
      metres: [...on].reduce((sum, i) => sum + (pieces[i]?.length ?? 0), 0),
      at: [Math.round(((first?.x ?? 0) / KX) * 1e5) / 1e5, Math.round(((first?.y ?? 0) / DEGREE) * 1e5) / 1e5] as Point,
      lines: [...along].map((l) => lines[l]?.id ?? ''),
    };
  });
}

/**
 * Each Line's lane, the index of the first of the Lines of its Network and its colour, compared
 * without case: they take one place where they share a Stretch, as Renfe's map draws one C-4 up to
 * its fork (#283). So measures() counts each lane as one Line in `over` and `covered`, its strokes
 * lying on each other on purpose (#303).
 */
export function lanes(lines: Line[]): number[] {
  return lines.map((l) => lines.findIndex((m) => m.network === l.network && m.colour.toLowerCase() === l.colour.toLowerCase()));
}

/**
 * The strokes, centrelines, rails and slots of one line graph, drawn in `bands`: its Stretches take
 * tracks within `near` of each other, and their IDs start with `prefix`, after STRETCH or LINK. Where
 * it's a band's `own`, its strokes and slots are only in that band.
 */
async function graphed(
  { pieces, runs, every }: ReturnType<typeof walk>,
  lines: Line[],
  { near, bands, own, prefix }: { near: number; bands: number[]; own?: number; prefix: string },
): Promise<{ strokes: Stroke[]; centrelines: Shape[]; rails: Stroke[]; slots: Slot[] }> {
  const cells = grid(pieces, near);
  const nearby = pieces.map((_, i) => neighbours(i, pieces, cells, near));
  const turned = turn(lines.length, pieces, nearby.map((n) => byLine(cluster(n, near))));
  const tracks = nearby.map((n) => cluster(n, near, turned));
  const beside = tracks.map(byLine);
  const left = sides(lines.length, pieces, nearby, turned);
  const place = rank(left);
  const sideOf = (s: Step) => side(s, beside[s.piece] ?? new Map(), turned, left, place);
  const draw = (run: Step[], by: (s: Step) => number, shares = false) => {
    const line = lines[run[0]?.line ?? -1]?.id ?? '';
    return strokes(line, run, by, pieces, shares);
  };
  const kept = lasting(every, pieces, tracks);
  const keptBeside = kept.map(byLine);
  const { centrelines, stretches: found, drawer } = stretches(pieces, every, kept, keptBeside, `${STRETCH}${prefix}`);
  // Each drawn piece's Stretch, the line graph's edge it's on, and how far along its centreline its middle is.
  const edgeOf = new Map(found.flatMap(({ steps }, e) => steps.map((s): [number, [edge: number, at: number]] => [s.piece, [e, (s.from + s.to) / 2]])));
  const most = (metres: Map<number, number>) => [...metres].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  // Each Line's lane, ordered and placed for all its Lines, so that each Line's stroke lies on the others'.
  const lane = lanes(lines);
  // Where nothing else decides, a Stretch's lanes go in the order of the sides their Lines take on it
  // piece by piece, for most of it, each where the first of its Lines in that order goes.
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
    return [...new Set(onIt.toSorted((a, b) => usual(a) - usual(b) || a - b).map((l) => lane[l] ?? l))];
  });
  const walked = every.map((shape) => ({ line: shape[0]?.line ?? -1, visits: visits(shape, pieces, drawer, edgeOf) }));
  const byId = new Map(centrelines.map((c) => [c.id, c]));
  const orders = await order(prior, graph(found, walked.map((w) => ({ ...w, line: lane[w.line] ?? w.line })), byId));
  // Each Line on each Stretch it goes along, a run for each time it's there, all at one side: its
  // lane's place in the Stretch's order among the lanes there, for most of it. A SHORT Stretch merged
  // into another brings its Lines, but only there.
  const sideOn = new Map<string, number>(); // `<Stretch> <Line>`
  const onStretch = new Map<string, Stroke[]>(); // each Line's strokes on each Stretch, `<Stretch> <Line>`
  const visited = new Set(walked.flatMap(({ line, visits }) => visits.map((v) => `${v.edge} ${line}`)));
  const drawn = found.flatMap(({ steps, lines: onIt }, e) =>
    onIt.flatMap((line) => {
      // Only on a Stretch it goes along: beside one it doesn't, it's drawn on its own.
      if (!visited.has(`${e} ${line}`)) return [];
      const [list, metres] = [[] as Step[][], new Map<number, number>()];
      let [run, crowded]: [Step[] | undefined, boolean] = [undefined, false];
      for (const s of steps) {
        if (!keptBeside[s.piece]?.has(line)) {
          run = undefined;
          continue;
        }
        if (!run) list.push((run = []));
        run.push({ ...s, line });
        const here = orders[e]?.filter((l) => onIt.some((m) => lane[m] === l && keptBeside[s.piece]?.has(m) && visited.has(`${e} ${m}`))) ?? [];
        const at = spread(here.indexOf(lane[line] ?? line), here.length);
        crowded ||= here.length > CROWD;
        metres.set(at, (metres.get(at) ?? 0) + (pieces[s.piece]?.length ?? 0));
      }
      const at = most(metres);
      sideOn.set(`${e} ${line}`, at);
      const made = list.flatMap((run) => draw(run, () => at));
      for (const s of made) Object.assign(s, crowded && { crowded: true }, own !== undefined && { band: own });
      onStretch.set(`${e} ${line}`, made);
      return made;
    }),
  );
  const joins = ports(walked, found, onStretch);
  together(found, onStretch, joins);
  const smooth = smoothed(centrelines, drawn, bands);
  for (const c of smooth) byId.set(c.id, c);
  const linked = curves(joins, found, onStretch, byId, bands, `${LINK}${prefix}`);
  // Each step of each shape on its Line's stroke along the Stretch its piece is drawn on, or where the
  // Line has none there, beside its own track, at the side its own stroke would be drawn.
  const wayOn = new Map(found.flatMap(({ steps }) => steps.map((s): [number, number] => [s.piece, s.way])));
  // On a band's own graph, as far off as the map simplifies a line there, out of sight.
  const px = pixelMetres(BANDS[own ?? -1] ?? 0, LATITUDE);
  const off = own === undefined ? ALONG : Math.max(ALONG, TOLERANCE * px);
  const slots = every.flatMap((shape) => {
    const line = lines[shape[0]?.line ?? -1]?.id ?? '';
    return slotted(off, shape.map((s) => {
      const drawnOn = drawer[s.piece] ?? s.piece;
      const [edge, middle] = edgeOf.get(drawnOn) ?? [];
      const [side, on] = [sideOn.get(`${edge} ${s.line}`), found[edge ?? -1]?.steps[0]?.shape];
      if (middle === undefined || side === undefined || !on) return { on: s.shape, side: sideOf(s), from: s.from, to: s.to, at: [s.from, s.to] };
      // Which way the centreline runs, against the shape.
      const [p, q] = [pieces[s.piece], pieces[drawnOn]];
      const way = Math.sign(s.way * (wayOn.get(drawnOn) ?? 1) * ((p?.ux ?? 0) * (q?.ux ?? 0) + (p?.uy ?? 0) * (q?.uy ?? 0))) || 1;
      const half = (way * (s.to - s.from)) / 2;
      return { on, side, from: s.from, to: s.to, at: [middle - half, middle + half] };
    })).map((slot) => ({ line, shape: shape[0]?.shape ?? '', ...slot, ...(own !== undefined && { band: own }) }));
  });
  // On a band's own graph, each centreline only with the points the map keeps of it there, as far along each as they were.
  const written = own === undefined ? centrelines : centrelines.map((c) => {
    const flat = c.coords.map(([lon, y]): [number, number] => [lon * KX, y * DEGREE]);
    const left = new Set(simplify(flat, TOLERANCE * px));
    return { ...c, coords: c.coords.filter((_, i) => left.has(flat[i] ?? [0, 0])), dist: c.dist.filter((_, i) => left.has(flat[i] ?? [0, 0])) };
  });
  // Not flatMap(draw): that would pass each run's index as its sides.
  return { strokes: split([...drawn, ...linked.strokes]), centrelines: [...written, ...smooth, ...linked.shapes], rails: own === undefined ? split(runs.flatMap((run) => draw(run, sideOf, /* shares */ true))) : [], slots };
}

/**
 * A shape's slots, from where each of its steps goes, in order: one for each length of it that goes
 * along one line at one side, in as few pieces as put no Train more than `off` metres from where its
 * step would.
 */
function slotted(off: number, steps: Omit<Slot, 'line' | 'shape'>[]): Omit<Slot, 'line' | 'shape'>[] {
  const found: Omit<Slot, 'line' | 'shape'>[] = [];
  let points: { d: number; at: number }[] = [];
  let key = '';
  const flush = (on: string, side: number) => {
    // From each point, as far as the line to it passes within ALONG of every point between.
    for (let i = 0; i < points.length - 1; ) {
      const [a = { d: 0, at: 0 }] = [points[i]];
      let j = i + 1;
      const fits = (k: number) => {
        const b = points[k] ?? a;
        return points.slice(i + 1, k).every((p) => Math.abs(a.at + ((b.at - a.at) * (p.d - a.d)) / (b.d - a.d || 1) - p.at) <= off);
      };
      while (j + 1 < points.length && fits(j + 1)) j++;
      const b = points[j] ?? a;
      found.push({ on, side, from: Math.round(a.d), to: Math.round(b.d), at: [Math.round(a.at), Math.round(b.at)] });
      i = j;
    }
    points = [];
  };
  for (const [n, step] of steps.entries()) {
    const here = `${step.on} ${step.side} ${Math.sign(step.at[1] - step.at[0])}`;
    if (here !== key && points.length) flush(steps[n - 1]?.on ?? '', steps[n - 1]?.side ?? 0);
    key = here;
    // Where one step ends and the next starts, halfway between where each puts it.
    const last = points.at(-1);
    if (last && last.d === step.from) last.at = (last.at + step.at[0]) / 2;
    else points.push({ d: step.from, at: step.at[0] });
    points.push({ d: step.to, at: step.at[1] });
  }
  if (points.length) flush(steps.at(-1)?.on ?? '', steps.at(-1)?.side ?? 0);
  return found;
}

/** A shape's time on a Stretch it goes along: how far along the Stretch's centreline it comes in and goes out, and how far it goes. */
interface Visit {
  edge: number;
  first: number;
  last: number;
  length: number;
}

/** The Stretches a shape goes along, in order, each where its pieces are drawn. */
function visits(shape: Step[], pieces: Piece[], drawer: number[], edgeOf: Map<number, [edge: number, at: number]>): Visit[] {
  const found: Visit[] = [];
  for (const s of shape) {
    const [edge, middle] = edgeOf.get(drawer[s.piece] ?? s.piece) ?? [];
    if (edge === undefined || middle === undefined) continue;
    const v = found.at(-1);
    if (v?.edge === edge) [v.last, v.length] = [middle, v.length + (pieces[s.piece]?.length ?? 0)];
    else found.push({ edge, first: middle, last: middle, length: pieces[s.piece]?.length ?? 0 });
  }
  return found;
}

/** Where a Line goes from its stroke on one Stretch to its stroke on the next: each stroke, and its end there, 1 its `to` and 0 its `from`. */
interface Join {
  line: number;
  from: Stroke;
  out: 0 | 1;
  to: Stroke;
  into: 0 | 1;
}

/** Each time a Line's shape goes from one Stretch to the next, the strokes it goes from and to, once each. */
function ports(walked: { line: number; visits: Visit[] }[], found: Stretch[], onStretch: Map<string, Stroke[]>): Join[] {
  const joins = new Map<string, Join>();
  const nearest = (strokes: Stroke[], end: 0 | 1, at: number) => strokes.toSorted((a, b) => Math.abs((end ? a.to : a.from) - at) - Math.abs((end ? b.to : b.from) - at))[0];
  for (const { line, visits } of walked) {
    for (const [i, v] of visits.entries()) {
      const w = visits[i + 1];
      if (!w) continue;
      const [out, into] = [end(v, found, false), end(w, found, true)];
      const [from, to] = [nearest(onStretch.get(`${v.edge} ${line}`) ?? [], out, v.last), nearest(onStretch.get(`${w.edge} ${line}`) ?? [], into, w.first)];
      // Only where its strokes are: on a Stretch it's on but not drawn along there, it joins nothing.
      if (!from || !to || Math.abs((out ? from.to : from.from) - v.last) > REACH || Math.abs((into ? to.to : to.from) - w.first) > REACH) continue;
      const ends = [`${from.shape} ${out ? from.to : from.from}`, `${to.shape} ${into ? to.to : to.from}`];
      const key = `${line} ${ends.sort().join(' ')}`;
      if (!joins.has(key)) joins.set(key, { line, from, out, to, into });
    }
  }
  return [...joins.values()];
}

/**
 * Lines that end together end at one point across their Stretch: a stroke end that joins no other,
 * under SHORT from its Stretch's end, goes on to it, as the others ending there do.
 */
function together(found: Stretch[], onStretch: Map<string, Stroke[]>, joins: Join[]): void {
  const joined = new Set(joins.flatMap((j) => [`${j.out} ${j.from.shape} ${j.out ? j.from.to : j.from.from}`, `${j.into} ${j.to.shape} ${j.into ? j.to.to : j.to.from}`]));
  for (const [e, { steps, lines }] of found.entries()) {
    const [first, last] = [Math.round(steps[0]?.from ?? 0), Math.round(steps.at(-1)?.to ?? 0)];
    for (const s of lines.flatMap((line) => onStretch.get(`${e} ${line}`) ?? [])) {
      if (s.from > first && s.from - first < SHORT && !joined.has(`0 ${s.shape} ${s.from}`)) s.from = first;
      if (s.to < last && last - s.to < SHORT && !joined.has(`1 ${s.shape} ${s.to}`)) s.to = last;
    }
  }
}

/** A Line's way across a node: the strokes it goes along, in order, each by its end it leaves at (the first) or comes in at (the rest). */
type Leg = { stroke: Stroke; end: 0 | 1 };

/**
 * The curves across the line graph's nodes (ADR-0007), in each zoom band. A node takes the room its
 * curves and its fronts need on each Stretch (room()), and a Stretch too short for its nodes' room is
 * absorbed into one node with them, until none is left; its strokes aren't drawn in the band. Each
 * Line crossing a node is drawn on one curve, from its stroke on the Stretch it leaves, cut back by
 * the room there, to its stroke on the next, eased from one side to the other (pieces()). Where the
 * node absorbed none, or the chain of centrelines the Line goes along inside it runs straight, the
 * curve is a cubic Bézier, leaving and coming in the way the strokes run, as LOOM does; else it's that
 * chain, blurred so that it doesn't step from one centreline to the next and smoothed as centrelines
 * are (smooth()). Where the chain steps aside further than a line width from one centreline to the
 * next, the step counts as moving over that far, for the room, and the chain is blurred over at least
 * as far, so that the curve doesn't hook back onto its stroke (#206). Along a hidden stroke, the chain
 * goes only from its point nearest where it left the leg before to its point nearest where the next
 * leg starts, not from end to end, so that it doesn't run on past the next leg's start and back (#311).
 * Where it neither moves over nor changes side, the Line goes on without a curve.
 */
function curves(joins: Join[], found: Stretch[], onStretch: Map<string, Stroke[]>, byId: Map<string, Shape>, bands: number[], prefix: string): { shapes: Shape[]; strokes: Stroke[] } {
  const shapeOf = (s: Stroke, band: number) => inBand(byId, s.shape, band) ?? { coords: [], dist: [] };
  const flat = ([lon, lat]: Point): [number, number] => [lon * KX, lat * DEGREE];
  const ends = (s: Stroke, end: 0 | 1) => (end ? s.to : s.from);
  const edgeOf = new Map<Stroke, number>();
  for (const [key, list] of onStretch) for (const s of list) edgeOf.set(s, Number(key.split(' ')[0]));
  const at = new Map<Stroke, [Leg[], Leg[]]>(); // the strokes each stroke's ends join, at its start and its end
  const atEnd = (s: Stroke, end: 0 | 1) => (at.get(s) ?? (at.set(s, [[], []]), at.get(s) ?? [[], []]))[end];
  for (const j of joins) {
    atEnd(j.from, j.out).push({ stroke: j.to, end: j.into });
    atEnd(j.to, j.into).push({ stroke: j.from, end: j.out });
  }
  const id = new Map([...edgeOf.keys()].map((s, i) => [s, i]));
  const [shapes, strokes]: [Shape[], Stroke[]] = [[], []];
  for (const band of bands) {
    const zoom = BANDS[band] ?? 0;
    const [px, width] = [pixelMetres(zoom, LATITUDE), atZoom(APART, zoom) * pixelMetres(zoom, LATITUDE)];
    // Each front where a Line leaves a Stretch, by where its stroke ends: its centreline from there on, and how far its Lines reach either side, looking that way.
    const fronts = new Map<string, Omit<Front, 'change'>>(); // `<Stretch> <end> <metres along>`
    const keyOf = ({ stroke, end }: Leg) => `${edgeOf.get(stroke)} ${end} ${Math.round(ends(stroke, end))}`;
    const frontOf = (key: string) => {
      const known = fronts.get(key);
      if (known) return known;
      const [e = 0, end = 0, d = 0] = key.split(' ').map(Number);
      const { steps, lines: onIt } = found[e] ?? { steps: [], lines: [] };
      const [shape, way] = [inBand(byId, steps[0]?.shape ?? '', band) ?? { coords: [], dist: [] }, end ? -1 : 1];
      const points = (end ? along(shape, 0, d).toReversed() : along(shape, d, shape.dist.at(-1) ?? 0)).map(flat);
      const sides = onIt.flatMap((l) => onStretch.get(`${e} ${l}`) ?? []).map((s) => s.side * way);
      const front = { points, left: 0.5 - Math.min(0, ...sides), right: 0.5 + Math.max(0, ...sides) };
      fronts.set(key, front);
      return front;
    };
    // The Stretches absorbed, and strokes along only part of a Stretch, too short for their curves, hidden on their own.
    const [absorbed, alone] = [new Set<number>(), new Set<Stroke>()];
    const hidden = (s: Stroke) => absorbed.has(edgeOf.get(s) ?? -1) || alone.has(s);
    /**
     * How far along a stroke's line in the band, between two distances along it, its point nearest a
     * point is: by the line's own `dist`, which a centreline smoothed for the band keeps from the
     * centreline, rather than by nearest()'s `along`.
     */
    const closest = (s: Stroke, from: number, to: number, p: Point): number => {
      const [line, lo, hi] = [shapeOf(s, band), Math.min(from, to), Math.max(from, to)];
      const dist = [lo, ...line.dist.filter((d) => d > lo && d < hi), hi];
      const { i, t } = nearest(along(line, lo, hi), p);
      return (dist[i] ?? lo) + t * ((dist[i + 1] ?? hi) - (dist[i] ?? lo));
    };
    /**
     * How far along each leg's line the chain of centrelines a Line goes along across a node comes onto
     * it and leaves it, the way it goes: a stroke drawn in the band at its end, and a hidden one only
     * from its point nearest where the chain left the leg before to its point nearest where the next leg
     * starts, the first looked for only up to the second, so that the chain doesn't turn back along it.
     * Where a hidden stroke runs on beside the next leg, past where that starts, as C4's does at
     * Madrid-Atocha, the chain would run to its end and back, and so would its curve (#311). Either end,
     * as the legs are kept whichever way round sorts first (across()).
     */
    const spans = (legs: Leg[]): [on: number, off: number][] => {
      const spanned: [number, number][] = [];
      for (const [i, { stroke: s, end }] of legs.entries()) {
        const [d, other, next, before] = [ends(s, end), ends(s, end ? 0 : 1), legs[i + 1], legs[i - 1]];
        if (!hidden(s)) {
          spanned.push([d, d]);
          continue;
        }
        // End to end the way the chain goes: from the end it comes on by, or on a first leg, where a Line that ends inside the node starts, to the end it leaves by.
        let [on, off] = i ? [d, other] : [other, d];
        if (next) off = closest(s, on, off, pointAt(shapeOf(next.stroke, band), ends(next.stroke, next.end)));
        if (before) on = closest(s, on, off, pointAt(shapeOf(before.stroke, band), spanned[i - 1]?.[1] ?? 0));
        spanned.push([on, off]);
      }
      return spanned;
    };
    /**
     * How far, in metres, the chain of centrelines a Line goes along across a node steps aside from one
     * to the next, at most, across the way it goes both as it leaves the one and as it comes onto the
     * next, where that's further than a line width; else 0 (#206).
     */
    const aside = (legs: Leg[]): number => {
      const spanned = spans(legs);
      let most = 0;
      for (const [i, b] of legs.entries()) {
        const a = legs[i - 1];
        if (!a) continue;
        // Where the chain leaves a and comes onto b (spans()), with a point 5 m back the way it came, and one
        // 5 m on the way it goes: along the first leg it goes towards its end, along the rest their other.
        const leaves = i > 1 ? (a.end ? 0 : 1) : a.end;
        const [out = 0, onto = 0] = [spanned[i - 1]?.[1], spanned[i]?.[0]];
        const [p, came] = [out, out + (leaves ? -5 : 5)].map((d) => flat(pointAt(shapeOf(a.stroke, band), d)));
        const [q, goes] = [onto, onto + (b.end ? -5 : 5)].map((d) => flat(pointAt(shapeOf(b.stroke, band), d)));
        if (!p || !came || !q || !goes) continue;
        const sideways = ([x, y]: [number, number]) => Math.abs((q[0] - p[0]) * y - (q[1] - p[1]) * x) / (Math.hypot(x, y) || 1);
        most = Math.max(most, Math.min(sideways([p[0] - came[0], p[1] - came[1]]), sideways([goes[0] - q[0], goes[1] - q[1]])));
      }
      return most > width ? most : 0;
    };
    /** How many line widths a Line crossing a node moves over: its side change, or where it goes from one Stretch straight to the next, as far as their centrelines are apart if that's more (#178), or inside the node, as far as its chain steps aside (#206). 0 where it goes on without a curve. */
    const moved = (legs: Leg[]): number => {
      const [first, last] = [legs[0], legs.at(-1)];
      if (!first || !last) return 0;
      const [start, stop] = sidesOf(legs, hidden);
      if (legs.some((l) => hidden(l.stroke))) return Math.max(Math.abs(stop - start), aside(legs) / width);
      const [a, b] = [ends(first.stroke, first.end), ends(last.stroke, last.end)];
      const [p, q] = [flat(beside(shapeOf(first.stroke, band), a, first.stroke.side * width)), flat(beside(shapeOf(last.stroke, band), b, last.stroke.side * width))];
      const own = (s: Stroke) => byId.get(s.shape) ?? { coords: [], dist: [] };
      const [g0, g1] = [flat(pointAt(own(first.stroke), a)), flat(pointAt(own(last.stroke), b))];
      if (Math.hypot(g1[0] - g0[0], g1[1] - g0[1]) < 5 && start === stop) return 0;
      return Math.max(Math.hypot(q[0] - p[0], q[1] - p[1]) / width, Math.abs(stop - start));
    };
    let made: ReturnType<typeof across> = [];
    for (;;) {
      made = across(at, hidden, id);
      // The most each Line crossing a node changes side, or moves over, at each front, and the node's room there.
      const change = new Map<string, number>();
      const curved = new Set<string>(); // each stroke end a curve takes over at, `<stroke> <end>`
      const parent = new Map<string, string>();
      const root = (k: string): string => {
        const p = parent.get(k) ?? k;
        return p === k ? k : root(p);
      };
      const unite = (a: string, b: string) => {
        const [ra, rb] = [root(a), root(b)];
        if (ra !== rb) parent.set(ra, rb);
      };
      for (const legs of made) {
        const [first, last] = [legs[0], legs.at(-1)];
        if (!first || !last) continue;
        const keys = [keyOf(first), keyOf(last)];
        // One node for every Line across a Stretch absorbed, or a stroke hidden.
        for (const { stroke } of legs) if (hidden(stroke)) unite(keys[0] ?? '', alone.has(stroke) ? `alone ${id.get(stroke)}` : `absorbed ${edgeOf.get(stroke)}`);
        unite(keys[0] ?? '', keys[1] ?? '');
        const moves = moved(legs);
        if (!moves && !legs.some((l) => hidden(l.stroke))) continue;
        for (const [k, leg] of [[keys[0], first], [keys[1], last]] as const) {
          if (!k || hidden(leg.stroke)) continue;
          change.set(k, Math.max(change.get(k) ?? 0, moves));
          curved.add(`${id.get(leg.stroke)} ${leg.end}`);
        }
      }
      const byNode = new Map<string, string[]>();
      for (const k of change.keys()) byNode.set(root(k), [...(byNode.get(root(k)) ?? []), k]);
      const roomOf = new Map<string, number>();
      for (const keys of byNode.values()) {
        const rooms = room(keys.map((k) => ({ ...frontOf(k), change: change.get(k) ?? 0 })), width);
        for (const [i, k] of keys.entries()) roomOf.set(k, rooms[i] ?? 0);
      }
      // Each stroke's cut at either end, for the curves there; a Stretch with a stroke too short for its cuts is absorbed.
      const cut = (stroke: Stroke, end: 0 | 1) => {
        const k = keyOf({ stroke, end });
        return curved.has(`${id.get(stroke)} ${end}`) ? (roomOf.get(k) ?? 0) : 0;
      };
      const short = [...edgeOf].filter(([s]) => !hidden(s) && s.to - s.from + 0.5 < cut(s, 0) + cut(s, 1));
      if (!short.length) {
        for (const s of edgeOf.keys()) {
          const length = s.to - s.from;
          const [start, end] = hidden(s) && made.some((legs) => legs.some((l) => l.stroke === s)) ? [length, 0] : [Math.min(length, cut(s, 0)), Math.min(length - Math.min(length, cut(s, 0)), cut(s, 1))];
          if (!start && !end && !s.cut) continue;
          // Indexed as cutIn() reads it, from the stroke's first band.
          s.cut ??= bands.map(() => [0, 0]);
          s.cut[band - (s.band ?? GRAPH_BAND)] = [Math.round(start), Math.round(end)];
        }
        break;
      }
      for (const [s, e] of short) {
        const steps = found[e]?.steps ?? [];
        if (s.from - (steps[0]?.from ?? 0) < 1 && (steps.at(-1)?.to ?? 0) - s.to < 1) absorbed.add(e);
        else alone.add(s);
      }
    }
    for (const legs of made) {
      const [first, last] = [legs[0], legs.at(-1)];
      if (!first || !last || (!moved(legs) && !legs.some((l) => hidden(l.stroke)))) continue;
      // Each stroke's part of the curve, the way it goes: from its cut on the one it leaves, across those absorbed, to its cut on the one it comes onto.
      const parts = legs.map(({ stroke: s, end }, i): [shape: string, start: number, end: number] => {
        const [d, other] = [ends(s, end), ends(s, end ? 0 : 1)];
        if (hidden(s)) return i ? [s.shape, d, other] : [s.shape, other, d];
        const cut = cutIn(s, band)[end] * (end ? -1 : 1);
        return i ? [s.shape, d, d + cut] : [s.shape, d + cut, d];
      });
      // The chain goes along only part of a hidden stroke, but the curve stands for all of it, which isn't drawn, so that its Line's Trains anywhere along it go on the curve (#176).
      const spanned = spans(legs);
      const chain = parts.flatMap(([, from, to], i) => {
        const s = legs[i]?.stroke ?? first.stroke;
        const [a, b] = hidden(s) ? (spanned[i] ?? [from, to]) : [from, to];
        const points = along(shapeOf(s, band), Math.min(a, b), Math.max(a, b));
        return a > b ? points.toReversed() : points;
      });
      const [d0, d3] = [parts[0]?.[1] ?? 0, parts.at(-1)?.[2] ?? 0];
      const [p0, p3] = [flat(pointAt(shapeOf(first.stroke, band), d0)), flat(pointAt(shapeOf(last.stroke, band), d3))];
      const way = (s: Stroke, d: number, ahead: number) => {
        const [p, q] = [flat(pointAt(shapeOf(s, band), d)), flat(pointAt(shapeOf(s, band), d + ahead))];
        const length = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
        return [(q[0] - p[0]) / length, (q[1] - p[1]) / length] as const;
      };
      // Each the way its stroke runs where it's drawn up to the curve, as the map offsets the stroke's end along its last segment.
      const [back, t3] = [way(first.stroke, d0, first.end ? -5 : 5), way(last.stroke, d3, last.end ? -5 : 5)];
      const t0 = [-back[0], -back[1]] as const;
      const h = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]) / 3;
      const [p1, p2] = [[p0[0] + t0[0] * h, p0[1] + t0[1] * h], [p3[0] - t3[0] * h, p3[1] - t3[1] * h]];
      const round = (degrees: number) => Math.round(degrees * 1e5) / 1e5;
      const bezier = (segments: number) => Array.from({ length: segments + 1 }, (_, k): [number, number] => {
        // Closer together at the ends, so that the first and last segments leave and come in the way the strokes run.
        const t = (1 - Math.cos((Math.PI * k) / segments)) / 2;
        const [u, v, w, z] = [(1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t ** 2, t ** 3];
        const at = (i: 0 | 1) => u * p0[i] + v * (p1[i] ?? 0) + w * (p2[i] ?? 0) + z * p3[i];
        return [at(0), at(1)];
      });
      const [start, stop] = sidesOf(legs, hidden);
      // The chain runs straight where it's all within half a line width of the Bézier.
      const curve = bezier(4 * SEGMENTS);
      const straight = !legs.some((l) => hidden(l.stroke)) || chain.map(flat).every((p) => near(curve, p) <= width / 2);
      let coords = bezier(SEGMENTS).map(([x, y]): Point => [round(x / KX), round(y / DEGREE)]);
      if (!straight) {
        // Blurred over half of LENGTH line widths, or as far as it steps aside if that's more, so that it doesn't step where one centreline gives way to the next, then smoothed where it still folds.
        const kept = { coords: chain.filter((p, i) => !i || p[0] !== chain[i - 1]?.[0] || p[1] !== chain[i - 1]?.[1]), dist: [] as number[] };
        kept.dist = distances(kept.coords);
        const length = kept.dist.at(-1) ?? 0;
        // At least a tenth of a line width apart, which is plenty for a blur LENGTH / 2 widths wide.
        const apart = Math.max(SAMPLE, width / 10);
        const samples = Array.from({ length: Math.ceil(length / apart) + 1 }, (_, i) => flat(pointAt(kept, Math.min(length, i * apart))));
        const coordsOf = (points: [number, number][]) => points.map(([x, y]): Point => [x / KX, y / DEGREE]);
        const sigma = Math.max((LENGTH / 2) * width, aside(legs)) / apart;
        const line = { coords: coordsOf(blur(samples, samples.map(() => sigma))), dist: [] as number[] };
        line.dist = distances(line.coords);
        const eased = pieces({ line: '', shape: '', from: 0, to: length, side: start, ...(stop !== start && { ease: stop }) }).map((p) => ({ from: p.from, to: p.to, metres: p.side * width }));
        // Only the points it needs, within a tenth of a line width of itself, as smooth() writes a centreline.
        const drawn = (smooth(line, eased, MOVE * width, TOLERANCE * px, KX) ?? line).coords.map(flat);
        coords = simplify(drawn, (MOVE * width) / 10).map(([x, y]): Point => [round(x / KX), round(y / DEGREE)]);
      }
      const dist = distances(coords).map((d) => Math.round(d * 10) / 10);
      const shape = `${prefix}${shapes.length}`;
      shapes.push({ id: shape, coords, dist });
      const below = Math.min(depthAt(first.stroke, ends(first.stroke, first.end)), depthAt(last.stroke, ends(last.stroke, last.end)));
      const crowded = legs.some((l) => l.stroke.crowded);
      strokes.push({ line: first.stroke.line, shape, from: 0, to: dist.at(-1) ?? 0, side: start, ...(stop !== start && { ease: stop }), band, across: parts.map(([s, a, b]) => [s, Math.round(a), Math.round(b)]), ...(below && { under: below }), ...(crowded && { crowded: true as const }) });
    }
  }
  return { shapes, strokes };
}

/**
 * A Line's side as it leaves a node and as it comes in, looking the way it goes. Where it ends inside
 * the node, on a `hidden` stroke, it keeps the side it has at its other end: there's no stroke to
 * meet, and no room to change side on.
 */
function sidesOf(legs: Leg[], hidden: (s: Stroke) => boolean): [number, number] {
  const [first, last] = [legs[0], legs.at(-1)];
  const [start, stop] = [(first?.stroke.side ?? 0) * (first?.end ? 1 : -1), (last?.stroke.side ?? 0) * (last?.end ? -1 : 1)];
  if (first && hidden(first.stroke)) return [stop, stop];
  return [start, last && hidden(last.stroke) ? start : stop];
}

/** How far a point is from a line through points. */
function near(line: [number, number][], p: [number, number]): number {
  let best = Infinity;
  for (const [k, b] of line.entries()) {
    const a = line[k - 1] ?? b;
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]));
  }
  return best;
}

/**
 * Each Line's ways across the nodes, once each: from a stroke end it leaves at, through the joins, along
 * the `hidden` strokes, of the Stretches absorbed, to the next stroke it comes onto. A Line that ends
 * inside a node starts or stops at the end of its hidden stroke there; one that only touches a hidden
 * stroke, coming and going at one end, passes it by.
 */
function across(at: Map<Stroke, [Leg[], Leg[]]>, hidden: (s: Stroke) => boolean, id: Map<Stroke, number>): Leg[][] {
  const found = new Map<string, Leg[]>();
  const key = (legs: Leg[]) => legs.map((l) => `${id.get(l.stroke)}.${l.end}`).join(' ');
  // With the hidden strokes passed by on the way, so as not to go back and forth between two.
  const go = (legs: Leg[], next: Leg, passed = new Set<Stroke>()) => {
    const here = [...legs, next];
    const out = at.get(next.stroke)?.[next.end ? 0 : 1] ?? [];
    // A hidden stroke the Line only touches, going on from the end it came in at, it passes by.
    const back = (at.get(next.stroke)?.[next.end] ?? []).filter((leg) => !here.some((l) => l.stroke === leg.stroke) && !passed.has(leg.stroke));
    if (hidden(next.stroke) && !out.length && back.length) {
      for (const leg of back) go(legs, leg, new Set([...passed, next.stroke]));
      return;
    }
    if (!hidden(next.stroke) || !out.length) {
      // Found from either end: kept once, the way its key sorts first.
      const back = here.map((l, i) => (i && i < here.length - 1 ? { ...l, end: l.end ? 0 : 1 } : l)).toReversed() as Leg[];
      const [k, b] = [key(here), key(back)];
      if (!found.has(k) && !found.has(b)) found.set(k < b ? k : b, k < b ? here : back);
      return;
    }
    for (const leg of out) if (!here.some((l) => l.stroke === leg.stroke)) go(here, leg);
  };
  for (const [s, [start, end]] of at) {
    for (const [e, list] of [[0, start], [1, end]] as const) {
      // A hidden stroke is started from only where the Line ends inside the node, at its other end, and
      // not where it only touches it.
      if (hidden(s) && ((at.get(s)?.[e ? 0 : 1].length ?? 0) || list.length > 1)) continue;
      for (const leg of list) go([{ stroke: s, end: e }], leg);
    }
  }
  return [...found.values()];
}

/**
 * Each centreline smoothed for each zoom band, where a Line drawn off it at the band's zoom would
 * fold, on the inside of a bend tighter than it's far off (#164). The strokes go along it in the
 * band, as far along as on the centreline, and so do the curves.
 */
function smoothed(centrelines: Shape[], strokes: Stroke[], bands: number[]): Shape[] {
  const onIt = new Map<string, Stroke[]>();
  for (const s of strokes) if (s.side) onIt.set(s.shape, [...(onIt.get(s.shape) ?? []), s]);
  return bands.flatMap((band) => {
    const zoom = BANDS[band] ?? 0;
    const [px, width] = [pixelMetres(zoom, LATITUDE), atZoom(APART, zoom) * pixelMetres(zoom, LATITUDE)];
    return centrelines.flatMap((c) => {
      const drawn = (onIt.get(c.id) ?? []).map((s) => ({ from: s.from, to: s.to, metres: s.side * width }));
      const line = drawn.length ? smooth(c, drawn, MOVE * width, TOLERANCE * px, KX) : undefined;
      return line ? [{ id: smoothId(c.id, band), ...line }] : [];
    });
  });
}

/**
 * A line smoothed so that none of the strokes drawn along it, each `metres` right of it from one
 * distance along it to another, folds, simplified by `tolerance` as the map does; and moved no more
 * than `most` metres. It's a gaussian blur of its points, SAMPLE apart, as wide at each as it needs to
 * be there, widened a round at a time where a stroke still folds, and tapering off either side so
 * that the line stays smooth. Its ends stay where they are. Or nothing, where none folds.
 */
export function smooth(line: Pick<Shape, 'coords' | 'dist'>, strokes: { from: number; to: number; metres: number }[], most: number, tolerance: number, kx: number): Pick<Shape, 'coords' | 'dist'> | undefined {
  const length = line.dist.at(-1) ?? 0;
  // Its own points too, so that where it isn't smoothed, it's simplified as it is.
  const every = Array.from({ length: Math.ceil(length / SAMPLE) }, (_, i) => i * SAMPLE);
  const at = [...new Set([...every, ...line.dist])].sort((a, b) => a - b);
  const n = at.length;
  const points = at.map((d): [number, number] => {
    const [lon, lat] = pointAt(line, d);
    return [lon * kx, lat * DEGREE];
  });
  const moved = (q: [number, number][], i: number) => Math.hypot((q[i]?.[0] ?? 0) - (points[i]?.[0] ?? 0), (q[i]?.[1] ?? 0) - (points[i]?.[1] ?? 0));
  /** The line as it's written: only the points it needs, within a tenth of `most` of itself, rounded as the track's are. */
  const written = (q: [number, number][]): Pick<Shape, 'coords' | 'dist'> => {
    const kept = new Set(simplify(q, most / 10));
    const round = (degrees: number) => Math.round(degrees * 1e5) / 1e5;
    return { coords: q.filter((p) => kept.has(p)).map(([x, y]) => [round(x / kx), round(y / DEGREE)]), dist: at.filter((_, i) => kept.has(q[i] ?? [0, 0])).map(Math.round) };
  };
  /** The points on the segments of the strokes that fold, as written and as the map simplifies each, less those moved as far as they may be. */
  const folds = (q: [number, number][]) => {
    const found = new Set<number>();
    const shape = written(q);
    for (const { from, to, metres } of strokes) {
      const inside = shape.dist.flatMap((d, i) => (d > from && d < to ? [i] : []));
      const dists = [from, ...inside.map((i) => shape.dist[i] ?? 0), to];
      const flat = [pointAt(shape, from), ...inside.map((i) => shape.coords[i] ?? pointAt(shape, from)), pointAt(shape, to)].map(([lon, lat]): [number, number] => [lon * kx, lat * DEGREE]);
      const kept = simplify(flat, tolerance);
      const along = new Map(flat.map((p, i) => [p, dists[i] ?? 0]));
      for (const k of folded(kept, metres)) {
        const [start, end] = [along.get(kept[k - 1] ?? [0, 0]) ?? 0, along.get(kept[k] ?? [0, 0]) ?? 0];
        for (const [i, d] of at.entries()) if (d >= start && d <= end) found.add(i);
      }
    }
    // Less a centimetre, for those moved back to `most`, give or take rounding.
    return [...found].filter((i) => moved(q, i) < most - 0.01);
  };
  const width = new Array<number>(n).fill(0); // the blur's, in samples, at each
  let q = points;
  for (let [round, tight] = [0, folds(q)]; round < ROUNDS && tight.length; round++, tight = folds(q)) {
    const was = [...width];
    for (const i of tight) {
      const wider = Math.min(n / 3, Math.max(1, (was[i] ?? 0) * 1.25));
      // Tapering off a sample for every four either side.
      for (let j = Math.max(0, Math.floor(i - 4 * wider)); j < Math.min(n, i + 4 * wider); j++) width[j] = Math.max(width[j] ?? 0, wider - Math.abs(j - i) / 4);
    }
    const blurred = blur(points, width);
    // No further than `most` from where it was.
    q = blurred.map(([bx, by], i) => {
      const [[x, y], off] = [points[i] ?? [bx, by], moved(blurred, i)];
      const k = off > most ? most / off : 1;
      return [x + (bx - x) * k, y + (by - y) * k];
    });
  }
  return q === points ? undefined : written(q);
}

/**
 * Points blurred along their line, each over a gaussian so many points wide, its ends kept where they
 * are by mirroring the line through them.
 * ponytail: every point's whole gaussian, O(n × width), about 3 s for the map's eight bands; a running
 * sum over boxes if the track grows.
 */
function blur(points: [number, number][], width: number[]): [number, number][] {
  const last = points.length - 1;
  const mirrored = (j: number): [number, number] => {
    const [end, k] = j < 0 ? [0, -j] : j > last ? [last, 2 * last - j] : [j, j];
    const [[ex, ey], [px, py]] = [points[end] ?? [0, 0], points[Math.max(0, Math.min(last, k))] ?? [0, 0]];
    return end === j ? [px, py] : [2 * ex - px, 2 * ey - py];
  };
  return points.map((p, i) => {
    const sigma = width[i] ?? 0;
    if (sigma <= 0 || i === 0 || i === last) return p;
    let [x, y, sum] = [0, 0, 0];
    for (let j = Math.floor(i - 3 * sigma); j <= i + 3 * sigma; j++) {
      const g = Math.exp(-((j - i) ** 2) / (2 * sigma * sigma));
      const [px, py] = mirrored(j);
      [x, y, sum] = [x + g * px, y + g * py, sum + g];
    }
    return [x / sum, y / sum];
  });
}

/**
 * The line graph's nodes, where the edges meet: where one follows another along a centreline, and
 * where a Line's shapes go from one edge to another. Each of a Line's shapes goes along the edges
 * its pieces are drawn on, in and out at their ends.
 */
function graph(edges: Stretch[], walked: { line: number; visits: Visit[] }[], byId: Map<string, Shape>): Node[] {
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
  for (const { line, visits: all } of walked) {
    // Those the shape's on for under SHORT it's only brushing past, or crossing a node on.
    const visits = all.map((v) => ({ ...v }));
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
      passes.push({ line, from: `${v.edge} ${out}`, to: `${w.edge} ${into}` });
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
function end({ edge, first, last }: Visit, edges: Stretch[], into: boolean): 0 | 1 {
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
function stretches(pieces: Piece[], every: Step[][], tracks: Neighbour[][], beside: Map<number, Neighbour>[], prefix: string): { centrelines: Shape[]; stretches: Stretch[]; drawer: number[] } {
  const mates = mated(pieces, every);
  const across = tracks.map((list, p) => list.filter((n) => !mates[p]?.has(n.piece)));
  const drawer: number[] = [];
  for (const [p, piece] of pieces.entries()) {
    const lines = [...piece.on.keys()];
    // Only drawn with a piece beside it, so that it's never drawn further than `near` or so off its track.
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
    const id = `${prefix}${centrelines.length}`;
    // Each piece's ends, the way the chain runs, moved over to halfway between its outermost tracks:
    // smoothed() smooths the jitter that leaves.
    const ends = chain.map(({ piece, way }) => {
      const p = pieces[piece] ?? { x: 0, y: 0, ux: 0, uy: 0, length: 0, level: '' };
      const lefts = (across[piece] ?? []).map((n) => n.left);
      const centre = (Math.min(0, ...lefts) + Math.max(0, ...lefts)) / 2;
      const [cx, cy, hx, hy] = [p.x - p.uy * centre, p.y + p.ux * centre, (p.ux * p.length * way) / 2, (p.uy * p.length * way) / 2];
      return [[cx - hx, cy - hy], [cx + hx, cy + hy]] as const;
    });
    const points = ends.map(([start], i) => {
      const [x, y] = ends[i - 1]?.[1] ?? start;
      return [(x + start[0]) / 2, (y + start[1]) / 2] as const;
    });
    points.push(ends.at(-1)?.[1] ?? [0, 0]);
    const round = (degrees: number) => Math.round(degrees * 1e5) / 1e5;
    const coords = points.map(([x, y]): Point => [round(x / KX), round(y / DEGREE)]);
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
function walk(lines: Line[], shapes: Shape[]): { pieces: Piece[]; runs: Step[][]; every: Step[][] } {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  const metres = ([lon, lat]: Point): [x: number, y: number] => [lon * KX, lat * DEGREE];

  const pieces: Piece[] = [];
  const cut = new Map<string, number[]>(); // the pieces from one point to another, on each level
  /** The pieces from a to b: 1 for each that points that way, -1 for each that points back. */
  const between = (a: Point, b: Point, level: string): [piece: number, way: number][] => {
    const known = cut.get(`${a} ${b} ${level}`);
    if (known) return known.map((p) => [p, 1]);
    const back = cut.get(`${b} ${a} ${level}`);
    if (back) return back.map((p): [number, number] => [p, -1]).reverse();
    const [[ax, ay], [bx, by]] = [metres(a), metres(b)];
    const length = Math.hypot(bx - ax, by - ay);
    const [ux, uy, n] = [(bx - ax) / (length || 1), (by - ay) / (length || 1), Math.ceil(length / STEP) || 1];
    const list = Array.from({ length: n }, (_, k) => {
      const t = (k + 0.5) / n;
      return pieces.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t, ux, uy, length: length / n, level, on: new Map() }) - 1;
    });
    cut.set(`${a} ${b} ${level}`, list);
    return list.map((p) => [p, 1]);
  };

  const [runs, every]: [Step[][], Step[][]] = [[], []];
  for (const [l, line] of lines.entries()) {
    const done = new Set<number>(); // the pieces this Line runs over already
    const first = byId.get(line.shapes[0] ?? '')?.coords ?? [];
    for (const [n, id] of line.shapes.entries()) {
      const { coords = [], dist = [], levels = [] } = byId.get(id) ?? {};
      // A Line's other shapes mostly run its first one's track back the other way.
      const way = n === 0 ? 1 : sameWay(coords, first);
      let run: Step[] | undefined;
      const all: Step[] = [];
      every.push(all);
      for (const [i, b] of coords.entries()) {
        const a = coords[i - 1];
        if (!a) continue;
        const [from, to] = [dist[i - 1] ?? 0, dist[i] ?? 0];
        const legs = between(a, b, levels.findLast(([at]) => at <= from)?.[1] ?? '');
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
  return { pieces, runs, every };
}

/**
 * 1 where a line mostly runs the same way as another alongside it, -1 where it mostly runs back the
 * other way, judged at about 50 of its points; 1 where they're nowhere near each other.
 */
function sameWay(a: Point[], b: Point[]): number {
  let votes = 0;
  const every = Math.max(1, Math.floor(a.length / 50));
  for (let i = every; i < a.length; i += every) {
    const [p, q] = [a[i - 1], a[i]];
    if (!p || !q) continue;
    const n = nearest(b, p);
    const [c, d] = [b[n.i], b[n.i + 1]];
    if (c && d && n.metres <= NEAR) votes += Math.sign((q[0] - p[0]) * (d[0] - c[0]) * KX * KX + (q[1] - p[1]) * (d[1] - c[1]) * DEGREE * DEGREE);
  }
  return votes < 0 ? -1 : 1;
}

/** The pieces in each cell WIDE × `near` metres across, by their middles. */
function grid(pieces: Piece[], near: number): Map<string, number[]> {
  const cells = new Map<string, number[]>();
  for (const [i, p] of pieces.entries()) {
    const list = cells.get(cell(p.x, p.y, near));
    if (list) list.push(i);
    else cells.set(cell(p.x, p.y, near), [i]);
  }
  return cells;
}

function cell(x: number, y: number, near: number): string {
  return `${Math.floor(x / (WIDE * near))} ${Math.floor(y / (WIDE * near))}`;
}

/** The Lines on a piece and beside it within WIDE × `near` metres, from its right to its left. */
function neighbours(index: number, pieces: Piece[], cells: Map<string, number[]>, near: number): Neighbour[] {
  const wide = WIDE * near;
  const p = pieces[index] ?? { x: 0, y: 0, ux: 0, uy: 0, length: 0, level: '', on: new Map() };
  const found = [...p.on].map(([line, way]) => ({ line, piece: index, left: 0, on: true, alongside: true, way }));
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      for (const k of cells.get(cell(p.x + i * wide, p.y + j * wide, near)) ?? []) {
        const o = pieces[k];
        if (!o || o === p) continue;
        // Where the other piece comes closest to this one's middle: it counts if that's beside it, not ahead or behind.
        const along = Math.max(-o.length / 2, Math.min(o.length / 2, (p.x - o.x) * o.ux + (p.y - o.y) * o.uy));
        const [dx, dy] = [o.x + along * o.ux - p.x, o.y + along * o.uy - p.y];
        const left = p.ux * dy - p.uy * dx;
        if (Math.abs(dx * p.ux + dy * p.uy) > STEP / 2 || Math.abs(left) > wide) continue;
        const cos = p.ux * o.ux + p.uy * o.uy;
        for (const [line, way] of o.on) {
          // Only Lines on the same level, not a tram over a tunnel, or a Line in one tunnel over
          // another's: but a Line's own other track counts, as its tunnel can be mapped at another
          // layer, or longer. Only that Line, so that none joins those on another level through it.
          if (o.level !== p.level && !p.on.has(line)) continue;
          found.push({ line, piece: k, left, on: false, alongside: Math.abs(cos) >= PARALLEL, way: way * Math.sign(cos) });
        }
      }
    }
  }
  return found.sort((a, b) => a.left - b.left);
}

/**
 * The Lines beside a piece, on each piece of theirs there: on it, alongside it `near` it, or `near`
 * those. Once Lines are `turned`, those on another track that run the other way to the piece's own
 * aren't beside it: that's another line of route passing by, as R1 and R4 pass the Lines for
 * Estació de França, and moving either over for the other only makes them jump.
 */
function cluster(nearby: Neighbour[], near: number, turned?: number[]): Neighbour[] {
  const way = (n: Neighbour) => n.way * (turned?.[n.line] ?? 1);
  const ahead = Math.sign(nearby.reduce((sum, n) => sum + (n.on ? way(n) : 0), 0)) || 1;
  const found = nearby.filter((n) => n.alongside && (n.on || !turned || way(n) === ahead));
  let [from, to] = [found.findIndex((n) => n.on), found.findLastIndex((n) => n.on)];
  while (from > 0 && (found[from]?.left ?? 0) - (found[from - 1]?.left ?? 0) <= near) from--;
  while (to >= 0 && (found[to + 1]?.left ?? Infinity) - (found[to]?.left ?? 0) <= near) to++;
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
  return spread(order.findIndex((m) => m.line === s.line), order.length) * ahead * s.way;
}

/** How many line widths right of the middle of so many places side by side one is, by its place among them: a line width apart, or closer past CROWD. */
function spread(place: number, count: number): number {
  return Math.round((place - (count - 1) / 2) * Math.min(1, (CROWD - 1) / (count - 1 || 1)) * 1000) / 1000;
}

/** Steps that go together: a run's steps at one side, or a centreline's with one set of Lines. */
interface Span<Key = number> {
  key: Key;
  steps: Step[];
}

/**
 * A run's strokes: its steps at each side, and where `shares`, on track another Line runs on too or
 * not (#139), the SHORT ones merged into their neighbours; with where each goes into a tunnel, in
 * `depths`, for split() (#178).
 */
function strokes(line: string, run: Step[], sideOf: (s: Step) => number, pieces: Piece[], shares = false): Stroke[] {
  const spans: Span<string>[] = [];
  for (const s of run) {
    const [key, last] = [`${sideOf(s)} ${shares && (pieces[s.piece]?.on.size ?? 0) > 1}`, spans.at(-1)];
    if (last?.key === key) last.steps.push(s);
    else spans.push({ key, steps: [s] });
  }
  return merge(spans, pieces).flatMap(({ key, steps }) => {
    const [first, last, [side, shared]] = [steps[0], steps.at(-1), key.split(' ')];
    if (!first || !last) return [];
    const stroke = { line, shape: first.shape, from: Math.round(first.from), to: Math.round(last.to), side: Number(side), ...(shared === 'true' && { shared: true as const }) };
    const runs: [from: number, depth: number][] = [];
    for (const s of steps) {
      const below = depth(pieces[s.piece]?.level ?? '');
      if (runs.at(-1)?.[1] !== below) runs.push([runs.length ? Math.round(s.from) : stroke.from, below]);
    }
    if (runs.some(([, below]) => below)) depths.set(stroke, runs);
    return [stroke];
  });
}

/**
 * Where each stroke that goes into a tunnel does: from each distance along its shape on, how deep
 * (depth()), until split() cuts it there. Kept on the very strokes strokes() makes, which curves()
 * and split() are given, so that none of their copies carries it into the bundle.
 */
const depths = new WeakMap<Stroke, [from: number, depth: number][]>();

/** How far below the ground a level (Piece's `level`) is, in OpenStreetMap's layers: a tunnel at least 1; 0 on or above it. */
function depth(level: string): number {
  const layer = Number(level.split(' ')[1]) || 0;
  return level.startsWith('tunnel') ? Math.max(1, -layer) : Math.max(0, -layer);
}

/** How deep a stroke is this far along its shape. */
function depthAt(stroke: Stroke, d: number): number {
  return depths.get(stroke)?.findLast(([from]) => from <= d)?.[1] ?? 0;
}

/**
 * Strokes cut where they go into a tunnel or come out, or deeper, each piece `under` as deep as it is,
 * so that the map draws it below the Lines above it (#178). Only once the curves are made, so that they
 * join the strokes as they would on one level; each piece is cut back as far as the stroke it's part
 * of is, for the curves there.
 */
function split(strokes: Stroke[]): Stroke[] {
  return strokes.flatMap((s) => {
    const runs = depths.get(s);
    if (!runs) return [s];
    return runs.map(([from, below], i): Stroke => {
      const to = runs[i + 1]?.[0] ?? s.to;
      const length = to - from;
      const cut = s.cut?.map(([start, end]): [number, number] => {
        const a = Math.min(length, Math.max(0, s.from + start - from));
        return [a, Math.min(length - a, Math.max(0, to - (s.to - end)))];
      });
      return { ...s, from, to, ...(cut && { cut }), ...(below && { under: below }) };
    });
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

/**
 * Where a bundle of Lines leaves a node along a Stretch (ADR-0007): its centreline from the node on,
 * in local metres, how many line widths the Lines on it reach to its left and right, looking the way
 * it goes, and the most any Line changes side on a curve onto it there.
 */
export interface Front {
  points: [x: number, y: number][];
  left: number;
  right: number;
  change: number;
}

/**
 * Each front's room at its node, in metres along its Stretch, at a line width of `width` metres: the
 * more of its curves' (LENGTH × their side change × the line width, half from each Stretch) and its
 * clearance, how far along its centreline its front goes before it stops overlapping the others'
 * bundles, as LOOM pushes them back (ADR-0007); but against a bundle it goes on overlapping, running
 * side by side rather than parting, no further than where it stops parting (#196). Up to as far as
 * its centreline goes.
 */
export function room(fronts: Front[], width: number): number[] {
  return fronts.map((f, i) => {
    const curves = (LENGTH / 2) * f.change * width;
    const end = length(f.points);
    const clear = fronts.map((g, j) => {
      if (j === i) return 0;
      // ponytail: steps of half a line width, then halving between the last two: a front that clears
      // a bundle and comes back onto it further on is taken as clear.
      const apart = (d: number) => near(g.points, heading(f.points, d).at);
      let [d, was] = [0, apart(0)];
      while (d < end) {
        const next = Math.min(end, d + width / 2);
        if (!overlaps(f, g, next, width)) {
          let [lo, hi] = [d, next];
          while (hi - lo > 0.5) {
            const mid = (lo + hi) / 2;
            if (overlaps(f, g, mid, width)) lo = mid;
            else hi = mid;
          }
          return hi;
        }
        const now = apart(next);
        if (now - was < PART * (next - d)) return d;
        [d, was] = [next, now];
      }
      return end;
    });
    return Math.max(curves, ...clear);
  });
}

/** How long a line through points is. */
function length(points: [number, number][]): number {
  return points.reduce((sum, p, k) => sum + Math.hypot(p[0] - (points[k - 1] ?? p)[0], p[1] - (points[k - 1] ?? p)[1]), 0);
}

/** Where a line through points is, `d` along it, and which way it goes there. */
function heading(points: [number, number][], d: number): { at: [number, number]; way: [number, number] } {
  let left = d;
  for (const [k, b] of points.entries()) {
    const a = points[k - 1];
    if (!a) continue;
    const step = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!step) continue;
    const way: [number, number] = [(b[0] - a[0]) / step, (b[1] - a[1]) / step];
    if (left <= step || k === points.length - 1) return { at: [a[0] + way[0] * Math.min(left, step), a[1] + way[1] * Math.min(left, step)], way };
    left -= step;
  }
  return { at: points[0] ?? [0, 0], way: [1, 0] };
}

/** Whether `f`'s front, `d` along it, crosses `g`'s bundle, its centreline drawn out to its Lines' reach, at a line width of `width` metres. */
function overlaps(f: Front, g: Front, d: number, width: number): boolean {
  const right = ([x, y]: [number, number]): [number, number] => [y, -x];
  const dot = (u: [number, number], v: [number, number]) => u[0] * v[0] + u[1] * v[1];
  const { at, way } = heading(f.points, d);
  const nf = right(way);
  const reach = (Math.max(f.left, f.right) + Math.max(g.left, g.right)) * width;
  return g.points.some((b, k) => {
    const a = g.points[k - 1];
    const step = a && Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!a || !step || Math.hypot(at[0] - a[0], at[1] - a[1]) > step + reach) return false;
    const ug: [number, number] = [(b[0] - a[0]) / step, (b[1] - a[1]) / step];
    const ng = right(ug);
    const r: [number, number] = [at[0] - a[0], at[1] - a[1]];
    // The front from its left edge to its right, t metres right of its middle, narrowed to where k + c·t ≥ min holds.
    let [lo, hi] = [-f.left * width, f.right * width];
    const keep = (k: number, c: number, min: number) => {
      if (Math.abs(c) < 1e-9) hi = k < min ? -Infinity : hi;
      else if (c > 0) lo = Math.max(lo, (min - k) / c);
      else hi = Math.min(hi, (min - k) / c);
    };
    keep(dot(r, ug), dot(nf, ug), 0); // along this piece of g
    keep(-dot(r, ug), -dot(nf, ug), -step);
    keep(dot(r, ng), dot(nf, ng), -g.left * width); // right of g's left edge
    keep(-dot(r, ng), -dot(nf, ng), -g.right * width); // left of its right edge
    return lo <= hi;
  });
}
