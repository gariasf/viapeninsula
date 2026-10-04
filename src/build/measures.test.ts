import { expect, test } from 'vitest';
import { BANDS, GRAPH_BAND, LINK, STRETCH, type Line, type Shape, type Stroke } from '../bundle.ts';
import { breaks, measures } from './measures.ts';
import { room, type Front } from './sideBySide.ts';

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

/** At each zoom in BANDS: n on the line graph from GRAPH_BAND on, 0 on the bands' own below it, which these strokes aren't on. */
const every = (n: number) => Object.fromEntries(BANDS.map((zoom, band) => [zoom, band >= GRAPH_BAND ? n : 0]));
const none = every(0);

test('counts nothing for Lines drawn in one stroke each', () => {
  expect(breaks([stroke('R2', 'a', 0, 2000, -0.5), stroke('R11', 'b', 0, 2000, 0.5)], [east('a', 2000), east('b', 2000)])).toEqual({ steps: 0, stubs: 0, swaps: 0, joins: 0 });
});

test('measures a stroke cut where it goes into a tunnel as the one stroke it is drawn as (#178)', () => {
  const tunnel = [stroke('R2', 'a', 0, 1990, 0.5), { ...stroke('R2', 'a', 1990, 2010, 0.5), under: 1 }, stroke('R2', 'a', 2010, 4000, 0.5)];
  expect(measures({ shapes: [east('a', 4000)], strokes: tunnel }).breaks.stubs).toBe(0);
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
  const zero = Object.fromEntries(BANDS.map((zoom) => [zoom, 0]));
  expect(found).toEqual({ breaks: { steps: 0, stubs: 0, swaps: 0, joins: 0 }, twice: 0, alone: 0, over: 0, folds: zero, covered: zero, dangling: 0, kinks: zero, weaves: zero, inside: zero, largest: Object.fromEntries(BANDS.map((zoom) => [zoom, []])) });
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

test("measures, in each band, Lines drawn over each other on tracks too close together to tell apart there", () => {
  // R11's track runs 60 m north of R2's, and each is drawn on its own: half a line width is 74 m at zoom 10, 42 m at zoom 11.
  const found = (strokes: Stroke[]) => measures({ shapes: [east('a', 2000), east('b', 2000, 0, 60)], strokes }).covered;
  const own = [stroke('R2', 'a', 0, 2000, 0), stroke('R11', 'b', 0, 2000, 0)];
  expect(found(own)[10]).toBeCloseTo(2000, -2);
  expect(found(own)[11]).toBe(0);
  // Drawn side by side, a line width apart, between their tracks, they aren't.
  expect(found([stroke('R2', 'a', 0, 2000, 0.5), stroke('R11', 'a', 0, 2000, -0.5)])).toEqual(none);
  // On zoom 9's own graph, only there.
  expect(found(own.map((s) => ({ ...s, band: BANDS.indexOf(9) })))).toEqual({ ...none, 9: 2000 });
});

test('measures folds where a stroke is drawn inside a curve tighter than its offset, zoomed out', () => {
  const folds = (radius: number, side: number) => measures({ shapes: [curve('a', radius)], strokes: [stroke('R2', 'a', 0, curve('a', radius).dist.at(-1) ?? 0, side)] }).folds;
  // Three widths out, the offset is about 440 m at zoom 10 and 80 m at zoom 13.
  const tight = folds(300, -3);
  expect(tight[10]).toBeGreaterThan(0);
  expect(tight[13]).toBe(0);
  expect(folds(300, 3)).toEqual(none);
  expect(folds(3000, -3)).toEqual(none);
});

test("counts a Line's stroke ends left loose, away from its other strokes and its terminus", () => {
  // R2's track runs east for 2 km. It's drawn along it for 1 km, then along a stretch's centreline
  // 40 m north of it to the end.
  const shapes = [east('a', 2000), shape(`${STRETCH}0`, [[1000, 40], [2000, 40]])];
  const found = (joined: boolean) =>
    measures({
      shapes: joined ? [...shapes, shape(`${LINK}0`, [[1000, 0], [1000, 40]])] : shapes,
      strokes: [stroke('R2', 'a', 0, 1000, 0), stroke('R2', `${STRETCH}0`, 0, 1000, 0), ...(joined ? [stroke('R2', `${LINK}0`, 0, 40, 0)] : [])],
    });
  expect(found(false).dangling).toBe(2);
  expect(found(true).dangling).toBe(0);
  // A link isn't a break, however short.
  expect(found(true).breaks).toEqual(found(false).breaks);
});

/** A bundle leaving a node at a point, in metres east and north, so many degrees north of east, for 2 km, as wide as so many Lines side by side. */
function front(at: [number, number], north: number, lines: number, change = 0): Front {
  const [cos, sin] = [Math.cos((north * Math.PI) / 180), Math.sin((north * Math.PI) / 180)];
  return { points: Array.from({ length: 201 }, (_, i) => [at[0] + i * 10 * cos, at[1] + i * 10 * sin]), left: lines / 2, right: lines / 2, change };
}

test("gives a node's fronts the room their curves need, or to clear each other's bundles", () => {
  // Across a junction at right angles, a front clears the other bundle half its width on; straight
  // through, at once.
  const [junction] = room([front([0, 0], 0, 2), front([0, 0], 90, 3)], 100);
  expect(junction).toBeCloseTo(150, -1);
  expect(room([front([0, 0], 0, 2), front([0, 0], 180, 2)], 100)[0]).toBeLessThan(1);
  // A Line moving over two widths on a curve takes four on each side.
  expect(room([front([0, 0], 0, 2, 2), front([0, 0], 180, 2, 2)], 100)).toEqual([400, 400]);
  // Bundles parting at 10° clear each other where they're as far apart as they're wide, about 1.1 km on.
  const [fork] = room([front([0, 0], 0, 1), front([0, 0], 10, 1)], 100);
  expect(fork).toBeGreaterThan(500);
  expect(fork).toBeLessThan(1200);
  // Bundles that part at 10° and then run side by side, 300 m apart, still overlapping, clear each other only as far as they part, about 1.7 km on (#196).
  const tan = Math.tan((10 * Math.PI) / 180);
  const parting: Front = { points: Array.from({ length: 201 }, (_, i): [number, number] => [i * 10, Math.min(300, i * 10 * tan)]), left: 2, right: 2, change: 0 };
  const [parted] = room([front([0, 0], 0, 4), parting], 100);
  expect(parted).toBeGreaterThan(1600);
  expect(parted).toBeLessThan(1800);
});

/** A curve across a node in each band from GRAPH_BAND on, from `start` to `end` metres along shape 'a', where R2 moves over from one side to another. */
function curves(start: number, end: number, side: number, ease: number): Stroke[] {
  return BANDS.flatMap((_, band) => (band < GRAPH_BAND ? [] : [{ ...stroke('R2', `${LINK}0`, 0, end - start, side), ease, band, across: [['a', start, (start + end) / 2], ['a', (start + end) / 2, end]] as Stroke['across'] }]));
}

test('counts curves too short for how far their Line moves over as kinks, in each band', () => {
  const kinks = (start: number, end: number) =>
    measures({
      shapes: [east('a', 4000), east(`${LINK}0`, end - start)],
      strokes: [stroke('R2', 'a', 0, start, 0), ...curves(start, end, 0, 1), stroke('R2', 'a', end, 4000, 1)],
    }).kinks;
  // A curve over a line width is 4 widths long: 105 m at zoom 13, 188 m at zoom 12, 590 m at zoom 10.
  expect(kinks(1000, 1020)).toEqual(every(1));
  expect(kinks(1000, 1200)).toEqual({ ...none, 10: 1, 11: 1 });
  expect(kinks(1000, 1700)).toEqual(none);
});

test("counts a Line's stroke shorter than the room the nodes at its ends need, where it changes side there, as a weave", () => {
  // R2 steps out a line width and back, on a stroke so many metres long; or, staying put, R11 runs alongside.
  const weaves = (long: number, ease = 1) => {
    const [a, b] = [1000, 1000 + 100 + long];
    const back = curves(b - 50, b + 50, ease, 0).map((c) => ({ ...c, shape: `${LINK}1` }));
    return measures({
      shapes: [east('a', 8000), east(`${LINK}0`, 100), east(`${LINK}1`, 100)],
      strokes: [
        stroke('R2', 'a', 0, a + 50, 0),
        ...curves(a, a + 100, 0, ease).map((c) => ({ ...c, across: [['a', a, a + 50], ['a', a + 50, a + 100]] as Stroke['across'] })),
        stroke('R2', 'a', a + 50, b, ease),
        ...back,
        stroke('R2', 'a', b, 8000, 0),
        stroke('R11', 'a', 0, 8000, -1),
      ],
    }).weaves;
  };
  // Each node takes 2 widths each way: a stroke needs 56 m at zoom 14, 105 m at zoom 13, 188 m at zoom 12, 336 m at zoom 11, 590 m at zoom 10.
  expect(weaves(50)).toEqual({ ...every(1), 14: 0 });
  expect(weaves(200)).toEqual({ ...none, 10: 1, 11: 1 });
  expect(weaves(3000)).toEqual(none);
  expect(weaves(50, 0)).toEqual(none);
});

test('measures metres of curve drawn further off its own track than at its ends, only for the Lines given', () => {
  // R2's track runs east, and its curve swings so many metres north of it halfway.
  const inside = (north: number, lines: Line[] = [{ id: 'R2', network: 'r', name: 'R2', colour: '#000', shapes: ['own'], kind: 'commuter' }]) => {
    const swing = shape(`${LINK}0`, Array.from({ length: 21 }, (_, i) => [1000 + i * 10, north * Math.sin((Math.PI * i) / 20)]));
    return measures({
      shapes: [east('own', 4000), east('a', 4000), swing],
      strokes: [stroke('R2', 'a', 0, 1000, 0), ...curves(1000, 1200, 0, 0).map((c) => ({ ...c, to: swing.dist.at(-1) ?? 0 })), stroke('R2', 'a', 1200, 4000, 0)],
      lines,
    }).inside;
  };
  const far = inside(400);
  expect(far[13]).toBeGreaterThan(100);
  expect(far[10]).toBeGreaterThan(100);
  expect(far[13]).toBeGreaterThan(far[10] ?? 0);
  // Half a line width at zoom 13 is 13 m, and at zoom 10, 74 m.
  expect(inside(40)[13]).toBeGreaterThan(0);
  expect(inside(40)[10]).toBe(0);
  expect(inside(0)).toEqual(none);
  expect(inside(400, [])).toEqual(none);
});
