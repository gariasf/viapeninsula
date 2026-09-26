import { expect, test } from 'vitest';
import { beside, DEGREE, type Shape } from './bundle.ts';

test('finds the point a distance along a line, moved to its right, or its left where negative', () => {
  // 1 km east along the equator, where a degree is DEGREE metres both ways.
  const east: Shape = { id: 'east', coords: [[0, 0], [1000 / DEGREE, 0]], dist: [0, 1000] };
  const metres = ([lon, lat]: [number, number]) => [lon * DEGREE, lat * DEGREE].map((m) => Math.round(m * 100) / 100);
  expect(metres(beside(east, 400, 5))).toEqual([400, -5]);
  expect(metres(beside(east, 400, -5))).toEqual([400, 5]);
  // At either end, it looks along the line's first or last metres.
  expect(metres(beside(east, 0, 5))).toEqual([0, -5]);
  expect(metres(beside(east, 1000, 5))).toEqual([1000, -5]);
});
