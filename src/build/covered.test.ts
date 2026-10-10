import { expect, test } from 'vitest';
import { BANDS, coveredIn, type Shape, type Stroke } from '../bundle.ts';
import { markCovered } from './covered.ts';
import { KX, LATITUDE } from './sideBySide.ts';

const M = (6_371_008.8 * Math.PI) / 180;
/** A straight shape 1 km long running east, `north` metres north of a point at LATITUDE, a point every 100 m. */
function east(id: string, north: number, from = 0, to = 1000): Shape {
  const xs = Array.from({ length: Math.round((to - from) / 100) + 1 }, (_, i) => from + i * 100);
  return { id, coords: xs.map((x) => [2 + x / KX, LATITUDE + north / M]), dist: xs.map((x) => x - from) };
}
const stroke = (line: string, shape: string, extra: Partial<Stroke> = {}): Stroke => ({ line, shape, from: 0, to: 1000, side: 0, ...extra });
const [z12 = 0, z13 = 0, z14 = 0] = [12, 13, 14].map((z) => BANDS.indexOf(z));

test("a Line in a tunnel is marked, in each band, where a Line above lies within that band's line width, alongside", () => {
  // Line widths: 47 m at zoom 12, 26 at 13 and 14 at 14.
  const shapes = [east('a', 0), east('near', 10), east('mid', 20), east('far', 40)];
  const strokes = [stroke('A', 'a'), stroke('N', 'near', { under: 1 }), stroke('M', 'mid', { under: 1 }), stroke('F', 'far', { under: 1 })];
  const [, near, mid, far] = markCovered(strokes, shapes, KX, LATITUDE);
  const whole = (band: number): [number, number, number] => [band, 0, 1000];
  // The wider bands below zoom 12 have it whole too, which the narrower ones have not.
  const from12 = (s?: Stroke) => s?.covered?.filter(([b]) => b >= z12);
  expect(from12(near)).toEqual([whole(z12), whole(z13), whole(z14)]);
  expect(from12(mid)).toEqual([whole(z12), whole(z13)]);
  expect(from12(far)).toEqual([whole(z12)]);
});

test('only where the Line above runs: a run of it half the stroke long marks half of it', () => {
  const shapes = [east('a', 0, 0, 500), east('b', 5)];
  const [, below] = markCovered([stroke('A', 'a', { to: 500 }), stroke('B', 'b', { under: 1 })], shapes, KX, LATITUDE);
  const [[, from, to] = [0, NaN, NaN]] = below?.covered?.filter(([b]) => b === z14) ?? [];
  expect(from).toBe(0);
  expect(Math.abs((to ?? 0) - 500)).toBeLessThanOrEqual(13);
});

test("a Line isn't covered by itself, by one as deep, or by one below it, and a stroke on the street has no mark", () => {
  const shapes = [east('a', 0), east('b', 5)];
  const marked = (a: Partial<Stroke>, b: Partial<Stroke>) => markCovered([stroke('A', 'a', a), stroke('B', 'b', b)], shapes, KX, LATITUDE);
  expect(marked({ under: 1 }, { under: 1 }).map((s) => s.covered)).toEqual([undefined, undefined]);
  expect(marked({ under: 2 }, { under: 1 }).map((s) => s.covered?.length)).toEqual([5, undefined]);
  expect(markCovered([stroke('A', 'a'), stroke('A', 'b', { under: 1 })], shapes, KX, LATITUDE).map((s) => s.covered)).toEqual([undefined, undefined]);
  expect(marked({}, {}).map((s) => s.covered)).toEqual([undefined, undefined]);
});

test("a stroke is split where it's covered, in the band, and nowhere else", () => {
  const s = stroke('B', 'b', { under: 1, covered: [[z13, 200, 600], [z14, 300, 400]] });
  expect(coveredIn(s, z13).map(({ from, to, covered }) => [from, to, covered ? true : undefined])).toEqual([[0, 200, undefined], [200, 600, true], [600, 1000, undefined]]);
  expect(coveredIn(s, z12).map(({ from, to, covered }) => [from, to, covered ? true : undefined])).toEqual([[0, 1000, undefined]]);
  expect(coveredIn({ ...s, from: 250, to: 500 }, z14).map(({ from, to, covered }) => [from, to, covered ? true : undefined])).toEqual([[250, 300, undefined], [300, 400, true], [400, 500, undefined]]);
});
