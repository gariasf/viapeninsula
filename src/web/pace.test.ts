import { expect, test } from 'vitest';
import type { Point } from '../bundle.ts';
import { fastestInView } from './pace.ts';

// Rodalies' R2 at 160 km/h, AVE's at 300 km/h, in m/s.
const topSpeeds = new Map([
  ['R2', 44.4],
  ['AVE', 83.3],
]);
// Barcelona's view at zoom 12, about a box round the city.
const inView = ([lon, lat]: Point) => lon > 2.1 && lon < 2.25 && lat > 41.35 && lat < 41.42;
const [barcelona, madrid]: [Point, Point] = [
  [2.17, 41.38],
  [-3.7, 40.41],
];

test("the Trains go at the pace of the fastest Line with a Train in view, not AVE's where none of its is", () => {
  expect(fastestInView([{ line: 'R2', at: barcelona }, { line: 'AVE', at: madrid }], inView, topSpeeds)).toBe(44.4);
  expect(fastestInView([{ line: 'R2', at: barcelona }, { line: 'AVE', at: [2.14, 41.379] }], inView, topSpeeds)).toBe(83.3);
});

test('with no Train in view, or none of a Line it knows, there is no pace to keep', () => {
  expect(fastestInView([{ line: 'R2', at: madrid }], inView, topSpeeds)).toBe(0);
  expect(fastestInView([{ line: 'R99', at: barcelona }], inView, topSpeeds)).toBe(0);
  expect(fastestInView([], inView, topSpeeds)).toBe(0);
});
