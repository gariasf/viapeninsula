import { expect, test } from 'vitest';
import type { Point, Shape, Slot, Track } from './bundle.ts';
import { metres } from './build/track.ts';
import { decodeTrack, encodeTrack, type StoredTrack } from './pieces.ts';

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
