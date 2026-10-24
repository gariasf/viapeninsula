import { createPropertyExpression, latest } from '@maplibre/maplibre-gl-style-spec';
import { expect, test } from 'vitest';
import { bandAt, bridgeLayer, DECKS_FROM, DEGREE, pixelMetres, type Shape, type Slot, type Zone } from '../bundle.ts';
import { deckHeight, deckTop, riseOn } from './decks.ts';
import { bakeGlow, heightOf, noteDecks, RAISED } from './trainDecks.ts';

// Track drawn in metres east (x) and north (y) of a point by Barcelona, as decks.test.ts draws it.
const [LON, LAT] = [2.1, 41.35];
const KX = DEGREE * Math.cos((LAT * Math.PI) / 180);
const point = (x: number, y = 0): [number, number] => [LON + x / KX, LAT + y / DEGREE];
/** A shape due east, with a point every 10 m, as decks.test.ts's straight(). */
const straight = (id: string, from: number, to: number, y = 0, levels?: Shape['levels']): Shape => {
  const n = Math.abs(to - from) / 10;
  return { id, coords: Array.from({ length: n + 1 }, (_, k) => point(from + ((to - from) * k) / n, y)), dist: Array.from({ length: n + 1 }, (_, k) => k * 10), ...(levels && { levels }) };
};
const RAILS_ZOOM = 15;
const SLAB = (lat: number) => (2 * pixelMetres(DECKS_FROM, lat)) / Math.SQRT1_2;

test("a Train on a bridge on its rails is raised to its deck's top, up a ramp at an end no other bridge meets, and not at all off one (#856)", () => {
  const shape = straight('s:0', 0, 2000, 0, [[300, 'bridge'], [700, ''], [1000, 'bridge 2'], [1400, '']]);
  const placing = { shapes: new Map([[shape.id, shape]]), slots: new Map<string, Slot[]>(), curves: new Map<string, Zone[]>() };
  const at = (dist: number, zoom = 15.5) => heightOf({ trip: { line: 'R2', shape: shape.id }, dist }, zoom, RAILS_ZOOM, placing, LAT);
  expect(at(500)).toBeCloseTo(deckTop(1, LAT, 1));
  expect(at(1200)).toBeCloseTo(deckTop(2, LAT, 1));
  // 40 m up the 80 m ramp at the first bridge's start: half its rise, and the slab.
  expect(at(340)).toBeCloseTo(deckHeight(1, LAT) * 0.5 + SLAB(LAT));
  // Off a bridge, and below the zoom the decks begin at, on the ground.
  expect(at(800)).toBe(0);
  expect(at(500, 13.9)).toBe(0);
});

test("a Train on a bridge on its Line's stroke, zoomed out from the rails, is raised by the decks file's bridges along the slot's centreline, but not on a bend across a node (#856)", () => {
  const centreline = straight('c:0', 0, 4000);
  const link = straight('stretch:link:0', 0, 400);
  noteDecks({ bridges: { 'c:0': [[1000, 2000, 1]] } });
  const slot: Slot = { line: 'R2', shape: 's:0', from: 0, to: 4000, side: 0, on: 'c:0', at: [0, 4000] };
  const curves = new Map<string, Zone[]>();
  const placing = () => ({ shapes: new Map([[centreline.id, centreline], [link.id, link]]), slots: new Map([['R2 s:0', [slot]]]), curves });
  const zoom = 14;
  const at = (dist: number) => heightOf({ trip: { line: 'R2', shape: 's:0' }, dist }, zoom, RAILS_ZOOM, placing(), LAT);
  expect(at(1500)).toBeCloseTo(deckTop(1, LAT, 1));
  expect(at(1040)).toBeCloseTo(deckHeight(1, LAT) * 0.5 + SLAB(LAT));
  expect(at(2500)).toBe(0);
  // On a bend across a node, the Line is drawn on the bend's curve, which has no deck.
  curves.set(`R2 ${bandAt(zoom)}`, [{ on: 'c:0', at: [1400, 1600], link: { line: 'R2', shape: link.id, from: 0, to: 400, side: 0 }, along: [0, 200], others: [] }]);
  expect(at(1500)).toBe(0);
  // Below the zoom the decks begin at, on the ground.
  expect(heightOf({ trip: { line: 'R2', shape: 's:0' }, dist: 1500 }, 13.5, RAILS_ZOOM, placing(), LAT)).toBe(0);
});

test('raises a Train as far as its deck stands at every zoom, and not below the zoom the decks begin at (#856)', () => {
  const offset = createPropertyExpression(RAISED, 'layout', latest['layout_symbol']['symbol-height-offset'] as never);
  if (offset.result !== 'success') throw new Error('No expression');
  const at = (height: number, zoom: number) => offset.value.evaluate({ zoom }, { properties: { height } } as never) as number;
  expect(at(100, 14)).toBeCloseTo(100);
  expect(at(100, 15)).toBeCloseTo(50);
  expect(at(100, 16.5)).toBeCloseTo(100 / 2 ** 2.5);
  expect(at(100, 13.9)).toBeCloseTo(0);
  // None set, as a phone's Trains have: on the ground.
  expect(offset.value.evaluate({ zoom: 15 }, { properties: {} } as never)).toBe(0);
});

test("a deck's rise on its ramps steps as the deck's own does, and a glow bakes in its Line's colour (#856)", () => {
  expect(riseOn(1000, 2000, [true, true], 1000)).toBe(0);
  expect(riseOn(1000, 2000, [true, true], 1040)).toBe(0.5);
  expect(riseOn(1000, 2000, [true, true], 1500)).toBe(1);
  expect(riseOn(1000, 2000, [true, true], 2000)).toBe(0);
  // No ramp where another bridge meets the end.
  expect(riseOn(1000, 2000, [false, true], 1000)).toBe(1);
  const glow = bakeGlow('c02130');
  expect(glow).toBeDefined();
  const [w, h] = [glow!.width, glow!.height];
  const px = (x: number, y: number) => [0, 1, 2, 3].map((k) => glow!.data[(y * w + x) * 4 + k]);
  expect(px(w / 2, h / 2)).toEqual([192, 33, 48, 255]); // solid in the middle, in the Line's colour
  expect(px(0, 0)).toEqual([192, 33, 48, 0]); // gone at a corner
  expect(bakeGlow('nope')).toBeUndefined();
});
