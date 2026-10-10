import { expect, test } from 'vitest';
import type { Point, Shape, Slot, Track } from './bundle.ts';
import { metres } from './build/track.ts';
import { decodeTrack, encodeTrack, type Run, type StoredTrack } from './pieces.ts';

// Hand-drawn track, in metres east (x) and north (y) of a spot in Barcelona, on the 6-decimal grid the
// build writes its shapes' points on.
const at = (x: number, y: number): Point => [Math.round((2.17 + x / 83_500) * 1e6) / 1e6, Math.round((41.39 + y / 111_195) * 1e6) / 1e6];

/** A shape as the build writes it: the distance at each point is the rounded running sum of the great-circle lengths before it. */
function shape(id: string, coords: Point[], levels?: Shape['levels']): Shape {
  let along = 0;
  const dist = coords.map((p, i) => Math.round((along += i ? metres(coords[i - 1] ?? p, p) : 0)));
  return { id, coords, dist, ...(levels && { levels }) };
}

/** A track of just these shapes, and Lines and slots if given, as the build writes one. */
const track = (shapes: Shape[], rest: Partial<Track> = {}): Track => ({ networks: [], lines: [], stations: [], shapes, strokes: [], rails: [], slots: [], tracks: [], ...rest });

/** What the file stores of the traced shapes. */
const stored = (t: Track) => (encodeTrack(t) as StoredTrack).traced;

// A main line m0 to m6, 100 m apart; a side track that joins it at m3.
const main = [0, 1, 2, 3, 4, 5, 6].map((i) => at(i * 100, 0));
const A = shape('A', main);
const B = shape('B', [at(100, 120), at(200, 60), ...main.slice(3)]);

test('stores the track shapes share once, and each shape as a list of the pieces it runs, between junctions and shape ends', () => {
  const t = track([A, B]);
  const { pieces, shapes } = stored(t);
  // m0 to m3, m3 to m6, and the side track's run onto m3: three pieces, not the 13 points of A and B.
  expect(pieces).toHaveLength(3);
  expect(shapes.map((s) => ('pieces' in s ? s.pieces : undefined))).toEqual([[1, 2], [3, 2]]);
  // The file's shapes are the build's, point for point and metre for metre.
  expect(decodeTrack(encodeTrack(t))).toEqual(t);
});

test('runs a piece backwards where a shape does, in its list as a negative number', () => {
  const back = shape('A:back', main.toReversed());
  const t = track([A, back, B]);
  expect(stored(t).shapes.map((s) => ('pieces' in s ? s.pieces : undefined))).toEqual([[1, 2], [-2, -1], [3, 2]]);
  expect(decodeTrack(encodeTrack(t))).toEqual(t);
});

test("ends a piece where a shape turns back, though no other shape's track branches there", () => {
  // Out to m2 and back to m0, along the track A runs, which A passes through at m2 without a branch.
  const turns = shape('turns', [main[0], main[1], main[2], main[1], main[0]].filter((p): p is Point => !!p));
  const t = track([A, turns]);
  expect(stored(t).shapes.map((s) => ('pieces' in s ? s.pieces : undefined))).toEqual([[1, 2], [1, -1]]);
  expect(decodeTrack(encodeTrack(t))).toEqual(t);
});

test('stores a loop from a point back to itself as one piece, run either way round', () => {
  const ring = [at(0, 500), at(100, 600), at(200, 500), at(100, 400), at(0, 500)];
  const round = shape('round', ring);
  const other = shape('other', ring.toReversed());
  const t = track([round, other]);
  expect(stored(t).pieces).toHaveLength(1);
  expect(stored(t).shapes.map((s) => ('pieces' in s ? s.pieces : undefined))).toEqual([[1], [-1]]);
  expect(decodeTrack(encodeTrack(t))).toEqual(t);
});

/** The runs a file stores its shapes as, by ID, for what's stored beside their pieces. */
const runs = (t: Track) => new Map(stored(t).shapes.flatMap((s): [string, Run][] => ('pieces' in s ? [[s.id, s]] : [])));

test("lists the places a shape's distances are a metre off the rounded sum of its points' lengths, as the build's come from points the file has rounded", () => {
  const off = { ...A, dist: A.dist.map((d, i) => (i === 3 ? d + 1 : d)) };
  const t = track([off]);
  // One fix: three points on from the start, one more.
  expect(runs(t).get('A')?.fixes).toEqual([3, 1]);
  expect(decodeTrack(encodeTrack(t))).toEqual(t);
  // A shape with none lists none.
  expect(runs(track([A])).get('A')).not.toHaveProperty('fixes');
});

test("gives a shape's distances whole where it doesn't start at 0, as one cut at the border keeps counting from where it began", () => {
  const cut = { ...B, dist: B.dist.map((d, i) => d + 1603 + (i % 2)) };
  const t = track([A, cut]);
  expect(runs(t).get('B')).toHaveProperty('dist');
  expect(runs(t).get('B')).not.toHaveProperty('fixes');
  // Its points are still the pieces' it shares with A.
  expect(runs(t).get('B')?.pieces).toEqual([3, 2]);
  expect(decodeTrack(encodeTrack(t))).toEqual(t);
});

test("keeps a shape's levels as the vertices they start at, and whole where one starts between two", () => {
  const tunnel = shape('tunnel', main, [[300, 'tunnel -1'], [500, '']]);
  const t = track([tunnel]);
  expect(runs(t).get('tunnel')).not.toHaveProperty('levels');
  expect(runs(t).get('tunnel')).toHaveProperty('levelsAt');
  expect(decodeTrack(encodeTrack(t))).toEqual(t);
  const between = shape('between', main, [[250, 'bridge 1']]);
  const u = track([between]);
  expect(runs(u).get('between')?.levels).toEqual([[250, 'bridge 1']]);
  expect(decodeTrack(encodeTrack(u))).toEqual(u);
});

test("keeps whole a shape whose points aren't on the file's grid, or that is a single point", () => {
  const fine: Shape = { id: 'fine', coords: [[2.1700001234, 41.39], [2.171, 41.3912345678]], dist: [0, 134] };
  const single: Shape = { id: 'single', coords: [at(0, 0)], dist: [0] };
  const t = track([A, fine, single]);
  expect(stored(t).shapes.map((s) => 'pieces' in s)).toEqual([true, false, false]);
  expect(decodeTrack(encodeTrack(t))).toEqual(t);
});

test('keeps the order of the traced shapes, and the centrelines and curves after them as they were', () => {
  const stretch: Shape = { id: 'stretch:catalonia:0', coords: [at(0, 0), at(600, 0)], dist: [0, 600] };
  const t = track([B, A, stretch]);
  const file = encodeTrack(t);
  expect(file.shapes).toEqual([stretch]);
  expect(decodeTrack(file).shapes.map((s) => s.id)).toEqual(['B', 'A', 'stretch:catalonia:0']);
});
