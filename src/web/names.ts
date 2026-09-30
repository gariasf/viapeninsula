// Where each place's name goes: beside its own Network's track nearest its dot, clear of the Trains
// running along it (#120, #143), and which of the basemap's labels it says again (#121).
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import { closestOnSegment, DEGREE, direction, type Line, type Place, type Point, type Shape, type Stroke } from '../bundle.ts';

/** How near up and down a track runs on screen, in degrees, for a name to go right of it rather than above it. */
const STEEP = 30;
/** How far either way along a track from where it comes nearest a place its heading is taken over, in metres. */
const CHORD = 50;
/**
 * How much further from a place's dot than the track nearest it another can pass, in metres, and how
 * many degrees off its line it can run, to run alongside it, as more tracks do at a larger Station.
 */
const [ALONGSIDE_METRES, ALONGSIDE_DEGREES] = [50, 30];
/** How near a place's dot a track passes, in metres, to be its track at all. */
const NEAR = 200;
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
   * they're drawn the other way, from a track that lies `behind` metres behind `from`.
   */
  lines: { line: string; toward: number; behind: number }[];
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
): (dot: Point, stations?: string[]) => (bearing: number) => Spot {
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
    // Which sides of it, right and left, the other tracks near the place cross it on, by where their
    // stretches within NEAR of the dot lie from its line there.
    const crossed = { right: false, left: false };
    if (nearest) {
      const local = ([lon, lat]: Point) => [(lon - dot[0]) * kx, (lat - dot[1]) * DEGREE] as const;
      const [qx, qy] = local(nearest.at);
      const h = (nearest.heading * Math.PI) / 180;
      const [rx, ry] = [Math.cos(h), -Math.sin(h)];
      for (const { segments } of near.filter((n) => !tracks.includes(n))) {
        for (const [a, b] of segments) {
          const [[ax, ay], [bx, by]] = [local(a), local(b)];
          const [dx, dy] = [bx - ax, by - ay];
          // Where the segment runs within NEAR of the dot, from t0 to t1 of the way along it.
          const [qa, qb, qc] = [dx * dx + dy * dy, ax * dx + ay * dy, ax * ax + ay * ay - NEAR * NEAR];
          const root = Math.sqrt(qb * qb - qa * qc);
          if (!(qa > 0) || Number.isNaN(root)) continue;
          for (const t of [Math.max(0, (-qb - root) / qa), Math.min(1, (-qb + root) / qa)]) {
            // ponytail: takes the track's line as straight over NEAR. Measure from the track's nearest point to each if a curve misleads.
            const right = (ax + t * dx - qx) * rx + (ay + t * dy - qy) * ry;
            // Within a metre of it, it only meets it.
            if (Math.abs(right) > 1) crossed[right > 0 ? 'right' : 'left'] = true;
          }
        }
      }
    }
    // Each Line drawn along them there, and how many line widths to the track's right its Trains are drawn.
    const lines = tracks.flatMap((track) =>
      (sidesOf.get(track.shape.id) ?? []).filter((s) => s.from <= track.dist && track.dist <= s.to).map((s) => ({ track, line: s.line, widths: s.side + 0.5 * keep(s.line) })),
    );
    return (bearing) => {
      if (!nearest) return { from: dot, anchor: 'bottom', normal: [0, -1], dot: 0, lines: [] };
      // The track's right on screen, which lies within STEEP of across where the track runs within STEEP of up and down.
      const [x, y] = rightOf(nearest.heading, bearing);
      const steep = Math.abs(x) >= Math.cos((STEEP * Math.PI) / 180);
      // Up or right on screen, the track's left or right, unless another track crosses that side and not the other.
      const left = steep ? x < 0 : y > 0;
      const flip = left ? crossed.left && !crossed.right : crossed.right && !crossed.left;
      const normal: Spot['normal'] = left !== flip ? [-x, -y] : [x, y];
      // How far a point lies from the track the name's way, in metres.
      const [cos, sin] = [Math.cos((bearing * Math.PI) / 180), Math.sin((bearing * Math.PI) / 180)];
      const out = ([lon, lat]: Point) => {
        const [east, north] = [(lon - nearest.at[0]) * kx, (lat - nearest.at[1]) * DEGREE];
        return (east * cos - north * sin) * normal[0] - (north * cos + east * sin) * normal[1];
      };
      const from = tracks.reduce((furthest, { at }) => (out(at) > out(furthest) ? at : furthest), dot);
      const toward = lines.map(({ track, line, widths }) => {
        const [rx, ry] = rightOf(track.heading, bearing);
        return { line, toward: widths * (rx * normal[0] + ry * normal[1]), behind: out(from) - out(track.at) };
      });
      const anchor = steep ? (flip ? 'right' : 'left') : flip ? 'top' : 'bottom';
      return { from, anchor, normal, dot: out(from) - out(dot), lines: toward };
    };
  };
}

/**
 * Where a name `width`×`height` px goes from its spot, in px, so that it stays `clear` px from the
 * track: out along the normal, and further the more the track slants across the name's side.
 */
export function nameOffset({ anchor, normal: [x, y] }: Spot, clear: number, [width, height]: [number, number]): [x: number, y: number] {
  const out = clear + (anchor === 'left' || anchor === 'right' ? (height / 2) * Math.abs(y) : (width / 2) * Math.abs(x));
  return [out * x, out * y];
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
