// The Lines and rails MapLibre draws, made in a worker of their own (linesWorker.ts) and served to it as vector tiles
// (#837): handed over as GeoJSON, MapLibre serialised 54k features for its worker on the page's thread, 3.1 s of a
// phone's long-distance join. The tiles are cut as MapLibre's GeoJSON source cut them, by the same library and options.

import { GeoJSONVT } from '@maplibre/geojson-vt';
import { fromGeojsonVt } from '@maplibre/vt-pbf';
import { DECKS_FROM, type DecksFile } from '../bundle.ts';
import { rounded } from './curve.ts';
import { drawnLines } from './lines.ts';
import { unpackFile, type Packed } from './placeNames.ts';

/** How a region's Lines are made, but its track: its place in the manifest, whether under the others', each Line's lettering, and each Network's zoom (drawnLines()). */
export interface RegionHow {
  rank: number;
  under: boolean;
  lettering: [line: string, lettering: string | undefined][];
  shownFrom: [network: string, zoom: number][];
  /** On a desktop, the region's decks file, where it came (ADR-0016): its Lines on bridges are drawn as decks (decks.ts). */
  decks?: DecksFile;
  /** And its decks' tier, which overlapping regions' decks stack by, as their strokes do (decks.ts's RegionDecks). */
  tier?: number;
}

/** The sources served, each a layer of its own name in its tiles: a desktop's decks too (ADR-0016). */
export type LineSource = 'lines' | 'rails' | 'decks';

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
export const OPTIONS = { buffer: 128 * (EXTENT / TILE_PX), extent: EXTENT, maxZoom: 18, updateable: true };
export const TOLERANCE = { lines: 0.375, rails: 0.1 };

/** A region's features, by source, and on a desktop its decks, made in the tiles they're in (decks.ts). */
type Drawing = { lines: GeoJSON.Feature[]; rails: GeoJSON.Feature[]; decks?: import('./decks.ts').RegionDecks };

/**
 * What the worker does with what the page asks (LinesAsk): makes each region's Lines once each time it's handed its file,
 * for as long as the next join names it, keeps the tiles' index of the regions joined, as MapLibre's GeoJSON source did,
 * and cuts and encodes a tile.
 * On a desktop, `decks` gives the decks' module (decks.ts) once it's loaded, which a region that comes with its decks
 * file waits for (linesWorker.ts): its strokes and rails are cut at their bridges, and their parts there drawn as decks
 * from DECKS_FROM, not on the ground.
 */
export function lineWork(decks: () => typeof import('./decks.ts') | undefined = () => undefined) {
  const index = Object.fromEntries((['lines', 'rails'] as const).map((s) => [s, new GeoJSONVT({ type: 'FeatureCollection', features: [] }, { ...OPTIONS, tolerance: TOLERANCE[s] * (EXTENT / TILE_PX) })])) as Record<'lines' | 'rails', GeoJSONVT>;
  let held = new Map<number, Drawing>();
  let next = 0;
  const make = (file: Packed, { rank, under, lettering, shownFrom, decks: bridges, tier }: RegionHow): Drawing => {
    const track = unpackFile<'shapes' | 'lines' | 'strokes' | 'rails'>(file);
    const letters = new Map(lettering);
    const how = { shapes: new Map(track.shapes.map((s) => [s.id, s])), lines: new Map(track.lines.map((l) => [l.id, l])), lettering: (line: string) => letters.get(line), rank, under, shownFrom: new Map(shownFrom) };
    const made = bridges && decks();
    const { strokes, rails } = made ? made.decked({ ...track, shapes: how.shapes }, bridges) : track;
    const drawing: Drawing = { lines: drawnLines(strokes, how), rails: drawnLines(rails, how, rounded) };
    for (const f of [...drawing.lines, ...drawing.rails]) f.id = next++;
    if (made) drawing.decks = made.regionDecks(drawing.lines, drawing.rails, track.shapes, tier);
    return drawing;
  };
  return (ask: LinesAsk): { shown: number } | { ask: number; data: ArrayBuffer } => {
    if ('tile' in ask) {
      const { source, z, x, y } = ask.tile;
      const made = decks();
      // From DECKS_FROM, a Line on a bridge is its deck's, not drawn on the ground.
      const cut = source === 'decks' ? made?.decksTile([...held.values()].flatMap((d) => d.decks ?? []), z, x, y) : index[source].getTile(z, x, y);
      const tile = cut && source !== 'decks' && z >= DECKS_FROM && made ? ({ ...cut, features: cut.features.filter((f) => !f.tags?.deck) } as typeof cut) : cut;
      return { ask: ask.tile.ask, data: tile && tile.features.length ? fromGeojsonVt({ [source]: tile }, { version: 2, extent: EXTENT }).slice().buffer : new ArrayBuffer(0) };
    }
    const now = new Map(
      ask.show.regions.map(({ key, file, how }): [number, Drawing] => {
        // Handed its file again, as a desktop's region is with its decks once the map has begun them (main.ts), it's made again.
        const drawing = (file && make(file, how)) ?? held.get(key);
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
