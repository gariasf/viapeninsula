import { expect, test } from 'vitest';
import { type Shape, type Stroke } from '../bundle.ts';
import { breaks, measures } from './measures.ts';

const degree = (6_371_008.8 * Math.PI) / 180;
const kx = degree * Math.cos((41.39 * Math.PI) / 180);

/** A shape through points in metres east and north of a point in Barcelona. */
function shape(id: string, points: [number, number][]): Shape {
  const dist = points.map((p, i) => Math.hypot(p[0] - (points[i - 1] ?? p)[0], p[1] - (points[i - 1] ?? p)[1]));
  for (let i = 1; i < dist.length; i++) dist[i] = (dist[i] ?? 0) + (dist[i - 1] ?? 0);
  return { id, coords: points.map(([x, y]) => [2.17 + x / kx, 41.39 + y / degree]), dist };
}

/** A shape running east from a point in Barcelona, or so many degrees north of east, so many metres long, with a point every 10 m; or starting so many metres north of it. */
function east(id: string, metres: number, north = 0, from = 0): Shape {
  const [cos, sin] = [Math.cos((north * Math.PI) / 180), Math.sin((north * Math.PI) / 180)];
  return shape(id, Array.from({ length: metres / 10 + 1 }, (_, i) => [i * 10 * cos, from + i * 10 * sin]));
}

/** A shape running east, then turning left through a quarter circle so many metres across, with a point every 10 m. */
function curve(id: string, radius: number): Shape {
  const turn = Array.from({ length: Math.round((Math.PI * radius) / 20) + 1 }, (_, i): [number, number] => {
    const a = (i * 10) / radius;
    return [1000 + radius * Math.sin(a), radius - radius * Math.cos(a)];
  });
  return shape(id, [[0, 0], [500, 0], ...turn, [1000 + radius, radius + 500]]);
}

/** The shape run back the other way. */
function back(s: Shape): Shape {
  const end = s.dist.at(-1) ?? 0;
  return { id: `${s.id} back`, coords: s.coords.toReversed(), dist: s.dist.map((d) => end - d).toReversed() };
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

test('measures nothing amiss for Lines side by side on one track, each drawn once', () => {
  const found = measures({ shapes: [east('a', 2000), east('b', 2000)], strokes: [stroke('R2', 'a', 0, 2000, -0.5), stroke('R11', 'b', 0, 2000, 0.5)] });
  expect(found).toEqual({ breaks: { steps: 0, stubs: 0, swaps: 0, joins: 0 }, twice: 0, alone: 0, over: 0, folds: { 10: 0, 11: 0, 12: 0, 13: 0 } });
});

test('measures a Line drawn twice, where its two directions have tracks of their own and different sides', () => {
  // R4's way back runs 10 m north, from 1500 m back to 500 m, and each draws its own track.
  const home = shape('b', Array.from({ length: 101 }, (_, i) => [1500 - i * 10, 10]));
  const shapes = [east('a', 2000), home, east('c', 2000)];
  const twice = (side: number) => measures({ shapes, strokes: [stroke('R4', 'a', 0, 2000, -0.5), stroke('R4', 'b', 0, 1000, side), stroke('R1', 'c', 0, 2000, 0.5)] }).twice;
  // Drawn apart looking the same way, it shows twice; the other way round, its sides line up.
  expect(twice(-0.5)).toBeCloseTo(1000, -2);
  expect(twice(0.5)).toBe(0);
});

test('measures a Line drawn off a track it has alone', () => {
  // R3 runs beside R2's track for 1 km and 30 m from R14's for 2 km, then on alone for 1 km, still drawn off its track.
  const found = measures({
    shapes: [east('a', 3000), east('b', 1000), east('c', 2000, 0, 30)],
    strokes: [stroke('R3', 'a', 0, 2000, 0.5), stroke('R3', 'a', 2000, 3000, -1), stroke('R2', 'b', 0, 1000, -0.5), stroke('R14', 'c', 0, 2000, 1)],
  });
  expect(found.alone).toBeCloseTo(1000, -2);
});

test("measures Lines on one track drawn over each other, not Lines on tracks of their own", () => {
  const found = (b: Shape, side: number) => measures({ shapes: [east('a', 2000), b], strokes: [stroke('R2', 'a', 0, 2000, 0.5), stroke('R11', b.id, 0, b.dist.at(-1) ?? 0, side)] }).over;
  expect(found(east('b', 2000), 0.5)).toBeCloseTo(2000, -2);
  // R11 runs the track the other way, so it's on R2's side at its left.
  expect(found(back(east('b', 2000)), -0.5)).toBeCloseTo(2000, -2);
  expect(found(back(east('b', 2000)), 0.5)).toBe(0);
  expect(found(east('b', 2000, 0, 20), 0.5)).toBe(0);
});

test("doesn't count Lines changing places as drawn over each other where they change", () => {
  // Each has a point looked at 12.5 m along from its start and every 25 m on, so one half a metre before the change.
  const found = measures({
    shapes: [east('a', 2000), east('b', 2000)],
    strokes: [stroke('R2', 'a', 0, 1013, -0.5), stroke('R2', 'a', 1013, 2000, 0.5), stroke('R11', 'b', 0, 1013, 0.5), stroke('R11', 'b', 1013, 2000, -0.5)],
  });
  expect(found.over).toBe(0);
});

test('measures folds where a stroke is drawn inside a curve tighter than its offset, zoomed out', () => {
  const folds = (radius: number, side: number) => measures({ shapes: [curve('a', radius)], strokes: [stroke('R2', 'a', 0, curve('a', radius).dist.at(-1) ?? 0, side)] }).folds;
  // Three widths out, the offset is about 440 m at zoom 10 and 80 m at zoom 13.
  const tight = folds(300, -3);
  expect(tight[10]).toBeGreaterThan(0);
  expect(tight[13]).toBe(0);
  expect(folds(300, 3)).toEqual({ 10: 0, 11: 0, 12: 0, 13: 0 });
  expect(folds(3000, -3)).toEqual({ 10: 0, 11: 0, 12: 0, 13: 0 });
});
