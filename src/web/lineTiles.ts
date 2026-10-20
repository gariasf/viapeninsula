// The Lines and rails MapLibre draws, made in a worker of their own (linesWorker.ts) and served to it as vector tiles
// (#837): handed over as GeoJSON, MapLibre serialised 54k features for its worker on the page's thread, 3.1 s of a
// phone's long-distance join. The tiles are cut as MapLibre's GeoJSON source cut them, by the same library and options.

import { GeoJSONVT } from '@maplibre/geojson-vt';
import { fromGeojsonVt } from '@maplibre/vt-pbf';
import { rounded } from './curve.ts';
import { drawnLines } from './lines.ts';
import { unpackFile, type Packed } from './placeNames.ts';

/** How a region's Lines are made, but its track: its place in the manifest, whether under the others', each Line's lettering, and each Network's zoom (drawnLines()). */
export interface RegionHow {
  rank: number;
  under: boolean;
  lettering: [line: string, lettering: string | undefined][];
  shownFrom: [network: string, zoom: number][];
}

/** The sources served, each a layer of its own name in its tiles. */
export type LineSource = 'lines' | 'rails';

/**
 * What the page asks of the worker: the regions joined now, each by its key and, where the worker doesn't hold it, its
 * file, answered once their Lines are in the tiles; and a tile, answered with its bytes.
 */
export type LinesAsk =
  | { show: { regions: { key: number; file?: Packed; how: RegionHow }[]; version: number } }
  | { tile: { source: LineSource; z: number; x: number; y: number; ask: number } };

/** The tiles' extent and MapLibre's tile size, in px, as a GeoJSON source has them: its options' px are tile units ×16. */
const [EXTENT, TILE_PX] = [8192, 512];
/** MapLibre's GeoJSON source's defaults, and the rails' tolerance, which is less, so as not to facet their curves (#203). */
const OPTIONS = { buffer: 128 * (EXTENT / TILE_PX), extent: EXTENT, maxZoom: 18, updateable: true };
const TOLERANCE: Record<LineSource, number> = { lines: 0.375, rails: 0.1 };

/** A region's features, by source. */
type Drawing = Record<LineSource, GeoJSON.Feature[]>;

/**
 * What the worker does with what the page asks (LinesAsk): makes each region's Lines once, for as long as the next join
 * names it, keeps the tiles' index of the regions joined, as MapLibre's GeoJSON source did, and cuts and encodes a tile.
 */
export function lineWork() {
  const index = Object.fromEntries((['lines', 'rails'] as const).map((s) => [s, new GeoJSONVT({ type: 'FeatureCollection', features: [] }, { ...OPTIONS, tolerance: TOLERANCE[s] * (EXTENT / TILE_PX) })])) as Record<LineSource, GeoJSONVT>;
  let held = new Map<number, Drawing>();
  let next = 0;
  const make = (file: Packed, { rank, under, lettering, shownFrom }: RegionHow): Drawing => {
    const track = unpackFile<'shapes' | 'lines' | 'strokes' | 'rails'>(file);
    const letters = new Map(lettering);
    const how = { shapes: new Map(track.shapes.map((s) => [s.id, s])), lines: new Map(track.lines.map((l) => [l.id, l])), lettering: (line: string) => letters.get(line), rank, under, shownFrom: new Map(shownFrom) };
    const drawing = { lines: drawnLines(track.strokes, how), rails: drawnLines(track.rails, how, rounded) };
    for (const f of [...drawing.lines, ...drawing.rails]) f.id = next++;
    return drawing;
  };
  return (ask: LinesAsk): { shown: number } | { ask: number; data: ArrayBuffer } => {
    if ('tile' in ask) {
      const { source, z, x, y } = ask.tile;
      const tile = index[source].getTile(z, x, y);
      return { ask: ask.tile.ask, data: tile ? fromGeojsonVt({ [source]: tile }, { version: 2, extent: EXTENT }).slice().buffer : new ArrayBuffer(0) };
    }
    const now = new Map(
      ask.show.regions.map(({ key, file, how }): [number, Drawing] => {
        const drawing = held.get(key) ?? (file && make(file, how));
        if (!drawing) throw new Error(`No region's track by key ${key}`);
        return [key, drawing];
      }),
    );
    const [add, remove] = [[...now.values()].filter((d) => ![...held.values()].includes(d)), [...held.values()].filter((d) => ![...now.values()].includes(d))];
    for (const source of ['lines', 'rails'] as const) {
      if (add.length || remove.length) index[source].updateData({ add: add.flatMap((d) => d[source]), remove: remove.flatMap((d) => d[source].map((f) => f.id as number)) });
    }
    held = now;
    return { shown: ask.show.version };
  };
}
