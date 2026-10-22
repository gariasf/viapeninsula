// #213's look, on the throwaway branch 213-variants: each variant behind localStorage.v213, read once at load. Unset,
// the page is main. A is main, which the harness tilts (`--pitch 45`). G draws the ground, terrain from Mapterhorn's DEM.
// L raises the track's bridges as decks, from the traced shapes' `levels` the track files already carry, and marks
// each tunnel's mouth. GL is both: a deck spans from the ground at one end to the ground at the other, and the Lines in
// tunnels go under the ground.
import type { ExpressionSpecification, Map as MapLibreMap, RasterDEMSourceSpecification, StyleSpecification } from 'maplibre-gl';
import { along, pointAt, type Line, type Point, type Shape, type Stroke } from '../bundle.ts';

/** The variant, read once. A worker has no localStorage: it's told what it needs (RegionHow's `decks`). */
export const V213 = (() => {
  try {
    return localStorage.getItem('v213') ?? '';
  } catch {
    return '';
  }
})();
export const GROUND = V213 === 'G' || V213 === 'GL';
export const LEVELS = V213 === 'L' || V213 === 'GL';

/**
 * Mapterhorn's terrain: Terrarium-encoded WebP, 512 px, no key, CORS `*`, a week's `max-age`; over Spain CNIG's MDT02
 * (2 m, CC BY 4.0) from z13, Copernicus GLO-30 below. Asked for to z14 (3.6 m a px at 41°N) and overzoomed past it.
 */
const DEM: RasterDEMSourceSpecification = {
  type: 'raster-dem',
  tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'],
  tileSize: 512,
  encoding: 'terrarium',
  maxzoom: 14,
  attribution: '<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>, MDT02 CC BY 4.0 scne.es, Copernicus GLO-30',
};
/** How much the ground's heights are stretched: Barcelona's Collserola and a 60 m valley under a viaduct read at z12–15. */
export const EXAGGERATION = 1.5;

/** G's and GL's ground in the basemap's style, as it comes (main.ts's transformStyle), shaded. */
export function grounded(style: StyleSpecification, dark: boolean) {
  style.sources.dem = DEM;
  style.terrain = { source: 'dem', exaggeration: EXAGGERATION };
  // A hillshade over the basemap's fills, under its first line: the shadows on positron, the highlights on the dark
  // basemap, each of which the other's background hides. It shares the terrain's tiles, and reads on both.
  const first = style.layers.findIndex((l) => l.type === 'line');
  style.layers.splice(first, 0, {
    id: 'hillshade',
    type: 'hillshade',
    source: 'dem',
    paint: dark
      ? { 'hillshade-exaggeration': 0.5, 'hillshade-shadow-color': 'rgba(0,0,0,0)', 'hillshade-highlight-color': 'rgba(255,255,255,0.18)', 'hillshade-accent-color': 'rgba(0,0,0,0)' }
      : { 'hillshade-exaggeration': 0.5, 'hillshade-shadow-color': 'rgba(60,64,72,0.35)', 'hillshade-highlight-color': 'rgba(255,255,255,0)', 'hillshade-accent-color': 'rgba(60,64,72,0.1)' },
  });
}

/** A traced shape's runs of one level, from its `levels` ('' on the ground), within its length: some run on past its ends. */
export function levelRuns(s: Pick<Shape, 'dist' | 'levels'>): { from: number; to: number; level: string }[] {
  const runs: { from: number; to: number; level: string }[] = [];
  const [start, end] = [s.dist[0] ?? 0, s.dist.at(-1) ?? 0];
  let [at, level] = [start, ''];
  for (const [d, next] of [...(s.levels ?? []), [end, ''] as [number, string]]) {
    const from = Math.max(start, Math.min(d, end));
    if (from > at) runs.push({ from: at, to: from, level });
    [at, level] = [from, next];
  }
  return runs;
}

/** In metres: a deck's width (a Line's 4 px at z15), its slab, the length of each of its parts, a pier's side and how far apart. */
const [DECK, SLAB, PART, PIER, PIERS] = [8, 3, 20, 3, 40];
/**
 * L's deck height for `bridge <layer>`, as a height on the screen: 12 px tilted 45°, three line widths, on layer 1, and
 * 6 px more for each layer above, so that a bridge over a bridge stands over it. A height in metres reads at one zoom
 * only: 25 m lifts a deck 5 px at z14 and 40 px at z17, as the line widths are px. OpenStreetMap's layer orders, it
 * doesn't measure, and BRIEF (150 m) has merged the bridges shorter than that into the ground. In metres at z14 (61 m
 * on layer 1 at 41°N), which deckPaint() halves for each zoom in.
 */
export const deckRise = (level: string, lat: number) => ((12 + 6 * (Math.max(1, Number(level.split(' ')[1]) || 1) - 1)) * ((40_075_016.7 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** 14))) / Math.SQRT1_2;

/** Metres to degrees of longitude and latitude, at a latitude. */
const perMetre = (lat: number): Point => [1 / (111_320 * Math.cos((lat * Math.PI) / 180)), 1 / 110_574];
/** A polygon's ring round a line, `half` metres either side. */
function strip(line: Point[], half: number): Point[] {
  const [kx, ky] = perMetre(line[0]![1]);
  const side = line.map((p, i) => {
    const [a, b] = [line[Math.max(0, i - 1)]!, line[Math.min(line.length - 1, i + 1)]!];
    const [dx, dy] = [(b[0] - a[0]) / kx, (b[1] - a[1]) / ky];
    const n = Math.hypot(dx, dy) || 1;
    return [(-dy / n) * half * kx, (dx / n) * half * ky];
  });
  const left = line.map((p, i): Point => [p[0] + side[i]![0]!, p[1] + side[i]![1]!]);
  const right = line.map((p, i): Point => [p[0] - side[i]![0]!, p[1] - side[i]![1]!]).reverse();
  return [...left, ...right, left[0]!];
}
/** A rectangle's ring round a point: `across` metres either side of a heading (dx, dy, in metres) and `ahead` along it. */
function box([x, y]: Point, [dx, dy]: Point, across: number, ahead: number): Point[] {
  const [kx, ky] = perMetre(y);
  const n = Math.hypot(dx, dy) || 1;
  const [ux, uy, vx, vy] = [dx / n, dy / n, -dy / n, dx / n];
  const at = (s: number, t: number): Point => [x + (ux * s + vx * t) * kx, y + (uy * s + vy * t) * ky];
  return [at(-ahead, -across), at(ahead, -across), at(ahead, across), at(-ahead, across), at(-ahead, -across)];
}
const polygon = (ring: Point[], properties: Record<string, unknown>): GeoJSON.Feature => ({ type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: [ring] } });

/**
 * L's and GL's features of a region's rails, for the `decks` source: each bridge piece of a Line's own track a deck in
 * PARTs, the Line's colour (or the shared track's, `shared`), with piers under it; each tunnel's mouth a point, for its mark;
 * it. Each part knows its bridge's two ends and how far along between them it is, which GL spans the deck by (spanning()).
 * One track that Lines share is decked once.
 */
export function decksOf(rails: Stroke[], shapes: Map<string, Shape>, lines: Map<string, Line>): GeoJSON.Feature[] {
  const [out, seen] = [[] as GeoJSON.Feature[], new Set<string>()];
  const once = (key: string) => !seen.has(key) && !!seen.add(key);
  const round = (p: Point) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
  const runsOf = new Map<Shape, ReturnType<typeof levelRuns>>();
  for (const r of rails) {
    const s = shapes.get(r.shape);
    if (!s?.levels || !lines.has(r.line)) continue;
    const runs = runsOf.get(s) ?? runsOf.set(s, levelRuns(s)).get(s)!;
    for (const [i, run] of runs.entries()) {
      const [a, b] = [Math.max(run.from, r.from), Math.min(run.to, r.to)];
      if (run.level.startsWith('bridge') && b - a > 1 && once([round(pointAt(s, a)), round(pointAt(s, b))].sort().join(' '))) {
        // Its ends are the bridge's, though a stroke may hold only part of it.
        const [[ax, ay], [bx, by]] = [pointAt(s, run.from), pointAt(s, run.to)];
        const ends = { ax, ay, bx, by, rise: deckRise(run.level, ay) };
        const t = (d: number) => (d - run.from) / (run.to - run.from);
        const n = Math.ceil((b - a) / PART);
        for (let k = 0; k < n; k++) {
          const [from, to] = [a + ((b - a) * k) / n, a + ((b - a) * (k + 1)) / n];
          const [cx, cy] = pointAt(s, (from + to) / 2);
          out.push(polygon(strip(along(s, from, to), DECK / 2), { kind: 'deck', colour: lines.get(r.line)!.colour, ...(r.shared && { shared: true }), t: t((from + to) / 2), cx, cy, ...ends }));
        }
        for (let d = Math.ceil((a - run.from) / PIERS) * PIERS + run.from; d < b; d += PIERS) {
          if (d - run.from < PIERS / 2 || run.to - d < PIERS / 2) continue;
          const [cx, cy] = pointAt(s, d);
          out.push(polygon(box([cx, cy], [1, 0], PIER / 2, PIER / 2), { kind: 'pier', t: t(d), cx, cy, ...ends }));
        }
      }
      // A mouth where the track goes into a tunnel or comes out of one, within this stroke.
      const before = runs[i - 1];
      if (!before || run.level.startsWith('tunnel') === before.level.startsWith('tunnel') || run.from < r.from || run.from > r.to) continue;
      const at = pointAt(s, run.from);
      if (!once(`${at[0].toFixed(4)},${at[1].toFixed(4)}`)) continue;
      out.push({ type: 'Feature', properties: { kind: 'mouth' }, geometry: { type: 'Point', coordinates: at } });
    }
  }
  return out;
}

/**
 * The decks' layer's paint: decks in their Line's colour, piers in `structure`. L's `rise` is the deck's height from its
 * level (deckRise()), halved for each zoom in; GL's is spanning()'s, from the ground at the bridge's ends, 0 till the
 * ground has come.
 */
export function deckPaint(lineColour: ExpressionSpecification, structure: string) {
  const at = (rise: ExpressionSpecification) => ({
    height: ['match', ['get', 'kind'], 'deck', ['+', rise, SLAB], rise] as ExpressionSpecification,
    base: ['match', ['get', 'kind'], 'deck', rise, 0] as ExpressionSpecification,
  });
  // A zoom goes only at the top of an expression.
  const byZoom = (of: 'height' | 'base'): ExpressionSpecification => ['interpolate', ['linear'], ['zoom'], ...[12, 13, 14, 15, 16, 17, 18].flatMap((z) => [z, at(['*', 2 ** (14 - z), ['get', 'rise']])[of]])];
  const ground = at(['coalesce', ['feature-state', 'rise'], 0]);
  return {
    'fill-extrusion-color': ['match', ['get', 'kind'], 'deck', lineColour, structure] as ExpressionSpecification,
    'fill-extrusion-height': GROUND ? ground.height : byZoom('height'),
    'fill-extrusion-base': GROUND ? ground.base : byZoom('base'),
  };
}

/** A tunnel's mouth's mark: an arch, standing up to the viewer, its bore dark. */
export function mouthIcon(dark: boolean): ImageData {
  const [w, h] = [40, 32];
  const g = new OffscreenCanvas(w, h).getContext('2d')!;
  g.fillStyle = dark ? '#a3a9b2' : '#6b7079';
  g.beginPath();
  g.roundRect(2, 2, w - 4, h - 2, [w / 2 - 2, w / 2 - 2, 0, 0]);
  g.fill();
  g.fillStyle = dark ? '#16181c' : '#2b2e33';
  g.beginPath();
  g.roundRect(11, 11, w - 22, h - 11, [w / 2 - 11, w / 2 - 11, 0, 0]);
  g.fill();
  return g.getImageData(0, 0, w, h);
}

/**
 * GL: each deck part's and pier's height over the ground under it, so that the deck runs straight from the ground at the
 * bridge's one end to the ground at its other (MapLibre lifts a fill-extrusion by the ground at its centroid). Worked out
 * from the ground drawn (queryTerrainElevation(), exaggerated as drawn) once the map is idle after a tile of the ground or
 * the decks came; an end where no ground has come (0) leaves the part as it was.
 * ponytail: every deck part loaded, each time; only those in view if a viaduct-heavy view shows it.
 */
export function spanning(map: MapLibreMap) {
  let due = true;
  map.on('sourcedata', (e) => (e.sourceId === 'dem' || e.sourceId === 'decks') && e.tile && (due = true));
  map.on('idle', () => {
    if (!due) return;
    due = false;
    const ground = (x: number, y: number) => map.queryTerrainElevation([x, y]) || undefined;
    for (const f of map.querySourceFeatures('decks', { sourceLayer: 'decks' })) {
      const p = f.properties as { kind: string; ax: number; ay: number; bx: number; by: number; cx: number; cy: number; t: number };
      if (p.kind === 'mouth' || f.id === undefined) continue;
      const [a, b, c] = [ground(p.ax, p.ay), ground(p.bx, p.by), ground(p.cx, p.cy)];
      if (a === undefined || b === undefined || c === undefined) continue;
      const rise = Math.max(0, a + p.t * (b - a) - c);
      const id = { source: 'decks', sourceLayer: 'decks', id: f.id };
      if (Math.abs((map.getFeatureState(id).rise ?? -1) - rise) > 0.5) map.setFeatureState(id, { rise });
    }
  });
}
