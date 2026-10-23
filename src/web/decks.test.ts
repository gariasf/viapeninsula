import { VectorTile } from '@mapbox/vector-tile';
import { createPropertyExpression, latest } from '@maplibre/maplibre-gl-style-spec';
import { PbfReader } from 'pbf';
import { expect, test, vi } from 'vitest';
import { BANDS, bridgeLayer, DECK_STEPS as STEPS, DECKS_FROM, DEGREE, pixelMetres, type DecksFile, type Shape, type Stroke, type Track } from '../bundle.ts';
import { encodeTrack } from '../pieces.ts';
import * as decks from './decks.ts';
import { deckPaint } from './deckLayers.ts';
import { cutAtBridges, decked, deckFeatures, deckHeight, decksTile, mouthsOf, regionDecks } from './decks.ts';
import { lineWork, type LinesAsk, type LineSource, type RegionHow } from './lineTiles.ts';
import { LINE_PARTS } from './lines.ts';
import { packFile } from './placeNames.ts';

// Track drawn in metres east (x) and north (y) of a point by Barcelona.
const [LON, LAT] = [2.1, 41.35];
const KX = DEGREE * Math.cos((LAT * Math.PI) / 180);
const point = (x: number, y = 0): [number, number] => [LON + x / KX, LAT + y / DEGREE];
/** The tile at a zoom that holds a point x metres east. */
const tileAt = (z: number, x: number) => {
  const [lon, lat] = point(x);
  const n = 2 ** z;
  return { x: Math.floor(((lon + 180) / 360) * n), y: Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n) };
};
/** A shape due east, or west where `to` is less than `from`, at y metres north, with a point every 10 m. */
const straight = (id: string, from: number, to: number, y = 0, levels?: Shape['levels']): Shape => {
  const n = Math.abs(to - from) / 10;
  return { id, coords: Array.from({ length: n + 1 }, (_, k) => point(from + ((to - from) * k) / n, y)), dist: Array.from({ length: n + 1 }, (_, k) => k * 10), ...(levels && { levels }) };
};
/** A Line's feature as drawnLines() makes it, along a straight, on a bridge of layer 1. */
const onBridge = (line: string, from: number, to: number, side = 0) => ({ type: 'Feature' as const, properties: { line, shape: 'stretch:c:0', from, to, side, colour: '#c00', deck: 1 }, geometry: { type: 'LineString' as const, coordinates: straight('', from, to).coords } });
/** A deck part's or a pier's west and east ends, in metres east. */
const span = (f: GeoJSON.Feature) => {
  const xs = (f.geometry as GeoJSON.Polygon).coordinates[0]!.map(([lon]) => Math.round((lon! - LON) * KX));
  return [Math.min(...xs), Math.max(...xs)];
};

test('stands a deck 12 px over the ground on the screen tilted 45° on a bridge of layer 1, and 6 px more for each layer above, at every zoom (#213)', () => {
  const height = createPropertyExpression(deckPaint(['get', 'colour'], '#000', DECKS_FROM)['fill-extrusion-height'], 'paint', latest['paint_fill-extrusion']['fill-extrusion-height'] as never);
  if (height.result !== 'success') throw new Error('No expression');
  // Tilted 45°, a height shows on the screen at cos 45° of it, in the zoom's pixels.
  const onScreen = (top: number, zoom: number) => ((height.value.evaluate({ zoom }, { properties: { top } } as never) as number) * Math.SQRT1_2) / pixelMetres(zoom, LAT);
  for (const zoom of [14, 14.3, 15, 16.5, 18]) {
    expect(onScreen(deckHeight(1, LAT), zoom)).toBeCloseTo(12);
    expect(onScreen(deckHeight(2, LAT), zoom)).toBeCloseTo(18);
    expect(onScreen(deckHeight(3, LAT), zoom)).toBeCloseTo(24);
  }
  // A bridge OpenStreetMap gives no layer, or layer 0, stands as one of layer 1; a tunnel and the ground have no deck.
  expect(['bridge 1', 'bridge 0', 'bridge', 'bridge 2', 'tunnel -1', 'layer 1', ''].map(bridgeLayer)).toEqual([1, 1, 1, 2, 0, 0, 0]);
});

test("cuts each Line's stroke at its bridges' ends, the part on a bridge marked with its layer and each cut back as the stroke is for its curves; its rails by their own track's levels (#213)", () => {
  const stroke: Stroke = { line: 'R2', shape: 'stretch:c:0', from: 100, to: 5000, side: 0.5, cut: [[50, 0], [80, 20]] };
  expect(cutAtBridges(stroke, [[0, 200], [2000, 3000, 2], [6000, 7000]])).toEqual([
    { ...stroke, from: 100, to: 200, cut: [[50, 0], [80, 0]], deck: 1 },
    { ...stroke, from: 200, to: 2000, cut: [[0, 0], [0, 0]] },
    { ...stroke, from: 2000, to: 3000, cut: [[0, 0], [0, 0]], deck: 2 },
    { ...stroke, from: 3000, to: 5000, cut: [[0, 0], [0, 20]] },
  ]);
  expect(cutAtBridges(stroke, [[6000, 7000]])).toEqual([stroke]);
  // The strokes by the decks file's bridges along their centrelines, the rails by their traced shape's levels.
  const track = straight('rodalies:s', 0, 3000, 0, [[1000, 'bridge 1'], [1500, ''], [2000, 'tunnel -1'], [2500, '']]);
  const { strokes, rails } = decked({ strokes: [{ ...stroke, from: 0, to: 3000, cut: undefined }], rails: [{ line: 'R2', shape: 'rodalies:s', from: 0, to: 3000, side: 0 }], shapes: new Map([[track.id, track]]) }, { bridges: { 'stretch:c:0': [[1200, 1700]] } });
  expect(strokes.map((s) => [s.from, s.to, s.deck])).toEqual([[0, 1200, undefined], [1200, 1700, 1], [1700, 3000, undefined]]);
  expect(rails.map((s) => [s.from, s.to, s.deck])).toEqual([[0, 1000, undefined], [1000, 1500, 1], [1500, 3000, undefined]]);
});

test("ramps a deck down to the ground over two piers at each end, in steps, but where it meets another of its Line's decks, and stands it on a pier every 40 m (#213)", () => {
  const rise = deckHeight(1, LAT);
  // R2's deck over 1 km, side by side with R11's; and R1's in two that meet at 500 m.
  const features = regionDecks([onBridge('R2', 0, 1000, -0.5), onBridge('R11', 0, 1000, 0.5), onBridge('R1', 0, 500), onBridge('R1', 500, 1000)], [], []).decks.flatMap(deckFeatures);
  const of = (line: string, kind: string) => features.filter((f) => f.properties?.line === line && f.properties.kind === kind && f.properties.step === 0).sort((a, b) => span(a)[0]! - span(b)[0]!);
  // Its height there, in tenths of the full one, which leaves out the hair it's lifted to keep two that overlap apart.
  const up = (f: GeoJSON.Feature, key = 'base') => Math.round((Number(f.properties?.[key]) / rise) * 10) / 10;
  const ramp = Array.from({ length: 10 }, (_, k) => (k + 1) / 10);
  for (const line of ['R2', 'R11']) {
    expect(of(line, 'deck').map((f) => up(f))).toEqual([...ramp, 1, ...ramp.toReversed()]);
    // Each ramp 80 m, in steps of 8 m.
    expect(of(line, 'deck').map(span).slice(0, 2)).toEqual([[0, 8], [8, 16]]);
    // A pier every 40 m, under the deck, as high as the deck there.
    expect(of(line, 'pier').map((f) => Math.round((span(f)[0]! + span(f)[1]!) / 20) * 10)).toEqual(Array.from({ length: 24 }, (_, k) => 40 * (k + 1)));
    expect(of(line, 'pier').slice(0, 3).map((f) => up(f, 'top'))).toEqual([0.5, 1, 1]);
  }
  // R1's two decks meet at 500 m: no ramp there.
  expect(of('R1', 'deck').map((f) => up(f))).toEqual([...ramp, 1, 1, ...ramp.toReversed()]);
  // Side by side, at their strokes' sides: R2's half a line width left of the way it runs, north, R11's right, at zoom 14 a line width apart.
  const north = (line: string) => Math.round(Math.max(...(of(line, 'deck')[10]!.geometry as GeoJSON.Polygon).coordinates[0]!.map(([, lat]) => (lat! - LAT) * DEGREE)));
  expect(north('R2') - north('R11')).toBe(Math.round(4 * pixelMetres(14, LAT)));
  // A deck for each of STEPS along the Stretches, and none for the rails' step.
  expect([...new Set(features.map((f) => f.properties?.step))].sort()).toEqual(STEPS.map((_, k) => k));
});

test("lifts decks that overlap a hair apart, as a double track's two on their rails, whichever way each runs, so that they don't flicker (#213)", () => {
  // R2's two tracks 4.5 m apart, each way, their decks 7 m wide on their rails; and a deck 30 m off, which overlaps neither.
  const rails = (line: string, from: number, to: number, y: number) => ({ ...onBridge(line, from, to), geometry: { type: 'LineString' as const, coordinates: straight('', from, to, y).coords } });
  const decks = regionDecks([], [rails('R2', 0, 600, 0), rails('R2', 600, 0, 4.5), rails('R3', 0, 600, 30)], []).decks.flatMap(deckFeatures);
  const base = (line: string, y: number) => decks.find((f) => f.properties?.line === line && f.properties.kind === 'deck' && Math.abs(Math.min(...(f.geometry as GeoJSON.Polygon).coordinates[0]!.map(([, lat]) => (lat! - LAT) * DEGREE)) - (y - 3.6)) < 1)?.properties?.base;
  // A lift apart at least, not the millionths of a metre their latitudes' scales differ by.
  expect(Math.abs(Number(base('R2', 0)) - Number(base('R2', 4.5)))).toBeGreaterThan(0.05);
  // A hair: under a twentieth of the deck's height.
  expect(Math.abs(Number(base('R2', 0)) - Number(base('R2', 4.5)))).toBeLessThan(deckHeight(1, LAT) / 20);
  // Two regions' decks on the track they share stack as their Lines' strokes do: Media Distancia y Avant's (tier 0) under
  // long distance's (1), under the region's own (2), wherever across their way they lie.
  for (const y of [0, 0.7, 4.5, 30]) {
    const tiers = [0, 1, 2].map((tier) => Number(regionDecks([], [rails('R2', 0, 600, y)], [], tier).decks.flatMap(deckFeatures)[0]?.properties?.base));
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
    expect(new Set(tiers).size).toBe(3);
  }
  // Rails Lines share, grey, are decked once, as they're drawn over each other.
  const shared = (line: string) => ({ ...rails(line, 0, 600, 0), properties: { ...rails(line, 0, 600, 0).properties, shared: true } });
  expect(regionDecks([], [shared('R2'), shared('R11')], []).decks.map((d) => d.properties)).toEqual([expect.objectContaining({ line: 'R2', shared: true })]);
});

test("makes a Stretch's decks of the band zoom 14 is drawn in, or of a stroke drawn alike in every band, not of another band's (#213)", () => {
  const band = (n?: number) => ({ ...onBridge('R2', 0, 1000), properties: { ...onBridge('R2', 0, 1000).properties, ...(n !== undefined && { band: n }) } });
  expect([band(BANDS.indexOf(10)), band(BANDS.indexOf(DECKS_FROM)), band()].map((f) => regionDecks([f], [], []).decks.length)).toEqual([0, 1, 1]);
});

test("marks each tunnel's mouth once, a double track's with one arch, and none where a Line starts or ends in its tunnel, goes deeper in it, or onto a bridge (#213)", () => {
  const shapes = [
    // R2 into a tunnel at 1 km and out at 2 km, and back the other way on its other track 4 m north, its mouths 12 m off those.
    straight('R2', 0, 3000, 0, [[1000, 'tunnel -1'], [2000, '']]),
    straight('R2:back', 3000, 0, 4, [[994, 'tunnel -1'], [2012, '']]),
    // R3 starts in a tunnel, and comes out 500 m on.
    straight('R3', 5000, 6000, 0, [[0, 'tunnel -2'], [500, '']]),
    // R4 goes deeper in its tunnel, and then over a bridge.
    straight('R4', 8000, 10_000, 0, [[100, 'tunnel -1'], [300, 'tunnel -2'], [600, ''], [1000, 'bridge 1'], [1300, '']]),
    // A centreline's levels, as a decks file would give, aren't the track's.
    straight('stretch:c:0', 0, 3000, 0, [[1000, 'tunnel -1']]),
  ];
  // R2's two tracks' mouths where they are on average: 1000 m and 988 m, 2000 m and 2006 m.
  expect(mouthsOf(shapes).map(([lon]) => Math.round((lon - LON) * KX))).toEqual([994, 2003, 5500, 8100, 8600]);
});

test("marks a mouth once where two regions' tracks go into one tunnel, as long distance's and Catalonia's do, the first region's (#213)", () => {
  // Long distance's at 1,000 m and 1,600 m; Catalonia's 3 m and 20 m off them, and one of its own at 1,300 m.
  const regions = [{ decks: [], mouths: [point(1000), point(1600)] }, { decks: [], mouths: [point(1003), point(1300), point(1600, 20)] }];
  const { x, y } = tileAt(13, 1000);
  const marked = decksTile(regions, 13, x, y)?.features ?? [];
  const east = (tx: number) => Math.round(((((x + tx / 8192) / 2 ** 13) * 360 - 180 - LON) * KX) / 10) * 10;
  expect(marked.map((f) => east((f.geometry as number[][])[0]![0]!)).sort((a, b) => a - b)).toEqual([1000, 1300, 1600]);
});

/** A region's track of one Line, R2, 1.2 km due east: on a bridge from 200 m to 500 m, and in a tunnel from 700 m to 1 km. */
const track: Track = {
  networks: [{ id: 'rodalies', name: 'Rodalies', profile: { acceleration: 1, braking: 1, topSpeed: 40, dwell: 30 }, runningSide: 'right', colour: '#000', pillZoom: 10, credit: { text: '', url: '' } }],
  lines: [{ id: 'rodalies:R2', network: 'rodalies', name: 'R2', colour: '#00a', shapes: ['rodalies:s'], kind: 'commuter' }],
  stations: [],
  shapes: [straight('rodalies:s', 0, 1200, 0, [[200, 'bridge 1'], [500, ''], [700, 'tunnel -1'], [1000, '']]), straight('stretch:catalonia:0', 0, 1200)],
  strokes: [{ line: 'rodalies:R2', shape: 'stretch:catalonia:0', from: 0, to: 1200, side: 0 }],
  rails: [{ line: 'rodalies:R2', shape: 'rodalies:s', from: 0, to: 1200, side: 0 }],
  slots: [],
  tracks: [],
};
const file = encodeTrack(track);
const how: RegionHow = { rank: 0, under: false, lettering: [], shownFrom: [] };
const bridges: DecksFile = { bridges: { 'stretch:catalonia:0': [[200, 500]] } };
/** A tile's features of a source, as MapLibre reads them. */
const read = (data: ArrayBuffer, source: LineSource) => {
  const layer = new VectorTile(new PbfReader(data)).layers[source];
  return Array.from({ length: layer?.length ?? 0 }, (_, i) => layer!.feature(i).properties);
};
/** The tile at a zoom that holds a point x metres east, and its features of a source. */
const tile = (work: ReturnType<typeof lineWork>, source: LineSource, z: number, x: number) => {
  const answer = work({ tile: { source, z, ...tileAt(z, x), ask: 1 } });
  if (!('data' in answer)) throw new Error('no tile');
  return read(answer.data, source);
};

test("on a desktop, draws a Line on a bridge as its deck from zoom 14, not on the ground, and marks the tunnels' mouths from 13; a phone, which gets no decks file nor loads the decks' module, draws its Lines as ever (#213)", () => {
  const show = (work: ReturnType<typeof lineWork>, region: RegionHow): LinesAsk => {
    const ask: LinesAsk = { show: { regions: [{ key: 1, file: packFile(file, LINE_PARTS), how: region }], version: 1 } };
    expect(work(ask)).toEqual({ shown: 1 });
    return ask;
  };
  const phone = lineWork();
  show(phone, how);
  for (const z of [13, 14, 15]) {
    expect(tile(phone, 'lines', z, 350).map((p) => [p.from, p.to, p.deck])).toEqual([[0, 1200, undefined]]);
    expect(tile(phone, 'decks', z, 350)).toEqual([]);
  }
  const desktop = lineWork(() => decks);
  show(desktop, { ...how, decks: bridges });
  // Below zoom 14, its Line goes over the bridge on the ground, as ever, cut at its ends; from 14, on its deck.
  expect(tile(desktop, 'lines', 13, 350).map((p) => [p.from, p.to, p.deck])).toEqual([[0, 200, undefined], [200, 500, 1], [500, 1200, undefined]]);
  expect(tile(desktop, 'lines', 14, 350).map((p) => p.deck)).not.toContain(1);
  expect(tile(desktop, 'rails', 14, 350).map((p) => p.deck)).not.toContain(1);
  // The mouths alone at 13; from 14 the decks along the Stretches, their STEPS, till the Lines are on their rails at 15, then the rails'.
  const kinds = (z: number) => [...new Set(tile(desktop, 'decks', z, 350).map((p) => `${p.kind} ${p.step ?? ''}`))].sort();
  expect(kinds(13)).toEqual(['mouth ']);
  expect(kinds(14)).toEqual(['deck 0', 'deck 1', 'deck 2', 'deck 3', 'mouth ', 'pier 0', 'pier 1', 'pier 2', 'pier 3']);
  expect(kinds(15)).toEqual(['deck 4', 'mouth ', 'pier 4']);
});

test("draws a desktop's Lines on the ground, as a phone's, where its worker can't load the decks' module, rather than none (#213)", async () => {
  vi.resetModules();
  vi.doMock('./decks.ts', () => {
    throw new Error('No chunk');
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const posted: { shown?: number; data?: ArrayBuffer }[] = [];
  vi.stubGlobal('self', { name: 'lines-decks', postMessage: (answer: (typeof posted)[number]) => posted.push(answer) });
  try {
    await import('./linesWorker.ts');
    const ask = (data: LinesAsk) => (self.onmessage as unknown as (e: { data: LinesAsk }) => Promise<void>)({ data });
    await ask({ show: { regions: [{ key: 1, file: packFile(file, LINE_PARTS), how: { ...how, decks: bridges } }], version: 1 } });
    await ask({ tile: { source: 'lines', z: 14, ...tileAt(14, 350), ask: 2 } });
    expect(posted[0]).toEqual({ shown: 1 });
    expect(read(posted[1]?.data ?? new ArrayBuffer(0), 'lines').map((p) => [p.from, p.to, p.deck])).toEqual([[0, 1200, undefined]]);
  } finally {
    vi.doUnmock('./decks.ts');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});
