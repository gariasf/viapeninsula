import { expect, test } from 'vitest';
import { type Shape, type Stroke } from '../bundle.ts';
import { breaks } from './breaks.ts';

/** A shape running east from a point in Barcelona, or so many degrees north of east, so many metres long, with a point every 10 m. */
function east(id: string, metres: number, north = 0): Shape {
  const n = metres / 10;
  const degree = (6_371_008.8 * Math.PI) / 180;
  const kx = degree * Math.cos((41.39 * Math.PI) / 180);
  const [cos, sin] = [Math.cos((north * Math.PI) / 180), Math.sin((north * Math.PI) / 180)];
  return { id, coords: Array.from({ length: n + 1 }, (_, i) => [2.17 + (i * 10 * cos) / kx, 41.39 + (i * 10 * sin) / degree]), dist: Array.from({ length: n + 1 }, (_, i) => i * 10) };
}

const stroke = (line: string, shape: string, from: number, to: number, side: number): Stroke => ({ line, shape, from, to, side });

test('counts nothing for Lines drawn in one stroke each', () => {
  expect(breaks([stroke('R2', 'a', 0, 2000, -0.5), stroke('R11', 'b', 0, 2000, 0.5)], [east('a', 2000), east('b', 2000)])).toEqual({ steps: 0, stubs: 0, swaps: 0, joins: 0 });
});

test('counts steps, stubs, swaps and short joins', () => {
  const found = breaks(
    [
      // R2 and R11 change places halfway along their track.
      stroke('R2', 'a', 0, 1000, -0.5),
      stroke('R2', 'a', 1000, 2000, 0.5),
      stroke('R11', 'b', 0, 1000, 0.5),
      stroke('R11', 'b', 1000, 2000, -0.5),
      // R14 steps out for 100 m and back, 2 km further on.
      stroke('R14', 'c', 0, 3900, 0),
      stroke('R14', 'c', 3900, 4000, 1),
      stroke('R14', 'c', 4000, 5000, 0),
      // R3 ends in a short stroke of its own, away from the others.
      stroke('R3', 'd', 0, 100, 0),
    ],
    [east('a', 2000), east('b', 2000), east('c', 5000), east('d', 100)],
  );
  expect(found).toEqual({ steps: 4, stubs: 2, swaps: 1, joins: 1 });
});

test("doesn't count Lines that step level with each other, running opposite ways, as a swap", () => {
  // R16's shape runs back west, its track a little off parallel to R2S's.
  const back = east('b', 2000, 1);
  back.coords.reverse();
  const found = breaks([stroke('R2S', 'a', 0, 1000, 1), stroke('R2S', 'a', 1000, 2000, 2), stroke('R16', 'b', 0, 1000, -3), stroke('R16', 'b', 1000, 2000, -2)], [east('a', 2000), back]);
  expect(found.swaps).toBe(0);
});

test("doesn't count Lines stepping side by side the same way as a swap", () => {
  // A third Line joins R2 and R11, and both move over a half.
  const found = breaks(
    [stroke('R2', 'a', 0, 1000, -0.5), stroke('R2', 'a', 1000, 2000, -1), stroke('R11', 'b', 0, 1000, 0.5), stroke('R11', 'b', 1000, 2000, 0)],
    [east('a', 2000), east('b', 2000)],
  );
  expect(found).toEqual({ steps: 2, stubs: 0, swaps: 0, joins: 0 });
});
