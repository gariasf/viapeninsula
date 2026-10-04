import { expect, test } from 'vitest';
import type { Point } from '../bundle.ts';
import { rounded } from './curve.ts';

// A right angle at Glòries, about 1 km each way.
const kx = Math.cos((41.4 * Math.PI) / 180);
const [a, b, c]: [Point, Point, Point] = [[2.175, 41.4], [2.187, 41.4], [2.187, 41.409]];
const metres = ([x, y]: Point) => [(x - b[0]) * kx * 111_195, (y - b[1]) * 111_195] as const;

test('rounds a bend into an arc that strays at most 2 m from the corner and meets the rails on either side', () => {
  const points = rounded([a, b, c]);
  expect(points[0]).toEqual(a);
  expect(points.at(-1)).toEqual(c);
  expect(points.length).toBeGreaterThan(5);
  // Every point on or beside the corner's two lengths, within 2 m, and the arc's nearest 2 m from the corner.
  for (const p of points) {
    const [x, y] = metres(p);
    expect(Math.min(Math.abs(x), Math.abs(y))).toBeLessThan(2.01);
    expect(x).toBeLessThan(0.01);
    expect(y).toBeGreaterThan(-0.01);
  }
  expect(Math.min(...points.map((p) => Math.hypot(...metres(p))))).toBeGreaterThan(1.9);
});

test('draws the same curve whichever way the rails run, and leaves a turn back and a straight line', () => {
  expect(rounded([c, b, a])).toEqual(rounded([a, b, c]).toReversed());
  const back: [Point, Point, Point] = [a, b, [2.181, 41.40001]];
  expect(rounded(back)).toEqual(back);
  const straight: [Point, Point, Point] = [a, [2.181, 41.4], b];
  expect(rounded(straight)).toEqual(straight);
});
