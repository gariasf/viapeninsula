import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { pointAt, type Point, type Shape, type Station } from '../bundle.ts';
import { CERCANIAS_ASTURIAS, CERCANIAS_MADRID, CERCANIAS_SANTANDER, CERCANIAS_SEVILLA, CERCANIAS_VALENCIA, RODALIES, type Gauges, type NetworkConfig } from '../networks.ts';
import { ownRails } from './networks.ts';
import type { OsmWay } from './osm.ts';
import { collect, type Found } from './report.ts';
import type { Snippet } from './snippet.ts';
import { eachWay, fine, metres as between, nearest, onOwnTrack, railGraphs, railsBeside, stationsOf, traceOwn, traceRuns, traceShapes, withLines } from './track.ts';
import { placeDays, placeTrips, type FeedTrip } from './trips.ts';

// A small railway, drawn in metres east (x) and north (y) of a point near Manresa.
const M = (6_371_008.8 * Math.PI) / 180; // metres in a degree of latitude
const LON = 1.8;
const LAT = 41.7;
const COS = Math.cos((LAT * Math.PI) / 180);
const at = (x: number, y: number): [number, number] => [LON + x / (M * COS), LAT + y / M];
const metres = ([lon, lat]: [number, number]) => [(lon - LON) * M * COS, (lat - LAT) * M];

/** Ways through the named points, each "a b c" with any tags beyond Iberian-gauge rail, or '' for one it hasn't. */
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
      tags: Object.fromEntries(Object.entries({ railway: 'rail', gauge: '1668', ...tags }).filter(([, value]) => value)),
    };
  });
}

const station = (id: string, x: number, y: number): Station => {
  const [lon, lat] = at(x, y);
  return { id, name: id, lon, lat };
};

type FeedIn = { id: string; line?: string; feed: [number, number][]; stations: string; gauges?: Gauges };

function trace(rails: OsmWay[], stations: Station[], ...shapes: FeedIn[]) {
  return traceKeeping('right', rails, stations, ...shapes);
}

/** Traces shapes for a Network whose Trains keep to one side of double track. */
function traceKeeping(side: 'left' | 'right', rails: OsmWay[], stations: Station[], ...shapes: FeedIn[]) {
  const [log, found]: [string[], Found[]] = [[], []];
  const traced = traceShapes(
    shapes.map((s) => ({ id: s.id, line: s.line ?? 'line', coords: s.feed.map(([x, y]) => at(x, y)), stations: s.stations.split(' '), ...(s.gauges && { gauges: s.gauges }) })),
    stations,
    rails,
    side,
    (line) => log.push(line),
    (f) => found.push(f),
  );
  const shape = (id: string) => {
    const one = traced.find((s) => s.id === id);
    if (!one) throw new Error(`No shape ${id}`);
    return one;
  };
  return { log, found, shape };
}

/** A traced shape's points, back in metres and rounded to the metre. */
const points = (shape: Shape) => shape.coords.map((c) => metres(c).map(Math.round));

/** Whether a traced shape passes within a metre and a half of a point: crossovers here are 2 m off either track. */
const passes = (shape: Shape, x: number, y: number) =>
  shape.coords.some((c) => {
    const [px = NaN, py = NaN] = metres(c);
    return Math.hypot(px - x, py - y) < 1.5;
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

// R15's Stations either side of its shape's end at Riba-roja (B): its line turns north at La Puebla
// de Híjar (P), and La Zaida-Sástago (Z), the next Station on, is the nearer of the two to Riba-roja.
const R15 = [station('A', 0, 10), station('B', 2000, 10), station('S', 6000, 10), station('P', 8000, -10), station('Z', 7800, 1500)];

test("traces the Stations beyond the end of the feed's shape in the order the line reaches them, where it bends back toward that end", () => {
  const { shape } = trace(
    rails({ a: [0, 0], b: [2000, 0], s: [6000, 0], p: [8000, 0], z: [7800, 1500] }, 'a b s p z'),
    R15,
    { id: 'line', feed: [[0, 1], [2000, 1]], stations: 'A B S P Z' },
  );
  expect(points(shape('line'))).toEqual([[0, 0], [2000, 0], [6000, 0], [8000, 0], [7800, 1500]]);
});

test('runs a Trip wholly beyond the end of its shape the way the line reaches its Stations there, where it bends back toward that end', () => {
  const feed = { id: 'line', line: 'R15', coords: [at(0, 1), at(2000, 1)], stations: ['A', 'B', 'S', 'P', 'Z'] };
  const { shapes, shapeOf } = eachWay([feed], R15, [{ shape: 'line', from: 'P', to: 'Z' }]);
  expect(shapes.map((s) => s.id)).toEqual(['line']);
  expect([['P', 'Z'], ['Z', 'P']].map(([from = '', to = '']) => shapeOf({ shape: 'line', from, to }))).toEqual(['line', 'line:back']);
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

test("reports a shape, its way back and the feed's own shape the other way, each turning back at one Station, as one spot", () => {
  // As R16's 51_R16, 51_R16:back and 51_R16_INV all turn back at L'Aldea.
  const feed: [number, number][] = [[500, 1], [2000, 1], [2600, 301], [2600, 1401], [2600, 301], [2000, 1], [20000, 1]];
  const { found } = trace(
    rails({ a: [0, 0], j: [2000, 0], c: [20000, 0], k: [2600, 300], t: [2600, 1500] }, 'a j c', 'j k t'),
    [station('A', 500, 10), station('L', 1600, 10), station('T', 2610, 1400), station('U', 19500, 10)],
    { id: 'R16', line: 'rodalies:R16', feed, stations: 'A L T U' },
    { id: 'R16:back', line: 'rodalies:R16', feed: feed.toReversed(), stations: 'A L T U' },
    { id: 'R16_INV', line: 'rodalies:R16', feed: feed.toReversed(), stations: 'A L T U' },
  );
  const report = collect();
  for (const f of found) report.add(f);
  expect(report.spots().filter((s) => s.kind === 'turn')).toMatchObject([
    {
      key: 'turn rodalies:R16 L',
      stations: [{ id: 'L', name: 'L' }],
      text: ['R16: T → U turns back at L', 'R16:back: U → T turns back at L', 'R16_INV: U → T turns back at L'],
    },
  ]);
  // A length is the feed's shape's, whichever way it's traced: the feed's shape the other way has its own.
  expect(report.spots().filter((s) => s.kind === 'length').map((s) => s.key)).toEqual(['length rodalies:R16 R16', 'length rodalies:R16 R16_INV']);
});

test("turns back at L'Aldea on R16's way from Camp-redó to Ulldecona, on OpenStreetMap's rails as they were", () => {
  // `npm run snippet -- 40.70163,0.48614 laldea 14`: 14 km round a point between Tortosa and Ulldecona,
  // from the rails downloaded on 4 Oct 2026 and Renfe's timetable of 24 Sep 2026.
  const { rails, shapes, stations } = JSON.parse(readFileSync(new URL('fixtures/osm/laldea.json', import.meta.url), 'utf8')) as Snippet;
  const log: string[] = [];
  traceShapes(shapes, stations, ownRails(rails, RODALIES), RODALIES.runningSide, (line) => log.push(line));
  // Only the turns, as in the build's own log (#63): no Station left out, nor a leg keeping the feed's shape.
  expect(log.filter((line) => !line.includes(' km long.'))).toEqual([
    "rodalies:51_R16: Camp-redó → Ulldecona-Alcanar-La Sénia turns back at L'Aldea-Amposta-Tortosa",
    "rodalies:51_R16_INV: Ulldecona-Alcanar-La Sénia → Camp-redó turns back at L'Aldea-Amposta-Tortosa",
  ]);
});

/**
 * Sevilla's C4 traced: `npm run snippet -- 'trip cercanias-sevilla:C4 fast adif:51003 adif:51100' sevilla-c4 5.4`,
 * the whole of its one shape and the rails within 5.4 km of the spot, from the rails downloaded on 9 Oct
 * 2026 and Renfe's timetable of 10 Oct 2026. C4 runs round a circle from Santa Justa to Santa Justa
 * again, and its shape starts and ends 1 m apart, 38 m from Santa Justa.
 */
function sevillaC4() {
  const { rails, shapes, stations } = JSON.parse(readFileSync(new URL('fixtures/osm/sevilla-c4.json', import.meta.url), 'utf8')) as Snippet;
  const [log, found]: [string[], Found[]] = [[], []];
  const traced = traceShapes(shapes, stations, ownRails(rails, CERCANIAS_SEVILLA), CERCANIAS_SEVILLA.runningSide, (line) => log.push(line), (f) => found.push(f));
  const [feed, track] = [shapes[0], traced[0]];
  if (!feed || !track) throw new Error('No shape of C4');
  const point = (id: string): Point => {
    const s = stations.find((o) => o.id === id);
    return [s?.lon ?? NaN, s?.lat ?? NaN];
  };
  return { shapes, stations, feed, track, log, found, point };
}

test("traces a circle Line round the whole circle, from its first Station to it again, as Sevilla's C4 is from Santa Justa", () => {
  const { feed, track, log, found, point } = sevillaC4();
  // All of the feed's 20.3 km, not the 18.6 km from Santa Justa to San Bernardo that it stopped at (#365).
  expect(log).toEqual(['cercanias-sevilla:30_C4: 20.3 km long. Where the feed has the track: 20.3 km traced against its 20.3 km (-0.0%)']);
  expect(found.map((f) => f.kind)).toEqual(['length']);
  // On the feed's shape all the way round, with no chord across it.
  const apart = (a: Point[], b: Point[]) => Math.max(...a.map((p) => nearest(b, p).metres));
  expect(apart(feed.coords, track.coords)).toBeLessThan(100);
  expect(apart(track.coords, feed.coords)).toBeLessThan(100);
  // It sets off from Santa Justa and comes back to it, by the Stations between in order.
  const [first = [NaN, NaN], last = [NaN, NaN]] = [track.coords[0], track.coords.at(-1)];
  expect(Math.max(between(first, point('adif:51003')), between(last, point('adif:51003')))).toBeLessThan(50);
  const along = ['adif:51009', 'adif:51010', 'adif:51110', 'adif:51100'].map((id) => nearest(track.coords, point(id)).along);
  expect(along.map((d) => Math.round(d / 100))).toEqual([58, 96, 169, 186]);
});

test("places a circle Line's Trips on its circle, the last call at its end, and takes each one the way round it runs, as Sevilla's C4's", () => {
  const { shapes, stations, feed, track } = sevillaC4();
  // Renfe's 3081S23605C4 of 10 Oct 2026, from Santa Justa round to it again.
  const calls = [
    { station: 'adif:51003', arrival: 24720, departure: 24720 },
    { station: 'adif:51009', arrival: 25140, departure: 25200 },
    { station: 'adif:51010', arrival: 25440, departure: 25500 },
    { station: 'adif:51110', arrival: 25860, departure: 25920 },
    { station: 'adif:51100', arrival: 26040, departure: 26100 },
    { station: 'adif:51003', arrival: 26340, departure: 26580 },
  ];
  const whole = { id: 'cercanias-sevilla:3081S23605C4', line: 'cercanias-sevilla:C4', shape: feed.id, headsign: 'Sevilla-Santa Justa', calls };
  // Trips that end at San Bernardo, as 90 of the timetable's do, and one that starts there.
  const trips = [whole, { ...whole, id: 'to San Bernardo', calls: calls.slice(0, 5) }, { ...whole, id: 'from San Bernardo', calls: calls.slice(4) }];
  const log: string[] = [];
  const placed = placeTrips(trips, [track], stations, CERCANIAS_SEVILLA.profile.topSpeed, (line) => log.push(line));
  expect(log).toEqual([]);
  const [round, ends, from] = placed.map((t) => t.calls.map((c) => c.dist));
  const length = track.dist.at(-1) ?? 0;
  expect(round?.map((d) => Math.round(d / 100))).toEqual([0, 58, 96, 169, 186, Math.round(length / 100)]);
  expect(round?.at(-1)).toBeGreaterThan(length - 100);
  expect(ends).toEqual(round?.slice(0, 5));
  expect(from).toEqual(round?.slice(4));

  // A Trip runs the shape back where it ends before it starts: those whose ends are round it either way aren't.
  const { shapes: ways, shapeOf } = eachWay(shapes, stations, [{ shape: feed.id, from: 'adif:51003', to: 'adif:51003' }]);
  expect(ways.map((s) => s.id)).toEqual([feed.id]);
  const ride = (from: string, to: string) => shapeOf({ shape: feed.id, from, to }).replace(feed.id, 'shape');
  expect([ride('adif:51003', 'adif:51003'), ride('adif:51003', 'adif:51100'), ride('adif:51009', 'adif:51003'), ride('adif:51009', 'adif:51010')]).toEqual(Array(4).fill('shape'));
  expect(ride('adif:51100', 'adif:51110')).toBe('shape:back');
});

test("leaves out a Station on a branch off the feed's shape, rather than run out to it and back", () => {
  // Like Estació de França, which a few R2N Trips run to off their shape's way through Barcelona.
  const { shape, log, found } = trace(
    branch(),
    [station('A', 500, 10), station('T', 2010, 1490), station('C', 3500, 10)],
    { id: 'line', feed: [[0, 1], [4000, 1]], stations: 'A T C' },
  );
  expect(points(shape('line'))).toEqual([[500, 0], [1800, 0], [2200, 0], [3500, 0]]);
  expect(log).toContain("line leaves out T: it lies off the feed's shape, on a branch");
  expect(found.filter((f) => f.kind === 'branch')).toMatchObject([{ line: 'line', shape: 'line', stations: [{ id: 'T' }], text: ["line leaves out T: it lies off the feed's shape, on a branch"] }]);
});

test('reports Stations left out one after another on a branch as one spot', () => {
  const { log, found } = trace(
    branch(),
    [station('A', 500, 10), station('S', 1995, 900), station('T', 2010, 1490), station('C', 3500, 10)],
    { id: 'line', feed: [[0, 1], [4000, 1]], stations: 'A S T C' },
  );
  const text = ["line leaves out S: it lies off the feed's shape, on a branch", "line leaves out T: it lies off the feed's shape, on a branch"];
  expect(log.filter((line) => line.includes('leaves out'))).toEqual(text);
  expect(found.filter((f) => f.kind === 'branch')).toMatchObject([{ stations: [{ id: 'S' }, { id: 'T' }], text }]);
});

test("keeps the feed's shape where the rails don't reach, and reports it", () => {
  const { shape, log, found } = trace(
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
  expect(found.filter((f) => f.kind === 'kept')).toMatchObject([
    { why: 'nopath', line: 'line', shape: 'line', stations: [{ id: 'B' }, { id: 'C' }], text: ["line: B → C keeps the feed's shape: no path along the rails"] },
    { why: 'off', line: 'line', shape: 'line', stations: [{ id: 'C' }, { id: 'D' }], text: ["line: C → D keeps the feed's shape: D is off the network"] },
  ]);
});

test("reports a run of legs between Stations keeping the feed's shape for one cause as one spot", () => {
  // Like Cádiz T1's tram-train section, where C and D are off the network.
  const { log, found } = trace(
    rails({ a: [0, 0], b: [2000, 0], e: [9000, 0], f: [10000, 0] }, 'a b', 'e f'),
    [station('A', 500, 10), station('B', 1500, 10), station('C', 5000, 3010), station('D', 7000, 3010), station('E', 9500, 10)],
    { id: 'line', feed: [[0, 0], [2000, 0], [5000, 3000], [7000, 3000], [9000, 0], [10000, 0]], stations: 'A B C D E' },
  );
  const text = [
    "line: B → C keeps the feed's shape: C is off the network",
    "line: C → D keeps the feed's shape: C is off the network",
    "line: D → E keeps the feed's shape: D is off the network",
  ];
  expect(log.filter((line) => line.includes("keeps the feed's shape"))).toEqual(text);
  expect(found.filter((f) => f.kind === 'kept')).toMatchObject([{ why: 'off', stations: ['B', 'C', 'D', 'E'].map((id) => ({ id })), text }]);
});

test('gives the ways a Station is on: those within 50 m of its nearest, if that is within 200 m', () => {
  // Three tracks 40 m and 100 m apart; C is half a kilometre off them.
  const ways = rails({ a: [0, 0], b: [4000, 0], c: [0, 40], d: [4000, 40], e: [0, 100], f: [4000, 100] }, 'a b', 'c d', 'e f');
  const near = railsBeside(ways, [station('A', 2000, 10), station('C', 2000, -500)]);
  expect([...near].map(([id, list]) => [id, list.map((c) => c.way.id)])).toEqual([['A', [1, 2]]]);
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
  const { shape, log, found } = trace(
    rails({ a: [0, 0], b: [4000, 0] }, 'a b'),
    [station('A', 500, 10)],
    { id: 'line', feed: [[0, 1], [4000, 1]], stations: 'A' },
  );
  expect(points(shape('line'))).toEqual([[0, 1], [4000, 1]]);
  expect(log).toEqual(["line keeps the feed's shape: its Trips serve fewer than two Stations"]);
  // At the middle of the feed's shape.
  expect(found).toMatchObject([{ kind: 'kept', why: 'fewer', shape: 'line', stations: [{ id: 'A' }], text: log }]);
  expect(metres(found[0]?.point ?? [NaN, NaN]).map(Math.round)).toEqual([2000, 1]);
});

test("reports each traced shape's length against the feed's, and fails when one is more than 5% off", () => {
  const { log, found } = trace(
    rails({ a: [0, 0], b: [1000, 0], c: [2000, 0], d: [3000, 0], e: [4000, 0] }, 'a b c d e'),
    [station('A', 500, 10), station('B', 3500, 10)],
    { id: 'line', feed: [[0, 1], [4000, 1]], stations: 'A B' },
  );
  expect(log).toEqual(['line: 3.0 km long. Where the feed has the track: 3.0 km traced against its 3.0 km (+0.0%)']);
  // At the middle of the traced shape.
  expect(found).toMatchObject([{ kind: 'length', shape: 'line', numbers: { percent: 0 }, text: log }]);
  expect(metres(found[0]?.point ?? [NaN, NaN]).map(Math.round)).toEqual([2000, 0]);

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

test("gives the level of each length of track a trace runs, from OpenStreetMap's tunnel, bridge and layer tags, but not a short bridge's", () => {
  const { shape } = trace(
    rails(
      { a: [0, 0], b: [1000, 0], c: [2000, 0], d: [3000, 0], e: [3500, 0], f: [3550, 0], g: [4000, 0], h: [5000, 0] },
      'a b',
      ['b c d', { tunnel: 'yes', layer: '-2' }],
      'd e',
      ['e f', { bridge: 'yes' }],
      'f g',
      ['g h', { bridge: 'viaduct' }],
    ),
    [station('A', 500, 0), station('B', 4800, 0)],
    { id: 'line', feed: [[0, 0], [5000, 0]], stations: 'A B' },
  );
  expect(shape('line').levels).toEqual([[500, 'tunnel -2'], [2500, ''], [3500, 'bridge 1']]);
});

test('gives no levels for a trace that runs on the ground all along', () => {
  const { shape } = trace(rails({ a: [0, 0], b: [1000, 0] }, 'a b'), [station('A', 100, 0), station('B', 900, 0)], { id: 'line', feed: [[0, 0], [1000, 0]], stations: 'A B' });
  expect(shape('line').levels).toBeUndefined();
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
  const feed = (id: string) => ({ id, line: 'R7', coords: [at(0, 0), at(4000, 0)], stations: ['A', 'B', 'C'] });
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

test("moves a Station published at another Network's point onto its own track, as one place with the other's", () => {
  // Renfe's track runs 60 m south of FGC's, but Renfe publishes its Station at FGC's.
  const shape = (id: string, y: number): Shape => {
    const coords = [at(0, y), at(1000, y)];
    return { id, coords, dist: [0, 1000] };
  };
  const [renfe, fgc] = [station('adif:1', 500, 3), station('fgc:A', 500, 1)];
  // As at Lleida, both published at the station building, over 40 m from either track, stay as they are.
  const [lleida, fgcLleida] = [station('adif:2', 2500, 0), station('fgc:B', 2500, 2)];
  const further = (s: Shape, y: number): Shape => ({ ...s, coords: [at(2000, y), at(3000, y)] });
  const [ours, theirs] = onOwnTrack([
    { stations: [renfe, lleida], shapes: [shape('r', -60), further(shape('r2', 0), -41)] },
    { stations: [fgc, fgcLleida], shapes: [shape('f', 0), further(shape('f2', 0), 45)] },
  ]);
  const moved = ours?.[0];
  expect(metres([moved?.lon ?? NaN, moved?.lat ?? NaN]).map(Math.round)).toEqual([500, -60]);
  expect(moved).toMatchObject({ id: 'adif:1', place: 'adif:1' });
  expect(theirs?.[0]).toEqual({ ...fgc, place: 'adif:1' });
  expect([ours?.[1], theirs?.[1]]).toEqual([lleida, fgcLleida]);
});

test("names the Lines whose timetable calls at each Station, whichever day, and one Station two Networks share has them all (#392)", () => {
  // Made up: R1 and R2 call at A, only R2 at B, and C has none of its Network's Lines but is one of AVE's.
  const feed = [{ line: 'rodalies:R2', stations: ['adif:A', 'adif:B'] }, { line: 'rodalies:R1', stations: ['adif:A'] }, { line: 'rodalies:R2', stations: ['adif:A'] }, { line: '', stations: ['adif:C'] }];
  const [a, b, c] = [station('adif:A', 0, 0), station('adif:B', 500, 0), station('adif:C', 900, 0)];
  expect(withLines([a, b, c], feed).map((s) => s.lines)).toEqual([['rodalies:R1', 'rodalies:R2'], ['rodalies:R2'], undefined]);
  const [rodalies, ave] = [withLines([a, b], feed), withLines([a, c], [{ line: 'ave:AVE', stations: ['adif:A', 'adif:C'] }])];
  const joined = stationsOf([
    { network: { id: 'rodalies' }, stations: rodalies, shapes: [] },
    { network: { id: 'ave' }, stations: ave, shapes: [] },
  ]);
  expect(joined.map((s) => [s.id, s.networks, s.lines])).toEqual([
    ['adif:A', ['rodalies', 'ave'], ['ave:AVE', 'rodalies:R1', 'rodalies:R2']],
    ['adif:B', ['rodalies'], ['rodalies:R2']],
    ['adif:C', ['ave'], ['ave:AVE']],
  ]);
});

test('drops the points a way carries on straight through, and keeps its ends, its bends and where another way meets it', () => {
  const ways = rails(
    { a: [0, 0], b: [100, 0.1], c: [200, 0], d: [300, 0.1], e: [400, 50], f: [300, 100] },
    'a b c d e',
    'c f',
  );
  const [main] = fine(ways);
  expect(main?.nodes).toEqual([1, 3, 4, 5]);
  expect(main?.geometry.map(({ lon, lat }) => metres([lon, lat]).map(Math.round))).toEqual([[0, 0], [200, 0], [300, 0], [400, 50]]);
});

// Long distance's Trips, which have no shapes: each run of them traced through its Stations on the
// rails of its gauges (#259), as each Line of a Network of two gauges is on its own (#366). Standard
// gauge is 1435 mm, Iberian 1668 and metre 1000.
const STANDARD: Gauges = { railway: ['rail'], gauges: ['1435'], orElse: ['1668'] };
const BOTH: Gauges = { railway: ['rail'], gauges: ['1435', '1668'] };
const IBERIAN: Gauges = { railway: ['rail'], gauges: ['1668'] };
const METRE: Gauges = { railway: ['rail', 'narrow_gauge'], gauges: ['1000'] };

/** A Trip of a Line on these rails, calling at the named Stations ten minutes apart. */
const call = (id: string, stations: string, gauges: Gauges, line = 'AVE'): FeedTrip => ({
  id,
  line,
  shape: '',
  headsign: '',
  gauges,
  calls: stations.split(' ').map((station, i) => ({ station, arrival: i * 600, departure: i * 600 })),
});

/** Traces each day's Trips, keeping right, and gives each Trip's traced track. */
function runs(rails: OsmWay[], stations: Station[], days: FeedTrip[][], changers = new Set<number>()) {
  const [log, found]: [string[], Found[]] = [[], []];
  const traced = traceRuns(days, stations, rails, changers, 'right', (line) => log.push(line), (f) => found.push(f));
  const track = (trip: string) => {
    const shape = traced.shapes.find((s) => s.id === traced.days.flat().find((t) => t.id === trip)?.shape);
    if (!shape) throw new Error(`No track for ${trip}`);
    return shape;
  };
  return { ...traced, log, found, track };
}

// A line of one gauge from A to B by s and t, partly on three rails and partly with no gauge tag, and a
// shorter one of another gauge by m: standard and Iberian unless given.
const twoLines = (long: Record<string, string> = { gauge: '1435' }, short: Record<string, string> = {}, three = '1435;1668') =>
  rails(
    { a: [0, 0], s: [1000, 500], t: [3000, 500], b: [4000, 0], m: [2000, 0] },
    ['a s', long],
    ['s t', { ...long, gauge: three }],
    ['t b', { ...long, gauge: '' }],
    ['a m b', short],
  );
const BY_S_AND_T = [[0, 0], [1000, 500], [3000, 500], [4000, 0]];

test("runs AVE on standard-gauge rails, and on those with three rails or no gauge tag, rather than the shorter Iberian-gauge line beside them", () => {
  const { track } = runs(twoLines(), [station('A', -10, 0), station('B', 4010, 0)], [[call('ave', 'A B', STANDARD)]]);
  expect(points(track('ave'))).toEqual(BY_S_AND_T);
});

test("runs MD on Iberian-gauge rails, and the ex-FEVE regionals on metre gauge, as rail or narrow_gauge, each on those with three rails or no gauge tag too, rather than a shorter line of another gauge", () => {
  const AB = [station('A', -10, 0), station('B', 4010, 0)];
  const md = runs(twoLines({ gauge: '1668' }, { gauge: '1435' }), AB, [[call('md', 'A B', IBERIAN, 'MD')]]);
  expect(points(md.track('md'))).toEqual(BY_S_AND_T);
  const feve = runs(twoLines({ railway: 'narrow_gauge', gauge: '1000' }, {}, '1000;1668'), AB, [[call('feve', 'A B', { railway: ['rail', 'narrow_gauge'], gauges: ['1000'] }, 'Regional')]]);
  expect(points(feve.track('feve'))).toEqual(BY_S_AND_T);
});

// A standard-gauge line from A to B, and two ways on from B onto an Iberian-gauge line to C: through a
// changer, k, and a shorter one through x, where the two gauges' track meets with none.
const CHANGER: Record<string, [number, number]> = { a: [0, 0], b: [2000, 0], x: [3000, 0], k: [3000, 800], c: [5000, 0] };
const changer = () => ({
  ways: rails(CHANGER, ['a b', { gauge: '1435' }], ['b x', { gauge: '1435' }], 'x c', ['b k', { gauge: '1435' }], 'k c'),
  changers: new Set([Object.keys(CHANGER).indexOf('k') + 1]),
  stations: [station('A', -10, 0), station('B', 2000, -10), station('C', 5010, 0)],
});

test("runs AVE on Iberian gauge too where a stretch has no path on standard gauge, changing gauge only at a changer", () => {
  const { ways, changers, stations } = changer();
  const { track } = runs(ways, stations, [[call('ave', 'A B C', STANDARD)]], changers);
  expect(points(track('ave'))).toEqual([[0, 0], [2000, 0], [3000, 800], [5000, 0]]);
});

test('runs Alvia on both gauges, the shorter way, and changes gauge only at a changer, which it logs', () => {
  const alvia = runs(twoLines(), [station('A', -10, 0), station('B', 4010, 0)], [[call('alvia', 'A B', BOTH, 'Alvia')]]);
  expect(points(alvia.track('alvia'))).toEqual([[0, 0], [4000, 0]]);
  const { ways, changers, stations } = changer();
  const { track, log } = runs(ways, stations, [[call('alvia', 'A B C', BOTH, 'Alvia')]], changers);
  expect(points(track('alvia'))).toEqual([[0, 0], [2000, 0], [3000, 800], [5000, 0]]);
  expect(log).toEqual(['Alvia:1: A → C, 5.4 km long, 1.08× the straight line through its 3 Stations, changing gauge between B and C']);
});

test("keeps AVE to the right-hand track of a standard-gauge double track, with an Iberian-gauge track 3 m beside it, which isn't the other of its pair", () => {
  // Double track 4 m apart, bending gently so that the north track, the bend's inside, is the shorter, and
  // an Iberian-gauge track 3 m south of the south one.
  const centre: [number, number][] = [[0, 0], [2500, -20], [5000, 0]];
  const layout: Record<string, [number, number]> = {};
  const way = (name: string, d: number) => offset(centre, d).map((p, i) => ((layout[`${name}${i}`] = p), `${name}${i}`)).join(' ');
  const ways = rails(layout, [way('n', 2), { gauge: '1435' }], [way('s', -2), { gauge: '1435' }], way('i', -5));
  const { track } = runs(ways, [station('A', -10, 0), station('C', 5010, 0)], [[call('east', 'A C', STANDARD), call('west', 'C A', STANDARD)]]);
  // Going east, the south track is on the right; going west, the north one.
  expect(points(track('east'))).toEqual([[0, -2], [2500, -22], [5000, -2]]);
  expect(points(track('west'))).toEqual([[5000, 2], [2500, -18], [0, 2]]);
});

test('reports a hop traced longer than twice its straight line and 10 km more, and still traces it', () => {
  // As round three sides of a square 20 km across: 60 km against 20 km in a straight line, but less than 3
  // times, beyond which a path is none.
  const { track, log, found } = runs(
    rails({ a: [0, 0], b: [0, 20_000], c: [20_000, 20_000], d: [20_000, 0] }, 'a b c d'),
    [station('A', -10, 0), station('B', 20_010, 0)],
    [[call('md', 'A B', IBERIAN, 'MD')]],
  );
  expect(points(track('md'))).toEqual([[0, 0], [0, 20_000], [20_000, 20_000], [20_000, 0]]);
  const text = 'MD:1: A → B is traced 59.9 km, 3.0 times its 20.0 km straight line';
  expect(log).toContain(text);
  expect(found).toMatchObject([{ kind: 'detour', line: 'MD', shape: 'MD:1', stations: [{ id: 'A' }, { id: 'B' }], text: [text] }]);
});

test('traces each run of Stations once for all its Trips, and leaves out, logs and reports those of a run with a stretch with no path or a Station off the rails, rather than draw them straight across the country', () => {
  // No rails between B and C, as where Renfe runs a bus, and none near E.
  const { shapes, days, log, found } = runs(
    rails({ a: [0, 0], b: [2000, 0], c: [4000, 0], d: [6000, 0] }, 'a b', 'c d'),
    [station('A', -10, 0), station('B', 2000, 10), station('C', 4000, 10), station('D', 6010, 0), station('E', 3000, 2000)],
    [
      [call('ab', 'A B', IBERIAN, 'MD'), call('abc', 'A B C', IBERIAN, 'MD'), call('ae', 'A E', IBERIAN, 'MD')],
      [call('ab again', 'A B', IBERIAN, 'MD'), call('cd', 'C D', IBERIAN, 'MD')],
    ],
  );
  expect(shapes.map((s) => s.id)).toEqual(['MD:1', 'MD:4']);
  // Each on its run, with its calls, but no longer its rails.
  const on = (id: string, stations: string, shape: string) => ({ id, line: 'MD', shape, headsign: '', calls: call(id, stations, IBERIAN).calls });
  expect(days).toStrictEqual([[on('ab', 'A B', 'MD:1')], [on('ab again', 'A B', 'MD:1'), on('cd', 'C D', 'MD:4')]]);
  const text = ['abc is left out: B → C has no path along the rails', 'ae is left out: E is off the network'];
  expect(log.filter((line) => line.includes('left out'))).toEqual(text);
  expect(found).toMatchObject([
    { kind: 'trip', why: 'nopath', trip: 'abc', line: 'MD', stations: [{ id: 'B' }, { id: 'C' }], text: [text[0]], day: 0 },
    { kind: 'trip', why: 'off', trip: 'ae', line: 'MD', stations: [{ id: 'E' }], text: [text[1]], day: 0 },
  ]);
});

test("runs AVE on both gauges all the way where a stretch has no path on standard gauge, as one can't tell where it must change till a later stretch: into Ourense through Taboadela's changer, on to Santiago", () => {
  // B has a standard-gauge track from A, and an Iberian-gauge one from A through a changer at k, on which
  // alone Trains run on to C.
  const layout: Record<string, [number, number]> = { a: [0, 0], j: [2000, 0], s: [4000, 0], k: [3000, 100], i: [4000, 30], c: [6000, 30] };
  const ways = rails(layout, ['a j', { gauge: '1435' }], ['j s', { gauge: '1435' }], ['j k', { gauge: '1435' }], 'k i c');
  const stations = [station('A', -10, 0), station('B', 4000, 15), station('C', 6010, 30)];
  const { track, log } = runs(ways, stations, [[call('ave', 'A B C', STANDARD), call('to B', 'A B', STANDARD)]], new Set([Object.keys(layout).indexOf('k') + 1]));
  expect(points(track('ave'))).toEqual([[0, 0], [2000, 0], [3000, 100], [4000, 30], [6000, 30]]);
  expect(log.filter((line) => line.includes('changing gauge'))).toEqual(['AVE:1: A → C, 6.0 km long, 1.00× the straight line through its 3 Stations, changing gauge between A and B']);
  // A Train that ends at B keeps to standard gauge.
  expect(points(track('to B'))).toEqual([[0, 0], [2000, 0], [4000, 0]]);
});

test("sets off from another of a Station's tracks of its gauge where OpenStreetMap has none that leads on from the one it comes in on, as at Alcázar de San Juan, and says so", () => {
  // A's line comes into S on its north track, which ends there, and C's leaves from its south track, 10 m off.
  const ways = rails({ a: [0, 0], n: [3000, 0], w: [2000, -10], s: [5000, -10], c: [8000, -10] }, 'a n', 'w s c');
  const { track, log } = runs(ways, [station('A', -10, 0), station('S', 3000, -5), station('C', 8010, -10)], [[call('md', 'A S C', IBERIAN, 'MD')]]);
  expect(points(track('md'))).toEqual([[0, 0], [3000, 0], [3000, -10], [8000, -10]]);
  expect(log).toEqual(["MD:1: A → C, 8.0 km long, 1.00× the straight line through its 3 Stations, leaving S from another track than it came in on"]);
});

test("comes into a Station on each gauge it can, as an Alvia must come into Sevilla on Iberian gauge, through Majarabique's changer, to go on to Jerez, though standard gauge is the shorter way in", () => {
  // From A, standard-gauge track runs straight into S, and on through a changer at k onto Iberian-gauge track
  // that runs into S beside it, 2 km longer. From S, only the Iberian-gauge track runs on, back south to C.
  const layout: Record<string, [number, number]> = { a: [0, 0], s: [4000, 0], j: [1000, 0], k: [2000, 2000], i: [4000, 10], m: [3000, 10], c: [3000, -3000] };
  const ways = rails(layout, ['a j s', { gauge: '1435' }], ['j k', { gauge: '1435' }], 'k i', 'i m c');
  const { track, log } = runs(
    ways,
    [station('A', -10, 0), station('S', 4010, 5), station('C', 3000, -3010)],
    [[call('alvia', 'A S C', BOTH, 'Alvia')]],
    new Set([Object.keys(layout).indexOf('k') + 1]),
  );
  expect(points(track('alvia')).slice(0, 4)).toEqual([[0, 0], [1000, 0], [2000, 2000], [4000, 10]]);
  expect(log[0]).toContain('changing gauge between A and S');
});

test("reaches a Station published at another's point where it reached that one, as Renfe has Ourense Turístico at Ourense's, a minute after it", () => {
  const { track } = runs(
    rails({ a: [0, 0], b: [2000, 0], c: [4000, 0] }, 'a b c'),
    // BT is B's second stop, at its point.
    [station('A', -10, 0), station('B', 2000, 10), station('BT', 2000, 10), station('C', 4010, 0)],
    [[call('md', 'A B BT C', IBERIAN, 'MD')]],
  );
  expect(points(track('md'))).toEqual([[0, 0], [2000, 0], [4000, 0]]);
});

// A Network of two gauges, as Cercanías Asturias, Bilbao and Santander are (ADR-0010): Adif's Iberian-gauge
// line along y = 0, and FEVE's metre-gauge one 70 m north of it, each with the feed's shape 2 m off it. S and
// U are 6 m from the metre-gauge track and 64 m from the Iberian-gauge one, as Renfe's Santander and Maliaño
// are nearer FEVE's track than Adif's, Maliaño 6 m and 65 m, and T the other way round, as Ablaña is for
// C8, which runs on FEVE's (#366).
test("traces each Line of a Network of two gauges on its own gauge's rails only, so that a Station nearer the other gauge's track is on its own gauge's", () => {
  const ways = rails({ a: [0, 0], b: [6000, 0], m: [0, 70], n: [6000, 70] }, 'a b', ['m n', { railway: 'narrow_gauge', gauge: '1000' }]);
  const stations = [station('A', -10, 0), station('B', 6010, 0), station('M', -10, 70), station('N', 6010, 70), station('S', 2000, 64), station('U', 4000, 64), station('T', 3000, 6)];
  const { shape, log } = trace(
    ways,
    stations,
    { id: 'C1', feed: [[0, -2], [6000, -2]], stations: 'A S U B', gauges: IBERIAN },
    { id: 'C8', feed: [[0, 72], [6000, 72]], stations: 'M T N', gauges: METRE },
  );
  expect(points(shape('C1'))).toEqual([[0, 0], [2000, 0], [4000, 0], [6000, 0]]);
  expect(points(shape('C8'))).toEqual([[0, 70], [3000, 70], [6000, 70]]);
  expect(log.filter((line) => !line.includes('km long'))).toEqual([]);
});

// The Trips that don't fit their feed's shape, traced through their own Stations on the rails their
// shapes were (#280): shapes first, as the build traces them, and then the runs, on the same graphs.
type OwnIn = { id: string; line?: string; feed: [number, number][]; stations: string; gauges?: Gauges };

/** Traces shapes and then each day's Trips through their own Stations (traceOwn()), keeping right, and gives each Trip's trace. */
function own(rails: OsmWay[], stations: Station[], shapes: OwnIn[], days: FeedTrip[][]) {
  const [log, found]: [string[], Found[]] = [[], []];
  const feeds = shapes.map((s) => ({ id: s.id, line: s.line ?? 'line', coords: s.feed.map(([x, y]) => at(x, y)), stations: s.stations.split(' '), ...(s.gauges && { gauges: s.gauges }) }));
  const graphs = railGraphs(feeds, stations, rails, 'right');
  const traced = traceShapes(feeds, stations, rails, 'right', () => {}, () => {}, graphs);
  const runs = traceOwn(days, feeds, stations, graphs, (line) => log.push(line), (f) => found.push(f));
  const track = (trip: string) => {
    const shape = runs.shapes.find((s) => s.id === runs.days.flat().find((t) => t.id === trip)?.shape);
    if (!shape) throw new Error(`No track for ${trip}`);
    return shape;
  };
  return { traced, ...runs, log, found, track };
}

test("traces the Trips that call at a Station off their feed's shape through their own Stations, once for all those that call at the same, as Estació de França's are off R2N's", () => {
  // As the one Station left out on a branch, T, which Trips to it reach from either side by the triangle's legs.
  const { shapes, days, track, log } = own(
    branch(),
    [station('A', 500, 10), station('T', 2010, 1490), station('C', 3500, 10)],
    [{ id: 'line', feed: [[0, 1], [4000, 1]], stations: 'A T C' }],
    [[call('first', 'A T C', IBERIAN, 'line'), call('second', 'A T C', IBERIAN, 'line'), call('short', 'T C', IBERIAN, 'line')]],
  );
  // One trace for the two, whose Stations are the same, and one for the third, each of the Line's.
  expect(shapes.map((s) => s.id)).toEqual(['line:1', 'line:2']);
  expect(days[0]?.map((t) => [t.id, t.shape])).toEqual([['first', 'line:1'], ['second', 'line:1'], ['short', 'line:2']]);
  // Through T where it's closest to the rails, short of the buffer stop, and on to C.
  expect(passes(track('first'), 2000, 1490)).toBe(true);
  expect(passes(track('first'), 3500, 0)).toBe(true);
  expect(log).toEqual([
    'line:1: A → C, 5.7 km long, 1.35× the straight line through its 3 Stations',
    'line:2: T → C, 2.9 km long, 1.36× the straight line through its 2 Stations',
  ]);
});

test("takes the track its Line's shape took where it shares it, though the other of two ways between the same Stations is shorter", () => {
  // Two ways from J1 to J2: through S, 1,044 m, and by Q, 1,090 m, which leaves straight ahead, and so is the
  // shorter once a trace pays for turning off it (DIVERGE), 1,144 m, though not once it takes the other's
  // track for 90% (SHARED), 1,040 m. The feed's shape calls at S; a trace of a Trip that doesn't would take Q.
  const { traced, track } = own(
    rails(
      { a: [0, 0], j1: [1000, 0], j2: [2000, 0], c: [3000, 0], p: [1500, 150], m1: [1100, 0], q: [1500, -195], m2: [1900, 0] },
      'a j1',
      'j1 p j2',
      'j1 m1 q m2 j2',
      'j2 c',
    ),
    [station('A', 10, 5), station('S', 1500, 150), station('C', 2990, 5)],
    [{ id: 'X', feed: [[0, 1], [3000, 1]], stations: 'A S C' }],
    [[call('y', 'A C', IBERIAN, 'line')]],
  );
  expect(passes(traced.find((s) => s.id === 'X') as Shape, 1500, 150)).toBe(true);
  expect(passes(track('y'), 1500, 150)).toBe(true);
  expect(passes(track('y'), 1500, -195)).toBe(false);
});

test("leaves out and reports the Trips of a run with a Station off the rails, or a stretch with no path, on their days, as long distance's are", () => {
  // No rails between B and C, and none near E.
  const { shapes, days, log, found } = own(
    rails({ a: [0, 0], b: [2000, 0], c: [4000, 0], d: [6000, 0] }, 'a b', 'c d'),
    [station('A', -10, 0), station('B', 2000, 10), station('C', 4000, 10), station('D', 6010, 0), station('E', 3000, 2000)],
    [{ id: 'line', feed: [[0, 1], [6000, 1]], stations: 'A B C D E' }],
    [
      [call('ab', 'A B', IBERIAN, 'line'), call('abc', 'A B C', IBERIAN, 'line')],
      [call('ae', 'A E', IBERIAN, 'line'), call('ab again', 'A B', IBERIAN, 'line')],
    ],
  );
  expect(shapes.map((s) => s.id)).toEqual(['line:1']);
  expect(days.map((day) => day.map((t) => [t.id, t.shape]))).toEqual([[['ab', 'line:1']], [['ab again', 'line:1']]]);
  const text = ['abc is left out: B → C has no path along the rails', 'ae is left out: E is off the network'];
  expect(log.filter((line) => line.includes('left out'))).toEqual(text);
  expect(found).toMatchObject([
    { kind: 'trip', why: 'nopath', trip: 'abc', line: 'line', stations: [{ id: 'B' }, { id: 'C' }], text: [text[0]], day: 0 },
    { kind: 'trip', why: 'off', trip: 'ae', line: 'line', stations: [{ id: 'E' }], text: [text[1]], day: 1 },
  ]);
});

test("runs a Trip on the rails of its Line's gauge alone, as its shape was traced, so that a Station nearer the other gauge's track is on its own gauge's", () => {
  // As 'traces each Line of a Network of two gauges on its own gauge's rails only': S and U are 6 m from the
  // metre-gauge track and 64 m from the Iberian-gauge one, and T the other way round.
  const ways = rails({ a: [0, 0], b: [6000, 0], m: [0, 70], n: [6000, 70] }, 'a b', ['m n', { railway: 'narrow_gauge', gauge: '1000' }]);
  const stations = [station('A', -10, 0), station('B', 6010, 0), station('M', -10, 70), station('N', 6010, 70), station('S', 2000, 64), station('U', 4000, 64), station('T', 3000, 6)];
  const { track } = own(
    ways,
    stations,
    [
      { id: 'C1', feed: [[0, -2], [6000, -2]], stations: 'A S U B', gauges: IBERIAN },
      { id: 'C8', feed: [[0, 72], [6000, 72]], stations: 'M T N', gauges: METRE },
    ],
    // Each takes its rails from the shape it had.
    [[{ ...call('c1', 'A S U B', IBERIAN, 'line'), shape: 'C1' }, { ...call('c8', 'M T N', METRE, 'line'), shape: 'C8' }]],
  );
  expect(points(track('c1'))).toEqual([[0, 0], [2000, 0], [4000, 0], [6000, 0]]);
  expect(points(track('c8'))).toEqual([[0, 70], [3000, 70], [6000, 70]]);
});

/**
 * A Network's Trips placed on a snippet's rails as the daily build places them (build()): its shapes traced,
 * each Trip on its shape, and one that doesn't fit it on a trace through its own Stations. What placeTrips()
 * would have left out of them, with its reasons, and the traces they run on, with the shapes.
 */
function placedFrom(file: string, network: NetworkConfig, trips: FeedTrip[]) {
  const { rails, shapes, stations } = JSON.parse(readFileSync(new URL(`fixtures/osm/${file}.json`, import.meta.url), 'utf8')) as Snippet;
  const [log, found]: [string[], Found[]] = [[], []];
  const owned = ownRails(rails, network);
  const graphs = railGraphs(shapes, stations, owned, network.runningSide);
  const traced = traceShapes(shapes, stations, owned, network.runningSide, () => {}, () => {}, graphs);
  const topSpeed = network.profile.topSpeed;
  const alone: string[] = [];
  placeTrips(trips, traced, stations, topSpeed, (line) => alone.push(line));
  const placed = placeDays([trips], traced, stations, topSpeed, (unfit) => traceOwn(unfit, shapes, stations, graphs, (line) => log.push(line), (f) => found.push(f)), (line) => log.push(line), (f) => found.push(f));
  const [trip] = placed.days[0] ?? [];
  const speeds = (trip?.calls ?? []).slice(1).map((c, i) => Math.round(((c.dist - (trip?.calls[i]?.dist ?? 0)) / (c.arrival - (trip?.calls[i]?.departure ?? 0))) * 3.6));
  return { alone, log, found, traced, trip, speeds, runs: placed.shapes, stations };
}

/** A Trip's calls as Renfe's timetable of 10 October 2026 gives them, "station arrival departure" in seconds into the day. */
const renfe = (id: string, line: string, headsign: string, shape: string, ...calls: [station: string, arrival: number, departure: number][]): FeedTrip => ({
  id,
  line,
  headsign,
  shape,
  calls: calls.map(([station, arrival, departure]) => ({ station, arrival, departure })),
});

test("runs C2's CIVIS Trips from Chamartín by Fuente de la Mora to San Fernando de Henares, 13 km, on a trace of their own through their Stations, not round by Atocha, as Renfe's shape does, at 142 km/h", () => {
  // Train 35980 of Tuesday 13 October 2026, as far as Torrejón de Ardoz. The snippet is C2's two shapes, whole, and
  // the rails within 15 m of the way the Train runs, cut as `npm run snippet` does but along that line, not round a
  // spot (a circle that holds the way round by Atocha is 900 KB), from the rails downloaded on 9 October. Where it has
  // none, as round by Atocha, a shape keeps the feed's own points.
  const trip = renfe('cercanias-madrid:1084M35980C2', 'cercanias-madrid:C2', 'CIVIS', 'cercanias-madrid:10_C2_INV:back', ['adif:17000', 23880, 23880], ['adif:98003', 24180, 24180], ['adif:70101', 24900, 24900], ['adif:70102', 25260, 25260]);
  const { alone, trip: placed, runs, speeds, traced, stations, log } = placedFrom('civis', CERCANIAS_MADRID, [trip]);
  expect(alone).toEqual(['cercanias-madrid:1084M35980C2 is left out: it would run Fuente de la Mora → San Fernando de Henares at 142 km/h along its track']);
  expect(runs.map((s) => s.id)).toEqual(['cercanias-madrid:C2:1']);
  expect(placed?.shape).toBe('cercanias-madrid:C2:1');
  // From Fuente de la Mora to San Fernando de Henares 13.3 km, not the 28 km round by Atocha, and each hop under the top speed, 140 km/h.
  const [run] = runs;
  const [, fuente, fernando] = (placed?.calls ?? []).map((c) => c.dist);
  expect(Math.round(((fernando ?? 0) - (fuente ?? 0)) / 100)).toBe(133);
  expect(speeds.every((km) => km < 140)).toBe(true);
  expect(log).toEqual(['cercanias-madrid:C2:1: Madrid-Chamartín-Clara Campoamor → Torrejón de Ardoz, 20.9 km long, 1.11× the straight line through its 4 Stations']);
  // It runs on C2's track from San Fernando de Henares on, exactly where the shape's, and not before it.
  const shape = traced.find((s) => s.id === 'cercanias-madrid:10_C2_INV:back');
  const point = (id: string): Point => {
    const s = stations.find((o) => o.id === id);
    return [s?.lon ?? NaN, s?.lat ?? NaN];
  };
  const from = nearest(run?.coords ?? [], point('adif:70101')).along;
  const apart = (coords: Point[]) => coords.map((p) => nearest(shape?.coords ?? [], p).metres);
  const [after, before] = [run?.coords.filter((_, i) => (run.dist[i] ?? 0) > from + 100) ?? [], run?.coords.filter((_, i) => (run.dist[i] ?? 0) > 5000 && (run.dist[i] ?? 0) < from - 100) ?? []];
  expect(Math.max(...apart(after))).toBeLessThan(1);
  expect(Math.max(...apart(before))).toBeGreaterThan(1000);
});

test("runs a C3 Trip through Puente Agüero, Villaverde de Pontones and Hoz de Anero, which Renfe's shape, Santander–Liérganes, lacks, on a trace of its own through its Stations, on FEVE's metre gauge", () => {
  // Train 71851 of Tuesday 13 October 2026 from Heras to Hoz de Anero, on its way to Gibaja: `npm run snippet --
  // "trip cercanias-santander:C3 off adif:05672" santander-c3 4.5`, from the rails downloaded on 9 October.
  const trip = renfe(
    'cercanias-santander:6284M71851C3',
    'cercanias-santander:C3',
    'Gibaja',
    'cercanias-santander:62_C3:back',
    ['adif:05661', 30420, 30420],
    ['adif:05663', 30780, 30780],
    ['adif:05672', 30900, 30900],
    ['adif:05673', 31020, 31020],
    ['adif:05675', 31380, 31440],
  );
  const { alone, trip: placed, runs, speeds, log, found } = placedFrom('santander-c3', CERCANIAS_SANTANDER, [trip]);
  expect(alone).toEqual(['cercanias-santander:6284M71851C3 is left out: Puente Agüero is 1.6 km off its track']);
  expect(runs.map((s) => [s.id, Math.round((s.dist.at(-1) ?? 0) / 100)])).toEqual([['cercanias-santander:C3:1', 91]]);
  expect(placed?.shape).toBe('cercanias-santander:C3:1');
  expect(placed?.calls.map((c) => Math.round(c.dist / 100))).toEqual([0, 25, 44, 59, 91]);
  expect(speeds).toEqual([25, 58, 43, 32]);
  expect(log).toEqual(['cercanias-santander:C3:1: Heras → Hoz de Anero, 9.1 km long, 1.08× the straight line through its 5 Stations']);
  expect(found).toEqual([]);
});

test("runs a C1 Trip to Platja i Grau de Gandia on a trace through its Stations, where its shape ends at Gandia and the Station is 1.7 km off it", () => {
  // Train 24291 of Tuesday 13 October 2026 from Xeraco, which doesn't call at Gandia, where C1's shape ends:
  // `npm run snippet -- "trip cercanias-valencia:C1 off adif:69111" valencia-c1 6.5`, from the rails downloaded on 9 October.
  const trip = renfe('cercanias-valencia:4084M24291C1', 'cercanias-valencia:C1', 'Platja i Grau de Gandia', 'cercanias-valencia:40_C1:back', ['adif:69107', 28080, 28080], ['adif:69111', 28920, 28920]);
  const { alone, trip: placed, runs, speeds, log } = placedFrom('valencia-c1', CERCANIAS_VALENCIA, [trip]);
  expect(alone).toEqual(['cercanias-valencia:4084M24291C1 is left out: Platja i Grau de Gandia is 1.7 km off its track']);
  expect(runs.map((s) => [s.id, Math.round((s.dist.at(-1) ?? 0) / 100)])).toEqual([['cercanias-valencia:C1:1', 84]]);
  expect(placed?.calls.map((c) => Math.round(c.dist / 100))).toEqual([0, 84]);
  expect(speeds).toEqual([36]);
  expect(log).toEqual(["cercanias-valencia:C1:1: Xeraco → Platja i Grau de Gandia, 8.4 km long, 1.39× the straight line through its 2 Stations"]);
});

/**
 * Cercanías Asturias' C1 from Pola de Lena to Ablaña, traced as the build does: `npm run snippet --
 * 43.2132,-5.8184 asturias-c1 6.4`, 6.4 km round the middle of those two Stations, from the rails downloaded on
 * 9 October 2026 and Renfe's timetable of 11 October 2026. Six ways of Adif's left-hand track between Villallana
 * and Mieres have railway=rail and no gauge tag (#370, #479). `only` picks which of the snippet's ways the build
 * gets, all of them if it's left out, and `side` is the config's unless given.
 */
function asturiasC1(only?: (all: OsmWay[]) => OsmWay[], side = CERCANIAS_ASTURIAS.runningSide) {
  const snippet = JSON.parse(readFileSync(new URL('fixtures/osm/asturias-c1.json', import.meta.url), 'utf8')) as Snippet;
  const log: string[] = [];
  const traced = () => traceShapes(snippet.shapes, snippet.stations, ownRails(only?.(snippet.rails) ?? snippet.rails, CERCANIAS_ASTURIAS), side, (line) => log.push(line));
  const track = (shapes: Shape[], id: string) => {
    const one = shapes.find((s) => s.id === `cercanias-asturias:20_${id}`);
    if (!one) throw new Error(`No shape ${id}`);
    return one;
  };
  /** Whether a trace runs every node of each of these ways, to within half a metre. */
  const runs = (shape: Shape, ...ways: number[]) =>
    ways.every((id) => {
      const way = snippet.rails.find((w) => w.id === id);
      if (!way) throw new Error(`No way ${id}`);
      return way.geometry.every((g) => nearest(shape.coords, [g.lon, g.lat]).metres < 0.5);
    });
  return { snippet, traced, log, track, runs };
}

/** The ways of Adif's left-hand track between Villallana and Mieres that have no gauge tag (#370). */
const NO_GAUGE = [12528311, 12528312, 428597896, 428597897, 1075571037, 1471639294];

test("keeps Cercanías Asturias' C1 to its left-hand track from Pola de Lena to Ablaña, along the ways of it that have no gauge tag, where without them it turns back at Pola de Lena and fails the build's length check", () => {
  expect(CERCANIAS_ASTURIAS.runningSide).toBe('left');
  const { traced, track, runs, log } = asturiasC1();
  const shapes = traced();
  expect(log.filter((line) => line.includes('turns back'))).toEqual([]);
  // From Pola de Lena it runs the left-hand track by 12528311, 12528312 and 428597896, the other way by 428597897.
  expect(runs(track(shapes, 'C1_INV'), 12528311, 12528312, 428597896)).toBe(true);
  expect(runs(track(shapes, 'C1'), 428597897)).toBe(true);
  expect(Math.round((track(shapes, 'C1').dist.at(-1) ?? 0) / 100)).toBe(151);
  expect(Math.round((track(shapes, 'C1_INV').dist.at(-1) ?? 0) / 100)).toBe(146);

  // What onRails() took before #479, the ways with a gauge: the trace has no way on from Villallana to Ujo on the left.
  const tagged = asturiasC1((ways) => ways.filter((w) => w.tags.gauge));
  expect(() => tagged.traced()).toThrow(/^cercanias-asturias:20_C1_INV's traced track is \d+\.\d km against the feed's 15\.1 km \(\+\d+\.\d%\)$/);
  expect(tagged.log).toContain('cercanias-asturias:20_C1_INV: Villallana → Ujo turns back at Pola de Lena');
});

test("draws Asturias' C1 on two tracks both north and south of Ujo, where it was on one south of the Station while six ways of its left-hand track had no gauge tag", () => {
  const apart = (only?: (all: OsmWay[]) => OsmWay[], side?: 'left' | 'right') => {
    const { snippet, traced, track } = asturiasC1(only, side);
    const shapes = traced();
    const [c1, inv] = [track(shapes, 'C1'), track(shapes, 'C1_INV')];
    const ujo = snippet.stations.find((s) => s.id === 'adif:15200');
    const from = nearest(c1.coords, [ujo?.lon ?? NaN, ujo?.lat ?? NaN]).along;
    // How far each trace is from the other, 500 m north of Ujo (towards Mieres) and 500 m south of it (towards Villallana).
    return [-500, 500].map((d) => nearest(inv.coords, pointAt(c1, from + d)).metres);
  };
  const [north, south] = apart();
  // Two tracks: 2 to 8 m apart side by side, as a double track is, or on alignments of their own.
  expect(north).toBeGreaterThan(2);
  expect(south).toBeGreaterThan(2);
  // On the right, with the six ways left out as before, it was one track south of Ujo: 0 m.
  expect(apart((ways) => ways.filter((w) => w.tags.gauge), 'right')[1]).toBeLessThan(0.01);
});

test("traces Cercanías Asturias' C1 the same where OpenStreetMap gives the six ways a gauge, so that tagging them changes nothing (#479)", () => {
  const { snippet, traced } = asturiasC1();
  // All six are in the snippet, with no gauge tag: the tagging below changes six ways.
  expect(NO_GAUGE.filter((id) => snippet.rails.some((w) => w.id === id && !w.tags.gauge))).toEqual(NO_GAUGE);
  const untagged = traced();
  const tagged = asturiasC1((ways) => ways.map((w) => (NO_GAUGE.includes(w.id) ? { ...w, tags: { ...w.tags, gauge: '1668' } } : w))).traced();
  expect(untagged.length).toBe(4);
  expect(tagged.map((s) => [s.id, s.coords])).toEqual(untagged.map((s) => [s.id, s.coords]));
});
