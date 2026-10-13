// Where each place's name goes: beside its own Networks' track nearest its dot, clear of the Trains
// running along it and of other places' dots, on the side where that's nearest the dot (#120, #143,
// #147, #501), which of the basemap's labels it says again (#121), and which of two that collide is
// placed first (#372).
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import { closestOnSegment, DEGREE, STRETCH, direction, pointAt, slotAt, type Line, type Place, type Point, type Shape, type Slot, type Track } from '../bundle.ts';
import { simplify } from '../build/offset.ts';

/** How near up and down a track runs on screen, in degrees, for a name to go right of it rather than above it. */
const STEEP = 30;
/** How far either way along a track from where it comes nearest a place its heading is taken over, in metres. */
const CHORD = 50;
/**
 * How much further from a place's dot than the track nearest it another can pass, in metres, and how
 * many degrees off its line it can run, to run alongside it, as more tracks do at a larger Station.
 */
const [ALONGSIDE_METRES, ALONGSIDE_DEGREES] = [50, 30];
/**
 * How far from its dot a name's near edge may go, in px, clear of every track alongside its own and
 * their Trains, before it clears only its own track's Lines (#147).
 */
export const CAP = 12;
/** How near 0 a normal's x or y is for its track to run level with a name's side. */
const LEVEL = 1e-6;
/** How near a place's dot a track passes, in metres, to be its track at all. */
const NEAR = 200;
/**
 * How far from a place's dot a track crossing its own, or another place's dot, can lie under its name, in
 * metres: zoomed out to 12, where a px is some 15 m in Catalonia, beyond its furthest corner (#154, #501).
 */
const REACH = 2500;
/** How far a track crossing a place's own may be taken as straight, in metres, to find whether it lies under its name. */
const STRAIGHT = 3;
/**
 * The side of the cells tracks and places' dots are filed in to find those near a place, in degrees: over
 * 400 m east to west anywhere in Spain, so the cells round a place's hold every track within NEAR of it.
 */
const CELL = 0.005;
/** How near a place a basemap label with its name is, in metres, to name the same place (#121). */
const TWICE = 2000;
/** The classes of the basemap's place labels that a place's name can say again: its towns', from cities to villages, and suburbs'. */
const TOWNS = ['city', 'town', 'village', 'suburb'];
/**
 * What another place's dot costs a name, in Lines it could lie under instead, where the dot is at its box: it
 * reads as that place's, and hides it. The further the dot lies from the box, the less it costs, down to
 * nothing as far from it as the name's own dot lies and DOT_MARGIN more (#501). As dear as one Line it decides
 * almost nothing, as both sides of a name in a city's core lie over dots and Lines; at 20, on #372's sweep in the
 * browser, the dots under names go from 38 to 26 at zoom 12 and from 12 to 6 at 13, at the price of names over
 * more Lines (a third more at zoom 12).
 */
export const DOT_COST = 20;
/** How many px further from its box than its own dot another place's dot is, at the least, for it to cost a name nothing. */
const DOT_MARGIN = 3;

/** Where a place's name goes, beside its own Networks' track nearest its dot, as railisland's do (#120, #143). */
export interface Spot {
  /**
   * Where it's measured from: the place's dot, or where its own Networks' track nearest it, or one alongside it, comes
   * nearest the dot, whichever lies furthest the name's way.
   */
  from: Point;
  /**
   * The side of it MapLibre anchors there: its bottom above the track, or its left right of it, or,
   * where another track crosses that side, its top below the track, or its right left of it.
   */
  anchor: 'bottom' | 'left' | 'top' | 'right';
  /** The way it goes from the track, on screen: 1 px along the track's normal, x right and y down. */
  normal: [x: number, y: number];
  /** How far behind `from` the place's dot lies, in metres the name's way. */
  dot: number;
  /**
   * Each Line drawn along its tracks there: how many line widths the name's way its Trains are drawn
   * zoomed out, beside the Line's stroke and half a line width to their running side, negative where
   * they're drawn the other way, from a point `behind` metres behind `from`: on their track, or on the
   * centreline of the Stretch their stroke is drawn along (#176). Or, where
   * `stroke` is set, how many its stroke is, which the name clears rather than the Trains.
   */
  lines: { line: string; toward: number; behind: number; stroke?: true }[];
  /**
   * The tracks near the place with Lines drawn along them that can lie under its name, by their
   * segments near it: those not alongside its own, where `stroke` is set those alongside but its
   * own, and where its own or one alongside bends away from beside the dot, the rest of it (#154).
   * Where each ends, in metres east and north of the dot, and the Lines drawn so many line widths to
   * its right, as it runs from `a` to `b`, nearest the dot first, `d` metres from it at their nearest.
   */
  crossing: { lines: string[]; a: [east: number, north: number]; b: [east: number, north: number]; side: number; d: number }[];
  /**
   * The dots of the other places within REACH of its dot, in metres east and north of it, which its name
   * should lie clear of, or it reads as that place's and hides it (#501).
   */
  neighbours: [east: number, north: number][];
  /** The most line widths either side of any of them its Lines are drawn out to. */
  widest: number;
  /** The map's bearing, in degrees clockwise from north, that the spot is for. */
  bearing: number;
}

/**
 * A side of its track a place's name can go: clear of every track alongside it and their Trains, or,
 * too far from its dot that way, `near` it, from its dot or the nearest track and clear of only that
 * track's Lines (#147).
 */
export interface Side {
  clear: Spot;
  near: Spot;
}

/**
 * Where each place's name goes, for a track's shapes, where its Lines' Trains go along them zoomed out
 * (`Slot`), the side each Line's Trains keep to, 1 right and -1 left, the Lines' Networks and shapes,
 * and the centrelines the Trains go along, and every place's dot (`everyDot`): given a place's dot and the Networks
 * it serves, its own (Place's `networks`), which finds its tracks and the dots of the others near it
 * once, and then the map's bearing, in degrees clockwise from north, as often as the map turns.
 * It leaves out the centrelines of stretches among `shapes`: names go beside the track (#733).
 * ponytail: takes the Trains to be on the centrelines as they are, not as each zoom band smooths them,
 * up to a line width off. Take the band's if names over Trains show.
 */
export function alongside(
  shapes: Shape[],
  slots: Slot[],
  keep: (line: string) => number,
  networks: Pick<Line, 'network' | 'shapes'>[] = [],
  centrelines = new Map<string, Shape>(),
  everyDot: Point[] = [],
): (dot: Point, served?: string[]) => (bearing: number) => Side[] {
  return alongsideFiled([filed(shapes)], slots, keep, networks, centrelines, everyDot);
}

/**
 * alongside() for a track joined from regions' (`tracks`, each a region's track, in the joined track's order) at each
 * join, for these places, by their IDs: worked out again only for the places whose sides the join can move (#733).
 * Those are the places new or changed, and those within REACH of a region that joined or left, or of a place's dot that
 * came, went or moved, which is as far as alongside() looks. The others keep the sides they had. `fresh` works every
 * place out again, as where the regions' IDs aren't their own (splitBy()).
 * ponytail: a place's sides kept from an earlier join keep that join's slots, dots and Lines along segments too, a set for
 * each join a kept place dates from. Work kept places out again after so many joins if the heap shows it.
 */
export function sidesByJoin() {
  type Sides = (bearing: number) => Side[];
  // What holds for each region's track from one join to the next (Memo).
  const memos = new WeakMap<Pick<Track, 'shapes'>, Memo>();
  const memoOf = (track: Pick<Track, 'shapes'>) => {
    const known = memos.get(track) ?? newMemo();
    memos.set(track, known);
    return known;
  };
  let last: { tracks: Pick<Track, 'shapes'>[]; dots: Map<number, { key: string; dots: Point[] }>; sides: Map<string, { dot: Point; served: string; sides: Sides }> } | undefined;
  return (
    tracks: Pick<Track, 'shapes'>[],
    slots: Slot[],
    keep: (line: string) => number,
    networks: Pick<Line, 'network' | 'shapes'>[],
    centrelines: Map<string, Shape>,
    places: { id: string; dot: Point; served?: string[] }[],
    fresh = false,
  ): Sides[] => {
    const regions = tracks.map((t) => filed(t.shapes));
    const spots = alongsideFiled(regions, slots, keep, networks, centrelines, places.map((p) => p.dot), tracks.map(memoOf));
    // Each cell's dots, and as a key that changes where one comes, goes or moves.
    const dots = new Map<number, { key: string; dots: Point[] }>();
    for (const { dot } of places) {
      const key = cell(Math.floor(dot[0] / CELL), Math.floor(dot[1] / CELL));
      const known = dots.get(key);
      if (known) {
        known.key += `${dot[0]},${dot[1]};`;
        known.dots.push(dot);
      } else dots.set(key, { key: `${dot[0]},${dot[1]};`, dots: [dot] });
    }
    // What the join moved: the regions that joined or left, and the dots, before and after, of the cells where one changed.
    const [moved, changed]: [Filed[], Point[]] = [[], []];
    if (last && !fresh) {
      // A region is the same by its track, as a track's slots and Lines are its own (splitBy()).
      const [was, now] = [new Set(last.tracks), new Set(tracks)];
      moved.push(...[...tracks.filter((t) => !was.has(t)), ...last.tracks.filter((t) => !now.has(t))].map((t) => filed(t.shapes)));
      for (const key of new Set([...dots.keys(), ...last.dots.keys()])) {
        const [before, after] = [last.dots.get(key), dots.get(key)];
        if (before?.key !== after?.key) changed.push(...(before?.dots ?? []), ...(after?.dots ?? []));
      }
    }
    // Whether the join can move a place's sides: a segment of a region that joined or left within REACH of its dot, or
    // one of its shapes as they are within NEAR, or a dot that changed within REACH, as far as alongside() looks (#763).
    const near = (dot: Point) => {
      const kx = DEGREE * Math.cos((dot[1] * Math.PI) / 180);
      if (changed.some(([lon, lat]) => Math.hypot((lon - dot[0]) * kx, (lat - dot[1]) * DEGREE) <= REACH)) return true;
      const [cx, cy, wx, wy] = reachOf(dot);
      for (const region of moved) {
        for (let x = cx - wx; x <= cx + wx; x++) {
          for (let y = cy - wy; y <= cy + wy; y++) {
            for (const { a, b } of region.straight.get(cell(x, y)) ?? []) if (closestOnSegment(a, b, dot, kx)[1] <= REACH) return true;
            if (Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1) for (const { a, b } of region.cells.get(cell(x, y)) ?? []) if (closestOnSegment(a, b, dot, kx)[1] <= NEAR) return true;
          }
        }
      }
      return false;
    };
    const sides = new Map<string, { dot: Point; served: string; sides: Sides }>();
    const made = places.map(({ id, dot, served = [] }) => {
      const had = !fresh ? last?.sides.get(id) : undefined;
      const now = { dot, served: served.join(' ') };
      const kept = had && had.dot[0] === dot[0] && had.dot[1] === dot[1] && had.served === now.served && !near(dot) ? had.sides : spots(dot, served);
      sides.set(id, { ...now, sides: kept });
      return kept;
    });
    last = { tracks, dots, sides };
    return made;
  };
}

/**
 * The regions' tracks (`parts`) a joined track's names can be worked out from a region at a time (sidesByJoin()): where
 * `joined` has their shapes, slots, Lines and Networks, in order, as joinTracks() joins them, and each region's IDs are
 * its own, its Lines and slots on its own shapes. Not where a day of another build was joined in (joinDays()), or a
 * region has a shape, Line or Network of another's ID, or its slots or Lines are on another's shapes: then what a region's
 * join moves can lie beyond its own track.
 */
export function splitBy(joined: Track, parts: Track[] | undefined): Track[] | undefined {
  if (!parts) return undefined;
  const same = <T>(of: (t: Track) => T[]) => {
    const list = of(joined);
    let i = 0;
    for (const part of parts) for (const x of of(part)) if (list[i++] !== x) return false;
    return i === list.length;
  };
  if (!same((t) => t.shapes) || !same((t) => t.slots ?? []) || !same((t) => t.lines) || !same((t) => t.networks)) return undefined;
  // Each shape, Line and Network of one region only, and no region's slots or Lines on another's shapes.
  const seen = new Set<string>();
  for (const { ids } of parts.map(idsOf)) {
    for (const id of ids) {
      if (seen.has(id)) return undefined;
      seen.add(id);
    }
  }
  return parts.every((part) => idsOf(part).elsewhere.every((shape) => !seen.has(shape))) ? parts : undefined;
}

/** Each region's track's IDs (idsOf()), by the track. */
const trackIds = new WeakMap<Track, { ids: string[]; elsewhere: string[] }>();

/**
 * A region's track's IDs, of its shapes, Lines and Networks, each kind its own, and its slots' and Lines' shapes it hasn't
 * itself, as shapes' IDs: worked out once for each track, as splitBy() looks at every region's at every join.
 */
function idsOf(track: Track): { ids: string[]; elsewhere: string[] } {
  const known = trackIds.get(track);
  if (known) return known;
  const shapes = new Set(track.shapes.map((s) => `s ${s.id}`));
  const on = [...(track.slots ?? []).flatMap((s) => [s.shape, s.on]), ...track.lines.flatMap((l) => l.shapes)].map((shape) => `s ${shape}`);
  const made = { ids: [...track.shapes.map((s) => `s ${s.id}`), ...track.lines.map((l) => `l ${l.id}`), ...track.networks.map((n) => `n ${n.id}`)], elsewhere: [...new Set(on)].filter((shape) => !shapes.has(shape)) };
  trackIds.set(track, made);
  return made;
}

/**
 * A track's shapes filed by the cells their segments cross, and simplified by STRAIGHT, as alongside() finds
 * those near a place: each region's once, for as long as its shapes are kept, however many join (#733). Not
 * the centrelines of stretches, which a name doesn't go beside.
 */
interface Filed {
  cells: Map<number, Raw[]>;
  straight: Map<number, Straight[]>;
  /** Each shape that runs the same points as another before it, in the same order, by that one (#763). */
  twins: Map<Shape, Shape[]>;
  /** Each shape's first segment's place among the region's shapes' segments (Raw). */
  base: Map<Shape, number>;
}

/**
 * A segment of the shapes as they are, from `a` to `b`, and each shape that runs it (`on`), as its `i`th segment, the
 * `i` of the shape in `on` at the same place, and
 * the shape's twins too (Filed's `twins`): filed once however many run it, as Straight is, as long distance's 696,806
 * segments are 111,596 (#757). alongside() puts the shapes it finds back in the order of the region's shapes' segments.
 */
interface Raw {
  a: Point;
  b: Point;
  on: Shape[];
  i: number[];
}

/**
 * A segment of the shapes simplified by STRAIGHT, from `a` to `b`, and each shape that runs it, `start` to `stop` metres
 * along it: filed once however many run it, as the shapes of a region share their points where they share track
 * (ADR-0015), and long distance's 338,544 segments are 60,661 (#733).
 */
interface Straight {
  a: Point;
  b: Point;
  /** The first cell it's filed in, west to east and south to north. */
  x: number;
  y: number;
  on: { shape: Shape; start: number; stop: number }[];
}

/** Each track's shapes filed (Filed), by the array they come in. */
const filedTracks = new WeakMap<Shape[], Filed>();

/** Files a region's track's shapes (Filed) a frame ahead of the join that names its places, off that frame (#770). */
export function fileShapes(shapes: Shape[]): void {
  filed(shapes);
}

/** A track's shapes filed by the cells their segments cross (Filed), once for each array of them. */
function filed(shapes: Shape[]): Filed {
  const known = filedTracks.get(shapes);
  if (known) return known;
  const traced = shapes.filter((s) => !s.id.startsWith(STRETCH));
  // The shape before it each runs the same points as, in the same order, if any: its segments are that one's, found
  // and simplified once, as 77 of long distance's 206 shapes are another's (#763).
  const [twinOf, twins] = [new Map<Shape, Shape>(), new Map<Shape, Shape[]>()];
  const byStart = new Map<Point | undefined, Shape[]>();
  const base = new Map<Shape, number>();
  let order = 0;
  for (const shape of traced) {
    base.set(shape, order);
    order += Math.max(0, shape.coords.length - 1);
    const before = byStart.get(shape.coords[0]) ?? [];
    const twin = before.find((s) => s.coords.length === shape.coords.length && s.coords.every((p, i) => p === shape.coords[i]));
    if (twin) {
      twinOf.set(shape, twin);
      twins.set(twin, [...(twins.get(twin) ?? []), shape]);
    } else byStart.set(shape.coords[0], [...before, shape]);
  }
  // Each shape's segments, by the cells their bounding boxes cross, each segment once, by its ends.
  const cells: Filed['cells'] = new Map();
  // Each point's segments from it: few, so looked through rather than mapped.
  const raw = new Map<Point, Raw[]>();
  // Each shape's segments in its order.
  const rawOf = new Map<Shape, Raw[]>();
  for (const shape of traced) {
    if (twinOf.has(shape)) continue;
    const segments: Raw[] = [];
    rawOf.set(shape, segments);
    // The shape before it whose segments it runs along, and the next of them: followed without looking each up, as
    // long distance's shapes share long runs of their points (#763).
    let along: [segments: Raw[] | undefined, coords: Point[], i: number] | undefined;
    for (let i = 1; i < shape.coords.length; i++) {
      const [a = [0, 0], b = [0, 0]] = [shape.coords[i - 1], shape.coords[i]];
      let known = along && along[1][along[2]] === b ? along[0]?.[along[2] - 1] : undefined;
      const to = known ? undefined : raw.get(a);
      known ??= to?.find((segment) => segment.b === b);
      if (known) {
        known.on.push(shape);
        known.i.push(i);
        segments.push(known);
        const [first = shape, j = i] = [known.on[0], known.i[0]];
        along = [rawOf.get(first), first.coords, j + 1];
        continue;
      }
      along = undefined;
      const segment: Raw = { a, b, on: [shape], i: [i] };
      segments.push(segment);
      if (to) to.push(segment);
      else raw.set(a, [segment]);
      for (let x = Math.floor(Math.min(a[0], b[0]) / CELL); x <= Math.floor(Math.max(a[0], b[0]) / CELL); x++) {
        for (let y = Math.floor(Math.min(a[1], b[1]) / CELL); y <= Math.floor(Math.max(a[1], b[1]) / CELL); y++) {
          const list = cells.get(cell(x, y));
          if (list) list.push(segment);
          else cells.set(cell(x, y), [segment]);
        }
      }
    }
  }
  // And each shape simplified, by STRAIGHT, as segments from `a` to `b`, `start` to `stop` metres along it, by the cells their bounding boxes cross.
  const straight: Filed['straight'] = new Map();
  // Each segment filed, by its ends.
  const from = new Map<Point, Straight[]>();
  // Each shape's simplified segments in its order, and where along it, by its points, each starts and stops, two by two, as its twins run them.
  const straightOf = new Map<Shape, { segments: Straight[]; ends: number[] }>();
  for (const shape of traced) {
    const twin = straightOf.get(twinOf.get(shape) ?? shape);
    if (twin) {
      twin.segments.forEach((segment, k) => segment.on.push({ shape, start: shape.dist[twin.ends[2 * k] ?? 0] ?? 0, stop: shape.dist[twin.ends[2 * k + 1] ?? 0] ?? 0 }));
      continue;
    }
    const [segments, ends]: [Straight[], number[]] = [[], []];
    straightOf.set(shape, { segments, ends });
    const kept = simplify(shape.coords, STRAIGHT / DEGREE);
    // Where along the shape each point kept is, the last time it comes, as a Map of all its points has it.
    const index = new Map<Point, number>();
    for (const p of kept) index.set(p, 0);
    shape.coords.forEach((p, i) => index.has(p) && index.set(p, i));
    for (let i = 1; i < kept.length; i++) {
      const [a = [0, 0], b = [0, 0]] = [kept[i - 1], kept[i]];
      const [start, stop] = [index.get(a) ?? 0, index.get(b) ?? 0];
      ends.push(start, stop);
      const on = { shape, start: shape.dist[start] ?? 0, stop: shape.dist[stop] ?? 0 };
      const to = from.get(a);
      const known = to?.find((segment) => segment.b === b);
      if (known) {
        known.on.push(on);
        segments.push(known);
        continue;
      }
      const segment: Straight = { a, b, x: Math.floor(Math.min(a[0], b[0]) / CELL), y: Math.floor(Math.min(a[1], b[1]) / CELL), on: [on] };
      segments.push(segment);
      if (to) to.push(segment);
      else from.set(a, [segment]);
      for (let x = Math.floor(Math.min(a[0], b[0]) / CELL); x <= Math.floor(Math.max(a[0], b[0]) / CELL); x++) {
        for (let y = Math.floor(Math.min(a[1], b[1]) / CELL); y <= Math.floor(Math.max(a[1], b[1]) / CELL); y++) {
          const list = straight.get(cell(x, y));
          if (list) list.push(segment);
          else straight.set(cell(x, y), [segment]);
        }
      }
    }
  }
  const made = { cells, straight, twins, base };
  filedTracks.set(shapes, made);
  return made;
}

/**
 * What alongside() works out for a region's track that holds from one join to the next, as its slots are its own
 * (splitBy()): the Lines along its segments (`linesAlong`, `crossingAlong`), and for each place's dot, by its point,
 * where each of the region's shapes within NEAR comes nearest it, and the first of the cells round the dot it was found
 * in (`found`), and the region's segments within REACH that cross its own track or lie beside it, nearest first, for the
 * tracks of the region's it runs beside and the nearest of them (`key`), as long as those stay the same (#763).
 * ponytail: kept for every dot a region was ever near, for as long as its track is. Drop a dot's when its place goes if the heap shows it.
 */
interface Memo {
  linesAlong: Map<Straight['on'][number], { lines: string[]; side: number; key: string }[]>;
  /** The slots along each shape's segment last worked out (`linesAlong`), and the Lines along it. */
  lastAlong: Map<Shape, { over: Slot[]; made: { lines: string[]; side: number; key: string }[] }>;
  crossingAlong: Map<Straight, { lines: string[]; side: number }[]>;
  found: Map<string, { shape: Shape; first: number; at: Point; dist: number; metres: number }[]>;
  crossingsNear: Map<string, { key: string; crossings: Spot['crossing']; besides: Spot['crossing'] }>;
}

const newMemo = (): Memo => ({ linesAlong: new Map(), lastAlong: new Map(), found: new Map(), crossingAlong: new Map(), crossingsNear: new Map() });

/** Lists of segments, each nearest first, as one, nearest first: where two are as near, that of the earlier list first. */
function byNearest(lists: Spot['crossing'][]): Spot['crossing'] {
  return lists.reduce((p, q) => {
    if (!q.length) return p;
    if (!p.length) return q;
    const both: Spot['crossing'] = [];
    let [i, j] = [0, 0];
    while (i < p.length && j < q.length) both.push((q[j]?.d ?? 0) < (p[i]?.d ?? 0) ? (q[j++] as Spot['crossing'][number]) : (p[i++] as Spot['crossing'][number]));
    while (i < p.length) both.push(p[i++] as Spot['crossing'][number]);
    while (j < q.length) both.push(q[j++] as Spot['crossing'][number]);
    return both;
  }, []);
}

/**
 * alongside(), for tracks filed (Filed) a region at a time, in the order the track joined from them has its shapes,
 * with what holds for each from an earlier join (`memos`) where its slots are its own.
 */
function alongsideFiled(
  regions: Filed[],
  slots: Slot[],
  keep: (line: string) => number,
  networks: Pick<Line, 'network' | 'shapes'>[],
  centrelines: Map<string, Shape>,
  everyDot: Point[],
  memos: Memo[] = regions.map(newMemo),
): (dot: Point, served?: string[]) => (bearing: number) => Side[] {
  // Each place's dot, by its cell.
  const dotCells = new Map<number, Point[]>();
  for (const p of everyDot) {
    const key = cell(Math.floor(p[0] / CELL), Math.floor(p[1] / CELL));
    const list = dotCells.get(key);
    if (list) list.push(p);
    else dotCells.set(key, [p]);
  }
  const slotsOf = new Map<string, Slot[]>();
  for (const s of slots) {
    const known = slotsOf.get(s.shape);
    if (known) known.push(s);
    else slotsOf.set(s.shape, [s]);
  }
  const networkOf = new Map(networks.flatMap((l) => l.shapes.map((shape) => [shape, l.network])));
  // The Lines drawn along each simplified segment, by the side of it they're drawn, worked out once for every place near it.
  // By `key`, the Lines and side, a shape's are the same as another's that runs the segment.
  const linesOn = ({ linesAlong, lastAlong }: Memo, on: Straight['on'][number]) => {
    const known = linesAlong.get(on);
    if (known) return known;
    const { shape, start, stop } = on;
    const over = (slotsOf.get(shape.id) ?? []).filter((s) => s.from <= stop && start <= s.to);
    // The same slots as the shape's segment before give the same Lines, as a slot's line runs one way all along it (#763).
    const last = lastAlong.get(shape);
    if (last && last.over.length === over.length && last.over.every((s, i) => s === over[i])) {
      linesAlong.set(on, last.made);
      return last.made;
    }
    // Each Line's side of the track, where the line its stroke is drawn along runs back the other way.
    const sides = over.map((s) => ({ line: s.line, side: slotAt(s, start).way * s.side }));
    const made = [...new Set(sides.map((s) => s.side))].map((side) => {
      const lines = sides.filter((s) => s.side === side).map((s) => s.line);
      return { lines, side, key: `${side} ${lines.join(' ')}` };
    });
    linesAlong.set(on, made);
    lastAlong.set(shape, { over, made });
    return made;
  };
  // The Lines drawn along each simplified segment where none of the shapes that run it lies beside a place's own, once
  // for each side they're drawn, as alongside() takes them below: worked out once for every place near it (#757).
  const crossingOn = (memo: Memo, segment: Straight) => {
    const known = memo.crossingAlong.get(segment);
    if (known) return known;
    const taken = new Set<string>();
    const made: { lines: string[]; side: number }[] = [];
    for (const runs of segment.on) {
      if (!slotsOf.has(runs.shape.id)) continue;
      for (const { lines, side, key } of linesOn(memo, runs)) {
        if (taken.has(key)) continue;
        taken.add(key);
        made.push({ lines, side });
      }
    }
    memo.crossingAlong.set(segment, made);
    return made;
  };
  return (dot, served = []) => {
    const own = new Set(served);
    const kx = DEGREE * Math.cos((dot[1] * Math.PI) / 180);
    // Where each shape within NEAR comes nearest the dot, looking in the dot's cell and those round it, a region at a
    // time, as found where it was near the dot at an earlier join; and the region of each, by its place among them.
    const dotKey = `${dot[0]},${dot[1]}`;
    const [cx, cy] = [Math.floor(dot[0] / CELL), Math.floor(dot[1] / CELL)];
    const regionOf = new Map<Shape, number>();
    const hitsIn = regions.flatMap((region, r) => {
      const memo = memos[r] ?? newMemo();
      const known = memo.found.get(dotKey);
      if (known) return known.map((f) => ({ ...f, r }));
      const found = new Map<Shape, { shape: Shape; first: number; at: Point; dist: number; metres: number }>();
      for (let x = cx - 1; x <= cx + 1; x++) {
        for (let y = cy - 1; y <= cy + 1; y++) {
          // Each shape that runs a segment of the cell within NEAR, in the order of the region's shapes' segments, as found's order picks among them.
          const hits: [shape: Shape, i: number, order: number, a: Point, b: Point, t: number, metres: number][] = [];
          for (const { a, b, on, i: at } of region.cells.get(cell(x, y)) ?? []) {
            const [t, metres] = closestOnSegment(a, b, dot, kx);
            if (metres > NEAR) continue;
            on.forEach((shape, k) => {
              const i = at[k] ?? 0;
              for (const runs of [shape, ...(region.twins.get(shape) ?? [])]) hits.push([runs, i, (region.base.get(runs) ?? 0) + i - 1, a, b, t, metres]);
            });
          }
          hits.sort((p, q) => p[2] - q[2]);
          for (const [shape, i, , a, b, t, metres] of hits) {
            const [start = 0, stop = 0] = [shape.dist[i - 1], shape.dist[i]];
            const f = found.get(shape) ?? { shape, first: (x - cx + 1) * 3 + y - cy + 1, at: a, dist: 0, metres: Infinity };
            if (metres < f.metres) Object.assign(f, { at: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], dist: start + t * (stop - start), metres });
            found.set(shape, f);
          }
        }
      }
      memo.found.set(dotKey, [...found.values()]);
      return [...found.values()].map((f) => ({ ...f, r }));
    });
    // In the order they're first found, cell by cell, and in a cell region by region.
    const found = hitsIn.sort((p, q) => p.first - q.first).map(({ shape, at, dist, metres, r }) => {
      regionOf.set(shape, r);
      return { shape, at, dist, metres };
    });
    // And which way each runs there.
    const near = found.map((f) => ({ ...f, heading: headingAt(f.shape, f.dist) }));
    // The nearest of its own Networks', or where it has none near, of any.
    const closest = (among: typeof near) => among.reduce<(typeof near)[number] | undefined>((best, n) => (best && best.metres <= n.metres ? best : n), undefined);
    const nearest = closest(near.filter((n) => own.has(networkOf.get(n.shape.id) ?? ''))) ?? closest(near);
    // The tracks alongside it there: those not much further from the dot, running much the same way, either way.
    const tracks = near.filter((n) => nearest && n.metres <= nearest.metres + ALONGSIDE_METRES && Math.abs(Math.cos(((n.heading - nearest.heading) * Math.PI) / 180)) >= Math.cos((ALONGSIDE_DEGREES * Math.PI) / 180));
    // A point's metres east and north of the dot.
    const local = ([lon, lat]: Point): [number, number] => [(lon - dot[0]) * kx, (lat - dot[1]) * DEGREE];
    // The tracks with Lines drawn along them, by their segments within REACH of the dot: those not
    // alongside its own, those alongside but its own, which a name near its dot can lie on, and where
    // its own or one alongside bends away from beside the dot, the rest of it, which can come back under the name.
    // ponytail: zoomed out past 12, a name can reach further than REACH, and a track or another place's dot there isn't counted. Look further, by more cells, if names over them show.
    // Each region's, nearest first.
    const [crossings, besides]: [Spot['crossing'][], Spot['crossing'][]] = [[], []];
    // Which way each track alongside runs by the dot.
    const besideHeading = new Map(tracks.map((n) => [n.shape, n.heading]));
    const [, , wx, wy] = reachOf(dot);
    // A region at a time, as an earlier join found it where the tracks of the region's it runs beside, and the nearest, are as they were.
    for (const [r, region] of regions.entries()) {
      const memo = memos[r] ?? newMemo();
      const besideHere = tracks.filter((n) => regionOf.get(n.shape) === r);
      const key = `${nearest && regionOf.get(nearest.shape) === r ? nearest.shape.id : ''};${besideHere.map((n) => `${n.shape.id} ${n.heading}`).join(';')}`;
      const known = memo.crossingsNear.get(dotKey);
      const part = known?.key === key ? known : { key, crossings: [] as Spot['crossing'], besides: [] as Spot['crossing'] };
      if (part !== known) {
        for (let x = cx - wx; x <= cx + wx; x++) {
          for (let y = cy - wy; y <= cy + wy; y++) {
            for (const segment of region.straight.get(cell(x, y)) ?? []) {
              const { a, b, on } = segment;
              // A segment crossing several cells is filed in each: take it in the first of them looked in.
              if (x !== Math.max(cx - wx, segment.x) || y !== Math.max(cy - wy, segment.y)) continue;
              const d = closestOnSegment(a, b, dot, kx)[1];
              if (d > REACH) continue;
              const [la, lb] = [local(a), local(b)];
              // None of the shapes that run it alongside the place's own: their Lines cross, as worked out once (crossingOn()).
              if (!besideHere.length || !on.some((runs) => besideHeading.has(runs.shape))) {
                for (const { lines, side } of crossingOn(memo, segment)) part.crossings.push({ lines, a: la, b: lb, side, d });
                continue;
              }
              // The Lines of each shape that runs it, once for each side they're drawn, beside or crossing: more of the same
              // lie under a name no more than one (underName()).
              const taken: string[] = [];
              for (const runs of on) {
                const { shape } = runs;
                if (!slotsOf.has(shape.id)) continue;
                const drawn = linesOn(memo, runs);
                // Its own or one alongside, where it runs much the same way as by the dot, lies beside it.
                // ponytail: a track that runs out and back along the same rails counts its way back as crossing. Take that as beside too if names flip over one.
                const heading = besideHeading.get(shape);
                const beside = heading !== undefined && Math.cos(Math.atan2(lb[0] - la[0], lb[1] - la[1]) - (heading * Math.PI) / 180) >= Math.cos((ALONGSIDE_DEGREES * Math.PI) / 180);
                if (!drawn.length || (beside && shape === nearest?.shape)) continue;
                for (const { lines, side, key } of drawn) {
                  const kind = `${beside} ${key}`;
                  if (taken.includes(kind)) continue;
                  taken.push(kind);
                  (beside ? part.besides : part.crossings).push({ lines, a: la, b: lb, side, d });
                }
              }
            }
          }
        }
        part.crossings.sort((p, q) => p.d - q.d);
        part.besides.sort((p, q) => p.d - q.d);
        memo.crossingsNear.set(dotKey, part);
      }
      crossings.push(part.crossings);
      besides.push(part.besides);
    }
    // The other places' dots within REACH of the dot: not the place's own, nor one at the same point.
    const neighbours: Spot['neighbours'] = [];
    for (let x = cx - wx; x <= cx + wx; x++) {
      for (let y = cy - wy; y <= cy + wy; y++) {
        for (const p of dotCells.get(cell(x, y)) ?? []) {
          const [east, north] = local(p);
          if ((east !== 0 || north !== 0) && Math.hypot(east, north) <= REACH) neighbours.push([east, north]);
        }
      }
    }
    const nearCrossings = byNearest(crossings);
    const nearBesides = byNearest([nearCrossings, byNearest(besides)]);
    // Each Line drawn along them there, the point on the line its stroke is drawn beside there, and
    // how many line widths to the track's right its stroke and its Trains are drawn from that point.
    const lines = tracks.flatMap((track) =>
      (slotsOf.get(track.shape.id) ?? [])
        .filter((s) => s.from <= track.dist && track.dist <= s.to)
        .map((slot) => {
          const { at: along, way } = slotAt(slot, track.dist);
          const centreline = centrelines.get(slot.on);
          // Where its line runs back the way the track runs, its right is the track's left.
          return { track, line: slot.line, at: centreline ? pointAt(centreline, along) : track.at, side: way * slot.side, widths: way * slot.side + 0.5 * keep(slot.line) };
        }),
    );
    return (bearing) => {
      if (!nearest) {
        const spot: Spot = { from: dot, anchor: 'bottom', normal: [0, -1], dot: 0, lines: [], crossing: [], neighbours, widest: 0, bearing };
        return [{ clear: spot, near: spot }];
      }
      // The track's right on screen, which lies within STEEP of across where the track runs within STEEP of up and down.
      const [x, y] = rightOf(nearest.heading, bearing);
      const steep = Math.abs(x) >= Math.cos((STEEP * Math.PI) / 180);
      // Up or right on screen, the track's left or right, and down or left, the other.
      const left = steep ? x < 0 : y > 0;
      const up: [Spot['normal'], Spot['anchor']] = [left ? [-x, -y] : [x, y], steep ? 'left' : 'bottom'];
      const down: [Spot['normal'], Spot['anchor']] = [left ? [x, y] : [-x, -y], steep ? 'right' : 'top'];
      const [cos, sin] = [Math.cos((bearing * Math.PI) / 180), Math.sin((bearing * Math.PI) / 180)];
      const widest = Math.max(0, ...nearBesides.map((c) => Math.abs(c.side) + 0.5));
      // The spot on one side, measured from the dot or these tracks, clear of their Lines' Trains or strokes.
      const spot = ([normal, anchor]: typeof up, among: typeof tracks, stroke: boolean): Spot => {
        // How far a point lies from the track the name's way, in metres.
        const out = ([lon, lat]: Point) => {
          const [east, north] = [(lon - nearest.at[0]) * kx, (lat - nearest.at[1]) * DEGREE];
          return (east * cos - north * sin) * normal[0] - (north * cos + east * sin) * normal[1];
        };
        const from = among.reduce((furthest, { at }) => (out(at) > out(furthest) ? at : furthest), dot);
        const toward = lines
          .filter(({ track }) => among.includes(track))
          .map(({ track, line, at, side, widths }) => {
            const [rx, ry] = rightOf(track.heading, bearing);
            const along = { line, toward: (stroke ? side : widths) * (rx * normal[0] + ry * normal[1]), behind: out(from) - out(at) };
            return stroke ? { ...along, stroke: true as const } : along;
          });
        return { from, anchor, normal, dot: out(from) - out(dot), lines: toward, crossing: stroke ? nearBesides : nearCrossings, neighbours, widest, bearing };
      };
      // Both, up first.
      return [up, down].map((side) => ({ clear: spot(side, tracks, false), near: spot(side, [nearest], true) }));
    };
  };
}

/**
 * Of the sides a name can go, the one where it's clear nearest its dot, its near edge `far` px from
 * the dot, and how far that is; or, further than CAP on every side, the nearest clear of only its own
 * track's Lines. Where two are as near, the first. Of those, only the sides with the fewest Lines on the
 * tracks crossing its own, or its own bending back, and the least cost of other places' dots, `under` the
 * name (#143, #154, #501). alongside() gives every place a side at least.
 * ponytail: past CAP a name can lie over the Trains on its own track and the Lines alongside it.
 * Clear them too where CAP allows, a side at a time, if names on them show.
 */
export function nearestSide(sides: Side[], far: (spot: Spot) => number, under: (spot: Spot, far: number) => number = () => 0): { spot: Spot; far: number } {
  const nearest = (spots: Spot[]) => spots.map((spot) => ({ spot, far: far(spot) })).reduce((best, s) => (s.far < best.far ? s : best));
  const pick = (among: Side[]) => {
    const clear = nearest(among.map((s) => s.clear));
    return clear.far <= CAP ? clear : nearest(among.map((s) => s.near));
  };
  const counts = sides.map((side) => {
    const { spot, far } = pick([side]);
    return under(spot, far);
  });
  return pick(sides.filter((_, i) => counts[i] === Math.min(...counts)));
}

/**
 * How many Lines on the tracks in its spot's `crossing` lie under a name `width`×`height` px, `far` px
 * out from its place's dot as nameOffset() puts it, where a px is `metresPerPx` metres and Lines are drawn
 * `apart` px apart: their strokes' middles within `gap` px of it (#154); and what the dots of other
 * places near it cost, in Lines, whatever `gap` is (DOT_COST, #501).
 */
export function underName(spot: Spot, far: number, size: [number, number], metresPerPx: number, apart: number, gap: number): number {
  const [ox, oy] = nameOffset(spot, far, size);
  const [[x0, x1], [y0, y1]] = extent(spot.anchor, size);
  // How far from the dot the box and the widest Lines beside it reach, in px: no segment further off lies under it.
  const furthest = Math.hypot(Math.max(Math.abs(ox + x0), Math.abs(ox + x1)), Math.max(Math.abs(oy + y0), Math.abs(oy + y1))) + spot.widest * apart + gap;
  // A point's px from the dot on screen, x right and y down.
  const [cos, sin] = [Math.cos((spot.bearing * Math.PI) / 180) / metresPerPx, Math.sin((spot.bearing * Math.PI) / 180) / metresPerPx];
  const screen = ([east, north]: [number, number]): [number, number] => [east * cos - north * sin, -(north * cos + east * sin)];
  const under = new Set<string>();
  const [left, top, right, bottom] = [ox + x0 - gap, oy + y0 - gap, ox + x1 + gap, oy + y1 + gap];
  for (const { lines, a, b, side, d } of spot.crossing) {
    if (d / metresPerPx > furthest) break;
    if (lines.every((line) => under.has(line))) continue;
    // Their strokes, `side` line widths right of the segment on screen: as screen() has them, in numbers rather than pairs,
    // as underName() goes over every crossing near every name at every zoom (#763).
    const ax = a[0] * cos - a[1] * sin;
    const ay = -(a[1] * cos + a[0] * sin);
    const bx = b[0] * cos - b[1] * sin;
    const by = -(b[1] * cos + b[0] * sin);
    const shift = (side * apart) / (Math.hypot(bx - ax, by - ay) || 1);
    const sx = -(by - ay) * shift;
    const sy = (bx - ax) * shift;
    if (meets(ax + sx, ay + sy, bx + sx, by + sy, left, top, right, bottom)) for (const line of lines) under.add(line);
  }
  // And each other place's dot, which makes the name read as that place's, as a stroke under it does as that Line's:
  // as much as DOT_COST at the box, down to nothing as far from it as the name's own dot is (and DOT_MARGIN more).
  const until = far + DOT_MARGIN;
  let cost = 0;
  for (const dot of spot.neighbours) {
    const [x, y] = screen(dot);
    const away = Math.hypot(Math.max(ox + x0 - x, 0, x - (ox + x1)), Math.max(oy + y0 - y, 0, y - (oy + y1)));
    if (away < until) cost += DOT_COST * (1 - away / until);
  }
  return under.size + cost;
}

/**
 * Where a name `width`×`height` px goes from its spot, in px, so that it stays `clear` px from the
 * track: its corner nearest the track straight out along the normal, the rest along the track, so
 * that it's as near the dot as it can be; or where the track runs level with a side, that side's middle.
 */
export function nameOffset({ anchor, normal: [x, y] }: Spot, clear: number, [width, height]: [number, number]): [x: number, y: number] {
  const [[x0, x1], [y0, y1]] = extent(anchor, [width, height]);
  // Its point nearest the track, from the anchor.
  const near = (n: number, from: number, to: number) => (Math.abs(n) < LEVEL ? (from + to) / 2 : n > 0 ? from : to);
  return [clear * x - near(x, x0, x1), clear * y - near(y, y0, y1)];
}

/**
 * Whether a place label of the basemap's, as a MapLibre filter reads it, is of one of the TOWNS with
 * the name of a place within TWICE of it, from the zoom the place's name shows (#121).
 */
export function namedTwice(places: (Pick<Place, 'name' | 'lon' | 'lat'> & { nameZoom: number })[]): ExpressionSpecification {
  // Where a label of each name names a place again, by the name.
  // ponytail: folds case alone, as none of the 140 places #121 counted differs from its town's label
  // otherwise. Fold accents and punctuation too, with split and join over a table of them on both
  // sides, if one does.
  const near = new Map<string, ExpressionSpecification[]>();
  for (const { name, nameZoom, lon, lat } of places) {
    const key = name.toLowerCase();
    near.set(key, [...(near.get(key) ?? []), ['all', ['>=', ['zoom'], nameZoom], ['<=', ['distance', { type: 'Point', coordinates: [lon, lat] }], TWICE]]]);
  }
  const [first, ...rest] = [...near].map(([name, where]): [string, ExpressionSpecification] => [name, ['any', ...where]]);
  // A match takes one name at least.
  return ['match', ['get', 'class'], TOWNS, ['match', ['downcase', ['to-string', ['get', 'name']]], ...(first ?? ['', false]), ...rest.flat(), false], false];
}

/**
 * How many times Trains call at each Station in these Trips, a Trip that calls at one twice counting
 * twice: the calls a day of the days' Trips the map has loaded, which rank the names of places in no
 * tier where they collide (nameSort(), #372).
 */
export function callsIn(trips: { calls: { station: string }[] }[]): Map<string, number> {
  const calls = new Map<string, number>();
  for (const { calls: made } of trips) for (const { station } of made) calls.set(station, (calls.get(station) ?? 0) + 1);
  return calls;
}

/**
 * What a place's name sorts by (`symbol-sort-key`, which MapLibre places lowest first, the first placed
 * keeping its spot where two names collide): the zoom its name shows from, so that a tier's names come
 * before the next's, and for a place in no tier, below the next whole zoom, the more calls a day at its
 * Stations the lower, so that the busier Station's name wins a collision and none outranks a tier's
 * (#372). A place in a tier is placed as it was. Places with as many calls sort alike, and MapLibre's own
 * order between them decides, as it did: tiles from west to east and then north to south, then the order
 * the places come in.
 */
export function nameSort({ nameZoom, tier, stations }: { nameZoom: number; tier: boolean; stations: string[] }, calls: Map<string, number>): number {
  if (tier) return nameZoom;
  return nameZoom + 1 / (2 + stations.reduce((n, station) => n + (calls.get(station) ?? 0), 0));
}

/** A name's box's extent either way from where MapLibre anchors it by `anchor`, in px, x right and y down. */
function extent(anchor: Spot['anchor'], [width, height]: [number, number]): [x: [number, number], y: [number, number]] {
  const extents: Record<Spot['anchor'], [[number, number], [number, number]]> = {
    bottom: [[-width / 2, width / 2], [-height, 0]],
    top: [[-width / 2, width / 2], [0, height]],
    left: [[0, width], [-height / 2, height / 2]],
    right: [[-width, 0], [-height / 2, height / 2]],
  };
  return extents[anchor];
}

/** Whether the segment from `a` to `b` meets the box from x0, y0 to x1, y1, as Liang and Barsky clip it. */
function meets(ax: number, ay: number, bx: number, by: number, x0: number, y0: number, x1: number, y1: number): boolean {
  let [t0, t1] = [0, 1];
  const clip = (p: number, q: number) => {
    if (p === 0) return !(q < 0);
    if (p < 0) t0 = Math.max(t0, q / p);
    else t1 = Math.min(t1, q / p);
    return true;
  };
  return clip(ax - bx, ax - x0) && clip(bx - ax, x1 - ax) && clip(ay - by, ay - y0) && clip(by - ay, y1 - ay) && t0 <= t1;
}

/** The way right of a track heading so many degrees clockwise from north is on screen, where the map's bearing is up: 1 px, x right and y down. */
export function rightOf(heading: number, bearing: number): [x: number, y: number] {
  // The track runs `a` clockwise from up on screen, and its right is a quarter turn on.
  const a = ((heading - bearing) * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a)];
}

/** The cell of a place's dot, and how many cells either way from it east to west and north to south alongside() looks, to find what lies within REACH. */
function reachOf(dot: Point): [x: number, y: number, wx: number, wy: number] {
  const kx = DEGREE * Math.cos((dot[1] * Math.PI) / 180);
  return [Math.floor(dot[0] / CELL), Math.floor(dot[1] / CELL), Math.ceil(REACH / (CELL * kx)), Math.ceil(REACH / (CELL * DEGREE))];
}

/** The key of the cell `x` cells east and `y` north of 0°, 0°: one of its own, as `y` stays within 18,000 cells of the equator. */
function cell(x: number, y: number): number {
  return x * 100_000 + y;
}

/** Which way a shape runs `d` metres along it, over CHORD either way, in degrees clockwise from north. */
function headingAt(shape: Shape, d: number): number {
  const [east, north] = direction(shape, Math.max(0, d - CHORD), Math.min(shape.dist.at(-1) ?? 0, d + CHORD));
  return (Math.atan2(east, north) * 180) / Math.PI;
}
