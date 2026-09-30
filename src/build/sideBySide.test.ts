import { expect, test } from 'vitest';
import { along, APART, atZoom, BANDS, beside, inBand, LINK, pieces, pixelMetres, pointAt, SMOOTH, type Line, type Shape, type Stroke } from '../bundle.ts';
import { measures } from './measures.ts';
import { sideBySide } from './sideBySide.ts';

// Track drawn in metres east (x) and north (y) of a point in Barcelona.
const M = (6_371_008.8 * Math.PI) / 180; // metres in a degree of latitude
const LON = 2.17;
const LAT = 41.39;
const COS = Math.cos((LAT * Math.PI) / 180);

/** A shape through corners given in metres, with a point every 10 m between them. */
const shape = (id: string, ...corners: [x: number, y: number][]) => shapeEvery(10, id, corners);

/** A shape with points at its corners only, as OpenStreetMap maps a long straight. */
const straight = (id: string, ...corners: [x: number, y: number][]) => shapeEvery(Infinity, id, corners);

/** A shape through corners given in metres, with a point about every so many metres between them, rounded as the build rounds them. */
function shapeEvery(every: number, id: string, corners: [x: number, y: number][]): Shape {
  const points: [number, number][] = corners.slice(0, 1);
  for (const [i, [x, y]] of corners.entries()) {
    const [px, py] = corners[i - 1] ?? [x, y];
    const n = i === 0 ? 0 : Math.max(1, Math.round(Math.hypot(x - px, y - py) / every));
    for (let k = 1; k <= n; k++) points.push([px + ((x - px) * k) / n, py + ((y - py) * k) / n]);
  }
  let along = 0;
  const dist = points.map(([x, y], i) => {
    const [px, py] = points[i - 1] ?? [x, y];
    along += Math.hypot(x - px, y - py);
    return Math.round(along);
  });
  const round = (degrees: number) => Math.round(degrees * 1e5) / 1e5;
  return { id, coords: points.map(([x, y]) => [round(LON + x / (M * COS)), round(LAT + y / M)]), dist };
}

const line = (name: string, ...shapes: string[]): Line => ({ id: name, network: 'rodalies', name, colour: '#000', shapes });

async function draw(lines: Line[], shapes: Shape[], on: 'strokes' | 'rails' = 'strokes') {
  const found = await sideBySide(lines, shapes);
  // Without the links between strokes, which only join them up.
  const drawn = found[on].filter((s) => !s.shape.startsWith(LINK));
  const byId = new Map([...shapes, ...found.centrelines].map((s) => [s.id, s]));
  /** A Line's strokes: their points in metres east and north, and how far north of its track each is drawn. */
  const placed = (name: string) =>
    drawn
      .filter((s) => s.line === name)
      .map((s) => {
        const shape = byId.get(s.shape);
        const points = (shape ? along(shape, s.from, s.to) : []).map(([lon, lat]) => [(lon - LON) * M * COS, (lat - LAT) * M] as const);
        const [from = NaN, to = NaN] = [points[0]?.[0], points.at(-1)?.[0]].map((x) => Math.round(x ?? NaN));
        // A stroke is drawn to the right of the way it runs: south when it runs east.
        return from < to ? { from, to, points, north: -s.side + 0 } : { from: to, to: from, points, north: s.side + 0 };
      });
  /** A Line's strokes, each as the metres it covers from west to east and how far north of its track it's drawn. */
  const strokes = (name: string) => placed(name).map(({ from, to, north }) => ({ from, to, north }));
  /** How far north each of a Line's strokes' own line is, in metres, at its ends: its track or its stretch's centreline. */
  const at = (name: string) => placed(name).map(({ points }) => [points[0], points.at(-1)].map((p) => Math.round(p?.[1] ?? NaN)));
  /** How far north of its track a Line is drawn at x metres east, on its track nearest y metres north. */
  const north = (name: string, x: number, y = 0) =>
    placed(name)
      .flatMap((s) =>
        s.points.slice(1).flatMap(([bx, by], i) => {
          const [ax = NaN, ay = NaN] = s.points[i] ?? [];
          if ((ax - x) * (bx - x) > 0 || ax === bx) return [];
          return [{ north: s.north, off: Math.abs(ay + ((by - ay) * (x - ax)) / (bx - ax) - y) }];
        }),
      )
      .sort((a, b) => a.off - b.off)[0]?.north;
  return { strokes, north, at };
}

test('draws a Line on track of its own as one stroke on its track, for both its directions', async () => {
  const { strokes } = await draw([line('R3', 'R3', 'R3_INV')], [shape('R3', [0, 0], [5000, 0]), shape('R3_INV', [5000, 0], [0, 0])]);
  expect(strokes('R3')).toEqual([{ from: 0, to: 5000, north: 0 }]);
});

test('draws Lines that share track side by side, a line width apart', async () => {
  const { strokes } = await draw(
    [line('R2', 'R2'), line('R11', 'R11'), line('R14', 'R14')],
    [shape('R2', [0, 0], [5000, 0]), shape('R11', [0, 0], [5000, 0]), shape('R14', [0, 0], [5000, 0])],
  );
  const drawn = ['R2', 'R11', 'R14'].flatMap(strokes);
  expect(drawn.map(({ from, to }) => [from, to])).toEqual([[0, 5000], [0, 5000], [0, 5000]]);
  expect(drawn.map((s) => s.north).sort((a, b) => a - b)).toEqual([-1, 0, 1]);
});

test('keeps Lines that run the track opposite ways on their sides, where another joins', async () => {
  // R2 runs east and R11 west; R14, which joins them halfway, runs west too.
  const { north } = await draw(
    [line('R14', 'R14'), line('R2', 'R2'), line('R11', 'R11')],
    [shape('R2', [0, 0], [5000, 0]), shape('R11', [5000, 0], [0, 0]), shape('R14', [5000, 0], [2500, 0])],
  );
  const [before, after] = [1000, 4000].map((x) => Math.sign((north('R2', x) ?? NaN) - (north('R11', x) ?? NaN)));
  expect(Math.abs(before ?? 0)).toBe(1);
  expect(after).toBe(before);
});

test('draws Lines on tracks too close to tell apart zoomed out side by side too, however many tracks there are', async () => {
  // As between L'Hospitalet and Sants: R4 is 40 m from R2's track and R1 40 m beyond, 80 m from R2.
  const { strokes } = await draw(
    [line('R2', 'R2'), line('R4', 'R4'), line('R1', 'R1')],
    [shape('R2', [0, 0], [5000, 0]), shape('R4', [0, 40], [5000, 40]), shape('R1', [0, 80], [5000, 80])],
  );
  expect(['R2', 'R4', 'R1'].flatMap(strokes).map((s) => s.north).sort((a, b) => a - b)).toEqual([-1, 0, 1]);
});

test('puts each Line on the side it branches off to, so that none crosses the others there', async () => {
  // As at El Clot: R2 carries straight on, R11 turns off north and R14 south.
  const { north } = await draw(
    [line('R14', 'R14'), line('R2', 'R2'), line('R11', 'R11')],
    [shape('R2', [0, 0], [8000, 0]), shape('R11', [0, 0], [5000, 0], [8000, 1500]), shape('R14', [0, 0], [5000, 0], [8000, -1500])],
  );
  expect(['R11', 'R2', 'R14'].map((name) => north(name, 2500))).toEqual([1, 0, -1]);
});

test("doesn't shift a Line over where another's track only brushes past it", async () => {
  // R1 comes within 45 m of R2's track for under 100 m, then heads off again.
  const { strokes } = await draw(
    [line('R2', 'R2'), line('R1', 'R1')],
    [shape('R2', [0, 0], [5000, 0]), shape('R1', [1000, 400], [2400, 35], [3800, 400])],
  );
  expect(strokes('R2')).toEqual([{ from: 0, to: 5000, north: 0 }]);
  expect(strokes('R1').map((s) => s.north)).toEqual([0]);
});

test.for(['R4', 'R7'])("draws a Line's two directions once, between their tracks, where each has a track of a double track (%s first)", async (first) => {
  // R4 runs east on the south track and back west on the north one, and R7 shares the south one.
  const [r4, r7] = [line('R4', 'R4', 'R4_INV'), line('R7', 'R7')];
  const { strokes, at } = await draw(
    first === 'R4' ? [r4, r7] : [r7, r4],
    [shape('R4', [0, 0], [5000, 0]), shape('R4_INV', [5000, 20], [0, 20]), shape('R7', [0, 0], [5000, 0])],
  );
  const sides = [...strokes('R4'), ...strokes('R7')].map((s) => s.north);
  expect(strokes('R4')).toHaveLength(1);
  expect(sides.sort((a = 0, b = 0) => a - b)).toEqual([-0.5, 0.5]);
  expect([...at('R4'), ...at('R7')]).toEqual([[10, 10], [10, 10]]);
});

test('draws Lines on tracks side by side along one line between their tracks', async () => {
  const { strokes, at } = await draw([line('R2', 'R2'), line('R11', 'R11')], [shape('R2', [0, 0], [5000, 0]), shape('R11', [5000, 40], [0, 40])]);
  expect([...strokes('R2'), ...strokes('R11')].map((s) => [s.from, s.to, s.north])).toEqual([[0, 5000, -0.5], [0, 5000, 0.5]]);
  expect([...at('R2'), ...at('R11')]).toEqual([[20, 20], [20, 20]]);
});

test('zoomed right in, draws each Line on its own track, once', async () => {
  const { strokes, at } = await draw(
    [line('R4', 'R4', 'R4_INV'), line('R7', 'R7')],
    [shape('R4', [0, 0], [5000, 0]), shape('R4_INV', [5000, 20], [0, 20]), shape('R7', [0, 0], [5000, 0])],
    'rails',
  );
  expect([...strokes('R4'), ...strokes('R7')].map(({ from, to }) => [from, to])).toEqual([[0, 5000], [0, 5000], [0, 5000]]);
  expect([...at('R4'), ...at('R7')].sort()).toEqual([[0, 0], [0, 0], [20, 20]]);
});

test('keeps Lines on their sides along a long straight, whichever way each runs it', async () => {
  // As in the Aragó tunnel, one straight 1.25 km segment: R2 runs it east, R11 west, and R14, which
  // turns off partway along it, east.
  const { north } = await draw(
    [line('R2', 'R2'), line('R11', 'R11'), line('R14', 'R14')],
    [straight('R2', [0, 0], [1250, 0]), straight('R11', [1250, 0], [0, 0]), shape('R14', [0, 0], [600, 0], [1250, -300])],
  );
  const at = (x: number, ...names: string[]) => names.map((name) => north(name, x)).sort((a = 0, b = 0) => a - b);
  expect(at(100, 'R2', 'R11', 'R14')).toEqual([-1, 0, 1]);
  expect(at(1100, 'R2', 'R11')).toEqual([-0.5, 0.5]);
  expect(Math.sign((north('R2', 100) ?? NaN) - (north('R11', 100) ?? NaN))).toBe(Math.sign((north('R2', 1100) ?? NaN) - (north('R11', 1100) ?? NaN)));
});

test('keeps Lines where they are while another runs past them the other way, and sides it with them where it joins their track', async () => {
  // R4 shares R2S's and R14's track east for 4 km, turns off north and loops round. It comes back
  // west along a track of its own 20 m north of theirs, as R1 and R4 run past the Lines for Estació
  // de França, then joins their track to its terminus, as R13 does into Lleida: under 4 km in all,
  // so there it runs the other way to them.
  const { north } = await draw(
    [line('R4', 'R4'), line('R2S', 'R2S'), line('R14', 'R14')],
    [
      shape('R2S', [0, 0], [12000, 0]),
      shape('R14', [0, 0], [12000, 0]),
      shape('R4', [0, 0], [4000, 0], [5000, 1000], [11000, 1000], [10000, 20], [9000, 20], [8800, 0], [7000, 0]),
    ],
  );
  // Passing on its own track, R4 keeps to it and R2S and R14 keep their places.
  expect([north('R4', 9500, 20), north('R2S', 9500), north('R14', 9500)]).toEqual([0, north('R2S', 11500), north('R14', 11500)]);
  // On their track, it goes on the side it came from, and they keep their order.
  const order = (x: number) => Math.sign((north('R2S', x) ?? NaN) - (north('R14', x) ?? NaN));
  expect([order(2000), order(8000)]).toEqual([order(11500), order(11500)]);
  expect(north('R4', 8000)).toBeGreaterThan(Math.max(north('R2S', 8000) ?? NaN, north('R14', 8000) ?? NaN));
});

test("gives each of a Line's shapes the side its stroke is drawn at all along it, though a stroke draws their track once", async () => {
  // R2 and R11 share track; R2's Trains run it back on R2_INV, which isn't drawn again.
  const shapes = [shape('R2', [0, 0], [5000, 0]), shape('R2_INV', [5000, 0], [0, 0]), shape('R11', [0, 0], [5000, 0])];
  const { rails: strokes, sides } = await sideBySide([line('R2', 'R2', 'R2_INV'), line('R11', 'R11')], shapes);
  expect(strokes.map((s) => s.shape)).toEqual(['R2', 'R11']);
  const side = (id: string) => sides.filter((s) => s.shape === id).map(({ line, from, to, side }) => ({ line, from, to, side }));
  const [r2] = side('R2');
  expect(r2).toEqual({ line: 'R2', from: 0, to: 5000, side: strokes[0]?.side });
  // Running back the other way, the same side of the track is the other side of the shape.
  expect(side('R2_INV')).toEqual([{ line: 'R2', from: 0, to: 5000, side: -(r2?.side ?? NaN) }]);
  expect(side('R11')).toEqual([{ line: 'R11', from: 0, to: 5000, side: strokes[1]?.side }]);
});

test('moves the Lines on a stretch over together, at the one place where another joins them', async () => {
  // R2 and R11 share track east; R14 comes in from the north and joins them halfway.
  const { strokes } = await draw(
    [line('R2', 'R2'), line('R11', 'R11'), line('R14', 'R14')],
    [shape('R2', [0, 0], [5000, 0]), shape('R11', [0, 0], [5000, 0]), shape('R14', [1000, 1500], [2500, 0], [5000, 0])],
  );
  const steps = ['R2', 'R11'].map((name) => strokes(name).slice(1).map((s) => s.from));
  expect(steps.map((s) => s.length)).toEqual([1, 1]);
  expect(steps[0]).toEqual(steps[1]);
  expect(Math.abs((steps[0]?.[0] ?? NaN) - 2500)).toBeLessThanOrEqual(50);
});

test("doesn't move the Lines on a stretch over where another runs along their track for under SHORT", async () => {
  // R14 crosses R2's and R11's track, sharing it for 100 m.
  const { strokes } = await draw(
    [line('R2', 'R2'), line('R11', 'R11'), line('R14', 'R14')],
    [shape('R2', [0, 0], [5000, 0]), shape('R11', [0, 0], [5000, 0]), shape('R14', [1000, 1500], [2450, 0], [2550, 0], [4000, -1500])],
  );
  expect(['R2', 'R11'].map((name) => strokes(name).map(({ from, to }) => [from, to]))).toEqual([[[0, 5000]], [[0, 5000]]]);
});

test('keeps a Line at one side where it steps off a stretch for under SHORT and back', async () => {
  // R11 shares R2's track but for a 100 m loop 60 m off it.
  const { strokes } = await draw(
    [line('R2', 'R2'), line('R11', 'R11')],
    [shape('R2', [0, 0], [5000, 0]), shape('R11', [0, 0], [2450, 0], [2450, 60], [2550, 60], [2550, 0], [5000, 0])],
  );
  expect(strokes('R2')).toEqual([{ from: 0, to: 5000, north: strokes('R2')[0]?.north }]);
  expect(new Set(strokes('R11').filter((s) => s.to - s.from > 1000).map((s) => s.north)).size).toBe(1);
  expect(Math.abs(strokes('R2')[0]?.north ?? 0)).toBe(0.5);
});

test('puts two Lines in each Stretch in the order that suits it, where the order that suits one crosses them on another', async () => {
  // A and B leave their first Stretch, A to the north-east and B to the south-east, and come back
  // together on their second, A from the south-west and B from the north-west, crossing tracks on
  // the way. So on the first A is north of B, and on the second south, crossing nowhere.
  const { north } = await draw(
    [line('A', 'A'), line('B', 'B')],
    [
      shape('A', [0, 0], [5000, 0], [7000, 2000], [12000, 2000], [14000, -3000], [18000, -3000], [20000, 0], [25000, 0]),
      shape('B', [0, 0], [5000, 0], [7000, -2000], [12000, -2000], [14000, 3000], [18000, 3000], [20000, 0], [25000, 0]),
    ],
  );
  const aNorth = (x: number) => Math.sign((north('A', x) ?? NaN) - (north('B', x) ?? NaN));
  expect([1000, 4000, 21000, 24000].map(aNorth)).toEqual([1, 1, -1, -1]);
});

test('joins a Line up where it leaves a stretch for a track of its own, leaving no loose ends', async () => {
  // R2 and R11 are drawn between their tracks, 40 m apart, for 2.5 km; then R2 goes on alone.
  const shapes = [shape('R2', [0, 0], [5000, 0]), shape('R11', [2500, 40], [0, 40])];
  const { strokes, centrelines } = await sideBySide([line('R2', 'R2'), line('R11', 'R11')], shapes);
  expect(strokes.some((s) => s.line === 'R2' && s.shape.startsWith(LINK))).toBe(true);
  expect(measures({ shapes: [...shapes, ...centrelines], strokes }).dangling).toBe(0);
});

test('curves a Line from its side on one Stretch to its side on the next, in each zoom band, the further it moves over the longer', async () => {
  // R2 and R11 are drawn between their tracks, 40 m apart, for 2.5 km; then R2 goes on alone.
  const shapes = [shape('R2', [0, 0], [5000, 0]), shape('R11', [2500, 40], [0, 40])];
  const { strokes, centrelines } = await sideBySide([line('R2', 'R2'), line('R11', 'R11')], shapes);
  const byId = new Map([...shapes, ...centrelines].map((s) => [s.id, s]));
  const lengths = BANDS.map((zoom, band) => {
    const px = pixelMetres(zoom, LAT);
    const width = atZoom(APART, zoom) * px;
    // Where a stroke is drawn at an end, in metres east and north, at the band's zoom.
    const at = (s: Stroke, d: number): [number, number] => {
      const [lon, lat] = beside(inBand(byId, s.shape, band) ?? { coords: [], dist: [] }, d, s.side * width);
      return [(lon - LON) * M * COS, (lat - LAT) * M];
    };
    const edges = strokes.filter((s) => s.line === 'R2' && !s.shape.startsWith(LINK));
    const ends = edges.flatMap((s) => [at(s, s.from + (s.cut?.[band]?.[0] ?? 0)), at(s, s.to - (s.cut?.[band]?.[1] ?? 0))]);
    const curve = strokes.filter((s) => s.line === 'R2' && s.shape.startsWith(LINK) && s.band === band).flatMap(pieces);
    const [first, last] = [curve[0], curve.at(-1)];
    if (!first || !last) return NaN;
    // Its ends meet the strokes it joins, within a quarter of a pixel, wherever the Line is drawn at that zoom.
    for (const p of [at(first, first.from), at(last, last.to)]) {
      expect(Math.min(...ends.map((e) => Math.hypot(e[0] - p[0], e[1] - p[1])))).toBeLessThan(px / 4);
    }
    return last.to - first.from;
  });
  // A line width is further on the ground zoomed out, so the curve is longer there.
  expect(lengths.every((l, i) => l > (lengths[i + 1] ?? 0))).toBe(true);
});

test('ends Lines that end together at one point across their Stretch', async () => {
  // A and B share track to a terminus; B's track stops 100 m short of A's.
  const { strokes } = await draw([line('A', 'A'), line('B', 'B')], [shape('A', [0, 0], [5000, 0]), shape('B', [0, 0], [4900, 0])]);
  expect([...strokes('A'), ...strokes('B')].map((s) => s.to)).toEqual([5000, 5000]);
});

test('smooths each centreline for each zoom band where Lines drawn off it would fold, moving it at most a line width', async () => {
  // Four Lines share track round a quarter circle 150 m across: 1.5 line widths off it is about 220 m at zoom 10.
  const turn = Array.from({ length: 25 }, (_, i): [number, number] => [1000 + 150 * Math.sin((i * Math.PI) / 48), 150 - 150 * Math.cos((i * Math.PI) / 48)]);
  const track = (id: string) => shape(id, [0, 0], ...turn, [1150, 1150]);
  const names = ['R1', 'R2', 'R3', 'R4'];
  const shapes = names.map(track);
  const { strokes, centrelines } = await sideBySide(names.map((n) => line(n, n)), shapes);
  expect(measures({ shapes: [...shapes, ...centrelines], strokes }).folds).toEqual({ 10: 0, 11: 0, 12: 0, 13: 0 });
  // Each band's centreline stays within a line width of the Stretch's own, which its Trains are placed by.
  const byId = new Map(centrelines.map((c) => [c.id, c]));
  const smoothed = BANDS.flatMap((zoom, band) => centrelines.filter((c) => c.id.endsWith(`${SMOOTH}${band}`)).map((c) => ({ c, width: atZoom(APART, zoom) * pixelMetres(zoom, LAT) })));
  expect(smoothed.length).toBeGreaterThan(0);
  for (const { c, width } of smoothed) {
    const own = byId.get(c.id.slice(0, c.id.lastIndexOf(SMOOTH))) ?? { coords: [], dist: [] };
    for (const [i, [lon, lat]] of c.coords.entries()) {
      const [x, y] = pointAt(own, c.dist[i] ?? 0);
      // Give or take a metre, for rounding its points.
      expect(Math.hypot((lon - x) * M * COS, (lat - y) * M)).toBeLessThanOrEqual(width + 1);
    }
  }
});
