import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { along, APART, atZoom, BANDS, beside, cutIn, DEGREE, drawnIn, GRAPH_BAND, inBand, LINK, onStroke, pieces, zones, pixelMetres, pointAt, SMOOTH, STRETCH, type Line, type Shape, type Stroke, type Track } from '../bundle.ts';
import { measures } from './measures.ts';
import { offset } from './offset.ts';
import { across, crossing, end, KX, notTwice, sharedTrack, sideBySide, type Leg } from './sideBySide.ts';

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

/** A Rodalies Line, in a colour of its own, as Lines of one Network and one colour take one place (#283). */
const line = (name: string, ...shapes: string[]): Line => ({ id: name, network: 'rodalies', name, colour: `#${name}`, shapes, kind: 'commuter' });

async function draw(lines: Line[], shapes: Shape[], on: 'strokes' | 'rails' = 'strokes', band?: number) {
  const found = await sideBySide(lines, shapes);
  // On the line graph from zoom 10 up, or a band's own below, without the links between strokes, which only join them up.
  const drawn = found[on].filter((s) => s.band === band && !s.shape.startsWith(LINK));
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

test('draws Lines of one Network and one colour in one place where they share a Stretch, each on its own stroke, its Trains on it (#283)', async () => {
  // As Madrid's C4a and C4b, of one colour (C4b's written here in lower case, as colours are compared
  // without case), along C-4's trunk with C3; and Rodalies' R4, in their colour.
  const madrid = (name: string, colour: string): Line => ({ ...line(name, name), network: 'cercanias-madrid', colour });
  const lines = [madrid('C4a', '#2C2A86'), madrid('C3', '#9E1B80'), madrid('C4b', '#2c2a86'), { ...line('R4', 'R4'), colour: '#2C2A86' }];
  const shapes = lines.map((l) => shape(l.id, [0, 0], [5000, 0]));
  const { strokes } = await draw(lines, shapes);
  expect(lines.map((l) => strokes(l.id).map(({ from, to }) => [from, to]))).toEqual(lines.map(() => [[0, 5000]]));
  const [c4a, c3, c4b, r4] = lines.map((l) => strokes(l.id)[0]?.north);
  expect(c4b).toBe(c4a);
  expect([c4a, c3, r4].sort((a = 0, b = 0) => a - b)).toEqual([-1, 0, 1]);
  expect(Math.max(...(await offStroke(lines, shapes, lines.map((l): [string, string] => [l.id, l.id]))))).toBeLessThan(1);
});

test('below zoom 10, draws Lines on tracks about a line width apart there side by side, on a graph for each band, its Trains on it (ADR-0007)', async () => {
  // R2's and R11's tracks run 120 m apart: further apart than NEAR, but under half a line width at zoom 9, 127 m.
  const lines = [line('R2', 'R2'), line('R11', 'R11')];
  const shapes = [shape('R2', [0, 0], [5000, 0]), shape('R11', [0, 120], [5000, 120])];
  const own = await draw(lines, shapes);
  expect([...own.strokes('R2'), ...own.strokes('R11')]).toEqual([{ from: 0, to: 5000, north: 0 }, { from: 0, to: 5000, north: 0 }]);
  for (const zoom of [7, 8, 9]) {
    const { strokes, at } = await draw(lines, shapes, 'strokes', BANDS.indexOf(zoom));
    expect([...strokes('R2'), ...strokes('R11')]).toEqual([{ from: 0, to: 5000, north: -0.5 }, { from: 0, to: 5000, north: 0.5 }]);
    // Along one line halfway between their tracks.
    expect([...at('R2'), ...at('R11')]).toEqual([[60, 60], [60, 60]]);
  }
  const { strokes, centrelines } = await sideBySide(lines, shapes);
  expect(measures({ shapes: [...shapes, ...centrelines], strokes }).covered).toEqual(Object.fromEntries(BANDS.map((zoom) => [zoom, 0])));
  expect(Math.max(...(await offStroke(lines, shapes, [['R2', 'R2'], ['R11', 'R11']], [7, 8, 9, 10])))).toBeLessThan(1);
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

test("keeps Lines on tracks at different levels apart, as a tram's over a tunnel", async () => {
  // As at Glòries: T4 runs on the avenue, 20 m from where R2 runs below it in a tunnel.
  const tunnel = { ...shape('R2', [0, 0], [5000, 0]), levels: [[0, 'tunnel -1']] as [number, string][] };
  const { strokes } = await draw([line('R2', 'R2'), line('T4', 'T4')], [tunnel, shape('T4', [0, 20], [5000, 20])]);
  expect(strokes('R2')).toEqual([{ from: 0, to: 5000, north: 0 }]);
  expect(strokes('T4')).toEqual([{ from: 0, to: 5000, north: 0 }]);
});

test('keeps Lines on the very same points at different levels apart, whichever comes first', async () => {
  const tunnel = { ...shape('R2', [0, 0], [5000, 0]), levels: [[0, 'tunnel -1']] as [number, string][] };
  for (const lines of [[line('R2', 'R2'), line('T4', 'T4')], [line('T4', 'T4'), line('R2', 'R2')]]) {
    const { strokes } = await draw(lines, [tunnel, shape('T4', [0, 0], [5000, 0])]);
    expect([...strokes('R2'), ...strokes('T4')]).toEqual([{ from: 0, to: 5000, north: 0 }, { from: 0, to: 5000, north: 0 }]);
  }
});

test("draws a Line's two directions once where OpenStreetMap maps their tracks at different layers of one tunnel", async () => {
  const [east, west] = [shape('R2', [0, 0], [5000, 0]), shape('R2_INV', [5000, 20], [0, 20])];
  const { strokes } = await draw([line('R2', 'R2', 'R2_INV')], [{ ...east, levels: [[0, 'tunnel -1']] }, { ...west, levels: [[0, 'tunnel -2']] }]);
  expect(strokes('R2')).toHaveLength(1);
});

test('marks where a Line runs in a tunnel, and how deep, so that the map draws it below those above it (#178)', async () => {
  // R2 on the ground for 2 km, then in a tunnel two layers down under T4 on the street.
  const r2 = { ...shape('R2', [0, 0], [5000, 0]), levels: [[2000, 'tunnel -2']] as [number, string][] };
  const shapes = [r2, shape('T4', [2000, 0], [5000, 0])];
  for (const on of ['strokes', 'rails'] as const) {
    const drawn = (await sideBySide([line('R2', 'R2'), line('T4', 'T4')], shapes))[on].filter((s) => s.band === undefined);
    const under = (name: string) => drawn.filter((s) => s.line === name).map((s) => [s.from, s.to, s.under ?? 0]);
    // From the piece the tunnel starts in.
    expect(under('R2')).toEqual([[0, expect.closeTo(2000, -2), 0], [expect.closeTo(2000, -2), 5000, 2]]);
    expect(under('T4').map(([, , below]) => below)).toEqual([0]);
  }
});

test('marks the parts of a Line in a tunnel that a Line above lies within a line width of, for each band that has it so (#417)', async () => {
  // R2 in a tunnel under T4 on the street, 10 m apart: within a line width at zoom 14 (14 m), and at 13 (26 m), but 20 m on from them, only at 13.
  const r2 = { ...shape('R2', [0, 0], [5000, 0]), levels: [[0, 'tunnel -1']] as [number, string][] };
  const t4 = shape('T4', [0, 10], [2000, 10], [2000, 20], [5000, 20]);
  const { strokes } = await sideBySide([line('R2', 'R2'), line('T4', 'T4')], [r2, t4]);
  const covered = (zoom: number) => strokes.filter((s) => s.line === 'R2').flatMap((s) => (s.covered ?? []).filter(([band]) => band === BANDS.indexOf(zoom)).map(([, from, to]) => [from, to]));
  const near = ([from, to]: number[]) => [Math.round((from ?? 0) / 50) * 50, Math.round((to ?? 0) / 50) * 50];
  expect(covered(14).map(near)).toEqual([[0, 2000]]);
  expect(covered(13).map(near)).toEqual([[0, 5000]]);
  expect(strokes.filter((s) => s.line === 'T4').some((s) => s.covered)).toBe(false);
});

test('draws a Line going into a tunnel just where it would be drawn on the ground, its curves too (#178)', async () => {
  // R2 and R11 are drawn between their tracks for 2.5 km, both going into a tunnel 500 m before R2 goes on alone.
  const shapes = [shape('R2', [0, 0], [5000, 0]), shape('R11', [2500, 40], [0, 40])];
  const tunnel: Shape[] = shapes.map((s, i) => ({ ...s, levels: i ? [[0, 'tunnel -1'], [500, '']] : [[2000, 'tunnel -1'], [3500, '']] }));
  // Each stroke's metres drawn in each band, cut back for curves, joined where they meet.
  const drawn = (strokes: Stroke[]) =>
    BANDS.map((_, band) =>
      strokes
        .filter((s) => drawnIn(s, band))
        .map((s) => [s.line, s.shape, s.side, s.from + cutIn(s, band)[0], s.to - cutIn(s, band)[1]] as const)
        .filter(([, , , from, to]) => to > from)
        .sort((a, b) => `${a.slice(0, 3)}`.localeCompare(`${b.slice(0, 3)}`) || a[3] - b[3])
        .reduce<(string | number)[][]>((all, s) => {
          const last = all.at(-1);
          if (last && `${last.slice(0, 3)}` === `${s.slice(0, 3)}` && last[4] === s[3]) last[4] = s[4];
          else all.push([...s]);
          return all;
        }, []),
    );
  const [ground, levelled] = [await sideBySide([line('R2', 'R2'), line('R11', 'R11')], shapes), await sideBySide([line('R2', 'R2'), line('R11', 'R11')], tunnel)];
  expect(levelled.strokes.some((s) => s.under)).toBe(true);
  expect(drawn(levelled.strokes)).toEqual(drawn(ground.strokes));
  expect(drawn(levelled.rails)).toEqual(drawn(ground.rails));
});

test('narrows the gap between Lines past six side by side, so that a stretch gets no wider', async () => {
  const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
  const { strokes } = await draw(names.map((n) => line(n, n)), names.map((n) => shape(n, [0, 0], [5000, 0])));
  const sides = names.flatMap(strokes).map((s) => s.north).sort((a, b) => a - b);
  expect(sides.map((n) => n.toFixed(3))).toEqual(names.map((_, i) => ((i - 4) * (5 / 8)).toFixed(3)));
});

test('marks the strokes of a stretch with more than six Lines as crowded, as each covers some of the next (#178)', async () => {
  for (const names of [['A', 'B', 'C', 'D', 'E', 'F'], ['A', 'B', 'C', 'D', 'E', 'F', 'G']]) {
    const { strokes } = await sideBySide(names.map((n) => line(n, n)), names.map((n) => shape(n, [0, 0], [5000, 0])));
    // On the line graph from zoom 10 up, and each band's own below.
    expect(strokes.filter((s) => s.band === undefined).map((s) => !!s.crowded)).toEqual(names.map(() => names.length > 6));
    expect(strokes.every((s) => !!s.crowded === names.length > 6)).toBe(true);
  }
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

test('zoomed right in, marks where Lines share a track, and not where a Line has its track to itself (#139)', async () => {
  // R2 and R11 share track east for 3 km; there R11 turns off on its own, and R2 goes on alone. R4 runs beside them on its own track, 20 m north.
  const { rails } = await sideBySide(
    [line('R2', 'R2'), line('R11', 'R11'), line('R4', 'R4')],
    [shape('R2', [0, 0], [3000, 0], [6000, 0]), shape('R11', [0, 0], [3000, 0], [4000, -2000]), shape('R4', [0, 20], [6000, 20])],
  );
  const shared = (name: string) => rails.filter((s) => s.line === name).map(({ shared }) => !!shared);
  expect([shared('R2'), shared('R11')]).toEqual([[true, false], [true, false]]);
  expect(shared('R4').every((s) => !s)).toBe(true);
  // Where they part, to within a piece of track.
  const parted = ['R2', 'R11'].map((name) => rails.find((s) => s.line === name && s.shared)?.to ?? NaN);
  for (const at of parted) expect(Math.abs(at - 3000)).toBeLessThanOrEqual(50);
});

test("below zoom 7, draws each Network's track once, however many of its Lines run on it (#190), in the order of the Networks, so that a Network's is drawn over those before it (#262)", async () => {
  // R2 and R11 share track east for 3 km; there R11 turns off on its own, 2236 m, and R2 goes on
  // alone. R2 runs back the other way too. FGC's S1 runs on that very track for 3 km.
  const { tracks } = await sideBySide(
    [line('R2', 'R2', 'R2_INV'), line('R11', 'R11'), { ...line('S1', 'S1'), network: 'fgc' }],
    [shape('R2', [0, 0], [3000, 0], [6000, 0]), shape('R2_INV', [6000, 0], [3000, 0], [0, 0]), shape('R11', [0, 0], [3000, 0], [4000, -2000]), shape('S1', [0, 0], [3000, 0])],
  );
  const metres = (lines: string[]) => tracks.filter((s) => lines.includes(s.line)).reduce((sum, s) => sum + s.to - s.from, 0);
  expect(Math.abs(metres(['R2', 'R11']) - 8236)).toBeLessThanOrEqual(2);
  expect(metres(['S1'])).toBe(3000);
  expect(tracks.every((s) => s.side === 0)).toBe(true);
  // FGC's after Rodalies', as its Lines come after Rodalies' Lines.
  expect(tracks.findIndex((s) => s.line === 'S1')).toBeGreaterThan(tracks.findLastIndex((s) => s.line !== 'S1'));
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

test("draws a Line beside the one it runs with here on one Stretch, though turned against it for the Line it runs with elsewhere (#383)", async () => {
  // A runs east for 3 km, 1.5 km of it with B 15 m north of it. C runs west along A's track, the other
  // way, and on north from its end, and B turns north 15 m east of that for 2 km. A and C run opposite
  // ways for 3 km, B with A for 1.5 km and with C for 2: one turn each puts B with C, against A.
  const lines = [line('A', 'A'), line('B', 'B'), line('C', 'C')];
  const shapes = [shape('A', [-1500, 0], [3000, 0]), shape('B', [-1500, 15], [15, 15], [15, 2000]), shape('C', [3000, 0], [0, 0], [0, 2000])];
  const { strokes, centrelines } = await sideBySide(lines, shapes);
  const byId = new Map(centrelines.map((c) => [c.id, c]));
  // The Stretch each Line is drawn on at 1 km west of the origin.
  const at = (name: string) =>
    strokes
      .filter((s) => s.line === name && s.band === undefined && !s.shape.startsWith(LINK))
      .filter((s) => {
        const ends = along(byId.get(s.shape) ?? { coords: [], dist: [] }, s.from, s.to);
        const [start, end] = [ends[0]?.[0] ?? NaN, ends.at(-1)?.[0] ?? NaN].map((lon) => (lon - LON) * M * COS);
        return Math.min(start ?? NaN, end ?? NaN) < -1000 && Math.max(start ?? NaN, end ?? NaN) > -1000;
      });
  const [a, b] = [at('A'), at('B')];
  expect(a).toHaveLength(1);
  expect(b.map((s) => s.shape)).toEqual(a.map((s) => s.shape));
  expect(Math.abs((a[0]?.side ?? NaN) - (b[0]?.side ?? NaN))).toBe(1);
});

/**
 * How far each of a Line's Trains, run along these of its shapes from 200 m in to 200 m short of their
 * ends, is drawn beyond half a line width from where its stroke is drawn, as they go that far to their
 * side, at zooms 12, 13 and 14, in metres.
 */
async function offStroke(lines: Line[], shapes: Shape[], runs: [line: string, shape: string][], zooms = [12, 13, 14]): Promise<number[]> {
  const { strokes, centrelines, slots } = await sideBySide(lines, shapes);
  const byId = new Map([...shapes, ...centrelines].map((s) => [s.id, s]));
  const across = zones(strokes);
  const xy = ([lon, lat]: [number, number]): [number, number] => [(lon - LON) * M * COS, (lat - LAT) * M];
  return zooms.flatMap((zoom) => {
    const [band, width] = [BANDS.indexOf(zoom), atZoom(APART, zoom) * pixelMetres(zoom, LAT)];
    return runs.flatMap(([name, id]) => {
      // Where the Line's strokes are drawn in the band, cut back for its curves, and its curves, every metre.
      const drawn = strokes
        .filter((s) => s.line === name && drawnIn(s, band))
        .flatMap((s) => pieces({ ...s, from: s.from + cutIn(s, band)[0], to: s.to - cutIn(s, band)[1] }))
        .flatMap((s) => Array.from({ length: Math.floor(s.to - s.from) + 1 }, (_, i) => xy(beside(inBand(byId, s.shape, band) ?? { coords: [], dist: [] }, s.from + i, s.side * width))));
      const mine = slots.filter((s) => s.line === name && s.shape === id);
      const length = byId.get(id)?.dist.at(-1) ?? 0;
      return Array.from({ length: Math.floor((length - 400) / 25) + 1 }, (_, i) => {
        const [x, y] = xy(onStroke(mine, byId, 200 + i * 25, zoom, 1, across) ?? [NaN, NaN]);
        return Math.max(0, Math.min(...drawn.map(([sx, sy]) => Math.hypot(sx - x, sy - y))) - width / 2);
      });
    });
  });
}

test("puts each of a Line's shapes' Trains on its stroke at every zoom it's drawn side by side, half a line width to their side", async () => {
  // R2 and R11 are drawn between their tracks, 40 m apart; R2's Trains run back on R2_INV, on R2's track.
  const shapes = [shape('R2', [0, 0], [5000, 0]), shape('R2_INV', [5000, 0], [0, 0]), shape('R11', [0, 40], [5000, 40])];
  const lines = [line('R2', 'R2', 'R2_INV'), line('R11', 'R11')];
  // Give or take a metre, for rounding.
  expect(Math.max(...(await offStroke(lines, shapes, [['R2', 'R2'], ['R2', 'R2_INV'], ['R11', 'R11']])))).toBeLessThan(1);
  // Running back the other way, R2's Trains go on the other side of its stroke.
  const { centrelines, slots } = await sideBySide(lines, shapes);
  const byId = new Map([...shapes, ...centrelines].map((s) => [s.id, s]));
  const north = (id: string) => ((onStroke(slots.filter((s) => s.shape === id), byId, 2500, 13, 1)?.[1] ?? NaN) - LAT) * M;
  expect(Math.abs(north('R2') - north('R2_INV'))).toBeCloseTo(atZoom(APART, 13) * pixelMetres(13, LAT), 0);
});

test("puts a Line's Trains on its curve where it moves over across a node, either way", async () => {
  // Six Lines share track for 2.5 km; then five turn off north-east, and A goes on alone, and back.
  const names = ['A', 'B', 'C', 'D', 'E', 'F'];
  const shapes = [
    shape('A', [0, 0], [5000, 0]),
    shape('A_INV', [5000, 0], [0, 0]),
    ...names.slice(1).map((n) => shape(n, [0, 0], [2500, 0], [4000, 1500])),
  ];
  const lines = [line('A', 'A', 'A_INV'), ...names.slice(1).map((n) => line(n, n))];
  const off = await offStroke(lines, shapes, [['A', 'A'], ['A', 'A_INV'], ...names.slice(1).map((n): [string, string] => [n, n])]);
  expect(Math.max(...off)).toBeLessThan(1);
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
    // Where a stroke is drawn from one distance along its line to another at the band's zoom, at its ends, in metres east
    // and north: as the map offsets it, along its first and last segments.
    const at = (s: Stroke, from: number, to: number): [start: [number, number], end: [number, number]] => {
      const points = along(inBand(byId, s.shape, band) ?? { coords: [], dist: [] }, from, to).map(([lon, lat]): [number, number] => [(lon - LON) * M * COS, (lat - LAT) * M]);
      const drawn = offset(points, s.side * width);
      return [drawn[0] ?? [NaN, NaN], drawn.at(-1) ?? [NaN, NaN]];
    };
    const edges = strokes.filter((s) => s.line === 'R2' && !s.shape.startsWith(LINK) && drawnIn(s, band));
    const ends = edges.flatMap((s) => at(s, s.from + cutIn(s, band)[0], s.to - cutIn(s, band)[1]));
    const curve = strokes.filter((s) => s.line === 'R2' && s.shape.startsWith(LINK) && s.band === band).flatMap(pieces);
    const [first, last] = [curve[0], curve.at(-1)];
    if (!first || !last) return NaN;
    // Its ends meet the strokes it joins, within a quarter of a pixel, wherever the Line is drawn at that zoom.
    for (const p of [at(first, first.from, first.to)[0], at(last, last.from, last.to)[1]]) {
      expect(Math.min(...ends.map((e) => Math.hypot(e[0] - p[0], e[1] - p[1])))).toBeLessThan(px / 4);
    }
    return last.to - first.from;
  });
  // A line width is further on the ground zoomed out, so the curve is longer there.
  expect(lengths.every((l, i) => l > (lengths[i + 1] ?? 0))).toBe(true);
});

test("makes a curve long enough for its side to change, however little the Line moves over, so that it doesn't kink (#178)", async () => {
  // As at Torrassa: C and D come in from the south-west onto track 30 m off A and B's, and the four
  // go on side by side. C changes side where it comes onto the stretch, but hardly moves over.
  const join = (id: string) => shape(id, [0, -2500], [2500, -30], [5000, -30]);
  const shapes = [shape('A', [0, 0], [5000, 0]), shape('B', [0, 0], [5000, 0]), join('C'), join('D')];
  const { strokes } = await sideBySide(['A', 'B', 'C', 'D'].map((n) => line(n, n)), shapes);
  const curves = strokes.filter((s) => s.line === 'C' && s.shape.startsWith(LINK));
  expect(curves).toHaveLength(BANDS.length);
  for (const c of curves) {
    const zoom = BANDS[c.band ?? -1] ?? NaN;
    // Four times as long as its side moves it, give or take its ends' cutting across.
    expect(c.to - c.from).toBeGreaterThan(0.8 * 4 * Math.abs((c.ease ?? c.side) - c.side) * atZoom(APART, zoom) * pixelMetres(zoom, LAT));
  }
});

test("absorbs a Stretch too short for its nodes' curves, zoomed out, and crosses it on one curve, its Trains on it (ADR-0007)", async () => {
  // As at Auditori: B comes in from the south-west onto A's track for 200 m, and leaves it north-east, crossing it.
  const shapes = [shape('A', [0, 0], [5000, 0]), shape('B', [0, -2500], [2400, 0], [2600, 0], [5000, 2500])];
  const lines = [line('A', 'A'), line('B', 'B')];
  const { strokes, centrelines } = await sideBySide(lines, shapes);
  const found = measures({ shapes: [...shapes, ...centrelines], strokes, lines });
  for (const zoom of BANDS) expect([found.kinks[zoom], found.weaves[zoom]]).toEqual([0, 0]);
  // At zoom 10 a line width is 147 m: the shared Stretch isn't drawn, and B crosses its node on one curve, along it.
  const [z10, z13] = [BANDS.indexOf(10), BANDS.indexOf(13)];
  const shared = strokes.filter((s) => s.line === 'B' && s.band === undefined && s.to - s.from < 400);
  expect(shared.length).toBeGreaterThan(0);
  for (const s of shared) expect(cutIn(s, z10)[0] + cutIn(s, z10)[1]).toBe(s.to - s.from);
  const curves = strokes.filter((s) => s.line === 'B' && s.shape.startsWith(LINK) && s.band === z10);
  expect(curves).toHaveLength(1);
  expect(curves[0]?.across?.length).toBeGreaterThan(2);
  // At zoom 13, 26 m, it's long enough to draw.
  for (const s of shared) expect(cutIn(s, z13)[0] + cutIn(s, z13)[1]).toBeLessThan(s.to - s.from);
  expect(Math.max(...(await offStroke(lines, shapes, [['A', 'A'], ['B', 'B']])))).toBeLessThan(1);
});

test("brings L1 from Marina onto the Rodalies bundle at Auditori without a hook, where its own Stretch ends a few line widths aside of the bundle's (#206)", async () => {
  // L1, R1 and R4 round Auditori/Teatre Nacional on 6 Oct 2026 (fixtures/auditori.json). L1's own
  // Stretch from Marina ends 38 m east of the centreline of the 89 m it shares with R4, which a node
  // absorbs at every zoom from 10 up: at zoom 14, its curve across the node hooked north-west off its
  // stroke and back north.
  const { lines, shapes } = JSON.parse(readFileSync(new URL('fixtures/auditori.json', import.meta.url), 'utf8')) as Pick<Track, 'lines' | 'shapes'>;
  const { strokes, centrelines } = await sideBySide(lines, shapes);
  const l1 = strokes.filter((s) => s.line === 'metro:L1');
  expect(measures({ shapes: [...shapes, ...centrelines], strokes: l1 }).wiggles).toEqual(Object.fromEntries(BANDS.map((zoom) => [zoom, 0])));
});

test("takes L1's and R4's stroke along the 36 m Stretch at Auditori/Teatre Nacional into their curves across the node, where each goes through it from one end to the other (#599)", async () => {
  // L1, R1 and R4 round Auditori/Teatre Nacional on 6 Oct 2026 (fixtures/auditori.json). A Stretch of one
  // piece, 36 m, lies between the 89 m L1 shares with R4 and the Stretch they go on along. L1 and R4 go
  // through it, but their visit of its one piece has no first and last, and end() took the nearer end for
  // the way out as for the way in: both of their joins to its stroke were made at its start. across() took
  // that for a hidden stroke a Line only touches, coming and going at one end, and passed it by: no curve
  // named it, and its stroke was drawn at every zoom from 10 to 14, along a curve that goes by it (363 m
  // at zoom 13, across 2 Stretches and the 89 m).
  const { lines, shapes } = JSON.parse(readFileSync(new URL('fixtures/auditori.json', import.meta.url), 'utf8')) as Pick<Track, 'lines' | 'shapes'>;
  const { strokes, centrelines } = await sideBySide(lines, shapes);
  const short = centrelines.find((c) => /^stretch:\d+$/.test(c.id) && c.dist.at(-1) === 36)?.id;
  expect(short).toBeDefined();
  for (const name of ['metro:L1', 'rodalies:R4']) {
    const stroke = strokes.find((s) => s.line === name && s.band === undefined && s.shape === short);
    expect(stroke).toBeDefined();
    // Per zoom from 10 up: metres of the stroke not drawn (all 36), and curves of the Line that go along it.
    const each = BANDS.flatMap((_, band) => {
      if (band < GRAPH_BAND || !stroke) return [];
      const curves = strokes.filter((s) => s.line === name && s.band === band && s.shape.startsWith(LINK) && s.across?.some(([id]) => id === short));
      return [[band, cutIn(stroke, band).reduce((sum, d) => sum + d, 0), curves.length]];
    });
    expect(each).toEqual(BANDS.flatMap((_, band) => (band < GRAPH_BAND ? [] : [[band, 36, 1]])));
  }
  // Each curve goes in at the end of the Stretch nearer the leg before it, and out at the end nearer the leg after it.
  const byId = new Map([...shapes, ...centrelines].map((c) => [c.id, c]));
  const at = (id: string, d: number): [number, number] => {
    const [lon, lat] = pointAt(byId.get(id) ?? { coords: [], dist: [] }, d);
    return [lon * KX, lat * DEGREE];
  };
  const curves = strokes.filter((s) => s.shape.startsWith(LINK) && s.across?.some(([id]) => id === short));
  expect(curves.length).toBeGreaterThan(0);
  for (const { across = [] } of curves) {
    const i = across.findIndex(([id]) => id === short);
    const [[, before = 0, after = 0], [, , prior = 0], [, next = 0]] = [across[i] ?? [], across[i - 1] ?? [], across[i + 1] ?? []];
    const [p, q] = [at(across[i - 1]?.[0] ?? '', prior), at(across[i + 1]?.[0] ?? '', next)];
    const near = (point: [number, number], d: number) => Math.hypot(point[0] - at(short ?? '', d)[0], point[1] - at(short ?? '', d)[1]);
    expect(near(p, before)).toBeLessThan(near(p, after));
    expect(near(q, after)).toBeLessThan(near(q, before));
  }
});

test("takes C3, C4 and C5 across the node by Madrid-Atocha without hooking back, where the stroke a node hides runs on past their next Stretch's start (#311)", async () => {
  // The Lines round Madrid-Atocha Cercanías on 9 Oct 2026 (fixtures/atocha.json). By the Station, C3's,
  // C4's and C5's stroke along the Stretch they leave runs on, hidden by a node at every zoom, 35 m past
  // where the next Stretch they go along starts beside it: their chain of centrelines across the node ran
  // to the hidden stroke's end and back, and at zoom 13 and 14 their curves hooked.
  const { lines, shapes } = JSON.parse(readFileSync(new URL('fixtures/atocha.json', import.meta.url), 'utf8')) as Pick<Track, 'lines' | 'shapes'>;
  const { strokes, centrelines } = await sideBySide(lines, shapes);
  const byId = new Map([...shapes, ...centrelines].map((s) => [s.id, s]));
  // The curves whose middle is within 200 m of the Station (adif:18000), with the strokes they join.
  // Further out some still wiggle, as on main: C10's, from 270 m, which no longer hook back (#353), and
  // 780 m south-east, C3's, C4's and C5's at zoom 13, where they step aside onto the next Stretch.
  const near = (c: Stroke) => {
    const [lon, lat] = pointAt(byId.get(c.shape) ?? { coords: [], dist: [] }, c.to / 2);
    return Math.hypot((lon + 3.68944) * KX, (lat - 40.40662) * DEGREE) < 200;
  };
  const curves = strokes.filter((s) => s.shape.startsWith(LINK) && near(s));
  expect(curves.length).toBeGreaterThan(0);
  const drawn = strokes.filter((s) => !s.shape.startsWith(LINK));
  expect(measures({ shapes: [...shapes, ...centrelines], strokes: [...drawn, ...curves] }).wiggles).toEqual(Object.fromEntries(BANDS.map((zoom) => [zoom, 0])));
});

test("takes R2S, R14, R15, R16 and RT1 across the node west of the Francolí without hooking back, where their westbound track goes round it on a bridge of its own and touches the Stretch beyond for one piece (#353)", async () => {
  // The Lines by the Francolí in Tarragona on 11 Oct 2026 (fixtures/francoli.json). Their westbound track
  // runs over the river 53 m north of the eastbound, further apart than NEAR, on a Stretch of its own of
  // 145 m; it leaves the Stretch they share 218 m from where that ends, and comes back to it for 47 m
  // before it goes on west. ports() joined the bridge's Stretch to that Stretch's end, which they go along
  // the other way, so that at zoom 11 to 14 each curve ran west along the bridge, turned back and ran 110
  // to 360 m east along the next Stretch, and the bridge's other end hung in the air.
  const { lines, shapes } = JSON.parse(readFileSync(new URL('fixtures/francoli.json', import.meta.url), 'utf8')) as Pick<Track, 'lines' | 'shapes'>;
  const { strokes, centrelines } = await sideBySide(lines, shapes);
  const found = measures({ shapes: [...shapes, ...centrelines], strokes, lines });
  // Their Trains on the westbound track are on their Lines' strokes, as on the eastbound, give or take
  // a metre for rounding. R17's and RT2's aren't, one each at the node, 5 m short of their curves' zones,
  // as on main.
  const runs = lines.filter((l) => !['rodalies:R17', 'rodalies:RT2'].includes(l.id)).flatMap((l): [string, string][] => l.shapes.map((id) => [l.id, id]));
  const off = await offStroke(lines, shapes, runs);
  expect(found.hairpins).toEqual(Object.fromEntries(BANDS.map((zoom) => [zoom, 0])));
  expect(found.dangling).toBe(0);
  expect(Math.max(...off)).toBeLessThan(1);
});

test("takes C10 across the node south-east of Madrid-Atocha without hooking back, where its track touches the Stretch beyond for 49 m (#353)", async () => {
  // C10 on 9 Oct 2026 (fixtures/atocha.json), 270 m south-east of the Station, at 40.402, -3.682: its
  // track runs on past the node onto the next Stretch's first piece and then off along another, and the
  // join to that piece hooked it back past its end and on, at zoom 12 to 14.
  const { lines, shapes } = JSON.parse(readFileSync(new URL('fixtures/atocha.json', import.meta.url), 'utf8')) as Pick<Track, 'lines' | 'shapes'>;
  const { strokes, centrelines } = await sideBySide(lines, shapes);
  const found = measures({ shapes: [...shapes, ...centrelines], strokes, lines });
  expect(BANDS.map((zoom, band) => (band >= GRAPH_BAND ? found.hairpins[zoom] : 0))).toEqual(BANDS.map(() => 0));
});

test("closes a loop Line across the node it began at, where its last piece touches the Stretch it started on, as Sevilla's C4 does at Santa Justa (#353)", async () => {
  // A runs along one track through a station and B only west of it, so that the Lines sit differently on
  // the two Stretches either side. L begins 10 m west of the station, runs west, round a loop on a track of
  // its own, and comes back from the east to end where it began: its last piece, 49 m, is on the Stretch it
  // began on, and its Line's stroke goes from the one side to the other across the node by a curve.
  const lines = [line('A', 'A', 'A_INV'), line('B', 'B', 'B_INV'), line('L', 'L')];
  const shapes = [
    straight('A', [-3000, 0], [3000, 0]),
    straight('A_INV', [3000, 0], [-3000, 0]),
    straight('B', [-3000, 0], [0, 0]),
    straight('B_INV', [0, 0], [-3000, 0]),
    straight('L', [-10, 0], [-3000, 0], [-3000, 400], [3000, 400], [3000, 0], [-10, 0]),
  ];
  const { strokes } = await sideBySide(lines, shapes);
  // From zoom 10 on, the curve along the one centreline: from L's stroke east of the station to its stroke west of it.
  const across = (band: number) => strokes.filter((s) => s.line === 'L' && s.band === band && s.shape.startsWith(LINK) && s.across?.length === 2 && s.across[0]?.[0] === s.across[1]?.[0]);
  expect(BANDS.map((_, band) => (band >= GRAPH_BAND ? across(band).length : 1))).toEqual(BANDS.map(() => 1));
});

/** A Stretch along a centreline from one distance to another, as sideBySide() finds them, and a visit of a shape to one. */
const stretch = (shape: string, from: number, to: number) => ({ steps: [{ line: -1, piece: 0, shape, way: 1, from, to }], lines: [] });
const visit = (edge: number, first: number, last: number, length: number) => ({ edge, first, last, length, steps: [0, 1] as [number, number], ways: [0, 0] as [number, number] });

test('comes in and goes out of a Stretch of one piece at the ends its first and last steps go from and to, and at the nearer end where they go across it (#599)', () => {
  // A Stretch of one piece, 36 m, which a visit of has no first and last apart.
  const one = [stretch('c0', 0, 36)];
  const goes = (...ways: [number, number]) => ({ ...visit(0, 18, 18, 36), ways });
  const into = (v: ReturnType<typeof goes>) => [end(v, one, true), end(v, one, false)];
  // Towards its end: in at its start, out at its end; and back.
  expect(into(goes(1, 1))).toEqual([0, 1]);
  expect(into(goes(-1, -1))).toEqual([1, 0]);
  // Out and back on it: in and out at the end it came in at.
  expect(into(goes(1, -1))).toEqual([0, 0]);
  expect(into(goes(-1, 1))).toEqual([1, 1]);
  // Across it, or where nothing says: the nearer end, as for one piece of a longer Stretch.
  expect(into({ ...goes(0, 0), first: 30, last: 30 })).toEqual([1, 1]);
  expect(into({ ...goes(0, 0), first: 5, last: 5 })).toEqual([0, 0]);
  // Not along a Stretch of more pieces, where first and last say.
  const two = [{ steps: [{ line: -1, piece: 0, shape: 'c0', way: 1, from: 0, to: 40 }, { line: -1, piece: 1, shape: 'c0', way: 1, from: 40, to: 80 }], lines: [] }];
  expect([end({ ...goes(1, 1), first: 60, last: 20 }, two, true), end({ ...goes(1, 1), first: 60, last: 20 }, two, false)]).toEqual([1, 0]);
  // And one piece of it a shape only touches is at its nearer end, whichever way it goes over it.
  expect([end({ ...goes(1, 1), first: 10, last: 10 }, two, true), end({ ...goes(1, 1), first: 10, last: 10 }, two, false)]).toEqual([0, 0]);
});

test('leaves a Line the one way across a node where it has two between the same strokes that differ by a hidden stroke of one piece, the one without it (#599)', () => {
  // A Line's way across a node from stroke a to stroke b, and one through a stroke of one piece; another's, through a stroke of its own.
  const stroke = (name: string): Stroke => ({ line: 'R2', shape: name, from: 0, to: 100, side: 0 });
  const [a, short, b, other] = [stroke('a'), stroke('short'), stroke('b'), stroke('other')];
  const id = new Map([[a, 0], [short, 1], [b, 2], [other, 3]]);
  const [first, last] = [{ stroke: a, end: 1 as const }, { stroke: b, end: 0 as const }];
  const direct = [first, last];
  const through = [first, { stroke: short, end: 0 as const }, last];
  const round = [first, { stroke: other, end: 0 as const }, last];
  const isShort = (s: Stroke) => s === short;
  expect(notTwice([through, direct], isShort, id)).toEqual([direct]);
  // Whichever way round it was found, and a way through another stroke is another way.
  const back = [{ stroke: b, end: 0 as const }, { stroke: short, end: 1 as const }, { stroke: a, end: 1 as const }];
  expect(notTwice([back, direct], isShort, id)).toEqual([direct]);
  expect(notTwice([through, direct, round], isShort, id)).toEqual([direct, round]);
  // Where there's none without it, it stays: the Line goes through it alone.
  expect(notTwice([through], isShort, id)).toEqual([through]);
});

test('leaves out a shape\'s track round a node only where it follows the Stretch it left along one centreline, left it beyond REACH from its end and doesn\'t come back onto it (#353)', () => {
  // Two Stretches of one centreline, 0 to 1,000 and 1,000 to 2,000 m, and a bridge of its own, 145 m.
  const found = [stretch('c0', 0, 1000), stretch('c0', 1000, 2000), stretch('c1', 0, 145)];
  const [out, over, back] = [visit(1, 1900, 1250, 650), visit(2, 10, 135, 145), visit(0, 990, 20, 970)];
  // Gone off the Stretch 250 m from its end, round on the bridge and onto the next: the bridge goes.
  expect(crossing([out, over, back], found)).toEqual([out, back]);
  // Gone off it 50 m from its end, as the Line goes off a junction onto a track beside it: it stays.
  const near = visit(1, 1900, 1050, 850);
  expect(crossing([near, over, back], found)).toEqual([near, over, back]);
  // A Stretch of another centreline that happens to be the next one by number, which a spur is: it stays.
  const spur = [stretch('c0', 0, 1000), stretch('c1', 0, 49)];
  const [along, onto] = [visit(0, 900, 990, 90), visit(1, 24.5, 24.5, 49)];
  expect(crossing([along, onto, along], spur)).toEqual([along, onto, along]);
  // A run that comes back onto the Stretch it left, before it goes on to the next, is a spur out and back, not a way round: it stays.
  const again = visit(1, 1060, 1010, 95);
  expect(crossing([out, over, again, back], found)).toEqual([out, over, again, back]);
});

test('leaves out the one piece a shape touches of the Stretch it goes on along, but not at its first or last visit, where its Line ends (#353)', () => {
  const found = [stretch('c0', 0, 1000), stretch('c0', 1000, 2000)];
  const [touch, on] = [visit(1, 1020, 1020, 47), visit(0, 990, 20, 970)];
  // Between two visits, the piece is left out; a visit of that one place as long as SHORT or more, going out and back on it, is not.
  expect(crossing([visit(1, 1900, 1100, 800), touch, on], found)).toEqual([visit(1, 1900, 1100, 800), on]);
  const dwell = visit(1, 1020, 1020, 200);
  expect(crossing([visit(1, 1900, 1100, 800), dwell, on], found)).toEqual([visit(1, 1900, 1100, 800), dwell, on]);
  // First or last of the shape, it's kept, as at the station a loop Line begins and ends at.
  expect(crossing([on, touch], found)).toEqual([on, touch]);
  expect(crossing([touch, on], found)).toEqual([touch, on]);
});

test("keeps a Line's way across a node from the end whose strokes' numbers come first as numbers, not as strings, so that it's the same end however many strokes are numbered before them (#448)", () => {
  // One way, from the end of S onto the start of T, which across() finds from either. Numbered 9 and 12 its
  // two ends' strings are "9.1 12.0" and "12.0 9.1", of which the second sorts first, though 9 comes before 12;
  // numbered 1 and 2 they are "1.1 2.0" and "2.0 1.1", and the first sorts first.
  const s: Stroke = { line: 'C3', shape: 'c0', from: 0, to: 500, side: 0 };
  const t: Stroke = { line: 'C3', shape: 'c1', from: 0, to: 500, side: 0 };
  const fromS: [Stroke, [Leg[], Leg[]]] = [s, [[], [{ stroke: t, end: 0 }]]];
  const fromT: [Stroke, [Leg[], Leg[]]] = [t, [[{ stroke: s, end: 1 }], []]];
  for (const [a, b] of [[1, 2], [4, 5], [9, 12], [90, 100], [12, 9], [5, 4], [100, 90]] as const) {
    for (const at of [new Map([fromS, fromT]), new Map([fromT, fromS])]) {
      const found = across(at, () => false, new Map([[s, a], [t, b]]));
      expect(found).toHaveLength(1);
      // It leaves the stroke numbered first, whichever it was found from.
      expect(found[0]?.[0]?.stroke).toBe(a < b ? s : t);
    }
  }
});

test("keeps each of a node's ways where one stroke's end joins both ends of another, numbered either way round (#448)", () => {
  // S's end joins T's start and T's end: two ways, which differ only in the end they come onto T at.
  const s: Stroke = { line: 'C3', shape: 'c0', from: 0, to: 500, side: 0 };
  const t: Stroke = { line: 'C3', shape: 'c1', from: 0, to: 500, side: 0 };
  const at = new Map<Stroke, [Leg[], Leg[]]>([
    [s, [[], [{ stroke: t, end: 0 }, { stroke: t, end: 1 }]]],
    [t, [[{ stroke: s, end: 1 }], [{ stroke: s, end: 1 }]]],
  ]);
  for (const [a, b] of [[9, 12], [12, 9]] as const) {
    const found = across(at, () => false, new Map([[s, a], [t, b]]));
    const ways = found.map((legs) => legs.map((l) => `${l.stroke === s ? 'S' : 'T'}.${l.end}`).join(' ')).sort();
    expect(ways).toEqual(a < b ? ['S.1 T.0', 'S.1 T.1'] : ['T.0 S.1', 'T.1 S.1']);
  }
});

test("keeps a way round a stroke onto its own start from its end 0, and ways whose numbers would run together as one string apart (#448)", () => {
  const stroke = (shape: string): Stroke => ({ line: 'C3', shape, from: 0, to: 500, side: 0 });
  // A's end joins its own start: one way, found from either end, whose two legs are the one stroke. The end decides it, 0 first.
  const loop = stroke('A');
  const around = new Map<Stroke, [Leg[], Leg[]]>([[loop, [[{ stroke: loop, end: 1 }], [{ stroke: loop, end: 0 }]]]]);
  expect(across(around, () => false, new Map([[loop, 9]])).map((legs) => legs.map((l) => l.end))).toEqual([[0, 1]]);
  // Two ways in one node: A's end onto B's start, numbered 1 and 12, which are 3 and 24 doubled and ended, and C's start
  // onto D's start, numbered 16 and 2, which are 32 and 4: "3 24" and "32 4", but "324" and "324" with the spaces left out.
  const [a, b, c, d] = [stroke('A'), stroke('B'), stroke('C'), stroke('D')];
  const at = new Map<Stroke, [Leg[], Leg[]]>([
    [a, [[], [{ stroke: b, end: 0 }]]],
    [b, [[{ stroke: a, end: 1 }], []]],
    [c, [[{ stroke: d, end: 0 }], []]],
    [d, [[{ stroke: c, end: 0 }], []]],
  ]);
  const found = across(at, () => false, new Map([[a, 1], [b, 12], [c, 16], [d, 2]]));
  expect(found.map((legs) => legs.map((l) => `${l.stroke.shape}.${l.end}`).join(' ')).sort()).toEqual(['A.1 B.0', 'D.0 C.0']);
});

test("draws the curves of Lines just as they are when other Lines' strokes are numbered before theirs, each from the same end (#448)", async () => {
  // Madrid-Atocha's Lines (fixtures/atocha.json) alone, and again after Tarragona's by the Francolí
  // (fixtures/francoli.json), whose strokes then come first: Atocha's are numbered from 12 or 14 on, not from 0
  // (65 strokes in each of its graphs alone, 77 or 79 with the Francolí's), so that as strings some of its
  // ways come in another order than as numbers, where 9 has one digit and 12 two.
  const read = (name: string) => JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8')) as Pick<Track, 'lines' | 'shapes'>;
  const [atocha, francoli] = [read('atocha'), read('francoli')];
  const mine = new Set(atocha.lines.map((l) => l.id));
  // Each stroke of those Lines as drawn, a centreline named by its points: its number depends on what comes before.
  const drawn = async (lines: Line[], shapes: Shape[]) => {
    const { strokes, centrelines } = await sideBySide(lines, shapes);
    const byId = new Map(centrelines.map((c) => [c.id, c]));
    const named = (id: string) => (id.startsWith(STRETCH) ? JSON.stringify(byId.get(id)?.coords) : id);
    return strokes
      .filter((s) => mine.has(s.line))
      .map((s) => JSON.stringify({ ...s, shape: named(s.shape), ...(s.across && { across: s.across.map(([id, from, to]) => [named(id), from, to]) }) }))
      .sort();
  };
  const alone = await drawn(atocha.lines, atocha.shapes);
  const after = await drawn([...francoli.lines, ...atocha.lines], [...francoli.shapes, ...atocha.shapes]);
  // There are curves to compare: across a node, on a centreline named by its points.
  expect(alone.some((s) => (JSON.parse(s) as Stroke).across)).toBe(true);
  expect(after).toEqual(alone);
});

test("draws the bands below zoom 10 on graphs of their own with every visit of each shape, as SHORT's metres are no measure of a line width there (#353)", async () => {
  // C10's 49 m touch of the Stretch beyond, left out of its shape's visits there too, would take six strokes
  // of the 79 away in each of zoom 7 to 9, and move other Lines' with them.
  const { lines, shapes } = JSON.parse(readFileSync(new URL('fixtures/atocha.json', import.meta.url), 'utf8')) as Pick<Track, 'lines' | 'shapes'>;
  const { strokes } = await sideBySide(lines, shapes);
  expect(BANDS.slice(0, GRAPH_BAND).map((_, band) => strokes.filter((s) => s.band === band).length)).toEqual([79, 79, 79]);
});

test('ends Lines that end together at one point across their Stretch', async () => {
  // A and B share track to a terminus; B's track stops 100 m short of A's.
  const { strokes } = await draw([line('A', 'A'), line('B', 'B')], [shape('A', [0, 0], [5000, 0]), shape('B', [0, 0], [4900, 0])]);
  expect([...strokes('A'), ...strokes('B')].map((s) => s.to)).toEqual([5000, 5000]);
});

test("starts the first piece and ends the last of a stroke that goes into a tunnel at its Stretch's ends, where Lines ending together moved it there (#541)", async () => {
  // A and B share track east, B's starting 100 m on and ending 100 m short, and both go into a tunnel from 2 km to 3.5 km.
  const tunnel = (from: number): [number, string][] => [[from, 'tunnel -1'], [from + 1500, '']];
  const shapes = [{ ...shape('A', [0, 0], [5000, 0]), levels: tunnel(2000) }, { ...shape('B', [100, 0], [4900, 0]), levels: tunnel(1900) }];
  const lines = [line('A', 'A'), line('B', 'B')];
  const { strokes } = await draw(lines, shapes);
  const { strokes: rails } = await draw(lines, shapes, 'rails');
  expect(strokes('A').map(({ from, to }) => [from, to])).toEqual([[0, 2000], [2000, 3500], [3500, 5000]]);
  // B's stroke starts and ends with A's, where the two are drawn along the Stretch's centreline.
  expect(strokes('B').map(({ from, to }) => [from, to])).toEqual([[0, 2000], [2000, 3500], [3500, 5000]]);
  // On its own track, which its shape starts 100 m along and ends 100 m short of A's, it starts and ends where its shape does.
  expect(rails('B').map(({ from, to }) => [from, to])).toEqual([[100, 2000], [2000, 3500], [3500, 4900]]);
});

test("draws a stroke that Lines ending together moved to its Stretch's start from there, where it lies wholly in a tunnel (#541)", async () => {
  // A and B share track in a tunnel from end to end, B's starting 100 m on: one piece each, under 1.
  const tunnel: [number, string][] = [[0, 'tunnel -1']];
  const shapes = [{ ...shape('A', [0, 0], [5000, 0]), levels: tunnel }, { ...shape('B', [100, 0], [5000, 0]), levels: tunnel }];
  const { strokes } = await sideBySide([line('A', 'A'), line('B', 'B')], shapes);
  const drawn = strokes.filter((s) => s.band === undefined && !s.shape.startsWith(LINK));
  expect(drawn.map((s) => [s.line, s.from, s.under])).toEqual([['A', 0, 1], ['B', 0, 1]]);
});

test('smooths each centreline for each zoom band where Lines drawn off it would fold, moving it at most a line width', async () => {
  // Four Lines share track round a quarter circle 150 m across: 1.5 line widths off it is about 220 m at zoom 10.
  const turn = Array.from({ length: 25 }, (_, i): [number, number] => [1000 + 150 * Math.sin((i * Math.PI) / 48), 150 - 150 * Math.cos((i * Math.PI) / 48)]);
  const track = (id: string) => shape(id, [0, 0], ...turn, [1150, 1150]);
  const names = ['R1', 'R2', 'R3', 'R4'];
  const shapes = names.map(track);
  const { strokes, centrelines } = await sideBySide(names.map((n) => line(n, n)), shapes);
  expect(measures({ shapes: [...shapes, ...centrelines], strokes }).folds).toEqual(Object.fromEntries(BANDS.map((zoom) => [zoom, 0])));
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

test("draws each Line just as it was when a Line far off is added, as Madrid's were beside Catalonia's (#277)", async () => {
  // R2 and R11 are drawn between their tracks, 40 m apart, for 2.5 km; then R2 goes on alone. 3 km
  // north, R1, R3, R4 and R7 share track round a quarter circle 150 m across, where their centreline is
  // smoothed zoomed out. C3 runs 30 km east across Madrid, with a point every 10 m, first.
  const turn = Array.from({ length: 25 }, (_, i): [number, number] => [1000 + 150 * Math.sin((i * Math.PI) / 48), 3150 - 150 * Math.cos((i * Math.PI) / 48)]);
  const round = ['R1', 'R3', 'R4', 'R7'];
  const lines = [line('R2', 'R2'), line('R11', 'R11'), ...round.map((n) => line(n, n))];
  const shapes = [shape('R2', [0, 0], [5000, 0]), shape('R11', [2500, 40], [0, 40]), ...round.map((n) => shape(n, [0, 3000], ...turn, [1150, 4150]))];
  const kx = M * Math.cos((40.42 * Math.PI) / 180);
  const madrid: Shape = { id: 'C3', coords: Array.from({ length: 3001 }, (_, i) => [Math.round((-3.7 + (i * 10) / kx) * 1e5) / 1e5, 40.42]), dist: Array.from({ length: 3001 }, (_, i) => i * 10) };
  const alone = await sideBySide(lines, shapes);
  const both = await sideBySide([{ ...line('C3', 'C3'), network: 'cercanias-madrid' }, ...lines], [madrid, ...shapes]);
  expect(alone.centrelines.some((c) => c.id.includes(SMOOTH))).toBe(true);
  // The other Lines' strokes in each band, and their slots, by the points of the line each is on there,
  // whatever its Stretch is called; and their rails and tracks.
  const drawn = ({ strokes, centrelines, rails, slots, tracks }: typeof alone) => {
    const byId = new Map([...shapes, ...centrelines].map((s) => [s.id, s]));
    const theirs = <T extends { line: string }>(list: T[]) => list.filter((s) => s.line !== 'C3');
    return {
      strokes: BANDS.flatMap((_, band) => theirs(strokes).filter((s) => drawnIn(s, band)).map(({ shape, across, ...s }) => ({ ...s, band, on: inBand(byId, shape, band)?.coords }))),
      slots: theirs(slots).map(({ on, ...s }) => ({ ...s, on: byId.get(on)?.coords })),
      rails: theirs(rails),
      tracks: theirs(tracks),
    };
  };
  expect(drawn(both)).toEqual(drawn(alone));
});

test("starts the IDs of the Stretches' centrelines, their smoothed copies and the curves between them with a region's, where it's given one, and draws the same", async () => {
  // R2, R11 and R14 share track for 2.5 km, where R14 turns off: centrelines, smoothed ones and curves in each band.
  const lines = [line('R2', 'R2'), line('R11', 'R11'), line('R14', 'R14')];
  const shapes = [shape('R2', [0, 0], [5000, 0]), shape('R11', [0, 0], [5000, 0]), shape('R14', [0, 0], [2500, 0], [5000, 1500])];
  const [plain, region] = [await sideBySide(lines, shapes), await sideBySide(lines, shapes, 'catalonia')];
  const led = (id: string) => id.replace(/^stretch:(link)?/, (lead) => `${lead}catalonia:`);
  expect(plain.centrelines.some((c) => c.id.startsWith(LINK))).toBe(true);
  expect(plain.centrelines.some((c) => c.id.includes(SMOOTH))).toBe(true);
  expect(region.centrelines.map((c) => c.id)).toEqual(plain.centrelines.map((c) => led(c.id)));
  expect(region.centrelines.every((c) => c.id.startsWith(STRETCH))).toBe(true);
  // Everything that names one of them does so by its new ID, and is otherwise as it was.
  const named = <T extends { shape: string }>(strokes: T[]) => strokes.map((s) => ({ ...s, shape: s.shape.startsWith(STRETCH) ? led(s.shape) : s.shape }));
  expect(region.strokes).toEqual(named(plain.strokes).map((s) => ({ ...s, ...('across' in s ? { across: (s.across as [string, number, number][]).map(([id, a, b]) => [led(id), a, b]) } : {}) })));
  expect(region.rails).toEqual(named(plain.rails));
  expect(region.slots).toEqual(plain.slots.map((s) => ({ ...s, on: s.on.startsWith(STRETCH) ? led(s.on) : s.on })));
  expect(region.tracks).toEqual(plain.tracks);
});

/** The regions the Lines of the tests below are in, by their IDs: a Line's, or its own ID. */
const regionOf = (regions: Record<string, string>) => (l: Line) => regions[l.id] ?? l.id;

test('finds the track that Lines of two regions run along, as Stretches they would share on one line graph, once for each, where it is and which Lines', () => {
  // C4, of Bilbao's region, runs along R2's track, of León's, from 3 km to 5 km; C1 is on its own.
  const lines = [line('R2', 'R2'), line('C4', 'C4'), line('C1', 'C1')];
  const shapes = [shape('R2', [0, 0], [5000, 0]), shape('C4', [3000, 0], [5000, 0]), shape('C1', [0, 2000], [5000, 2000])];
  const [found] = sharedTrack(lines, shapes, regionOf({ R2: 'leon', C4: 'bilbao', C1: 'bilbao' }));
  expect(sharedTrack(lines, shapes, regionOf({ R2: 'leon', C4: 'bilbao', C1: 'bilbao' }))).toHaveLength(1);
  expect(found?.regions).toEqual(['leon', 'bilbao']);
  expect(found?.stretches).toBe(1);
  expect(Math.abs((found?.metres ?? NaN) - 2000)).toBeLessThanOrEqual(100);
  expect(found?.lines.sort()).toEqual(['C4', 'R2']);
  // Where the first piece of it is: about 3 km east of the origin.
  const [lon, lat] = found?.at ?? [NaN, NaN];
  expect(Math.abs((lon - LON) * M * COS - 3000)).toBeLessThan(60);
  expect(Math.abs((lat - LAT) * M)).toBeLessThan(5);
});

test('finds tracks too close to tell apart zoomed out, as a Stretch takes them, but not tracks further apart, nor those that cross', () => {
  const lines = [line('R2', 'R2'), line('near', 'near'), line('far', 'far'), line('cross', 'cross')];
  const shapes = [shape('R2', [0, 0], [5000, 0]), shape('near', [0, 40], [5000, 40]), shape('far', [0, 300], [5000, 300]), shape('cross', [2500, -2000], [2500, 2000])];
  const found = sharedTrack(lines, shapes, regionOf({ R2: 'a', near: 'b', far: 'c', cross: 'd' }));
  expect(found.map((s) => s.regions)).toEqual([['a', 'b']]);
  expect(Math.abs((found[0]?.metres ?? NaN) - 5000)).toBeLessThanOrEqual(100);
});

test("finds nothing where Lines share track within one region, however many, or where no Line is near another's", () => {
  const lines = [line('R2', 'R2'), line('R11', 'R11'), line('C1', 'C1')];
  const shapes = [shape('R2', [0, 0], [5000, 0]), shape('R11', [0, 0], [5000, 0]), shape('C1', [0, 5000], [5000, 5000])];
  expect(sharedTrack(lines, shapes, regionOf({ R2: 'catalonia', R11: 'catalonia', C1: 'madrid' }))).toEqual([]);
});

test('counts each run of shared track as a Stretch of its own, and a Line running it both ways once', () => {
  // The same 1 km shared twice, 2 km apart, and R2 running both ways along them.
  const lines = [line('R2', 'R2', 'R2_INV'), line('C4', 'C4')];
  const shapes = [shape('R2', [0, 0], [5000, 0]), shape('R2_INV', [5000, 0], [0, 0]), shape('C4', [500, 0], [1500, 0], [1500, 3000], [3500, 3000], [3500, 0], [4500, 0])];
  const [found] = sharedTrack(lines, shapes, regionOf({ R2: 'a', R2_INV: 'a', C4: 'b' }));
  expect(found?.stretches).toBe(2);
  expect(Math.abs((found?.metres ?? NaN) - 2000)).toBeLessThanOrEqual(100);
});
