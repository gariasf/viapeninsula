import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, test } from 'vitest';
import type { Bundle, Point, Shape, Slot, Track } from './bundle.ts';
import { sideBySide } from './build/sideBySide.ts';
import { metres } from './build/track.ts';
import { decodeTrack, encodeTrack, metres as piecesMetres, type Run, type StoredTrack } from './pieces.ts';

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

/** A Line along the shapes given, as the build makes them. */
const line = (id: string, shapes: string[]) => ({ id, network: 'n', name: id, colour: '#000', shapes, kind: 'commuter' as const });

test("stores a shape's slots, which run one after another along it, as a chain of lengths, sides and where they go", () => {
  const slots: Slot[] = [
    { line: 'R1', shape: 'A', from: 0, to: 300, side: 0.5, on: 'stretch:r:0', at: [0, 302] },
    { line: 'R1', shape: 'A', from: 300, to: 600, side: 0, on: 'stretch:r:1', at: [302, 598] },
    // The way back along its centreline, and on its band's own graph.
    { line: 'R1', shape: 'B', from: 0, to: 600, side: -0.5, on: 'stretch:r:1', at: [598, 0] },
    { line: 'R1', shape: 'A', from: 0, to: 600, side: 0, on: 'A', at: [0, 600], band: 1 },
    { line: 'R2', shape: 'A', from: 0, to: 600, side: 1.5, on: 'stretch:r:0', at: [0, 600] },
  ];
  const t = track([A, B], { lines: [line('R1', ['A', 'B']), line('R2', ['A'])], slots });
  const file = encodeTrack(t);
  expect(file).not.toHaveProperty('slots');
  expect(decodeTrack(file)).toEqual(t);
  // Each run: how its Line and shape's places moved on from the run before, its band, and where its first slot starts; then, for each
  // slot, its length, its side, how its centreline's place moved on, where it starts less where the one before ended, and how far it
  // goes: none says where it starts, as each follows the one before.
  expect((file as StoredTrack).chains).toEqual({
    on: ['stretch:r:0', 'stretch:r:1', 'A'],
    runs: [
      [0, 0, 0, 0, 300, 0.5, 0, 0, 302, 300, 0, 1, 0, 296],
      [0, 1, 0, 0, 600, -0.5, 1, 598, -598],
      [0, -1, 2, 0, 600, 0, 2, 0, 600],
      [1, 0, 0, 0, 600, 1.5, 0, 0, 600],
    ],
  });
});

test("starts a chain where its shape's first slot does, as one cut at the border keeps counting from where it began", () => {
  const cut = { ...A, id: 'cut', dist: A.dist.map((d) => d + 1603) };
  const slots: Slot[] = [
    { line: 'R1', shape: 'cut', from: 1603, to: 1903, side: 0, on: 'stretch:r:0', at: [10, 310] },
    { line: 'R1', shape: 'cut', from: 1903, to: 2203, side: 0, on: 'stretch:r:0', at: [310, 610] },
  ];
  const t = track([cut], { lines: [line('R1', ['cut'])], slots });
  const file = encodeTrack(t) as StoredTrack;
  expect(file.chains?.runs).toEqual([[0, 0, 0, 1603, 300, 0, 0, 10, 300, 300, 0, 0, 0, 300]]);
  expect(decodeTrack(file)).toEqual(t);
});

test("keeps the slots whole where one doesn't follow the one before, or they name a Line or shape the track hasn't", () => {
  const gap: Slot[] = [
    { line: 'R1', shape: 'A', from: 0, to: 300, side: 0, on: 'stretch:r:0', at: [0, 300] },
    { line: 'R1', shape: 'A', from: 400, to: 600, side: 0, on: 'stretch:r:0', at: [400, 600] },
  ];
  const t = track([A], { lines: [line('R1', ['A'])], slots: gap });
  expect(encodeTrack(t)).toHaveProperty('slots', gap);
  expect(decodeTrack(encodeTrack(t))).toEqual(t);
  const lost: Slot[] = [{ line: 'R9', shape: 'A', from: 0, to: 600, side: 0, on: 'stretch:r:0', at: [0, 600] }];
  const u = track([A], { lines: [line('R1', ['A'])], slots: lost });
  expect(encodeTrack(u)).toHaveProperty('slots', lost);
  expect(decodeTrack(encodeTrack(u))).toEqual(u);
});

test('gives back a track with no traced shapes, and a Line with no slots', () => {
  const none = track([], { lines: [line('R1', [])] });
  expect(decodeTrack(encodeTrack(none))).toEqual(none);
  const stretch: Shape = { id: 'stretch:catalonia:0', coords: [at(0, 0), at(600, 0)], dist: [0, 600] };
  const only = track([stretch], { lines: [line('R1', [])] });
  expect(decodeTrack(encodeTrack(only))).toEqual(only);
  // A Line none of whose shapes has a slot is no run of any.
  const some = track([A], { lines: [line('R1', ['A']), line('R2', [])], slots: [{ line: 'R1', shape: 'A', from: 0, to: 600, side: 0, on: 'stretch:r:0', at: [0, 600] }] });
  expect(decodeTrack(encodeTrack(some))).toEqual(some);
});

test('reads a track built before it as it is', () => {
  const old = track([A, B], { lines: [line('R1', ['A', 'B'])] });
  expect(decodeTrack(old)).toBe(old);
});

// What production built, kept for the engine's tests: Rodalies' shapes of 25 September, Lines drawn by
// the build of 7 October with their levels, and Renfe's long-distance runs of 10 October.
const recorded = (name: string): Bundle => (JSON.parse(gunzipSync(readFileSync(new URL(`fixtures/replay-${name}.json.gz`, import.meta.url))).toString()) as { bundle: Bundle }).bundle;

/** What the map reads of a file once it has been written and fetched: as JSON, where a slot's -0 is 0. */
const written = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

test("gives back a real Network's shapes, point for point and metre for metre, from a third of their points where its :back shapes run its others' track", () => {
  const points = (list: Shape[]) => list.reduce((sum, s) => sum + s.coords.length, 0);
  for (const [name, most] of [['2026-09-25', 0.4], ['2026-10-07', 1], ['2026-10-10-long-distance', 1.01]] as const) {
    const { shapes } = recorded(name);
    const t = track(shapes);
    const file = written(encodeTrack(t)) as StoredTrack;
    expect(decodeTrack(file)).toEqual(written(t));
    // Each piece's points, counted as the numbers that make them: two for each.
    expect(file.traced.pieces.reduce((sum, p) => sum + p.length / 2, 0)).toBeLessThan(most * points(shapes));
  }
}, 60_000);

test("gives back the slots a Network's Lines are drawn with, as the build makes them", async () => {
  // The Lines round Madrid-Atocha Cercanías on 9 Oct 2026 (build/fixtures/atocha.json).
  const { lines, shapes } = JSON.parse(readFileSync(new URL('build/fixtures/atocha.json', import.meta.url), 'utf8')) as Pick<Track, 'lines' | 'shapes'>;
  const { slots, centrelines, strokes, rails, tracks } = await sideBySide(lines, shapes, 'cercanias-madrid');
  const t: Track = { networks: [], lines, stations: [], shapes: [...shapes, ...centrelines], strokes, rails, slots, tracks };
  expect(slots.length).toBeGreaterThan(0);
  const file = encodeTrack(t);
  expect(file).toHaveProperty('chains');
  expect(decodeTrack(written(file))).toEqual(written(t));
}, 60_000);

test("works out a great-circle length as the build does, to the last bit, since a shape's distances are a rounded sum of them", () => {
  // A deterministic spread of pairs of points across Spain, 0 to 600 km apart.
  let seed = 257;
  const next = () => (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31;
  for (let i = 0; i < 5000; i++) {
    const a: Point = [-9 + next() * 13, 36 + next() * 8];
    const b: Point = [a[0] + (next() - 0.5) * 8, a[1] + (next() - 0.5) * 5];
    expect(piecesMetres(a, b)).toBe(metres(a, b));
    // And either way round, as a piece run backwards is summed.
    expect(piecesMetres(b, a)).toBe(piecesMetres(a, b));
  }
});
