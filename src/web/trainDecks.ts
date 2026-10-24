// A desktop's Trains on bridges, from zoom DECKS_FROM (#856, ADR-0016): each drawn on the top of the deck its Line
// crosses there, as decks.ts measures the deck, its halo and the followed Train's rings raised with it, as symbols
// where they're raised. A phone never loads this module: main.ts imports it beside deckLayers.ts, and a phone's
// Trains stay on the ground, as ever.

import type { ExpressionSpecification, Map as MapLibreMap, SymbolLayerSpecification } from 'maplibre-gl';
import { bandAt, DECKS_FROM, drawnIn, inBand, slotAt, type DecksFile, type Shape, type Slot, type Trip, type Zone } from '../bundle.ts';
import { bridgesOf, deckTop, riseOn } from './decks.ts';
import { field, TARGET } from './pill.ts';

/** The decks files' bridges by their centreline's ID, of every region whose decks have begun (noteDecks()). */
const byShape = new Map<string, [from: number, to: number, layer?: number][]>();

/** A region's decks file's bridges, kept by centreline ID, for heightOf() to measure a Train's deck by. */
export function noteDecks(file: DecksFile | undefined) {
  for (const [shape, runs] of Object.entries(file?.bridges ?? {})) byShape.set(shape, runs);
}

/** The Lines' placing, as main.ts keeps it, which heightOf() measures a Train's slot and bends by. */
export interface Placing {
  shapes: Map<string, Shape>;
  slots: Map<string, Slot[]>;
  curves: Map<string, Zone[]>;
}

/**
 * How high a Train `dist` metres along its shape is drawn at a zoom, in metres: on the top of the deck its Line
 * crosses there, where it crosses one — zoomed out from its rails, on its Line's stroke's slot, from the decks file's
 * bridges along the slot's centreline, or on its rails, from the levels of its own shape (bridgesOf()) — up its ramp's
 * steps at an end no other bridge of the shape meets, as the deck itself rises (regionDecks()). 0 on the ground: below
 * DECKS_FROM, where its Line is drawn on a bend across a node (onStroke()), or where no bridge is.
 */
export function heightOf(train: { trip: Pick<Trip, 'line' | 'shape'>; dist: number }, zoom: number, railsZoom: number, placing: Placing, lat: number): number {
  if (zoom < DECKS_FROM) return 0;
  let runs: [from: number, to: number, layer?: number][] | undefined;
  let d: number;
  if (zoom >= railsZoom) {
    const shape = placing.shapes.get(train.trip.shape);
    if (!shape) return 0;
    [runs, d] = [bridgesOf(shape), train.dist];
  } else {
    const band = bandAt(zoom);
    const slot = placing.slots.get(`${train.trip.line} ${train.trip.shape}`)?.find((s) => s.from <= train.dist && train.dist <= s.to && drawnIn(s, band));
    const line = slot && inBand(placing.shapes, slot.on, band);
    if (!slot || !line) return 0;
    const { at } = slotAt(slot, train.dist);
    // On a bend across a node its Line is drawn on the bend's curve, which has no deck (onStroke()).
    const bent = (placing.curves.get(`${slot.line} ${band}`) ?? []).some((z) => z.on === slot.on && Math.min(...z.at) <= at && at <= Math.max(...z.at) && z.at[0] !== z.at[1] && placing.shapes.has(z.link.shape));
    if (bent) return 0;
    [runs, d] = [byShape.get(slot.on), at];
  }
  const i = runs?.findIndex(([a, b]) => a <= d && d <= b) ?? -1;
  if (i < 0 || !runs) return 0;
  const [a, b, layer = 1] = runs[i]!;
  // The deck ramps down at an end where no other of its shape's bridges meets it, as regionDecks() has it.
  const ramped: [boolean, boolean] = [!runs.some((r, k) => k !== i && r[1] === a), !runs.some((r, k) => k !== i && r[0] === b)];
  return deckTop(layer, lat, riseOn(a, b, ramped, d));
}

/**
 * How far a Train `height` metres up is drawn, in metres: its height from DECKS_FROM, halved for each zoom in, as a
 * deck's own paint stands as high on the screen at every zoom (deckPaint()); 0 below, where no deck is drawn.
 */
export const RAISED: ExpressionSpecification = [
  'interpolate',
  ['exponential', 0.5],
  ['zoom'],
  DECKS_FROM - 0.001,
  0,
  DECKS_FROM,
  ['coalesce', ['get', 'height'], 0],
  DECKS_FROM + 10,
  ['/', ['coalesce', ['get', 'height'], 0], 2 ** 10],
];

/** The px a baked glow's solid middle reaches, and its whole edge: its fade from one to the other is the circle halo's blur (main.ts's train-halos). */
const [GLOW_CORE, GLOW_EDGE] = [24, 48];

/** A Live Train's halo on a deck, baked in its Line's colour: a soft disc, as the circle halo's blur draws one on the ground. */
export function bakeGlow(hex: string): { width: number; height: number; data: Uint8ClampedArray } | undefined {
  const m = /^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(hex);
  if (!m) return undefined;
  const [r = 0, g = 0, b = 0] = [1, 2, 3].map((k) => parseInt(m[k]!, 16));
  const size = GLOW_EDGE * 2 * 2; // px across, at pixelRatio 2
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / 2; // logical px from the middle
      const t = Math.min(1, Math.max(0, (d - GLOW_CORE) / (GLOW_EDGE - GLOW_CORE)));
      const o = (y * size + x) * 4;
      [data[o], data[o + 1], data[o + 2], data[o + 3]] = [r, g, b, 255 * (1 - t * t * (3 - 2 * t))];
    }
  }
  return { width: size, height: size, data };
}

/** The px radius the followed Train's rings are baked at: icon-size scales each to its Train's own. */
const RING = 32;

/** A target ring as a signed distance field (field()): a stroke `width` px wide at RING, so it scales about right with it. */
function ring(width: number): ReturnType<typeof field> {
  return field(2 * RING, 2 * RING, (x, y) => Math.abs(Math.hypot(x, y) - RING) - width / 2);
}

/**
 * The Trains' layers raised onto the decks (main.ts's beginDecks()): the pills, arrows and pile counts by
 * symbol-height-offset, and a raised Live Train's halo and a raised followed Train's rings as symbols, which rise
 * with it — the circle ones stay for the Trains on the ground (main.ts filters them to those). The glows are baked in
 * each Line's colour as the style asks for them (main.ts's resolver, bakeGlow()).
 */
export function raiseTrains(map: MapLibreMap, { dark, haloOpacity, before }: { dark: boolean; haloOpacity: [number, number]; before: string }) {
  for (const id of ['train-pills', 'train-pills-followed', 'train-arrows', 'train-arrows-followed', 'train-counts', 'train-counts-followed']) map.setLayoutProperty(id, 'symbol-height-offset', RAISED);
  map.addImage('train-ring-inner', ring(TARGET.inner.width), { sdf: true, pixelRatio: 2 });
  map.addImage('train-ring-outer', ring(TARGET.outer.width), { sdf: true, pixelRatio: 2 });
  const onDeck: ExpressionSpecification = ['>', ['get', 'height'], 0];
  map.addLayer(
    {
      id: 'train-halos-decked',
      type: 'symbol',
      source: 'trains',
      // The circle halo's own, but a deck's Train's (main.ts's train-halos keeps the ground's).
      filter: ['all', ['>=', ['zoom'], ['get', 'pillZoom']], ['!', ['get', 'folded']], ['get', 'live'], dark || ['get', 'followed'], onDeck],
      layout: {
        'icon-image': ['concat', 'train-glow-', ['downcase', ['slice', ['get', 'colour'], 1]]],
        'icon-size': ['/', ['get', 'haloRadius'], GLOW_CORE],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'symbol-height-offset': RAISED,
      },
      paint: { 'icon-opacity': dark ? haloOpacity[1] : haloOpacity[0] },
    },
    before,
  );
  // The followed Train's target rings and pulse, as its circle ones draw them on the ground, before its arrow and pill.
  const target = (id: string, image: string, radius: ExpressionSpecification, opacity: number | ExpressionSpecification): SymbolLayerSpecification => ({
    id,
    type: 'symbol',
    source: 'trains',
    filter: ['all', ['>=', ['zoom'], ['get', 'dotZoom']], ['get', 'followed'], onDeck],
    layout: {
      'icon-image': image,
      'icon-size': ['/', ['coalesce', radius, 0], RING],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'symbol-height-offset': RAISED,
    },
    paint: { 'icon-color': ['get', 'lettering'], 'icon-opacity': opacity },
  });
  map.addLayer(target('train-pulse-decked', 'train-ring-outer', ['get', 'pulseRadius'], ['get', 'pulseOpacity']), 'train-arrows-followed');
  map.addLayer(target('train-target-outer-decked', 'train-ring-outer', ['get', 'outerRing'], TARGET.outer.opacity), 'train-arrows-followed');
  map.addLayer(target('train-target-decked', 'train-ring-inner', ['get', 'innerRing'], TARGET.inner.opacity), 'train-arrows-followed');
}
