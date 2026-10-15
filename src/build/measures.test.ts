import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { BANDS, cutIn, GRAPH_BAND, LINK, STRETCH, type Line, type Shape, type Stroke, type Track } from '../bundle.ts';
import { breaks, measures, offTrack, reported, summary, turnBack, type Measures } from './measures.ts';
import { collect, comment, diff, type Spot } from './report.ts';
import { room, sideBySide, type Front } from './sideBySide.ts';

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

test("measures a stroke a node hides, which a tunnel cuts, as the one stroke it's drawn as, and doesn't count its end as loose (#386)", async () => {
  // C8's stroke by Ablaña (43.2671, -5.8057) on 10 Oct 2026 (fixtures/ablana.json): 314 m along one
  // Stretch, hidden by a node at every zoom from 10 to 14, which a tunnel cuts at 189 m. split() gives
  // each piece the part of the cut that's in it, the whole of each, so that joined it's cut whole.
  const { lines, shapes } = JSON.parse(readFileSync(new URL('fixtures/ablana.json', import.meta.url), 'utf8')) as Pick<Track, 'lines' | 'shapes'>;
  const { strokes, centrelines } = await sideBySide(lines, shapes);
  const tunnel = strokes.find((s) => s.line === 'cercanias-asturias:C8' && s.under && s.band === undefined && !s.shape.startsWith(LINK));
  const rest = strokes.find((s) => s.line === tunnel?.line && s.shape === tunnel.shape && s.from === tunnel.to && s.band === undefined);
  if (!tunnel?.cut || !rest) throw new Error('No C8 stroke cut by a tunnel in fixtures/ablana.json');
  expect([tunnel.from, tunnel.to, rest.to]).toEqual([0, 189, 314]);
  for (let band = GRAPH_BAND; band < BANDS.length; band++) expect([cutIn(tunnel, band), cutIn(rest, band)]).toEqual([[189, 0], [125, 0]]);
  // The same strokes with it in one piece, cut whole.
  const whole: Stroke = { line: tunnel.line, shape: tunnel.shape, from: 0, to: 314, side: tunnel.side, cut: tunnel.cut.map(() => [314, 0]) };
  const joined = strokes.filter((s) => s !== rest).map((s) => (s === tunnel ? whole : s));
  const found = (drawn: Stroke[]) => measures({ shapes: [...shapes, ...centrelines], strokes: drawn, lines });
  expect(found(strokes)).toEqual(found(joined));
});

/** R2 on 4 km of R11's track, in the pieces a tunnel cuts it into, each cut back in every band of the line graph as given: how many metres of the two are drawn over each other at zoom 10. */
const covered = (pieces: [from: number, to: number, start: number, end: number, under?: number][]) => {
  const strokes = pieces.map(([from, to, start, end, under]): Stroke => ({ ...stroke('R2', 'a', from, to, 0), ...(under && { under }), cut: BANDS.flatMap((_, band) => (band < GRAPH_BAND ? [] : [[start, end] as [number, number]])) }));
  return measures({ shapes: [east('a', 4000), east('b', 4000)], strokes: [stroke('R11', 'b', 0, 4000, 0), ...strokes] }).covered[10];
};

test('measures a stroke as drawn from where its cuts leave it, where a cut runs over a piece a tunnel cuts into the next (#386)', () => {
  // R2 is drawn along 4 km of R11's track, 700 m of it cut off, at its start or at its end. The tunnel is
  // 300 m of it there, so that split() gives the 300 m piece the cut's first 300 m, and the next piece the
  // other 400 m. Where the two are drawn over each other, 3300 m, each is found from both and halved.
  expect(covered([[0, 300, 300, 0, 1], [300, 4000, 400, 0]])).toBeCloseTo(3300, -2);
  expect(covered([[0, 3700, 0, 400], [3700, 4000, 0, 300, 1]])).toBeCloseTo(3300, -2);
});

test('measures a stroke as drawn from where its first piece that is drawn begins to where its last one ends, whichever of its pieces its cuts leave (#386)', () => {
  // Every piece drawn, a tunnel of 300 m in the middle of the 4 km, 100 m cut off at each end: from 100 m to 3900 m.
  expect(covered([[0, 2000, 100, 0], [2000, 2300, 0, 0, 1], [2300, 4000, 0, 100]])).toBeCloseTo(3800, -2);
  // Tunnels of 300 m at each end, 700 m cut off at each: only the piece between is drawn, from 700 m to 3300 m.
  expect(covered([[0, 300, 300, 0, 1], [300, 3700, 400, 400], [3700, 4000, 0, 300, 1]])).toBeCloseTo(2600, -2);
  // 1500 m cut off at its start and 2500 m at its end is all of it: no piece is drawn, though the first piece's
  // start cut and the last piece's end cut alone leave 800 m of it, from 1500 m to 2300 m.
  expect(covered([[0, 2000, 1500, 500], [2000, 2300, 0, 300, 1], [2300, 4000, 0, 1700]])).toBe(0);
});

test("measures a stroke that follows one with no cut as drawn to where its own cut ends it, and one cut before one with none as drawn to the end of the second, a stroke having no `cut` where no band cuts it (#540)", () => {
  // R2 along 4 km of R11's track in two strokes: sideBySide() gives a stroke a `cut` only where some band cuts it, so Madrid's C4a
  // has one with none, and one after it cut at its end, on its Stretch.
  const cut = (start: number, end: number): Pick<Stroke, 'cut'> => ({ cut: BANDS.flatMap((_, band) => (band < GRAPH_BAND ? [] : [[start, end] as [number, number]])) });
  const drawn = (...strokes: Stroke[]) => measures({ shapes: [east('a', 4000), east('b', 4000)], strokes: [stroke('R11', 'b', 0, 4000, 0), ...strokes] }).covered[10];
  // None, then 500 m cut off at its end: drawn from 0 to 3500 m, not to 4000.
  expect(drawn(stroke('R2', 'a', 0, 2000, 0), { ...stroke('R2', 'a', 2000, 4000, 0), ...cut(0, 500) })).toBeCloseTo(3500, -2);
  // 300 m cut off at its start, then none: drawn from 300 m to 4000.
  expect(drawn({ ...stroke('R2', 'a', 0, 2000, 0), ...cut(300, 0) }, stroke('R2', 'a', 2000, 4000, 0))).toBeCloseTo(3700, -2);
  // 400 m cut off at the end of the first, then none: the joined stroke ends where the second does, 4000 m, not at its cut's 3600.
  expect(drawn({ ...stroke('R2', 'a', 0, 2000, 0), ...cut(0, 400) }, stroke('R2', 'a', 2000, 4000, 0))).toBeCloseTo(4000, -2);
  // A first piece with none that the second's cut is longer than, 400 m of 300: not the whole of it cut off.
  expect(drawn(stroke('R2', 'a', 0, 300, 0), { ...stroke('R2', 'a', 300, 4000, 0), ...cut(0, 400) })).toBeCloseTo(3600, -2);
  // None either side is as drawn.
  expect(drawn(stroke('R2', 'a', 0, 2000, 0), stroke('R2', 'a', 2000, 4000, 0))).toBeCloseTo(4000, -2);
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
  expect(found).toEqual({ breaks: { steps: 0, stubs: 0, swaps: 0, joins: 0 }, twice: 0, alone: 0, over: 0, folds: zero, covered: zero, dangling: 0, kinks: zero, weaves: zero, hidden: zero, wiggles: zero, hairpins: zero, inside: zero, largest: Object.fromEntries(BANDS.map((zoom) => [zoom, []])), curves: [] });
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

test("doesn't count Lines of one Network and one colour as over each other or covered, as they lie on each other on purpose (#303)", () => {
  // C4a and a second Line, each on its own shape of one track, drawn on each other: C4b in C4a's colour
  // written in lower case, as lanes() compares colours without case (#283), or in a colour of its own,
  // or another Network's.
  const found = (network: string, colour: string) =>
    measures({
      shapes: [east('a', 2000), east('b', 2000)],
      strokes: [stroke('C4a', 'a', 0, 2000, 0.5), stroke('C4b', 'b', 0, 2000, 0.5)],
      lines: [
        { id: 'C4a', network: 'cercanias-madrid', name: 'C4a', colour: '#2C2A86', shapes: ['a'], kind: 'commuter' },
        { id: 'C4b', network, name: 'C4b', colour, shapes: ['b'], kind: 'commuter' },
      ],
    });
  const apart = found('cercanias-madrid', '#9E1B80');
  expect(apart.over).toBeCloseTo(2000, -2);
  expect(apart.covered).toEqual(every(2000));
  expect(found('rodalies', '#2C2A86')).toEqual(apart);
  expect(found('cercanias-madrid', '#2c2a86')).toEqual({ ...apart, over: 0, covered: none });
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

test("counts the far end of a stub as loose where the curve it goes on along is nearer than LOOSE, as the Francolí's was (#353)", () => {
  // R2's stroke along its track is cut to 14 m, 1 km in, and goes on across a curve from there, 14 m east
  // of the stub's start: it's 14 m from the curve, but nothing else of the Line is near it.
  const link = shape(`${LINK}0`, [[1014, 0], [1150, 0], [1300, 0]]);
  const found = measures({
    shapes: [east('a', 4000), link],
    strokes: [stroke('R2', 'a', 1000, 1014, 0), { ...stroke('R2', link.id, 0, link.dist.at(-1) ?? 0, 0), band: BANDS.indexOf(14) }, stroke('R2', 'a', 1300, 4000, 0)],
  });
  expect(found.dangling).toBe(1);
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

test('counts the strokes still drawn along a Stretch a node absorbed, where a curve takes over a stroke of its own Line, as hidden (#708)', () => {
  // R2 crosses the node from 'a' along 'b', 40 m, onto 'c' on one curve; R11's stroke along 'b' is cut whole, or still drawn.
  const hidden = (cut: [number, number]) =>
    measures({
      shapes: [east('a', 1000), east('b', 40), east('c', 1000), east(`${LINK}0`, 100)],
      strokes: [
        stroke('R2', 'a', 0, 1000, 0),
        { ...stroke('R2', 'b', 0, 40, 0), cut: BANDS.map(() => [40, 0]) },
        ...BANDS.map((_, band): Stroke => ({ ...stroke('R2', `${LINK}0`, 0, 100, 0), band, across: [['a', 970, 1000], ['b', 0, 40], ['c', 0, 30]] })),
        stroke('R2', 'c', 0, 1000, 0),
        { ...stroke('R11', 'b', 0, 40, 1), cut: BANDS.map(() => cut) },
      ],
    }).hidden;
  expect(hidden([0, 0])).toEqual(every(1));
  expect(hidden([40, 0])).toEqual(none);
  // Or with no curve along it, as where every way of its Lines passes it by.
  const alone = measures({ shapes: [east('b', 40)], strokes: [{ ...stroke('R2', 'b', 0, 40, 0), cut: BANDS.map(() => [40, 0]) }, stroke('R11', 'b', 0, 40, 1)] }).hidden;
  expect(alone).toEqual(every(1));
});

/**
 * R2 drawn along 'a' up to 1000 m east, across a node on a curve through points, in each band from
 * GRAPH_BAND on, and on along 'b', which runs east so many metres north, from where the curve ends.
 */
function crossing(points: [number, number][], north = 0, ease = 0, line = 'R2', [lon, lat]: [number, number] = [2.17, 41.39]): Measures {
  const link = shape(`${LINK}0`, points);
  const [x = 0] = points.at(-1) ?? [];
  const across: Stroke['across'] = [['a', 1000, 1000 + x / 2], ['b', x / 2, x]];
  // Drawn from another point than Barcelona's, where given.
  const moved = (s: Shape): Shape => ({ ...s, coords: s.coords.map(([x, y]) => [x - 2.17 + lon, y - 41.39 + lat]) });
  return measures({
    shapes: [east('a', 4000), east('b', 4000, 0, north), link].map(moved),
    strokes: [
      stroke(line, 'a', 0, 1000, 0),
      ...BANDS.flatMap((_, band) => (band < GRAPH_BAND ? [] : [{ ...stroke(line, link.id, 0, link.dist.at(-1) ?? 0, 0), ease, band, across }])),
      stroke(line, 'b', x, 4000, ease),
    ],
  });
}

const wiggles = (points: [number, number][], north = 0, ease = 0) => crossing(points, north, ease).wiggles;

/** Points every 10 m along a line through corners, in metres east and north. */
function through(...corners: [number, number][]): [number, number][] {
  return corners.flatMap(([x, y], i) => {
    const [px, py] = corners[i - 1] ?? [x, y];
    const n = i ? Math.max(1, Math.round(Math.hypot(x - px, y - py) / 10)) : 1;
    return Array.from({ length: i ? n : 1 }, (_, k): [number, number] => (i ? [px + ((x - px) * (k + 1)) / n, py + ((y - py) * (k + 1)) / n] : [x, y]));
  });
}

test('counts a curve that turns and turns back within a few line widths as a wiggle, in each band where it shows (#206)', () => {
  // R2 steps 20 m north on a curve, at 45°: sharp at zoom 13, where a line width is 26 m, but not at zoom 12, 47 m.
  expect(wiggles(through([1000, 0], [1020, 0], [1040, 20], [1100, 20]), 20)).toEqual({ ...none, 13: 1, 14: 1 });
  // Moving over a line width on a curve as long as LENGTH widths at zoom 10 eases it over, and doesn't wiggle.
  expect(wiggles(through([1000, 0], [1600, 0]), 0, 1)).toEqual(none);
});

test("counts a curve that meets the stroke it comes onto heading off it as a wiggle, as L1's south of Auditori (#206)", () => {
  // R2's curve bends south-east onto 'b', 20 m south, but 'b' goes on east from its end: it hooks there.
  expect(wiggles(through([1000, 0], [1040, 0], [1060, -20]), -20)).toEqual({ ...none, 13: 1, 14: 1 });
  // Easing onto 'b' over 200 m, coming onto it the way it runs, it doesn't.
  const eased = Array.from({ length: 21 }, (_, i): [number, number] => [1000 + i * 10, -20 * (3 * (i / 20) ** 2 - 2 * (i / 20) ** 3)]);
  expect(wiggles(eased, -20)).toEqual(none);
});

test('counts a curve that turns back on itself as a wiggle (#206)', () => {
  // R2's curve loops round a circle 40 m across, and goes on east.
  const loop = Array.from({ length: 13 }, (_, i): [number, number] => [1000 + 20 * Math.sin((i * Math.PI) / 6), 20 - 20 * Math.cos((i * Math.PI) / 6)]);
  expect(wiggles([...loop, ...through([1000, 0], [1100, 0]).slice(1)])[14]).toBe(1);
});

test('counts a curve whose ends head opposite ways as a hairpin, in each band it is drawn in, but not a curve that turns less (#353)', () => {
  // R2's curve runs east, turns back and runs west 20 m north, as the Francolí's did at Tarragona.
  const hairpins = (...corners: [number, number][]) => crossing(through(...corners)).hairpins;
  expect(hairpins([1000, 0], [1060, 0], [1060, 20], [1000, 20])).toEqual(every(1));
  // Turning three quarters of the way back, 135°, is one too; a right angle, or a branch at 45°, is not.
  expect(hairpins([1000, 0], [1060, 0], [1020, 40])).toEqual(every(1));
  expect(hairpins([1000, 0], [1060, 0], [1060, 60])).toEqual(none);
  expect(hairpins([1000, 0], [1060, 0], [1100, 40])).toEqual(none);
});

test("counts a hairpin where its Line's own Trains turn back as a turn-back, not a hairpin, by its Line and how far from where they do, and reports it with why (#622)", () => {
  // The hairpin above, its middle 6 m from Ermua's Station, for E1, whose short workings from Eibar end and start
  // there, and for FCC, whose Trains go on round the town's loop.
  const ermua = (line: string) => crossing(through([1000, 0], [1060, 0], [1060, 20], [1000, 20]), 0, 0, line, [-2.50103 - 1060 / kx, 43.18524]);
  expect(ermua('euskotren:FCC').hairpins).toEqual(every(1));
  const named = ermua('euskotren:E1');
  expect(named.hairpins).toEqual(none);
  const spots = reported(named, summary(named)).filter((s) => s.kind === 'turnback');
  expect(spots.map((s) => [s.zoom, s.line, s.text[0]?.slice(0, 26)])).toEqual(BANDS.flatMap((zoom, band) => (band < GRAPH_BAND ? [] : [[zoom, 'euskotren:E1', "Ermua: E1's short workings"]])));
  // The others, by their Lines, as far from their Stations as the curves there are: Santiago's 305 m, L'Aldea's 611 m.
  const at = (line: string, lon: number, lat: number) => turnBack(line, [lon, lat]) !== undefined;
  expect(['AVE', 'Alvia', 'Avlo', 'Intercity'].map((name) => at(`ave-larga-distancia:${name}`, -8.5477, 42.8692))).toEqual([true, true, true, false]);
  expect([at('media-distancia-avant:MD', -3.2049, 39.3957), at('media-distancia-avant:MD', -3.2059, 39.3957), at('media-distancia-avant:Regional', -3.2049, 39.3957)]).toEqual([true, true, false]);
  expect([at('media-distancia-avant:Reg.Exp.', 0.6077, 40.7513), at('media-distancia-avant:Avant Exp', 0.6077, 40.7513), at('media-distancia-avant:Reg.Exp.', 0.6077, 40.73)]).toEqual([true, false, false]);
});

test("doesn't count the rounding of a curve's ends as turning it back (#353)", () => {
  // The curve starts with a metre stepped back west, as the track's points round to a metre, and goes on east.
  expect(crossing([[1000, 0], [999, 0], [1040, 0], [1100, 0]]).hairpins).toEqual(none);
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

test("finds how far a point is from a Line's own track as looking at each of its segments would, where its nearest segment lies in the last of its segments and a box round the first lies nearer (#262)", () => {
  // A track that spirals in 50 times round the points, from 5 km out to 100 m, 100 points a turn.
  const track = Array.from({ length: 5001 }, (_, k): [number, number] => [(5000 - 0.98 * k) * Math.cos(k * 0.0628), (5000 - 0.98 * k) * Math.sin(k * 0.0628)]);
  const each = ([x, y]: [number, number]) =>
    Math.min(...track.slice(1).map(([bx, by], k) => {
      const [ax, ay] = track[k] ?? [0, 0];
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
      return Math.hypot(ax + t * (bx - ax) - x, ay + t * (by - ay) - y);
    }));
  const off = offTrack(track);
  for (const p of [[0, 0], [30, 20], [-40, 70], [2500, 0], [6000, 6000]] as [number, number][]) expect(off(p)).toBeCloseTo(each(p), 6);
});

test('reports the measures as one spot with each of their numbers, in metres, and a spot for each of the largest nodes, each with its line of the log', () => {
  const found: Measures = {
    breaks: { steps: 181, stubs: 29, swaps: 6, joins: 20 },
    twice: 3412.5,
    alone: 100,
    over: 1062.5,
    folds: { 7: 3, 8: 0 },
    covered: { 7: 271712.5, 8: 201800 },
    dangling: 30,
    kinks: { 7: 0, 8: 1 },
    weaves: { 7: 2, 8: 0 },
    hidden: { 7: 1, 8: 0 },
    wiggles: { 7: 0, 8: 1 },
    hairpins: { 7: 2, 8: 0 },
    inside: { 7: 9395, 8: 14055.5 },
    largest: { 7: [{ size: 15.1, at: [-3.67716, 40.45778] }], 8: [{ size: 24.5, at: [-3.6773, 40.45782] }, { size: 19.1, at: [2.15024, 41.38278] }] },
    curves: [],
  };
  const [first, seven, eight] = `Lines drawn: ${summary(found)}`.split('\n').map((line) => line.trim());
  expect([seven, eight]).toEqual([
    'largest nodes at zoom 7, in line widths: 15.1 at 40.45778,-3.67716',
    'largest nodes at zoom 8, in line widths: 24.5 at 40.45782,-3.67730, 19.1 at 41.38278,2.15024',
  ]);
  const report = collect();
  for (const f of reported(found, `Lines drawn: ${summary(found)}`)) report.add(f);
  expect(report.spots()).toEqual([
    {
      kind: 'measures',
      key: 'measures',
      text: [first],
      numbers: {
        breaks: 236,
        steps: 181,
        stubs: 29,
        swaps: 6,
        joins: 20,
        twice: 3413,
        alone: 100,
        over: 1063,
        dangling: 30,
        'folds 7': 3,
        'folds 8': 0,
        'covered 7': 271713,
        'covered 8': 201800,
        'kinks 7': 0,
        'kinks 8': 1,
        'weaves 7': 2,
        'weaves 8': 0,
        'hidden 7': 1,
        'hidden 8': 0,
        'wiggles 7': 0,
        'wiggles 8': 1,
        'hairpins 7': 2,
        'hairpins 8': 0,
        'inside 7': 9395,
        'inside 8': 14056,
      },
    },
    { kind: 'node', key: 'node 7 40.458 -3.677', point: [-3.67716, 40.45778], zoom: 7, text: [seven], numbers: { size: 15.1 } },
    { kind: 'node', key: 'node 8 40.458 -3.677', point: [-3.6773, 40.45782], zoom: 8, text: [eight], numbers: { size: 24.5 } },
    { kind: 'node', key: 'node 8 41.383 2.150', point: [2.15024, 41.38278], zoom: 8, text: [eight], numbers: { size: 19.1 } },
  ]);
});

/** The curves that wiggle and the hairpins of a fixture's Lines as sideBySide() draws them, as the report's spots, and the measures. */
async function curveSpots(name: string): Promise<{ spots: Spot[]; found: Measures }> {
  const { lines, shapes } = JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8')) as Pick<Track, 'lines' | 'shapes'>;
  const { strokes, centrelines } = await sideBySide(lines, shapes);
  const found = measures({ shapes: [...shapes, ...centrelines], strokes, lines });
  const report = collect();
  for (const f of reported(found, `Lines drawn: ${summary(found)}`)) report.add(f);
  return { spots: report.spots().filter((s) => s.kind === 'wiggle' || s.kind === 'hairpin'), found };
}

test("reports each curve that wiggles as a spot of its own, keyed by its zoom, its middle and its Line, with how far its chain steps aside, never a problem spot, as R1's at Auditori (#520)", async () => {
  // L1, R1 and R4 round Auditori/Teatre Nacional on 6 Oct 2026 (fixtures/auditori.json): one curve wiggles, R1's at
  // zoom 12, where it changes side along the one Stretch, so its chain steps nowhere aside.
  const { spots, found } = await curveSpots('auditori');
  expect(found.wiggles).toEqual({ ...Object.fromEntries(BANDS.map((zoom) => [zoom, 0])), 12: 1 });
  expect(spots).toEqual([{ kind: 'wiggle', key: 'wiggle 12 41.395 2.185 rodalies:R1', line: 'rodalies:R1', point: [2.18505, 41.39485], zoom: 12, text: [], numbers: { aside: 0 } }]);
  // The Build report issue hears of none, but the run's summary shows one that comes or goes.
  expect(comment(undefined, spots, 'run')).toBeUndefined();
  expect(diff(spots, [])).toContain('#### Gone\n\n- `wiggle 12 41.395 2.185 rodalies:R1` · [map](https://viapeninsula.gariasf.com/#map=12/41.39485/2.18505&mark=41.39485,2.18505)');
});

test("reports each hairpin as a spot too, as C10's south of Madrid-Atocha at zoom 7 and 8, with how far each curve's chain steps aside, as C3's to C5's 1.6 line widths at zoom 13 (#520, #385)", async () => {
  // The Lines round Madrid-Atocha Cercanías on 9 Oct 2026 (fixtures/atocha.json). From `stretch:2` at zoom 13, the
  // chain of C3, C4, C4a, C4b and C5 steps 41 m aside onto `stretch:3`, which the node absorbs (#385).
  const { spots, found } = await curveSpots('atocha');
  expect([found.wiggles, found.hairpins]).toEqual([
    { 7: 0, 8: 0, 9: 1, 10: 0, 11: 0, 12: 0, 13: 6, 14: 0 },
    { 7: 1, 8: 1, 9: 0, 10: 0, 11: 0, 12: 0, 13: 0, 14: 0 },
  ]);
  expect(spots.map(({ key, numbers }) => [key, numbers?.aside])).toEqual([
    ['hairpin 7 40.403 -3.687 cercanias-madrid:C10', 0],
    ['hairpin 8 40.401 -3.683 cercanias-madrid:C10', 0],
    ['wiggle 13 40.401 -3.683 cercanias-madrid:C3', 1.6],
    ['wiggle 13 40.401 -3.683 cercanias-madrid:C4', 1.6],
    ['wiggle 13 40.401 -3.683 cercanias-madrid:C4a', 1.6],
    ['wiggle 13 40.401 -3.683 cercanias-madrid:C4b', 1.6],
    ['wiggle 13 40.401 -3.683 cercanias-madrid:C5', 1.6],
    ['wiggle 13 40.402 -3.684 cercanias-madrid:C10', 0],
    ['wiggle 9 40.404 -3.688 cercanias-madrid:C10', 0],
  ]);
});

test('measures Lines the same whichever shape comes first in the track, however far off (#277)', () => {
  // R2 moves over a line width on a curve 190 m long, a kink at zooms 10 and 11; R11's and R14's
  // tracks run 43.5 m apart, each drawn on its own, over each other at zoom 10 but not at zoom 11, where
  // half a line width is 42 m; and R3's strokes end 19 m apart, not loose. C1's track is in Cádiz.
  const shapes = [east('a', 4000), east(`${LINK}0`, 190), east('b', 2000, 0, 3000), east('c', 2000, 0, 3043.5), east('d', 3000, 0, 6000)];
  const strokes = [
    stroke('R2', 'a', 0, 1000, 0),
    ...curves(1000, 1190, 0, 1),
    stroke('R2', 'a', 1190, 4000, 1),
    stroke('R11', 'b', 0, 2000, 0),
    stroke('R14', 'c', 0, 2000, 0),
    stroke('R3', 'd', 0, 1000, 0),
    stroke('R3', 'd', 1019, 3000, 0),
  ];
  const cadiz: Shape = { id: 'C1', coords: [[-6.29, 36.53], [-6.19, 36.53]], dist: [0, 8935] };
  expect(measures({ shapes: [cadiz, ...shapes], strokes })).toEqual(measures({ shapes, strokes }));
});
