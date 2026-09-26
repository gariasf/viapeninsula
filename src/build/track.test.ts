import { expect, test } from 'vitest';
import type { Shape, Station } from '../bundle.ts';
import type { OsmWay } from './osm.ts';
import { eachWay, traceShapes } from './track.ts';

// A small railway, drawn in metres east (x) and north (y) of a point near Manresa.
const M = (6_371_008.8 * Math.PI) / 180; // metres in a degree of latitude
const LON = 1.8;
const LAT = 41.7;
const COS = Math.cos((LAT * Math.PI) / 180);
const at = (x: number, y: number): [number, number] => [LON + x / (M * COS), LAT + y / M];
const metres = ([lon, lat]: [number, number]) => [(lon - LON) * M * COS, (lat - LAT) * M];

/** Ways through the named points, each "a b c" with any tags beyond Iberian-gauge rail. */
function rails(points: Record<string, [x: number, y: number]>, ...ways: (string | [string, Record<string, string>])[]): OsmWay[] {
  const ids = Object.keys(points);
  return ways.map((way, i) => {
    const [names, tags] = typeof way === 'string' ? [way] : way;
    const list = names.split(' ');
    return {
      id: i + 1,
      nodes: list.map((n) => ids.indexOf(n) + 1),
      geometry: list.map((n) => {
        const [lon, lat] = at(...(points[n] ?? [NaN, NaN]));
        return { lon, lat };
      }),
      tags: { railway: 'rail', gauge: '1668', ...tags },
    };
  });
}

const station = (id: string, x: number, y: number): Station => {
  const [lon, lat] = at(x, y);
  return { id, name: id, lon, lat };
};

type FeedIn = { id: string; feed: [number, number][]; stations: string };

function trace(rails: OsmWay[], stations: Station[], ...shapes: FeedIn[]) {
  return traceKeeping('right', rails, stations, ...shapes);
}

/** Traces shapes for a Network whose Trains keep to one side of double track. */
function traceKeeping(side: 'left' | 'right', rails: OsmWay[], stations: Station[], ...shapes: FeedIn[]) {
  const log: string[] = [];
  const traced = traceShapes(
    shapes.map((s) => ({ id: s.id, coords: s.feed.map(([x, y]) => at(x, y)), stations: s.stations.split(' ') })),
    stations,
    rails,
    side,
    (line) => log.push(line),
  );
  const shape = (id: string) => {
    const found = traced.find((s) => s.id === id);
    if (!found) throw new Error(`No shape ${id}`);
    return found;
  };
  return { log, shape };
}

/** A traced shape's points, back in metres and rounded to the metre. */
const points = (shape: Shape) => shape.coords.map((c) => metres(c).map(Math.round));

/** Whether a traced shape passes within a couple of metres of a point. */
const passes = (shape: Shape, x: number, y: number) =>
  shape.coords.some((c) => {
    const [px = NaN, py = NaN] = metres(c);
    return Math.hypot(px - x, py - y) < 2;
  });

/** A line d metres left of a centre line through corners given in metres, or right where negative. */
function offset(centre: [number, number][], d: number): [number, number][] {
  return centre.map(([x, y], i) => {
    // Offset each corner along the bisector of the normals of the straights either side of it.
    const [px, py] = centre[Math.max(0, i - 1)] ?? [x, y];
    const [nx, ny] = centre[Math.min(centre.length - 1, i + 1)] ?? [x, y];
    const n = (ax: number, ay: number, bx: number, by: number) => [-(by - ay) / Math.hypot(bx - ax, by - ay), (bx - ax) / Math.hypot(bx - ax, by - ay)];
    const [n1x = 0, n1y = 0] = i > 0 ? n(px, py, x, y) : n(x, y, nx, ny);
    const [n2x = 0, n2y = 0] = i < centre.length - 1 ? n(x, y, nx, ny) : n(px, py, x, y);
    const [mx, my] = [n1x + n2x, n1y + n2y];
    const scale = d / ((mx * n1x + my * n1y) / Math.hypot(mx, my)) / Math.hypot(mx, my);
    return [x + mx * scale, y + my * scale] as [number, number];
  });
}

/**
 * Double track, 4 m apart, bending north-east and back so that each bend's inside track is the other
 * one. Scissors crossovers halfway along each straight let a train change track either way; each
 * crossover's middle is returned, to tell whether a trace used it.
 */
function doubleTrack(): { ways: OsmWay[]; crossovers: [number, number][] } {
  const centre: [number, number][] = [[0, 0], [1000, 0], [2000, 300], [3000, 300], [4000, 0], [5000, 0]];
  const beside = (d: number) => offset(centre, d);
  const [left, right] = [beside(2), beside(-2)];
  const points: Record<string, [number, number]> = {};
  const track = (name: string, line: [number, number][]) =>
    line.flatMap(([x, y], i) => {
      points[`${name}${i}`] = [x, y];
      const next = line[i + 1];
      if (!next) return [`${name}${i}`];
      // Nodes 45% and 55% of the way along each straight, where the crossovers are.
      return [`${name}${i}`, ...[0.45, 0.55].map((f) => {
        points[`${name}${i}.${f}`] = [x + (next[0] - x) * f, y + (next[1] - y) * f];
        return `${name}${i}.${f}`;
      })];
    });
  const [l, r] = [track('l', left).join(' '), track('r', right).join(' ')];
  const crossovers: [number, number][] = [];
  const scissors = centre.slice(1).flatMap((_, i) =>
    [['l', 'r'], ['r', 'l']].map(([a, b]) => {
      const [ax = 0, ay = 0] = points[`${a}${i}.0.45`] ?? [];
      const [bx = 0, by = 0] = points[`${b}${i}.0.55`] ?? [];
      const mid = `x${a}${i}`;
      points[mid] = [(ax + bx) / 2, (ay + by) / 2];
      crossovers.push(points[mid]);
      return [`${a}${i}.0.45 ${mid} ${b}${i}.0.55`, { service: 'crossover' }] as [string, Record<string, string>];
    }),
  );
  return { ways: rails(points, l, r, ...scissors), crossovers };
}

test("follows the rails instead of the feed's shape, from Station to Station", () => {
  const { shape } = trace(
    rails({ a: [0, 0], b: [1000, 0], c: [2000, 0], d: [3000, 0], e: [4000, 0] }, 'a b c d e'),
    [station('A', 500, 20), station('B', 3500, -15)],
    { id: 'line', feed: [[0, 1.5], [2000, 3], [4000, 1.5]], stations: 'A B' },
  );
  expect(points(shape('line'))).toEqual([[500, 0], [1000, 0], [2000, 0], [3000, 0], [3500, 0]]);
  expect(shape('line').dist).toEqual([0, 500, 1500, 2500, 3000]);
});

test("takes each leg of a junction the way trains can, and never turns back at a switch", () => {
  // A triangular junction: trains from the west turn north by the west leg, trains from the east by the east leg.
  const { shape, log } = trace(
    rails(
      { w: [0, 0], j1: [1000, 0], j2: [4000, 0], e: [5000, 0], a: [1600, 200], b: [3400, 200], k: [2500, 1200], n: [2500, 3000] },
      'w j1 j2 e',
      'j1 a k',
      'j2 b k',
      'k n',
    ),
    [station('W', 500, 10), station('M', 2990, -10), station('E', 4500, 10), station('N', 2500, 2500)],
    { id: 'from W', feed: [[500, 0], [1000, 0], [2500, 1200], [2500, 2500]], stations: 'W N' },
    { id: 'from E', feed: [[4500, 0], [4000, 0], [2500, 1200], [2500, 2500]], stations: 'E N' },
    // Between the switches, the line north is behind a train whichever way it sets off.
    { id: 'from M', feed: [[3000, 0], [3000, 1200], [2500, 2500]], stations: 'M N' },
  );
  expect(passes(shape('from W'), 1600, 200)).toBe(true);
  expect(passes(shape('from E'), 3400, 200)).toBe(true);
  expect(points(shape('from M'))).toEqual([[3000, 0], [3000, 1200], [2500, 2500]]);
  expect(log).toContain("from M: M → N keeps the feed's shape: no path along the rails");
});

test("traces the Stations its Trips serve beyond either end of the feed's shape, in order", () => {
  const { shape, log } = trace(
    rails({ a: [0, 0], b: [1000, 0], c: [2000, 0], d: [3000, 0], e: [4000, 0], f: [5000, 0], g: [6000, 0] }, 'a b c d e f g'),
    [station('P', 500, 10), station('B', 1500, 10), station('C', 2500, 10), station('Q', 4000, 10), station('R', 5500, 10)],
    // The feed's shape stops short of where some Trips run, at both ends.
    { id: 'line', feed: [[1000, 1], [3000, 1]], stations: 'R P C Q B' },
  );
  expect(points(shape('line'))).toEqual([[500, 0], [1000, 0], [1500, 0], [2000, 0], [2500, 0], [3000, 0], [4000, 0], [5000, 0], [5500, 0]]);
  // Only B → C can be held against the feed.
  expect(log).toEqual(['line: 5.0 km long. Where the feed has the track: 1.0 km traced against its 1.0 km (+0.0%)']);
});

// A main line with a branch north to a terminus T, which trains reach from either side by the legs of a triangle.
const branch = () =>
  rails(
    { a: [0, 0], j1: [1800, 0], j2: [2200, 0], c: [4000, 0], k: [2000, 300], t: [2000, 1500] },
    'a j1 j2 c',
    'j1 k',
    'j2 k',
    'k t',
  );

test("turns back at a terminus where the feed's shape runs out to it and back", () => {
  // Like R16's shape, out to Tortosa and back to the main line.
  const { shape, log } = trace(
    branch(),
    [station('A', 500, 10), station('T', 2010, 1490), station('C', 3500, 10)],
    { id: 'line', feed: [[500, 1], [1800, 1], [2000, 300], [2000, 1500], [2000, 300], [2200, 1], [3500, 1]], stations: 'A T C' },
  );
  // Nor does it turn back at A on the way to C: the triangle's other leg takes it on without.
  expect(log.filter((line) => line.includes("keeps the feed's shape") || line.includes('turns back'))).toEqual([]);
  // It turns back where T is closest to the rails, short of the buffer stop.
  expect(passes(shape('line'), 2000, 1490)).toBe(true);
  expect(passes(shape('line'), 3500, 0)).toBe(true);
});

test('turns back at a Station on the way between two others, as Trains do, and not at a switch', () => {
  // Like R16's shape: out along the branch to Tortosa (T), back to the switch short of L'Aldea (L),
  // and on down the main line to Ulldecona (U). From T, a Train must turn back to reach U, and the
  // first Station it can turn back at is L.
  const { shape, log } = trace(
    rails({ a: [0, 0], j: [2000, 0], c: [20000, 0], k: [2600, 300], t: [2600, 1500] }, 'a j c', 'j k t'),
    [station('A', 500, 10), station('L', 1600, 10), station('T', 2610, 1400), station('U', 19500, 10)],
    { id: 'line', feed: [[500, 1], [2000, 1], [2600, 301], [2600, 1401], [2600, 301], [2000, 1], [20000, 1]], stations: 'A L T U' },
  );
  expect(log.filter((line) => line.includes("keeps the feed's shape"))).toEqual([]);
  expect(points(shape('line'))).toEqual([[500, 0], [1600, 0], [2000, 0], [2600, 300], [2600, 1400], [2600, 300], [2000, 0], [1600, 0], [2000, 0], [19500, 0]]);
  // As a trace that can't carry on would, it reports where it turns back.
  expect(log).toContain('line: T → U turns back at L');
});

test("leaves out a Station on a branch off the feed's shape, rather than run out to it and back", () => {
  // Like Estació de França, which a few R2N Trips run to off their shape's way through Barcelona.
  const { shape, log } = trace(
    branch(),
    [station('A', 500, 10), station('T', 2010, 1490), station('C', 3500, 10)],
    { id: 'line', feed: [[0, 1], [4000, 1]], stations: 'A T C' },
  );
  expect(points(shape('line'))).toEqual([[500, 0], [1800, 0], [2200, 0], [3500, 0]]);
  expect(log).toContain("line leaves out T: it lies off the feed's shape, on a branch");
});

test("keeps the feed's shape where the rails don't reach, and reports it", () => {
  const { shape, log } = trace(
    // A gap in the rails between B and C, and nothing near D.
    rails({ a: [0, 0], b: [1000, 0], c: [2000, 0], d: [2100, 0], e: [4000, 0] }, 'a b c', 'd e'),
    [station('A', 500, 10), station('B', 1500, 10), station('C', 3000, 10), station('D', 9000, 10)],
    { id: 'line', feed: [[0, 1], [10000, 1]], stations: 'A B C D' },
  );
  expect(points(shape('line'))).toEqual([[500, 0], [1000, 0], [1500, 0], [1500, 1], [3000, 1], [9000, 1]]);
  expect(log).toEqual([
    "line: B → C keeps the feed's shape: no path along the rails",
    "line: C → D keeps the feed's shape: D is off the network",
    'line: 8.5 km long. Where the feed has the track: 1.0 km traced against its 1.0 km (+0.0%)',
  ]);
});

test("draws nothing for Stations off the network beyond the end of the feed's shape", () => {
  // Like R15's, which stops at Riba-roja, while its Trips run on past Faió into Aragon, beyond the rails.
  const { shape } = trace(
    rails({ a: [0, 0], b: [1000, 0], c: [2000, 0] }, 'a b c'),
    [station('A', 500, 10), station('B', 1500, 10), station('C', 5000, 10), station('D', 9000, 10)],
    { id: 'line', feed: [[0, 1], [1000, 1]], stations: 'A B C D' },
  );
  expect(points(shape('line'))).toEqual([[500, 0], [1000, 0], [1500, 0]]);
});

test("keeps the feed's shape when its Trips serve fewer than two Stations", () => {
  const { shape, log } = trace(
    rails({ a: [0, 0], b: [4000, 0] }, 'a b'),
    [station('A', 500, 10)],
    { id: 'line', feed: [[0, 1], [4000, 1]], stations: 'A' },
  );
  expect(points(shape('line'))).toEqual([[0, 1], [4000, 1]]);
  expect(log).toEqual(["line keeps the feed's shape: its Trips serve fewer than two Stations"]);
});

test("reports each traced shape's length against the feed's, and fails when one is more than 5% off", () => {
  const { log } = trace(
    rails({ a: [0, 0], b: [1000, 0], c: [2000, 0], d: [3000, 0], e: [4000, 0] }, 'a b c d e'),
    [station('A', 500, 10), station('B', 3500, 10)],
    { id: 'line', feed: [[0, 1], [4000, 1]], stations: 'A B' },
  );
  expect(log).toEqual(['line: 3.0 km long. Where the feed has the track: 3.0 km traced against its 3.0 km (+0.0%)']);

  // The only rails between A and B take a long way round, as if OpenStreetMap had them on an old alignment.
  const detour = () =>
    trace(
      rails({ a: [0, 0], b: [1000, 0], c: [1500, 800], d: [2500, 800], e: [3000, 0], f: [4000, 0] }, 'a b c d e f'),
      [station('A', 500, 10), station('B', 3500, 10)],
      { id: 'line', feed: [[0, 1], [4000, 1]], stations: 'A B' },
    );
  expect(detour).toThrow("line's traced track is 3.9 km against the feed's 3.0 km (+29.6%)");
});

test("doesn't fail a short shape for stopping at the near side of a Station's rails, as the Montjuïc funicular does", () => {
  // Q's rails spread over 40 m, and the trace stops at the first of them it reaches, 5.7% short on a
  // 700 m line.
  const { log } = trace(
    rails({ a: [0, 0], b: [660, 0], c: [720, 0] }, 'a b', 'b c'),
    [station('P', 0, 10), station('Q', 700, 0)],
    { id: 'line', feed: [[0, 1], [720, 1]], stations: 'P Q' },
  );
  expect(log).toEqual(['line: 0.7 km long. Where the feed has the track: 0.7 km traced against its 0.7 km (-5.7%)']);
});

test('stays on one track of a double track instead of zig-zagging across the crossovers', () => {
  const { ways, crossovers } = doubleTrack();
  const { shape } = trace(
    ways,
    [station('A', 0, -12), station('B', 2500, 312), station('C', 5000, -12)],
    { id: 'line', feed: [[0, 1], [1000, 1], [2000, 301], [3000, 301], [4000, 1], [5000, 1]], stations: 'A B C' },
  );
  expect(crossovers.filter(([x, y]) => passes(shape('line'), x, y))).toEqual([]);
});

test('arrives at a junction Station on the track the line leaves it by', () => {
  // As at Sant Vicenç de Calders: the line west to W leaves from the north track only, and the
  // south track, a shade shorter from E, carries on elsewhere. A crossover east of S joins them.
  const { shape, log } = trace(
    rails(
      {
        n4: [4000, 2], n3: [3500, 2], n27: [2700, 2], bulge: [2350, 12], n2: [2000, 2], n15: [1500, 2], n0: [0, 2],
        s4: [4000, -2], s28: [2800, -2], s2: [2000, -2], s0: [0, -2], x: [2750, 0], b: [1000, 60], w: [0, 300],
      },
      'n4 n3 n27 bulge n2 n15 n0',
      's4 s28 s2 s0',
      ['s28 x n27', { service: 'crossover' }],
      'n15 b w',
    ),
    [station('E', 3500, -10), station('S', 2000, -10), station('W', 0, 310)],
    { id: 'line', feed: [[3500, 0], [2000, 0], [1500, 2], [0, 300]], stations: 'E S W' },
  );
  expect(log.filter((line) => line.includes("keeps the feed's shape"))).toEqual([]);
  expect(passes(shape('line'), 1000, 60)).toBe(true);
});

test("doesn't detour into a siding beside a Station", () => {
  const { shape } = trace(
    rails(
      { a: [0, 0], b: [1000, 0], s: [1600, 0], c: [2000, 0], d: [3000, 0], e: [4000, 0], s1: [1800, 5], s2: [2400, 5] },
      'a b s c d e',
      ['s s1 s2', { service: 'siding' }],
    ),
    // B's nearest rail is the siding, 4 m away; the main line is 9 m away.
    [station('A', 500, 10), station('B', 2100, 9), station('C', 3500, 10)],
    { id: 'line', feed: [[0, 1], [4000, 1]], stations: 'A B C' },
  );
  expect(points(shape('line')).filter(([, y]) => y !== 0)).toEqual([]);
});

test('gives Lines that share track the same geometry there', () => {
  // On its own, Y would take the south track: from B its bends are mostly to the right.
  const { shape } = trace(
    doubleTrack().ways,
    [station('A', 0, -12), station('B', 1200, 72), station('C', 5000, -12)],
    { id: 'X', feed: [[0, 1], [1000, 1], [2000, 301], [3000, 301], [4000, 1], [5000, 1]], stations: 'A B C' },
    { id: 'Y', feed: [[1200, 61], [2000, 301], [3000, 301], [4000, 1], [5000, 1]], stations: 'B C' },
  );
  const [x, y] = [shape('X').coords, shape('Y').coords];
  expect(x.slice(x.length - y.length)).toEqual(y);
});

test('gives each shape once for each way its Trips run it, turned round for the way back', () => {
  const stations = [station('A', 0, 10), station('B', 2000, 10), station('C', 4000, 10)];
  const feed = (id: string) => ({ id, coords: [at(0, 0), at(4000, 0)], stations: ['A', 'B', 'C'] });
  const { shapes, shapeOf } = eachWay([feed('both'), feed('back'), feed('ahead')], stations, [
    { shape: 'both', from: 'A', to: 'C' },
    { shape: 'both', from: 'C', to: 'B' },
    // Like every R7 Trip.
    { shape: 'back', from: 'B', to: 'A' },
    { shape: 'ahead', from: 'B', to: 'C' },
  ]);
  expect(shapes.map((s) => ({ id: s.id, coords: s.coords.map((c) => metres(c).map(Math.round)), stations: s.stations }))).toEqual([
    { id: 'both', coords: [[0, 0], [4000, 0]], stations: ['A', 'B', 'C'] },
    { id: 'both:back', coords: [[4000, 0], [0, 0]], stations: ['A', 'B', 'C'] },
    { id: 'back:back', coords: [[4000, 0], [0, 0]], stations: ['A', 'B', 'C'] },
    { id: 'ahead', coords: [[0, 0], [4000, 0]], stations: ['A', 'B', 'C'] },
  ]);
  expect(['both A B', 'both B A', 'back C A', 'ahead A C'].map((t) => t.split(' ')).map(([shape = '', from = '', to = '']) => shapeOf({ shape, from, to }))).toEqual([
    'both',
    'both:back',
    'back:back',
    'ahead',
  ]);
});

const EAST: [number, number][] = [[0, 1], [1000, 1], [2000, 301], [3000, 301], [4000, 1], [5000, 1]];

test.for(['right', 'left'] as const)('traces each way along double track on the track Trains keep to going that way (keeping %s)', (side) => {
  const { shape } = traceKeeping(
    side,
    doubleTrack().ways,
    [station('A', 0, -12), station('C', 5000, -12)],
    { id: 'east', feed: EAST, stations: 'A C' },
    { id: 'west', feed: EAST.toReversed(), stations: 'A C' },
  );
  // Going east, the south track is on the right; going west, the north one.
  const [east, west] = side === 'right' ? [-2, 2] : [2, -2];
  for (const x of [450, 4450]) {
    expect([passes(shape('east'), x, east), passes(shape('east'), x, -east)]).toEqual([true, false]);
    expect([passes(shape('west'), x, west), passes(shape('west'), x, -west)]).toEqual([true, false]);
  }
});

test("follows OpenStreetMap's tags for which way Trains run each track, where they differ from the Network's side", () => {
  // As on the Metro's L2 between Tetuan and Paral·lel, which runs on the left though the rest keeps right.
  const ways = doubleTrack().ways;
  const [north, south] = ways;
  if (north) north.tags['railway:preferred_direction'] = 'forward'; // drawn west to east
  if (south) south.tags['railway:preferred_direction'] = 'backward';
  const { shape } = trace(
    ways,
    [station('A', 0, -12), station('C', 5000, -12)],
    { id: 'east', feed: EAST, stations: 'A C' },
    { id: 'west', feed: EAST.toReversed(), stations: 'A C' },
  );
  for (const x of [450, 4450]) {
    expect([passes(shape('east'), x, 2), passes(shape('west'), x, -2)]).toEqual([true, true]);
  }
});

test("pays no heed to a tag on one track of a pair alone, as R8's near Castellbisbal", () => {
  const ways = doubleTrack().ways;
  const [north] = ways;
  if (north) north.tags['railway:preferred_direction'] = 'forward';
  const { shape } = trace(ways, [station('A', 0, -12), station('C', 5000, -12)], { id: 'east', feed: EAST, stations: 'A C' });
  for (const x of [450, 4450]) expect(passes(shape('east'), x, -2)).toBe(true);
});

test('shares single track between both ways', () => {
  const { shape } = trace(
    rails({ a: [0, 0], b: [1000, 0], c: [2000, 0] }, 'a b c'),
    [station('A', 0, 10), station('C', 2000, 10)],
    { id: 'east', feed: [[0, 1], [2000, 1]], stations: 'A C' },
    { id: 'west', feed: [[2000, 1], [0, 1]], stations: 'A C' },
  );
  expect(points(shape('west'))).toEqual(points(shape('east')).toReversed());
});

test('keeps each way to its side of the pair of tracks it runs on, where four run side by side', () => {
  // Two double tracks run side by side between x = 1000 and 4000: N's pair to the north, from NW to
  // NE, and S's to the south, from SW to SE. Each pair's tracks are 5 m apart, but the pairs only 4 m,
  // so a track's nearest isn't always the other of its pair. Each pair bends away from the other at
  // both ends, so its inner track is the longer.
  const n: [number, number][] = [[0, 300], [1000, 4.5], [4000, 4.5], [5000, 300]];
  const s = n.map(([x, y]): [number, number] => [x, -y]);
  const points: Record<string, [number, number]> = {};
  const way = (name: string, line: [number, number][]) => line.map((p, i) => ((points[`${name}${i}`] = p), `${name}${i}`)).join(' ');
  const { shape } = trace(
    rails(points, way('n', offset(n, 2.5)), way('m', offset(n, -2.5)), way('s', offset(s, 2.5)), way('t', offset(s, -2.5))),
    [station('NW', 0, 314), station('NE', 5000, 314), station('SW', 0, -314), station('SE', 5000, -314)],
    { id: 'N east', feed: n, stations: 'NW NE' },
    { id: 'N west', feed: n.toReversed(), stations: 'NW NE' },
    { id: 'S east', feed: s, stations: 'SW SE' },
    { id: 'S west', feed: s.toReversed(), stations: 'SW SE' },
  );
  const track = (id: string) => [7, 2, -2, -7].filter((y) => passes(shape(id), 1000, y) && passes(shape(id), 4000, y));
  expect(['N east', 'N west', 'S east', 'S west'].map(track)).toEqual([[2], [7], [-7], [-2]]);
});

test("doesn't give Lines going opposite ways the same track where there are two", () => {
  const { shape } = trace(
    doubleTrack().ways,
    [station('A', 0, -12), station('C', 5000, -12)],
    { id: 'X', feed: EAST, stations: 'A C' },
    { id: 'Y', feed: EAST.toReversed(), stations: 'A C' },
  );
  const y = new Set(points(shape('Y')).map(String));
  expect(points(shape('X')).filter((p) => y.has(String(p)))).toEqual([]);
});
