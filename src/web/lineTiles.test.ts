import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { VectorTile } from '@mapbox/vector-tile';
import { GeoJSONVT } from '@maplibre/geojson-vt';
import { PbfReader } from 'pbf';
import { expect, test } from 'vitest';
import type { Track } from '../bundle.ts';
import { decodeTrack, encodeTrack } from '../pieces.ts';
import { rounded } from './curve.ts';
import { lineWork, type LinesAsk, type RegionHow } from './lineTiles.ts';
import { drawnFrom, drawnLines, LINE_PARTS } from './lines.ts';
import { packFile } from './placeNames.ts';

// One region's track, Barcelona's of 7 Oct 2026, as its file stores it and as the page reads it, with a stroke and a rail
// along each of its Lines' shapes, which it was built before.
const { bundle } = JSON.parse(gunzipSync(readFileSync(new URL('../fixtures/replay-2026-10-07.json.gz', import.meta.url))).toString()) as { bundle: Track };
const shapeLength = new Map(bundle.shapes.map((s) => [s.id, s.dist.at(-1) ?? 0]));
const along = bundle.lines.flatMap((l, i) => l.shapes.map((shape) => ({ line: l.id, shape, from: 0, to: shapeLength.get(shape) ?? 0, side: (i % 3) - 1 })));
const file = encodeTrack({ ...bundle, strokes: along, rails: along });
const track = decodeTrack(file);
const how: RegionHow = { rank: 2, under: false, lettering: track.lines.map((l) => [l.id, '#fff']), shownFrom: [...drawnFrom(track.lines)] };

/** As postMessage() hands an ask over: a copy, its numbers' buffers moved. */
const handed = (ask: LinesAsk): LinesAsk => {
  const transfer = 'show' in ask ? ask.show.regions.flatMap((r) => (r.file ? [r.file.numbers.buffer, r.file.lengths.buffer] : [])) : [];
  return structuredClone(ask, { transfer });
};
const region = (key: number, withFile = true) => ({ key, how, ...(withFile && { file: packFile(file, LINE_PARTS) }) });
/** The features of a tile the worker serves, as MapLibre reads them. */
const tile = (work: ReturnType<typeof lineWork>, source: 'lines' | 'rails', [z, x, y]: [number, number, number]) => {
  const answer = work(handed({ tile: { source, z, x, y, ask: 1 } }));
  if (!answer || !('data' in answer)) throw new Error('no tile');
  const layer = new VectorTile(new PbfReader(answer.data)).layers[source];
  return Array.from({ length: layer?.length ?? 0 }, (_, i) => layer?.feature(i)).flatMap((f) => (f ? [{ id: f.id, properties: f.properties, geometry: f.loadGeometry().map((ring) => ring.map((p) => [p.x, p.y])) }] : []));
};
// Barcelona at zoom 12 and Spain's north east at zoom 7.
const TILES: [number, number, number][] = [
  [12, 2072, 1530],
  [7, 64, 47],
];

test("serves a region's Lines and rails as the tiles MapLibre's GeoJSON source cut from the features the page made, from its file handed over as typed arrays (#837)", { timeout: 60_000 }, () => {
  const work = lineWork();
  expect(work(handed({ show: { regions: [region(1)], version: 1 } }))).toEqual({ shown: 1 });
  // What the page handed MapLibre before: the features made on the page, in a GeoJSON source of its options.
  const made = { shapes: new Map(track.shapes.map((s) => [s.id, s])), lines: new Map(track.lines.map((l) => [l.id, l])), lettering: () => '#fff', rank: 2, shownFrom: drawnFrom(track.lines) };
  for (const [source, features, tolerance] of [
    ['lines', drawnLines(track.strokes, made), 0.375],
    ['rails', drawnLines(track.rails, made, rounded), 0.1],
  ] as const) {
    features.forEach((f, i) => (f.id = i));
    const index = new GeoJSONVT({ type: 'FeatureCollection', features }, { buffer: 2048, tolerance: tolerance * 16, extent: 8192, maxZoom: 18, updateable: true });
    for (const [z, x, y] of TILES) {
      const expected = (index.getTile(z, x, y)?.features ?? []).map((f) => ({ properties: f.tags, geometry: f.geometry }));
      expect(expected.length).toBeGreaterThan(0);
      expect(tile(work, source, [z, x, y]).map(({ properties, geometry }) => ({ properties, geometry }))).toEqual(expected);
    }
  }
});

test('adds each region joined to the tiles once, by its key, and takes off those no longer joined (#837)', { timeout: 60_000 }, () => {
  const work = lineWork();
  const [z, x, y] = TILES[0] ?? [0, 0, 0];
  work(handed({ show: { regions: [region(1)], version: 1 } }));
  const one = tile(work, 'lines', [z, x, y]);
  // A second region joins, the first held already.
  work(handed({ show: { regions: [region(1, false), region(2)], version: 2 } }));
  const both = tile(work, 'lines', [z, x, y]);
  expect(both).toHaveLength(2 * one.length);
  expect(new Set(both.map((f) => f.id)).size).toBe(both.length);
  // The first's file fails at a later look: its Lines come off.
  expect(work(handed({ show: { regions: [region(2, false)], version: 3 } }))).toEqual({ shown: 3 });
  const second = tile(work, 'lines', [z, x, y]);
  expect(second.map((f) => f.id)).toEqual(both.slice(one.length).map((f) => f.id));
  // One it no longer holds can't be named by its key alone.
  expect(() => work(handed({ show: { regions: [region(1, false)], version: 4 } }))).toThrow();
});
