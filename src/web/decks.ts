// A desktop's bridges as decks and tunnels' mouths (#213, ADR-0016): their features, which the Lines' worker makes with
// this module, a chunk of its own that a phone never loads (linesWorker.ts), and serves as the `decks` source's tiles,
// which deckLayers.ts draws. From DECKS_FROM, each Line on a bridge goes up onto it, its stroke there drawn as a deck in
// its own colour, side by side as its stroke is, its rails' grey on shared track; each deck stands on piers and ramps
// down to the ground at each end. Each tunnel's mouth gets an arch. Tunnels are drawn as ever.

import { along, APART, atZoom, BANDS, bridgeLayer, cutStroke, DECK_STEPS as STEPS, DECKS_FROM, DEGREE, depth, pixelMetres, pointAt, STRETCH, WIDTH, type DecksFile, type Point, type Shape, type Stroke } from '../bundle.ts';

/** The zoom the Lines are back on their rails at, and their decks: the rails' decks are the step after STEPS. */
const RAILS_ZOOM = APART.at(-1)?.[0] ?? 15;
/** The band of the zoom the decks along the Stretches are drawn at. */
const BAND = BANDS.indexOf(DECKS_FROM);

/**
 * How high a deck stands, on the screen tilted 45°, in px: on a bridge of layer 1, and more for each layer above
 * (bridgeLayer()), every bridge of a layer alike, as OpenStreetMap's layers order bridges but don't measure them. Its
 * slab, a ramp's length at each end and how many steps it rises in, its piers' side and how far apart, in metres.
 */
const [RISE, MORE, SLAB] = [12, 6, 2];
const [RAMP, RAMP_STEPS, PIER, PIERS] = [80, 10, 3, 40];
/** The width of a rails' deck, in metres: a Line's stroke at the zoom the rails' decks start at, at 41°N. */
const RAILS_DECK = atZoom(WIDTH, RAILS_ZOOM) * pixelMetres(RAILS_ZOOM, 41);
/** How near, in metres, ends of tunnels on tracks side by side are, for one arch: a double track's two, mapped apart. */
const MOUTH_NEAR = 25;

/** Metres in a degree of longitude and of latitude, at a latitude. */
const perMetre = (lat: number) => [DEGREE * Math.cos((lat * Math.PI) / 180), DEGREE] as const;

/** How high a deck of a bridge's layer stands at zoom DECKS_FROM, in metres at a latitude: halved for each zoom in, it stands as high on the screen at every zoom. */
export function deckHeight(layer: number, lat: number): number {
  return ((RISE + MORE * (Math.max(1, layer) - 1)) * pixelMetres(DECKS_FROM, lat)) / Math.SQRT1_2;
}

/**
 * A stroke cut at its bridges' ends, each part on a bridge marked `deck` with the bridge's layer: by `runs`, from where
 * to where along its shape each bridge is, and its layer, 1 where none is given.
 */
export function cutAtBridges(s: Stroke, runs: [from: number, to: number, layer?: number][]): Stroke[] {
  const at: [number, Partial<Stroke>][] = [[s.from, {}]];
  for (const [a, b, layer = 1] of runs) if (a < s.to && b > s.from) at.push([Math.max(a, s.from), { deck: layer }], [Math.min(b, s.to), {}]);
  return at.length > 1 ? cutStroke(s, at).filter((p) => p.to > p.from) : [s];
}

/** A traced shape's bridges, from its levels: from where to where along it, and each one's layer. */
function bridgesOf({ levels = [], dist }: Pick<Shape, 'levels' | 'dist'>): [from: number, to: number, layer: number][] {
  return levels.flatMap(([from, level], i) => {
    const layer = bridgeLayer(level);
    return layer ? [[from, levels[i + 1]?.[0] ?? dist.at(-1) ?? from, layer] as [number, number, number]] : [];
  });
}

/**
 * A region's strokes and rails cut at their bridges' ends (cutAtBridges()): its strokes by the decks file's bridges
 * along their centrelines, and its rails by the levels of their own track.
 */
export function decked({ strokes, rails, shapes }: { strokes: Stroke[]; rails: Stroke[]; shapes: Map<string, Shape> }, { bridges }: DecksFile): { strokes: Stroke[]; rails: Stroke[] } {
  const own = new Map<string, [number, number, number][]>();
  const railsOf = (shape: string) => own.get(shape) ?? own.set(shape, bridgesOf(shapes.get(shape) ?? { dist: [] })).get(shape)!;
  return {
    strokes: strokes.flatMap((s) => (bridges[s.shape] ? cutAtBridges(s, bridges[s.shape]!) : [s])),
    rails: rails.flatMap((s) => cutAtBridges(s, railsOf(s.shape))),
  };
}

/**
 * Where each of a region's tunnels' mouths is, once: where a traced shape goes under the ground or comes out of it, as
 * the Lines go `under` (bundle's depth()), but at its ends; those of tracks side by side within MOUTH_NEAR, as a double
 * track's, one, where they are on average.
 */
export function mouthsOf(shapes: Iterable<Shape>): Point[] {
  const found: { x: number; y: number; n: number }[] = [];
  const cells = new Map<string, number[]>();
  const cell = (x: number, y: number) => `${Math.floor(x / MOUTH_NEAR)} ${Math.floor(y / MOUTH_NEAR)}`;
  for (const s of shapes) {
    if (s.id.startsWith(STRETCH) || !s.levels) continue;
    const [start = 0, end = 0] = [s.dist[0], s.dist.at(-1)];
    s.levels.forEach(([from, level], i) => {
      if (from <= start || from >= end || depth(level) > 0 === depth(s.levels?.[i - 1]?.[1] ?? '') > 0) return;
      const [lon, lat] = pointAt(s, from);
      const [x, y] = [lon * perMetre(41)[0], lat * DEGREE];
      const [cx, cy] = [Math.floor(x / MOUTH_NEAR), Math.floor(y / MOUTH_NEAR)];
      const near = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].flatMap((dy) => cells.get(`${cx + dx} ${cy + dy}`) ?? [])).find((k) => Math.hypot(found[k]!.x - x, found[k]!.y - y) <= MOUTH_NEAR);
      if (near !== undefined) {
        const m = found[near]!;
        [m.x, m.y, m.n] = [(m.x * m.n + x) / (m.n + 1), (m.y * m.n + y) / (m.n + 1), m.n + 1];
      } else cells.set(cell(x, y), [...(cells.get(cell(x, y)) ?? []), found.push({ x, y, n: 1 }) - 1]);
    });
  }
  return found.map(({ x, y }) => [x / perMetre(41)[0], y / DEGREE]);
}

/** A ring round a line, from `left` to `right` metres to its right (left of it where negative), as a polygon's outer ring goes. */
function strip(line: Point[], left: number, right: number): Point[] {
  const [kx, ky] = perMetre(line[0]?.[1] ?? 0);
  const normals = line.map((_, i) => {
    const [a, b] = [line[Math.max(0, i - 1)]!, line[Math.min(line.length - 1, i + 1)]!];
    const [dx, dy] = [(b[0] - a[0]) * kx, (b[1] - a[1]) * ky];
    const n = Math.hypot(dx, dy) || 1;
    return [dy / n, -dx / n] as const;
  });
  const side = (metres: number) => line.map(([x, y], i): Point => [x + (normals[i]![0] * metres) / kx, y + (normals[i]![1] * metres) / ky]);
  const ring = [...side(right), ...side(left).reverse()];
  return [...ring, ring[0]!];
}

/** A line's points with how far along it each is, in metres. */
function measured(line: Point[]): Pick<Shape, 'coords' | 'dist'> {
  const [kx, ky] = perMetre(line[0]?.[1] ?? 0);
  let gone = 0;
  return { coords: line, dist: line.map((p, i) => (gone += i ? Math.hypot((p[0] - line[i - 1]![0]) * kx, (p[1] - line[i - 1]![1]) * ky) : 0)) };
}

/** A deck's or a pier's feature, its base and top in metres at DECKS_FROM, and the Lines a tap on it names (tap.ts's linesAt()). */
type Part = { kind: 'deck' | 'pier'; step: number; base: number; top: number };
const polygon = (ring: Point[], properties: Record<string, unknown>): GeoJSON.Feature => ({ type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: [ring] } });

/**
 * A deck along a line, `side` line widths right of it and as wide as a line at the step's zoom, or for the rails' step
 * on it and RAILS_DECK wide: its ramps at the `ramped` ends, each in RAMP_STEPS rising to its full height, the rest at
 * it, and a pier every PIERS, as high as the deck there. `lift` raises it a hair, so that two decks that overlap, as a
 * double track's do, don't flicker.
 */
function deck(line: Point[], { side, step, layer, ramped, lift }: { side: number; step: number; layer: number; ramped: [boolean, boolean]; lift: number }, properties: Record<string, unknown>): GeoJSON.Feature[] {
  const lat = line[0]?.[1] ?? 0;
  const zoom = STEPS[step];
  const [offset, width] = zoom === undefined ? [0, RAILS_DECK] : [side * atZoom(APART, zoom) * pixelMetres(zoom, lat), atZoom(WIDTH, zoom) * pixelMetres(zoom, lat)];
  const shape = measured(line);
  const length = shape.dist.at(-1) ?? 0;
  const ramp = Math.min(RAMP, length / 3);
  const [rise, slab] = [deckHeight(layer, lat), (SLAB * pixelMetres(DECKS_FROM, lat)) / Math.SQRT1_2];
  /** How high the deck is a distance along it, of its full height. */
  const up = (d: number) => Math.min(ramped[0] ? Math.ceil((RAMP_STEPS * d) / ramp) / RAMP_STEPS : 1, ramped[1] ? Math.ceil((RAMP_STEPS * (length - d)) / ramp) / RAMP_STEPS : 1, 1);
  // Its parts: a ramp's steps at each end ramped, and the rest whole.
  const cuts = [...new Set([0, ...(ramped[0] ? Array.from({ length: RAMP_STEPS }, (_, k) => (ramp * (k + 1)) / RAMP_STEPS) : []), ...(ramped[1] ? Array.from({ length: RAMP_STEPS }, (_, k) => length - (ramp * (RAMP_STEPS - k)) / RAMP_STEPS) : []), length])].sort((a, b) => a - b);
  const parts = cuts.slice(1).flatMap((to, i) => {
    const from = cuts[i]!;
    if (to - from < 0.01) return [];
    const base = rise * up((from + to) / 2) + lift;
    return [polygon(strip(along(shape, from, to), offset - width / 2, offset + width / 2), { ...properties, kind: 'deck', step, base, top: base + slab } satisfies Part)];
  });
  const [kx, ky] = perMetre(lat);
  const piers = Array.from({ length: Math.max(0, Math.ceil(length / PIERS) - 1) }, (_, k) => (k + 1) * PIERS).flatMap((d) => {
    if (length - d < PIERS / 2) return [];
    const [x, y] = pointAt(shape, d);
    const [a, b] = [pointAt(shape, Math.max(0, d - 1)), pointAt(shape, Math.min(length, d + 1))];
    const [dx, dy] = [(b[0] - a[0]) * kx, (b[1] - a[1]) * ky];
    const n = Math.hypot(dx, dy) || 1;
    const [ux, uy, vx, vy] = [dx / n, dy / n, dy / n, -dx / n];
    const at = (s: number, t: number): Point => [x + (ux * s + vx * (offset + t)) / kx, y + (uy * s + vy * (offset + t)) / ky];
    const h = PIER / 2;
    return [polygon([at(-h, h), at(h, h), at(h, -h), at(-h, -h), at(-h, h)], { ...properties, kind: 'pier', step, base: 0, top: rise * up(d) + lift } satisfies Part)];
  });
  return [...parts, ...piers];
}

/**
 * The features of a region's decks, from the Lines' features drawnLines() made of its strokes and rails cut at their
 * bridges (decked()): of each stroke on a bridge in the band of DECKS_FROM, a deck for each of STEPS, side by side as the
 * strokes are; of each rails' part on a bridge, a deck, once for a track Lines share; and each tunnel's mouth (mouthsOf()).
 * A deck ramps down at each end where it doesn't meet another of its Line's.
 */
export function deckFeatures(lines: GeoJSON.Feature[], rails: GeoJSON.Feature[], shapes: Iterable<Shape>): GeoJSON.Feature[] {
  const out: GeoJSON.Feature[] = [];
  let made = 0;
  const each = (features: GeoJSON.Feature[], steps: number[]) => {
    const on = features.filter((f) => f.properties?.deck && (f.properties.band === undefined || f.properties.band === BAND) && f.geometry.type === 'LineString');
    const key = (p: Point) => `${p[0].toFixed(5)} ${p[1].toFixed(5)}`;
    // Where each Line's decks end, to tell where one meets the next, as at a centreline's end, from one where it doesn't.
    const ends = new Map<string, number>();
    for (const f of on) for (const p of [(f.geometry as GeoJSON.LineString).coordinates[0], (f.geometry as GeoJSON.LineString).coordinates.at(-1)]) ends.set(`${f.properties?.line} ${key(p as Point)}`, (ends.get(`${f.properties?.line} ${key(p as Point)}`) ?? 0) + 1);
    const seen = new Set<string>();
    for (const f of on) {
      const line = (f.geometry as GeoJSON.LineString).coordinates as Point[];
      const [first, last] = [line[0]!, line.at(-1)!];
      const p = f.properties!;
      // A track Lines share is decked once (#139's grey).
      if (p.shared && seen.has([key(first), key(last)].sort().join(' '))) continue;
      seen.add([key(first), key(last)].sort().join(' '));
      const ramped: [boolean, boolean] = [ends.get(`${p.line} ${key(first)}`) === 1, ends.get(`${p.line} ${key(last)}`) === 1];
      const properties = { line: p.line, shape: p.shape, from: p.from, to: p.to, colour: p.colour, ...(p.shared && { shared: true }) };
      const lift = 0.4 * (made++ % 4);
      for (const step of steps) out.push(...deck(line, { side: steps.length > 1 ? Number(p.side) : 0, step, layer: Number(p.deck), ramped, lift }, properties));
    }
  };
  each(lines, STEPS.map((_, k) => k));
  each(rails, [STEPS.length]);
  for (const at of mouthsOf(shapes)) out.push({ type: 'Feature', properties: { kind: 'mouth' }, geometry: { type: 'Point', coordinates: at } });
  return out;
}

/** The decks' features in a tile at a zoom: the mouths at every zoom the source has, and from DECKS_FROM each step's decks at the zooms it's drawn at. */
export function inTile<F extends { tags?: Record<string, unknown> | null }>(features: F[], z: number): F[] {
  const steps = z < DECKS_FROM ? [] : z < RAILS_ZOOM ? STEPS.map((_, k) => k) : [STEPS.length];
  return features.filter(({ tags }) => tags?.kind === 'mouth' || steps.includes(Number(tags?.step)));
}
