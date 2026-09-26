import { expect, test } from 'vitest';
import { along, type Line, type Shape } from '../bundle.ts';
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

function draw(lines: Line[], shapes: Shape[]) {
  const { strokes: drawn } = sideBySide(lines, shapes);
  const byId = new Map(shapes.map((s) => [s.id, s]));
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
  return { strokes, north };
}

test('draws a Line on track of its own as one stroke on its track, for both its directions', () => {
  const { strokes } = draw([line('R3', 'R3', 'R3_INV')], [shape('R3', [0, 0], [5000, 0]), shape('R3_INV', [5000, 0], [0, 0])]);
  expect(strokes('R3')).toEqual([{ from: 0, to: 5000, north: 0 }]);
});

test('draws Lines that share track side by side, a line width apart', () => {
  const { strokes } = draw(
    [line('R2', 'R2'), line('R11', 'R11'), line('R14', 'R14')],
    [shape('R2', [0, 0], [5000, 0]), shape('R11', [0, 0], [5000, 0]), shape('R14', [0, 0], [5000, 0])],
  );
  const drawn = ['R2', 'R11', 'R14'].flatMap(strokes);
  expect(drawn.map(({ from, to }) => [from, to])).toEqual([[0, 5000], [0, 5000], [0, 5000]]);
  expect(drawn.map((s) => s.north).sort((a, b) => a - b)).toEqual([-1, 0, 1]);
});

test('keeps Lines that run the track opposite ways on their sides, where another joins', () => {
  // R2 runs east and R11 west; R14, which joins them halfway, runs west too.
  const { north } = draw(
    [line('R14', 'R14'), line('R2', 'R2'), line('R11', 'R11')],
    [shape('R2', [0, 0], [5000, 0]), shape('R11', [5000, 0], [0, 0]), shape('R14', [5000, 0], [2500, 0])],
  );
  const [before, after] = [1000, 4000].map((x) => Math.sign((north('R2', x) ?? NaN) - (north('R11', x) ?? NaN)));
  expect(Math.abs(before ?? 0)).toBe(1);
  expect(after).toBe(before);
});

test('draws Lines on tracks too close to tell apart zoomed out side by side too, however many tracks there are', () => {
  // As between L'Hospitalet and Sants: R4 is 40 m from R2's track and R1 40 m beyond, 80 m from R2.
  const { strokes } = draw(
    [line('R2', 'R2'), line('R4', 'R4'), line('R1', 'R1')],
    [shape('R2', [0, 0], [5000, 0]), shape('R4', [0, 40], [5000, 40]), shape('R1', [0, 80], [5000, 80])],
  );
  expect(['R2', 'R4', 'R1'].flatMap(strokes).map((s) => s.north).sort((a, b) => a - b)).toEqual([-1, 0, 1]);
});

test('puts each Line on the side it branches off to, so that none crosses the others there', () => {
  // As at El Clot: R2 carries straight on, R11 turns off north and R14 south.
  const { north } = draw(
    [line('R14', 'R14'), line('R2', 'R2'), line('R11', 'R11')],
    [shape('R2', [0, 0], [8000, 0]), shape('R11', [0, 0], [5000, 0], [8000, 1500]), shape('R14', [0, 0], [5000, 0], [8000, -1500])],
  );
  expect(['R11', 'R2', 'R14'].map((name) => north(name, 2500))).toEqual([1, 0, -1]);
});

test("doesn't shift a Line over where another's track only brushes past it", () => {
  // R1 comes within 45 m of R2's track for under 100 m, then heads off again.
  const { strokes } = draw(
    [line('R2', 'R2'), line('R1', 'R1')],
    [shape('R2', [0, 0], [5000, 0]), shape('R1', [1000, 400], [2400, 35], [3800, 400])],
  );
  expect(strokes('R2')).toEqual([{ from: 0, to: 5000, north: 0 }]);
  expect(strokes('R1').map((s) => s.north)).toEqual([0]);
});

test.for(['R4', 'R7'])("draws a Line's two directions as one where each has a track of a double track (%s first)", (first) => {
  // R4 runs east on the south track and back west on the north one, and R7 shares the south one.
  const [r4, r7] = [line('R4', 'R4', 'R4_INV'), line('R7', 'R7')];
  const { strokes } = draw(
    first === 'R4' ? [r4, r7] : [r7, r4],
    [shape('R4', [0, 0], [5000, 0]), shape('R4_INV', [5000, 5], [0, 5]), shape('R7', [0, 0], [5000, 0])],
  );
  const sides = strokes('R4').map((s) => s.north);
  expect(sides).toEqual([sides[0], sides[0]]);
  expect([sides[0], strokes('R7')[0]?.north].sort((a = 0, b = 0) => a - b)).toEqual([-0.5, 0.5]);
});

test('keeps Lines on their sides along a long straight, whichever way each runs it', () => {
  // As in the Aragó tunnel, one straight 1.25 km segment: R2 runs it east, R11 west, and R14, which
  // turns off partway along it, east.
  const { north } = draw(
    [line('R2', 'R2'), line('R11', 'R11'), line('R14', 'R14')],
    [straight('R2', [0, 0], [1250, 0]), straight('R11', [1250, 0], [0, 0]), shape('R14', [0, 0], [600, 0], [1250, -300])],
  );
  const at = (x: number, ...names: string[]) => names.map((name) => north(name, x)).sort((a = 0, b = 0) => a - b);
  expect(at(100, 'R2', 'R11', 'R14')).toEqual([-1, 0, 1]);
  expect(at(1100, 'R2', 'R11')).toEqual([-0.5, 0.5]);
  expect(Math.sign((north('R2', 100) ?? NaN) - (north('R11', 100) ?? NaN))).toBe(Math.sign((north('R2', 1100) ?? NaN) - (north('R11', 1100) ?? NaN)));
});

test('keeps Lines where they are while another runs past them the other way, and sides it with them where it joins their track', () => {
  // R4 shares R2S's and R14's track east for 4 km, turns off north and loops round. It comes back
  // west along a track of its own 20 m north of theirs, as R1 and R4 run past the Lines for Estació
  // de França, then joins their track to its terminus, as R13 does into Lleida: under 4 km in all,
  // so there it runs the other way to them.
  const { north } = draw(
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

test("gives each of a Line's shapes the side its stroke is drawn at all along it, though a stroke draws their track once", () => {
  // R2 and R11 share track; R2's Trains run it back on R2_INV, which isn't drawn again.
  const shapes = [shape('R2', [0, 0], [5000, 0]), shape('R2_INV', [5000, 0], [0, 0]), shape('R11', [0, 0], [5000, 0])];
  const { strokes, sides } = sideBySide([line('R2', 'R2', 'R2_INV'), line('R11', 'R11')], shapes);
  expect(strokes.map((s) => s.shape)).toEqual(['R2', 'R11']);
  const side = (id: string) => sides.filter((s) => s.shape === id).map(({ line, from, to, side }) => ({ line, from, to, side }));
  const [r2] = side('R2');
  expect(r2).toEqual({ line: 'R2', from: 0, to: 5000, side: strokes[0]?.side });
  // Running back the other way, the same side of the track is the other side of the shape.
  expect(side('R2_INV')).toEqual([{ line: 'R2', from: 0, to: 5000, side: -(r2?.side ?? NaN) }]);
  expect(side('R11')).toEqual([{ line: 'R11', from: 0, to: 5000, side: strokes[1]?.side }]);
});
