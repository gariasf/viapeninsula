// Where each place's name goes: beside its own Network's track nearest its dot, clear of the Trains
// running along it, on the side where that's nearest the dot (#120, #143, #147), and which of the
// basemap's labels it says again (#121).
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import { closestOnSegment, DEGREE, direction, type Line, type Place, type Point, type Shape, type Stroke } from '../bundle.ts';
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
 * How far from a place's dot a track crossing its own can lie under its name, in metres: zoomed out to
 * 12, where a px is some 15 m in Catalonia, beyond its furthest corner (#154).
 */
const REACH = 2500;
/** How far a track crossing a place's own may be taken as straight, in metres, to find whether it lies under its name. */
const STRAIGHT = 3;
/**
 * The side of the cells tracks are filed in to find those near a place, in degrees: over 400 m east to
 * west anywhere in Spain, so the cells round a place's hold every track within NEAR of it.
 */
const CELL = 0.005;
/** How near a place a basemap label with its name is, in metres, to name the same place (#121). */
const TWICE = 2000;
/**
 * The Network whose Stations each operator runs, by what their IDs start with (`Feed.operator` in
 * `src/build/networks.ts`): a place's own Network, whose track its name goes beside (#143).
 */
export const NETWORK_OF: Record<string, string> = { adif: 'rodalies', fgc: 'fgc', tram: 'tram', tmb: 'metro' };
/** The classes of the basemap's place labels that a place's name can say again: its towns', from cities to villages, and suburbs'. */
const TOWNS = ['city', 'town', 'village', 'suburb'];

/** Where a place's name goes, beside its own Network's track nearest its dot, as railisland's do (#120, #143). */
export interface Spot {
  /**
   * Where it's measured from: the place's dot, or where its own Network's track nearest it, or one alongside it, comes
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
   * they're drawn the other way, from a track that lies `behind` metres behind `from`. Or, where
   * `stroke` is set, how many its stroke is, which the name clears rather than the Trains.
   */
  lines: { line: string; toward: number; behind: number; stroke?: true }[];
  /**
   * The other tracks near the place with Lines drawn along them, not alongside its own, or where
   * `stroke` is set not its own, by their segments near it: where each ends, in metres east and
   * north of the dot, and how many line widths either side of it its Lines are drawn out to, nearest
   * the dot first, `d` metres from it at their nearest (#154).
   */
  crossing: { a: [east: number, north: number]; b: [east: number, north: number]; widths: number; d: number }[];
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
 * Where each place's name goes, for a track's shapes, the sides its Lines are drawn at along them, the
 * side each Line's Trains keep to, 1 right and -1 left, and the Lines' Networks and shapes: given a
 * place's dot and its Stations' IDs, which finds its tracks once, and then the map's bearing, in
 * degrees clockwise from north, as often as the map turns.
 */
export function alongside(
  shapes: Shape[],
  sides: Stroke[],
  keep: (line: string) => number,
  networks: Pick<Line, 'network' | 'shapes'>[] = [],
): (dot: Point, stations?: string[]) => (bearing: number) => Side[] {
  // Each shape's segments, by the cells their bounding boxes cross.
  const cells = new Map<number, [shape: Shape, i: number][]>();
  for (const shape of shapes) {
    for (let i = 1; i < shape.coords.length; i++) {
      const [[ax, ay] = [0, 0], [bx, by] = [0, 0]] = [shape.coords[i - 1], shape.coords[i]];
      for (let x = Math.floor(Math.min(ax, bx) / CELL); x <= Math.floor(Math.max(ax, bx) / CELL); x++) {
        for (let y = Math.floor(Math.min(ay, by) / CELL); y <= Math.floor(Math.max(ay, by) / CELL); y++) {
          const list = cells.get(cell(x, y));
          if (list) list.push([shape, i]);
          else cells.set(cell(x, y), [[shape, i]]);
        }
      }
    }
  }
  // And each shape simplified, by STRAIGHT, as segments from `a` to `b`, `start` to `stop` metres along it, by the cells their bounding boxes cross.
  const straight = new Map<number, { shape: Shape; a: Point; b: Point; start: number; stop: number }[]>();
  for (const shape of shapes) {
    const index = new Map(shape.coords.map((p, i) => [p, i]));
    const kept = simplify(shape.coords, STRAIGHT / DEGREE);
    for (let i = 1; i < kept.length; i++) {
      const [a = [0, 0], b = [0, 0]] = [kept[i - 1], kept[i]];
      const segment = { shape, a, b, start: shape.dist[index.get(a) ?? 0] ?? 0, stop: shape.dist[index.get(b) ?? 0] ?? 0 };
      for (let x = Math.floor(Math.min(a[0], b[0]) / CELL); x <= Math.floor(Math.max(a[0], b[0]) / CELL); x++) {
        for (let y = Math.floor(Math.min(a[1], b[1]) / CELL); y <= Math.floor(Math.max(a[1], b[1]) / CELL); y++) {
          const list = straight.get(cell(x, y));
          if (list) list.push(segment);
          else straight.set(cell(x, y), [segment]);
        }
      }
    }
  }
  const sidesOf = new Map<string, Stroke[]>();
  for (const s of sides) sidesOf.set(s.shape, [...(sidesOf.get(s.shape) ?? []), s]);
  const networkOf = new Map(networks.flatMap((l) => l.shapes.map((shape) => [shape, l.network])));
  return (dot, stations = []) => {
    const own = new Set(stations.map((id) => NETWORK_OF[id.split(':')[0] ?? '']));
    const kx = DEGREE * Math.cos((dot[1] * Math.PI) / 180);
    // Where each shape within NEAR comes nearest the dot, looking in the dot's cell and those round it.
    const found = new Map<Shape, { at: Point; dist: number; metres: number; segments: [Point, Point][] }>();
    const [cx, cy] = [Math.floor(dot[0] / CELL), Math.floor(dot[1] / CELL)];
    for (let x = cx - 1; x <= cx + 1; x++) {
      for (let y = cy - 1; y <= cy + 1; y++) {
        for (const [shape, i] of cells.get(cell(x, y)) ?? []) {
          const [a, b, start = 0, stop = 0] = [shape.coords[i - 1], shape.coords[i], shape.dist[i - 1], shape.dist[i]];
          if (!a || !b) continue;
          const [t, metres] = closestOnSegment(a, b, dot, kx);
          if (metres > NEAR) continue;
          const f = found.get(shape) ?? { at: a, dist: 0, metres: Infinity, segments: [] };
          // A segment crossing several cells is found in each.
          if (!f.segments.some(([sa, sb]) => sa === a && sb === b)) f.segments.push([a, b]);
          if (metres < f.metres) Object.assign(f, { at: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], dist: start + t * (stop - start), metres });
          found.set(shape, f);
        }
      }
    }
    // And which way each runs there.
    const near = [...found].map(([shape, f]) => ({ ...f, shape, heading: headingAt(shape, f.dist) }));
    // The nearest of its own Network's, or where it has none near, of any.
    const closest = (among: typeof near) => among.reduce<(typeof near)[number] | undefined>((best, n) => (best && best.metres <= n.metres ? best : n), undefined);
    const nearest = closest(near.filter((n) => own.has(networkOf.get(n.shape.id)))) ?? closest(near);
    // The tracks alongside it there: those not much further from the dot, running much the same way, either way.
    const tracks = near.filter((n) => nearest && n.metres <= nearest.metres + ALONGSIDE_METRES && Math.abs(Math.cos(((n.heading - nearest.heading) * Math.PI) / 180)) >= Math.cos((ALONGSIDE_DEGREES * Math.PI) / 180));
    // A point's metres east and north of the dot.
    const local = ([lon, lat]: Point): [number, number] => [(lon - dot[0]) * kx, (lat - dot[1]) * DEGREE];
    // The Lines drawn along a track from `from` to `to` metres along it.
    const drawnOn = (shape: Shape, from: number, to: number) => (sidesOf.get(shape.id) ?? []).filter((s) => s.from <= to && from <= s.to);
    // A name near its dot clears only its nearest track's Lines, so those alongside with other Lines can lie under it too.
    const nearestLines = new Set(nearest ? drawnOn(nearest.shape, nearest.dist, nearest.dist).map((s) => s.line) : []);
    // The other tracks with Lines drawn along them, by their segments within REACH of the dot: those
    // not alongside its own, and those alongside with Lines its nearest doesn't carry.
    // ponytail: zoomed out past 12, a name can reach further than REACH, and a track there isn't counted. Look further, by more cells, if names over them show.
    const [crossings, besides]: [Spot['crossing'], Spot['crossing']] = [[], []];
    const alongsideShapes = new Set(tracks.map((n) => n.shape));
    const [wx, wy] = [Math.ceil(REACH / (CELL * kx)), Math.ceil(REACH / (CELL * DEGREE))];
    for (let x = cx - wx; x <= cx + wx; x++) {
      for (let y = cy - wy; y <= cy + wy; y++) {
        for (const { shape, a, b, start, stop } of straight.get(cell(x, y)) ?? []) {
          if (shape === nearest?.shape || !sidesOf.has(shape.id)) continue;
          // A segment crossing several cells is filed in each: take it in the first of them looked in.
          if (x !== Math.max(cx - wx, Math.floor(Math.min(a[0], b[0]) / CELL)) || y !== Math.max(cy - wy, Math.floor(Math.min(a[1], b[1]) / CELL))) continue;
          const d = closestOnSegment(a, b, dot, kx)[1];
          if (d > REACH) continue;
          const drawn = drawnOn(shape, start, stop);
          const alongsideIt = alongsideShapes.has(shape);
          if (!drawn.length || (alongsideIt && drawn.every((s) => nearestLines.has(s.line)))) continue;
          (alongsideIt ? besides : crossings).push({ a: local(a), b: local(b), widths: Math.max(...drawn.map((s) => Math.abs(s.side))) + 0.5, d });
        }
      }
    }
    const byNearest = (list: Spot['crossing']) => list.sort((p, q) => p.d - q.d);
    const [nearCrossings, nearBesides] = [byNearest(crossings), byNearest([...crossings, ...besides])];
    // Each Line drawn along them there, and how many line widths to the track's right its Trains are drawn.
    const lines = tracks.flatMap((track) =>
      (sidesOf.get(track.shape.id) ?? []).filter((s) => s.from <= track.dist && track.dist <= s.to).map((s) => ({ track, line: s.line, side: s.side, widths: s.side + 0.5 * keep(s.line) })),
    );
    return (bearing) => {
      if (!nearest) {
        const spot: Spot = { from: dot, anchor: 'bottom', normal: [0, -1], dot: 0, lines: [], crossing: [], widest: 0, bearing };
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
      const widest = Math.max(0, ...nearBesides.map((c) => c.widths));
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
          .map(({ track, line, side, widths }) => {
            const [rx, ry] = rightOf(track.heading, bearing);
            const along = { line, toward: (stroke ? side : widths) * (rx * normal[0] + ry * normal[1]), behind: out(from) - out(track.at) };
            return stroke ? { ...along, stroke: true as const } : along;
          });
        return { from, anchor, normal, dot: out(from) - out(dot), lines: toward, crossing: stroke ? nearBesides : nearCrossings, widest, bearing };
      };
      // Both, up first.
      return [up, down].map((side) => ({ clear: spot(side, tracks, false), near: spot(side, [nearest], true) }));
    };
  };
}

/**
 * Of the sides a name can go, the one where it's clear nearest its dot, its near edge `far` px from
 * the dot, and how far that is; or, further than CAP on every side, the nearest clear of only its own
 * track's Lines. Where two are as near, the first. Of those, only the sides with the fewest of the
 * tracks crossing its own `under` the name (#143, #154). alongside() gives every place a side at least.
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
 * How many segments of the tracks crossing its own lie under a name `width`×`height` px, `far` px out from its spot
 * as nameOffset() puts it, where a px is `metresPerPx` metres and Lines are drawn `apart` px apart, or
 * within `gap` px of it (#154).
 */
export function underName(spot: Spot, far: number, size: [number, number], metresPerPx: number, apart: number, gap: number): number {
  const [ox, oy] = nameOffset(spot, far, size);
  const [[x0, x1], [y0, y1]] = extent(spot.anchor, size);
  // How far from the dot the box and the widest Lines beside it reach, in px: no segment further off lies under it.
  const furthest = Math.hypot(Math.max(Math.abs(ox + x0), Math.abs(ox + x1)), Math.max(Math.abs(oy + y0), Math.abs(oy + y1))) + spot.widest * apart + gap;
  // A point's px from the dot on screen, x right and y down.
  const [cos, sin] = [Math.cos((spot.bearing * Math.PI) / 180) / metresPerPx, Math.sin((spot.bearing * Math.PI) / 180) / metresPerPx];
  const screen = ([east, north]: [number, number]): [number, number] => [east * cos - north * sin, -(north * cos + east * sin)];
  let under = 0;
  for (const { a, b, widths, d } of spot.crossing) {
    if (d / metresPerPx > furthest) break;
    const pad = widths * apart + gap;
    if (meets(screen(a), screen(b), [ox + x0 - pad, oy + y0 - pad, ox + x1 + pad, oy + y1 + pad])) under++;
  }
  return under;
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
function meets([ax, ay]: [number, number], [bx, by]: [number, number], [x0, y0, x1, y1]: [number, number, number, number]): boolean {
  let [t0, t1] = [0, 1];
  for (const [p, q] of [[ax - bx, ax - x0], [bx - ax, x1 - ax], [ay - by, ay - y0], [by - ay, y1 - ay]] as const) {
    if (p === 0) {
      if (q < 0) return false;
    } else if (p < 0) t0 = Math.max(t0, q / p);
    else t1 = Math.min(t1, q / p);
  }
  return t0 <= t1;
}

/** The way right of a track heading so many degrees clockwise from north is on screen, where the map's bearing is up: 1 px, x right and y down. */
function rightOf(heading: number, bearing: number): [x: number, y: number] {
  // The track runs `a` clockwise from up on screen, and its right is a quarter turn on.
  const a = ((heading - bearing) * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a)];
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
