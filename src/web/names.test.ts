import { featureFilter, type ExpressionFilterSpecification, type Feature, type ICanonicalTileID } from '@maplibre/maplibre-gl-style-spec';
import { readFileSync } from 'node:fs';
import { assert, expect, test, vi } from 'vitest';
import { stationsOf } from '../build/track.ts';
import { DEGREE, joinTracks, places, type Place, type Point, type Shape, type Slot, type Station, type Stroke, type Track } from '../bundle.ts';
import { alongside, callsIn, CAP, DOT_COST, hidesTowns, namedTwice, nameOffset, nameSort, nearestSide, sidesByJoin, splitBy, underName, type Side, type Spot } from './names.ts';

// Made up, on the equator, where a degree is DEGREE metres both ways, but for the one test of #501's cells.
/** The point so many metres east and north of 0°, 0°. */
const at = (east: number, north: number): Point => [east / DEGREE, north / DEGREE];
/** A track through these points, in metres east and north of 0°, 0°. */
function track(id: string, ...points: [east: number, north: number][]): Shape {
  const dist = points.map((_, i) => points.slice(1, i + 1).reduce((sum, [e, n], j) => sum + Math.hypot(e - (points[j]?.[0] ?? 0), n - (points[j]?.[1] ?? 0)), 0));
  return { id, coords: points.map(([e, n]) => at(e, n)), dist };
}
/** Every Line's Trains keep right. */
const right = () => 1;
/** Rounded to 0.001, without -0. */
const rounded = (values: number[]) => values.map((v) => Math.round(v * 1000) / 1000 + 0);
/** A point's metres east and north of 0°, 0°, to the cm. */
const metres = ([lon, lat]: Point) => [lon * DEGREE, lat * DEGREE].map((m) => Math.round(m * 100) / 100 + 0);

/** alongside(), but only the side it tries first, clear of every track alongside its own. */
function first(...args: Parameters<typeof alongside>) {
  const spots = alongside(...args);
  return (dot: Point, served?: string[]) => {
    const place = spots(dot, served);
    return (bearing: number): Spot => place(bearing)[0]?.clear ?? assert.fail('no side');
  };
}

/** Trains placed beside their own track, along it, at these sides. */
const own = (sides: Stroke[]): Slot[] => sides.map((s) => ({ ...s, on: s.shape, at: [s.from, s.to] }));
/** A Line drawn along each track, all of it, named after it. */
const drawn = (tracks: Shape[]): Slot[] => own(tracks.map((t) => ({ line: t.id, shape: t.id, from: 0, to: t.dist.at(-1) ?? 0, side: 0 })));

/**
 * alongside(), then the side nearestSide() takes for a name 100×20 px that goes 10 px out from its
 * spot, where a px is so many metres, off any track crossing its own and any other place's dot that lies under it.
 */
function placed(...args: Parameters<typeof alongside>) {
  const spots = alongside(...args);
  return (dot: Point) => {
    const place = spots(dot);
    return (bearing: number, metresPerPx = 1): Spot => nearestSide(place(bearing), () => 10, (s, far) => underName(s, far, [100, 20], metresPerPx, 0, 0)).spot;
  };
}

test("a place's name goes above a track that runs east–west, from its dot", () => {
  const spot = first([track('ew', [-500, 0], [500, 0])], [], right)(at(0, 0))(0);
  expect(spot.anchor).toBe('bottom');
  expect(rounded(spot.normal)).toEqual([0, -1]);
  expect(metres(spot.from)).toEqual([0, 0]);
});

/** A straight track through 0°, 0°, 1 km long, heading `degrees` clockwise from north. */
const heading = (degrees: number) => {
  const [e, n] = [Math.sin((degrees * Math.PI) / 180) * 500, Math.cos((degrees * Math.PI) / 180) * 500];
  return track(`${degrees}`, [-e, -n], [e, n]);
};

test('it goes right of a track that runs within 30° of north–south, and above one that runs further off it', () => {
  const steep = first([heading(29)], [], right)(at(0, 0))(0);
  expect(steep.anchor).toBe('left');
  expect(rounded(steep.normal)).toEqual([0.875, 0.485]);
  const slanting = first([heading(31)], [], right)(at(0, 0))(0);
  expect(slanting.anchor).toBe('bottom');
  expect(rounded(slanting.normal)).toEqual([-0.857, -0.515]);
});

test('turned, it goes beside its track as the track lies on screen', () => {
  const place = first([heading(90)], [], right)(at(0, 0));
  // Facing east, the track runs up the screen, and the name goes right of it, south of the track.
  expect(place(90).anchor).toBe('left');
  expect(rounded(place(90).normal)).toEqual([1, 0]);
  // Upside down, it goes above the track on screen, south of it.
  expect(place(180).anchor).toBe('bottom');
  expect(rounded(place(180).normal)).toEqual([0, -1]);
});

test('with no track within 200 m of its dot, it goes above the dot', () => {
  const far = track('far', [300, -500], [300, 500]);
  expect(first([far], [], right)(at(0, 0))(0)).toEqual({ from: at(0, 0), anchor: 'bottom', normal: [0, -1], dot: 0, lines: [], crossing: [], neighbours: [], widest: 0, bearing: 0 });
  expect(first([far], [], right)(at(150, 0))(0).anchor).toBe('left');
});

test('where several tracks meet at a place, it follows the one nearest the dot', () => {
  const spot = first([heading(0), track('ew', [-500, 20], [500, 20])], [], right)(at(0, 10))(0);
  expect(spot.anchor).toBe('left');
  const other = first([heading(0), track('ew', [-500, 20], [500, 20])], [], right)(at(15, 10))(0);
  expect(other.anchor).toBe('bottom');
});

test("it follows its own Network's nearest track, even where another Network's passes nearer its dot", () => {
  // As at Barcelona Plaça de Catalunya: the Metro's track 1 m from the dot, north to south, and
  // Rodalies' 13 m from it, east to west.
  const tracks = [track('metro:L3', [1, -500], [1, 500]), track('rodalies:R1', [-500, 13], [500, 13])];
  const lines = [
    { network: 'metro', shapes: ['metro:L3'] },
    { network: 'rodalies', shapes: ['rodalies:R1'] },
  ];
  const spots = first(tracks, [], right, lines);
  expect(spots(at(0, 0), ['rodalies'])(0).anchor).toBe('bottom');
  expect(spots(at(0, 0), ['metro'])(0).anchor).toBe('left');
  // With no track of its own Network within 200 m, it goes by the nearest of any.
  expect(spots(at(0, 0), ['fgc'])(0).anchor).toBe('left');
});

test('two Networks on the same Stations make one Station of each, and one place, named beside the nearest track of either', () => {
  // Made up, as Adif's Stations serve both Rodalies and AVE y Larga Distancia: Sants, which serves
  // both, 5 m from AVE's track, 13 m from Rodalies' and 1 m from the Metro's; and 2 km east, a
  // Station only AVE serves, 8 m from its track and 3 m from Rodalies'.
  const sants: Station = { id: 'adif:71801', name: 'Barcelona-Sants', lon: 0, lat: 0 };
  const [lon, lat] = at(2000, 0);
  const alone: Station = { id: 'adif:2', name: 'AVE only', lon, lat };
  const tracks = {
    metro: [track('metro', [1, -500], [1, 500])],
    rodalies: [track('rodalies', [-13, -500], [-13, 500]), track('rodalies:east', [1500, 3], [2500, 3])],
    ave: [track('ave', [-500, 5], [500, 5]), track('ave:east', [2008, -500], [2008, 500])],
  };
  const stations = stationsOf([
    { network: { id: 'rodalies' }, stations: [sants], shapes: tracks.rodalies },
    { network: { id: 'ave' }, stations: [sants, alone], shapes: tracks.ave },
  ]);
  // Sants stays where Adif publishes it, as both Networks' Trains stop there.
  expect(stations).toEqual([{ ...sants, networks: ['rodalies', 'ave'] }, { ...alone, networks: ['ave'] }]);
  const [shared, aveOnly, ...more] = places(stations);
  expect(more).toEqual([]);
  expect(shared).toMatchObject({ id: 'adif:71801', stations: ['adif:71801'] });
  const lines = Object.entries(tracks).map(([network, shapes]) => ({ network, shapes: shapes.map((s) => s.id) }));
  const spots = first(Object.values(tracks).flat(), [], right, lines);
  const anchor = (place?: Place) => spots([place?.lon ?? NaN, place?.lat ?? NaN], place?.networks)(0).anchor;
  // Sants' name goes above AVE's track, the nearest of its own Networks', not right of the Metro's, nearer still.
  expect(anchor(shared)).toBe('bottom');
  // The Station only AVE serves: right of AVE's track, not above Rodalies', which passes nearer.
  expect(anchor(aveOnly)).toBe('left');
});

test("where another track crossing its own lies under its name, it takes the side of its own that's clear", () => {
  // Its own track runs east to west through the dot, and another leaves it north-east.
  const own = track('own', [-500, 0], [500, 0]);
  const branch = track('branch', [0, 5], [300, 300]);
  const place = placed([own, branch], drawn([own, branch]), right)(at(0, 0));
  expect(place(0).anchor).toBe('top');
  expect(rounded(place(0).normal)).toEqual([0, 1]);
  // Upside down, north is below on screen, so it stays above.
  expect(place(180).anchor).toBe('bottom');
  // Where a track crosses right over its own, neither side is clear, and it goes as it would.
  const across = track('across', [-300, -300], [300, 300]);
  expect(placed([own, across], drawn([own, across]), right)(at(0, 0))(0).anchor).toBe('bottom');
  // A track with no Line drawn along it hides no Trains.
  expect(placed([own, branch], [], right)(at(0, 0))(0).anchor).toBe('bottom');
  // Right of a track that runs north to south, crossed to the east, it goes left of it.
  const east = [heading(0), track('east', [5, 0], [300, 200])];
  const upright = placed(east, drawn(east), right)(at(0, 0))(0);
  expect(upright.anchor).toBe('right');
  expect(rounded(upright.normal)).toEqual([-1, 0]);
});

test('where tracks cross its own on both sides, it takes the side where none lies under its name at that zoom', () => {
  // One leaves its own north-east by the dot, and one south-east 150 m east of it.
  const tracks = [track('own', [-500, 0], [500, 0]), track('north', [0, 5], [300, 300]), track('south', [150, -5], [450, -300])];
  const place = placed(tracks, drawn(tracks), right)(at(0, 0));
  // At a metre a px, the name south of its own, 10 to 30 m south and 50 m either way, is clear of the one south.
  expect(place(0).anchor).toBe('top');
  // At 4, it reaches 200 m east, and both lie under it, so it goes as it would.
  expect(place(0, 4).anchor).toBe('bottom');
  // Zoomed out, one that passes under the name only beyond 200 m of the dot counts too: here 400 m north, at 20 m a px.
  const far = [track('own', [-500, 0], [500, 0]), track('far', [-3000, 400], [3000, 400])];
  expect(placed(far, drawn(far), right)(at(0, 0))(0, 20).anchor).toBe('top');
});

test('where its own track bends back under its name, it takes the side clear of the bend', () => {
  // Its own runs east past the dot, then loops back west 25 m north of it, under a name above it, as at Besòs.
  const own = track('own', [-500, 0], [30, 0], [30, 25], [-300, 25]);
  const place = placed([own], drawn([own]), right)(at(0, 0));
  expect(place(0).anchor).toBe('top');
  // But not by the stretch it runs along beside the dot, however many segments it's in.
  const straight = track('own', [-500, 0], [-20, 0], [20, 10], [500, 10]);
  expect(alongside([straight], drawn([straight]), right)(at(0, 0))(0).map(({ clear, near }) => [clear.crossing, near.crossing])).toEqual([[[], []], [[], []]]);
});

test("a crossing track counts within as many px of a name as it's given, and where its Lines are drawn", () => {
  // The name goes above its own, from 10 to 30 px north, and 50 either way; the other passes 3 px east of it.
  const tracks = [track('own', [-500, 0], [500, 0]), track('other', [53, 5], [53, 300])];
  const northOfR = (side: number) => alongside(tracks, own([{ line: 'R', shape: 'other', from: 0, to: 1000, side }]), right)(at(0, 0))(0)[0]?.clear ?? assert.fail('no side');
  expect(underName(northOfR(1), 10, [100, 20], 1, 0, 2)).toBe(0);
  expect(underName(northOfR(1), 10, [100, 20], 1, 0, 4)).toBe(1);
  // Drawn a line width west of it, its right as it runs north, 3 px apart puts R's stroke's middle 3 px west of it, on the name's edge.
  expect(underName(northOfR(-1), 10, [100, 20], 1, 3, 0)).toBe(1);
  // A line width east of it, 6 px out, it lies under the name only within 6 px of it.
  expect(underName(northOfR(1), 10, [100, 20], 1, 3, 5)).toBe(0);
  expect(underName(northOfR(1), 10, [100, 20], 1, 3, 6)).toBe(1);
});

test("where another place's dot lies under its name on the side nearest its dot, it takes the other side, a dot costing it more than a few Lines (#501)", () => {
  // Its own track runs east to west through the dot, and the name goes above it, 10 to 30 m north and 50 either way
  // at a metre a px. Another place's dot lies 40 m east and 20 m north of it, in that box.
  const own = track('own', [-500, 0], [500, 0]);
  expect(placed([own], [], right)(at(0, 0))(0).anchor).toBe('bottom');
  const place = placed([own], [], right, [], new Map(), [at(40, 20)])(at(0, 0));
  expect(place(0).anchor).toBe('top');
  expect(rounded(place(0).normal)).toEqual([0, 1]);
  // Upside down, north is down on screen, so the name above it on screen is south of its track, clear of the dot.
  expect(place(180).anchor).toBe('bottom');
  // A dot as far from the box as its own dot is, and a few px more, leaves it above.
  expect(placed([own], [], right, [], new Map(), [at(40, 45)])(at(0, 0))(0).anchor).toBe('bottom');
  expect(placed([own], [], right, [], new Map(), [at(80, 20)])(at(0, 0))(0).anchor).toBe('bottom');
  // And where one lies under it on each side, it goes as it would.
  expect(placed([own], [], right, [], new Map(), [at(40, 20), at(-40, -20)])(at(0, 0))(0).anchor).toBe('bottom');
});

test("it goes under as many Lines as a dot costs it, and no more, to clear another place's dot (#501)", () => {
  // The dot lies under the name above its own track; spurs of the track, each a Line, go south under the one below.
  const own = track('own', [-500, 0], [500, 0]);
  const spurs = (n: number) => Array.from({ length: n }, (_, i) => track(`spur${i}`, [-45 + (90 * i) / n, -5], [-45 + (90 * i) / n, -200]));
  const goes = (n: number) => {
    const tracks = [own, ...spurs(n)];
    return placed(tracks, drawn(tracks), right, [], new Map(), [at(40, 20)])(at(0, 0))(0).anchor;
  };
  expect(goes(1)).toBe('top');
  expect(goes(DOT_COST - 1)).toBe('top');
  expect(goes(DOT_COST + 1)).toBe('bottom');
});

test("another place's dot costs a name less the further it lies from its box, nothing as far as its own dot, and its own never does (#501)", () => {
  // The name goes above its own track, from 10 to 30 px north, and 50 either way: its own dot is 10 px below it.
  const own = track('own', [-500, 0], [500, 0]);
  const cost = (...dots: Point[]) => underName(alongside([own], [], right, [], new Map(), dots)(at(0, 0))(0)[0]?.clear ?? assert.fail('no side'), 10, [100, 20], 1, 0, 0);
  // Inside the box, it costs the most.
  expect(cost(at(40, 20))).toBe(DOT_COST);
  // Beyond its end by half of 13 px, its own dot's distance and a few more, it costs half.
  expect(cost(at(56.5, 20))).toBeCloseTo(DOT_COST / 2);
  // As far as that and more, nothing; and each dot counts.
  expect(cost(at(70, 20))).toBe(0);
  expect(cost(at(40, 20), at(-40, 20))).toBe(2 * DOT_COST);
  // Due north and due east of its own dot count as any other, and past a corner it's the distance to the corner that counts.
  expect(cost(at(0, 20))).toBe(DOT_COST);
  expect(cost(at(40, 0))).toBeCloseTo((DOT_COST * 3) / 13);
  expect(cost(at(54, 7))).toBeCloseTo(DOT_COST * (1 - 5 / 13));
  // The place's own dot, which the list of every place's holds, is under no name of its own.
  expect(cost(at(0, 0))).toBe(0);
});

test("its own dot's distance is from the dot, not from the track the name is measured from, where the track passes beyond the dot (#501)", () => {
  // The track runs 20 m north of the dot, so the name above it is measured from the track, 20 m beyond the dot (`dot`),
  // and `far` is 30 px, from the dot: its near edge 30 m north of it, 100 m wide and 20 m tall.
  const place = alongside([track('own', [-500, 20], [500, 20])], [], right)(at(0, 0));
  const spot = place(0)[0]?.clear ?? assert.fail('no side');
  expect(spot.dot).toBeCloseTo(20);
  const cost = (...dots: Point[]) => underName({ ...spot, neighbours: dots.map((d) => [d[0] * DEGREE, d[1] * DEGREE]) }, 30, [100, 20], 1, 0, 0);
  // Its own dot is 30 px from the box, so 3 px more is where a dot costs nothing: 33 px from the box's end.
  expect(cost(at(83, 40))).toBe(0);
  expect(cost(at(70, 40))).toBeCloseTo(DOT_COST * (1 - 20 / 33));
});

test("another place's dot is found away from 0°, 0° too, where a cell of the track is not as many metres east to west as north to south (#501)", () => {
  const [lon, lat] = [2.1, 41.4];
  const [east, north] = [DEGREE * Math.cos((lat * Math.PI) / 180), DEGREE];
  const own: Shape = { id: 'own', coords: [[lon - 0.01, lat], [lon + 0.01, lat]], dist: [0, 0.02 * east] };
  const neighbour: Point = [lon + 40 / east, lat + 20 / north];
  // And one in the corner of the cells looked in, 3.4 km off, which is further than REACH and not kept.
  const far: Point = [lon + 2400 / east, lat + 2400 / north];
  const spot = alongside([own], [], right, [], new Map(), [[lon, lat], neighbour, far])([lon, lat])(0)[0]?.clear ?? assert.fail('no side');
  expect(spot.neighbours.map((m) => m.map((v) => Math.round(v)))).toEqual([[40, 20]]);
});

test('where the dot lies the other side of its track, it goes from the track', () => {
  expect(metres(first([heading(90)], [], right)(at(0, -20))(0).from)).toEqual([0, 0]);
  expect(metres(first([heading(90)], [], right)(at(0, 20))(0).from)).toEqual([0, 20]);
});

test("where tracks run alongside it, as at a Station with more, it goes from the furthest the name's way", () => {
  const station = [heading(90), track('north', [-500, 30], [500, 30]), track('south', [-500, -30], [500, -30])];
  expect(metres(first(station, [], right)(at(0, 5))(0).from)).toEqual([0, 30]);
  // One more than 50 m further from the dot than the nearest, or running across it, isn't alongside.
  const others = [heading(90), track('far', [-500, 70], [500, 70]), track('across', [-500, -460], [500, 540])];
  expect(metres(first(others, [], right)(at(0, 5))(0).from)).toEqual([0, 5]);
});

test('a segment shapes share, at the same points, is found for each shape that runs it, in the order the shapes come (#757)', () => {
  // One and three run the same points, two alongside them; three's segment is filed with one's, before two's.
  const one = track('one', [-500, 0], [500, 0]);
  const station = [one, track('two', [-500, 20], [500, 20]), { ...one, id: 'three' }];
  expect(first(station, drawn(station), right)(at(0, 5))(0).lines.map(({ line }) => line)).toEqual(['one', 'two', 'three']);
  // A shape that leaves from one's first point, but not to its second, runs a segment of its own, about 20 m north of the dot.
  const fork: Shape = { id: 'fork', coords: [one.coords[0] ?? at(-500, 0), at(500, 40)], dist: [0, Math.hypot(1000, 40)] };
  expect(Math.round(metres(first([one, fork], [], right)(at(0, 5))(0).from)[1] ?? 0)).toBe(20);
});

test('shapes that share points, all of them or a run of them, are found as they would be with points of their own (#763)', () => {
  // Through, and a branch that runs three of its points before it leaves north, a twin of the branch, and a track across.
  const through = track('through', [-900, 0], [-300, 0], [0, 0], [300, 0], [900, 0]);
  const branch: Shape = { id: 'branch', coords: [...through.coords.slice(1, 4), at(600, 300), at(900, 900)], dist: [] };
  branch.dist = branch.coords.map((_, i) => branch.coords.slice(1, i + 1).reduce((sum, [lon, lat], j) => sum + Math.hypot(lon - (branch.coords[j]?.[0] ?? 0), lat - (branch.coords[j]?.[1] ?? 0)) * DEGREE, 0));
  const shared = [through, branch, { ...branch, id: 'twin' }, track('across', [0, -900], [0, 900])];
  // The same, each with points of its own.
  const own = shared.map((s) => ({ ...s, coords: s.coords.map(([lon, lat]): Point => [lon, lat]) }));
  const slots = drawn(shared);
  const seen = (shapes: Shape[]) => {
    const spots = alongside(shapes, slots, right);
    return [at(0, 10), at(-300, 50), at(450, 150), at(300, -40)].map((dot) =>
      spots(dot)(30).map(({ clear, near }) => [clear, near].map(({ crossing, ...spot }) => ({ ...spot, crossing: [...new Set(crossing.map((c) => JSON.stringify(c)))].sort() }))),
    );
  };
  expect(seen(shared)).toEqual(seen(own));
});

test("where it goes from a track beyond the dot, it keeps how far behind that, in metres, the dot and each Line's track lie", () => {
  // R1 is drawn along the track nearest the dot, 5 m south of it, and R2 along one 25 m north of it.
  const station = [track('near', [-500, 0], [500, 0]), track('far', [-500, 30], [500, 30])];
  const sides: Stroke[] = [
    { line: 'R1', shape: 'near', from: 0, to: 1000, side: 0 },
    { line: 'R2', shape: 'far', from: 0, to: 1000, side: 0 },
  ];
  const place = first(station, own(sides), right)(at(0, 5));
  const behind = (bearing: number) => {
    const spot = place(bearing);
    return [metres(spot.from), rounded([spot.dot]), spot.lines.map(({ line, behind }) => `${line} ${rounded([behind])}`).sort()];
  };
  // North up, it goes above R2's track; upside down, above R1's, which is then south of the dot.
  expect(behind(0)).toEqual([[0, 30], [25], ['R1 30', 'R2 0']]);
  expect(behind(180)).toEqual([[0, 0], [5], ['R1 0', 'R2 30']]);
});

test("zoomed out, where Lines are drawn side by side, it takes each Line's Trains to be as many line widths its way as their stroke and running side put them", () => {
  // A double track, east along 0° and back west 4 m south of it. R1 is drawn 2 line widths north of
  // both, so its Trains going east are drawn 1.5 north, a half to their right, and those going west
  // 2.5. R2 is drawn a line width south. L's Trains keep left.
  const tracks = [track('e', [-500, 0], [500, 0]), track('w', [500, -4], [-500, -4])];
  const sides: Stroke[] = [
    { line: 'R1', shape: 'e', from: 0, to: 1000, side: -2 },
    { line: 'R2', shape: 'e', from: 0, to: 400, side: 3 },
    { line: 'R2', shape: 'e', from: 400, to: 1000, side: 1 },
    { line: 'L', shape: 'e', from: 0, to: 1000, side: 0 },
    { line: 'R1', shape: 'w', from: 0, to: 1000, side: 2 },
    { line: 'R2', shape: 'w', from: 0, to: 1000, side: -1 },
  ];
  const { lines } = first(tracks, own(sides), (line) => (line === 'L' ? -1 : 1))(at(0, 3))(0);
  const sorted = lines.map(({ line, toward }) => `${line} ${rounded([toward])}`).sort();
  expect(sorted).toEqual(['L 0.5', 'R1 1.5', 'R1 2.5', 'R2 -0.5', 'R2 -1.5']);
});

test("zoomed out, it takes a Line's Trains to be on its stroke along the Stretch's centreline, not beside its own track", () => {
  // R1 runs east along 0°, and is drawn a line width right of a centreline 30 m north, which runs
  // back west: north of it, and so its Trains half a line width south of that, to their right.
  const tracks = [track('e', [-500, 0], [500, 0])];
  const centreline = track('stretch:0', [500, 30], [-500, 30]);
  const slots: Slot[] = [{ line: 'R1', shape: 'e', from: 0, to: 1000, side: 1, on: 'stretch:0', at: [1000, 0] }];
  const [north, south] = alongside(tracks, slots, right, [], new Map([[centreline.id, centreline]]))(at(0, -10))(0);
  expect(north?.clear.lines.map(({ line, toward, behind }) => [line, ...rounded([toward, behind])])).toEqual([['R1', 0.5, -30]]);
  expect(south?.clear.lines.map(({ line, toward, behind }) => [line, ...rounded([toward, behind])])).toEqual([['R1', -0.5, 40]]);
  // Clearing its stroke, a line width north of the centreline.
  expect(north?.near.lines.map(({ toward, behind }) => rounded([toward, behind]))).toEqual([[1, -30]]);
  // Crossing another place's track, it's drawn a line width to that track's left, as it runs east.
  const across = alongside([track('ns', [-300, -500], [-300, 500]), ...tracks], slots, right, [], new Map([[centreline.id, centreline]]))(at(-300, 200))(0);
  expect(across[0]?.clear.crossing.map(({ lines, side }) => [lines, side])).toEqual([[['R1'], -1]]);
});

test("its box keeps a given distance from its track, however the track slants, its nearest corner straight out along its normal", () => {
  // The corners of a name `w`×`h` px that MapLibre anchors at a point by its bottom or its left.
  const corners = (anchor: Spot['anchor'], [x, y]: [number, number], [w, h]: [number, number]) =>
    ({
      left: [[x, y - h / 2], [x + w, y - h / 2], [x, y + h / 2], [x + w, y + h / 2]],
      right: [[x - w, y - h / 2], [x, y - h / 2], [x - w, y + h / 2], [x, y + h / 2]],
      bottom: [[x - w / 2, y - h], [x + w / 2, y - h], [x - w / 2, y], [x + w / 2, y]],
      top: [[x - w / 2, y], [x + w / 2, y], [x - w / 2, y + h], [x + w / 2, y + h]],
    })[anchor];
  const size: [number, number] = [100, 26];
  const opposite = { left: 'right', right: 'left', bottom: 'top', top: 'bottom' } as const;
  for (const degrees of [0, 20, 45, 90, 135, 160]) {
    const spot = first([heading(degrees)], [], right)(at(0, 0))(0);
    // And the other side of the track, where another crosses its own.
    const other: Spot = { ...spot, anchor: opposite[spot.anchor], normal: [-spot.normal[0], -spot.normal[1]] };
    for (const s of [spot, other]) {
      const box = corners(s.anchor, nameOffset(s, 10, size), size);
      const clear = Math.min(...box.map(([x = 0, y = 0]) => x * s.normal[0] + y * s.normal[1]));
      expect(rounded([clear])).toEqual([10]);
      // And it's as near the dot as it can be.
      const [xs, ys] = [box.map(([x = 0]) => x), box.map(([, y = 0]) => y)];
      const [dx, dy] = [Math.max(Math.min(...xs), 0, -Math.max(...xs)), Math.max(Math.min(...ys), 0, -Math.max(...ys))];
      expect(rounded([Math.hypot(dx, dy)])).toEqual([10]);
    }
  }
  // Over a flat track, it's centred over the dot; beside an upright one, level with it.
  expect(rounded(nameOffset(first([heading(90)], [], right)(at(0, 0))(0), 10, size))).toEqual([0, -10]);
  expect(rounded(nameOffset(first([heading(0)], [], right)(at(0, 0))(0), 10, size))).toEqual([10, 0]);
});

test('it can go either side of its track, up first, however other tracks cross it', () => {
  const own = track('own', [-500, 0], [500, 0]);
  const sides = (tracks: Shape[]) => alongside(tracks, [], right)(at(0, 0))(0).map(({ clear }) => `${clear.anchor} ${rounded(clear.normal).join(',')}`);
  expect(sides([own])).toEqual(['bottom 0,-1', 'top 0,1']);
  expect(sides([heading(0)])).toEqual(['left 1,0', 'right -1,0']);
  // Which is clear of a branch, nearestSide() finds at each zoom.
  expect(sides([own, track('branch', [0, 5], [300, 300])])).toEqual(['bottom 0,-1', 'top 0,1']);
});

test("near its dot, it goes from the dot or its nearest track, clear of only that track's Lines' strokes", () => {
  // R1 is drawn a line width north of the track nearest the dot, 5 m south of it, and R2 along one 25 m north of it.
  const station = [track('near', [-500, 0], [500, 0]), track('far', [-500, 30], [500, 30])];
  const sides: Stroke[] = [
    { line: 'R1', shape: 'near', from: 0, to: 1000, side: -1 },
    { line: 'R2', shape: 'far', from: 0, to: 1000, side: 0 },
  ];
  const [north, south] = alongside(station, own(sides), right)(at(0, 5))(0);
  expect(metres(north?.near.from ?? [0, 0])).toEqual([0, 5]);
  expect(north?.near.dot).toBe(0);
  expect(north?.near.lines.map(({ line, toward, behind, stroke }) => [line, rounded([toward, behind]), stroke])).toEqual([['R1', [1, 5], true]]);
  // South, the track lies beyond the dot, and the stroke a line width back from it.
  expect(metres(south?.near.from ?? [0, 0])).toEqual([0, 0]);
  expect(rounded([south?.near.dot ?? NaN])).toEqual([5]);
  expect(south?.near.lines.map(({ line, toward, behind }) => [line, rounded([toward, behind])])).toEqual([['R1', [-1, 0]]]);
  // Clear of only that track's Lines, it can lie on the one alongside, 25 m north of the dot, so that counts as under it too.
  expect(north?.clear.crossing).toEqual([]);
  expect(north?.near.crossing.map(({ a, b }) => rounded([...a, ...b]))).toEqual([[-500, 25, 500, 25]]);
  // And where it carries only the Lines of the track nearest the dot, as a double track's other track does, drawn apart zoomed in.
  const double: Stroke[] = [...sides, { line: 'R1', shape: 'far', from: 0, to: 1000, side: 0 }].filter((s) => s.line === 'R1');
  const [doubleNorth, doubleSouth] = alongside(station, own(double), right)(at(0, 5))(0);
  expect(doubleNorth?.near.crossing.map(({ lines, a, b }) => [lines, rounded([...a, ...b])])).toEqual([[['R1'], [-500, 25, 500, 25]]]);
  expect(doubleNorth?.clear.crossing).toEqual([]);
  // Not the track nearest the dot itself, beside it.
  expect(doubleSouth?.near.crossing.map(({ a }) => rounded(a))).toEqual([[-500, 25]]);
});

test(`it takes the side where it's clear nearest its dot, and past ${CAP} px on both, the nearest clear of its own track's Lines`, () => {
  /** A side whose spots lie so many px from the dot, as `far` measures them by their `dot`. */
  const side = (anchor: Spot['anchor'], clear: number, near: number): Side => {
    const spot = (px: number): Spot => ({ from: [0, 0], anchor, normal: [0, 1], dot: px, lines: [], crossing: [], neighbours: [], widest: 0, bearing: 0 });
    return { clear: spot(clear), near: spot(near) };
  };
  const pick = (...sides: Side[]) => {
    const { spot, far } = nearestSide(sides, (s) => s.dot);
    return [spot.anchor, far];
  };
  expect(pick(side('bottom', 10, 1), side('top', 6, 1))).toEqual(['top', 6]);
  expect(pick(side('bottom', 6, 1), side('top', 6, 1))).toEqual(['bottom', 6]);
  expect(pick(side('bottom', CAP, 1), side('top', 40, 1))).toEqual(['bottom', CAP]);
  expect(pick(side('bottom', 20, 9), side('top', 40, 5))).toEqual(['top', 5]);
  expect(pick(side('left', 30, 8))).toEqual(['left', 8]);
  // Where crossing tracks lie under it on every side, the side with fewest under it, however near the other.
  const fewest = nearestSide([side('bottom', 6, 1), side('top', 8, 1)], (s) => s.dot, (s) => (s.anchor === 'bottom' ? 2 : 1));
  expect([fewest.spot.anchor, fewest.far]).toEqual(['top', 8]);
});

/** A place of this name, named from a zoom, so many metres east and north of 0°, 0°. */
const named = (name: string, nameZoom: number, east = 0, north = 0) => {
  const [lon, lat] = at(east, north);
  return { name, nameZoom, lon, lat };
};

/**
 * Whether the basemap shows a place label with these properties, so many metres east and north of
 * 0°, 0°, at a whole zoom, where these places are named: as MapLibre filters it in a vector tile of
 * the zoom, which lays it out 8192 units a side.
 */
function shows(places: ReturnType<typeof named>[], zoom: number, properties: Record<string, string>, east = 0, north = 0): boolean {
  const [lon, lat] = at(east, north);
  const [x, y] = [((lon + 180) / 360) * 2 ** zoom, ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** zoom];
  // MapLibre's distance reads only the tile's z, x and y.
  const tile = { z: zoom, x: Math.floor(x), y: Math.floor(y) } as ICanonicalTileID;
  const label: Feature = { type: 1, properties, geometry: [[{ x: (x % 1) * 8192, y: (y % 1) * 8192 }]] };
  const warn = vi.spyOn(console, 'warn');
  try {
    const shown = featureFilter(['!', namedTwice(places)], 'filter').filter({ zoom }, label, tile);
    // Where the filter fails to run, MapLibre warns and hides the label.
    expect(warn).not.toHaveBeenCalled();
    return shown;
  } finally {
    warn.mockRestore();
  }
}

test("the place labels' filters are set again only when the places change, unvalidated (#778)", () => {
  const setFilter = vi.fn();
  const hide = hidesTowns(setFilter);
  const labels = new Map<string, ExpressionFilterSpecification | undefined>([['town', ['==', ['get', 'class'], 'town']], ['village', undefined]]);
  hide(labels, [named('Vic', 9)]);
  expect(setFilter).toHaveBeenCalledTimes(2);
  expect(setFilter).toHaveBeenCalledWith('town', ['all', ['==', ['get', 'class'], 'town'], ['!', namedTwice([named('Vic', 9)])]], { validate: false });
  expect(setFilter).toHaveBeenCalledWith('village', ['all', true, ['!', namedTwice([named('Vic', 9)])]], { validate: false });
  // The same places, in new objects, as each join makes them.
  hide(labels, [named('Vic', 9)]);
  expect(setFilter).toHaveBeenCalledTimes(2);
  // A place whose name shows from another zoom, or another place.
  hide(labels, [named('Vic', 10)]);
  expect(setFilter).toHaveBeenCalledTimes(4);
  hide(labels, [named('Vic', 10), named('Manlleu', 10, 5000)]);
  expect(setFilter).toHaveBeenCalledTimes(6);
  // A place that moves.
  hide(labels, [named('Vic', 10), named('Manlleu', 10, 5000, 100)]);
  expect(setFilter).toHaveBeenCalledTimes(8);
});

test("a town's label with a place's name, within 2 km of it, goes from the zoom the place's name shows", () => {
  const vic = [named('Vic', 9)];
  expect(shows(vic, 8, { class: 'town', name: 'Vic' }, 300, 400)).toBe(true);
  expect(shows(vic, 9, { class: 'town', name: 'Vic' }, 300, 400)).toBe(false);
  expect(shows(vic, 13, { class: 'town', name: 'Vic' }, 300, 400)).toBe(false);
});

test('one further than 2 km from the place stays', () => {
  const vic = [named('Vic', 9)];
  expect(shows(vic, 12, { class: 'town', name: 'Vic' }, 1900, 0)).toBe(false);
  expect(shows(vic, 12, { class: 'town', name: 'Vic' }, 2100, 0)).toBe(true);
  expect(shows(vic, 12, { class: 'town', name: 'Vic' }, 0, -2100)).toBe(true);
});

test("names match whatever their case, but a place's that says more than the label's doesn't", () => {
  const places = [named('El Vendrell', 12), named('Barcelona-Sants', 9, 500)];
  expect(shows(places, 12, { class: 'town', name: 'el Vendrell' }, 300)).toBe(false);
  expect(shows(places, 12, { class: 'city', name: 'Barcelona' }, 300)).toBe(true);
});

test("only a city's, a town's, a village's or a suburb's label goes, not a neighbourhood's or a hamlet's", () => {
  const sarria = [named('Sarrià', 11)];
  for (const kind of ['city', 'town', 'village', 'suburb']) expect(shows(sarria, 12, { class: kind, name: 'Sarrià' }, 300)).toBe(false);
  for (const kind of ['neighbourhood', 'quarter', 'hamlet']) expect(shows(sarria, 12, { class: kind, name: 'Sarrià' }, 300)).toBe(true);
});

test('a label with no name stays', () => {
  expect(shows([named('Vic', 9)], 12, { class: 'town' }, 300)).toBe(true);
});

test('where two places have one name, each takes the label near it, from the zoom its own name shows', () => {
  const places = [named('Sant Roc', 12), named('Sant Roc', 9, 10_000)];
  expect(shows(places, 11, { class: 'suburb', name: 'Sant Roc' }, 300)).toBe(true);
  expect(shows(places, 12, { class: 'suburb', name: 'Sant Roc' }, 300)).toBe(false);
  expect(shows(places, 9, { class: 'suburb', name: 'Sant Roc' }, 10_300)).toBe(false);
  expect(shows(places, 12, { class: 'suburb', name: 'Sant Roc' }, 5000)).toBe(true);
});

test("counts the calls at each Station in some Trips, a Trip that calls at one twice counting twice", () => {
  const trip = (...stations: string[]) => ({ calls: stations.map((station) => ({ station })) });
  expect(callsIn([trip('a', 'b'), trip('b', 'c', 'b'), trip()])).toEqual(
    new Map([
      ['a', 1],
      ['b', 3],
      ['c', 1],
    ]),
  );
  expect(callsIn([])).toEqual(new Map());
});

test("sorts a place's name by the zoom it shows from, and by its calls after that, the busier first and none as far as the next zoom's", () => {
  // Bilbao-Abando's 287 calls against San Mamés' 181 and La Concordia's 61, a Station each, and two that call alike.
  const calls = new Map([
    ['abando', 287],
    ['san-mames', 181],
    ['concordia', 61],
    ['one', 38],
    ['other', 38],
  ]);
  const sort = (...stations: string[]) => nameSort({ nameZoom: 12, stations }, calls);
  expect(sort('abando')).toBeLessThan(sort('san-mames'));
  expect(sort('san-mames')).toBeLessThan(sort('concordia'));
  // Places with as many calls sort alike, so where they collide MapLibre's own order decides, as it did.
  expect(sort('one')).toBe(sort('other'));
  // One that no Trip calls at, or none of whose Stations the Trips know, is after every one that has some, and within its zoom.
  expect(sort('nobody')).toBe(sort());
  expect(sort('nobody')).toBeGreaterThan(sort('one'));
  expect(sort('nobody')).toBeLessThan(13);
  // The busiest Station of all is within its zoom too.
  expect(nameSort({ nameZoom: 12, stations: ['x'] }, new Map([['x', 100_000]]))).toBeGreaterThan(12);
  // A place's Stations add up.
  expect(sort('san-mames', 'concordia')).toBe(nameSort({ nameZoom: 12, stations: ['x'] }, new Map([['x', 242]])));
  expect(sort('san-mames', 'concordia')).toBeLessThan(sort('san-mames'));
});

test("sorts a tier's names by their calls a day too, the busier first, and every one before the next tier's and those in none (#424)", () => {
  // Madrid-Atocha's 1032 calls against Nuevos Ministerios' 738, both named from zoom 9, as the maintainer picked them.
  const calls = new Map([
    ['atocha', 1032],
    ['nuevos-ministerios', 738],
    ['x', 1_000_000],
  ]);
  const sort = (nameZoom: number, ...stations: string[]) => nameSort({ nameZoom, stations }, calls);
  expect(sort(9, 'atocha')).toBeLessThan(sort(9, 'nuevos-ministerios'));
  // A place no Trip calls at, in the zoom 9 tier, before the busiest of the zoom 11 tier's, and one in that, before the busiest in none.
  expect(sort(9, 'nobody')).toBeLessThan(sort(11, 'x'));
  expect(sort(11, 'nobody')).toBeLessThan(nameSort({ nameZoom: 12, stations: ['x'] }, calls));
});

test("lists each place in TIERS once: a place is drawn as the first tier that lists it says, so a second listing of it, in that tier or the next, is one nobody sees (#424)", () => {
  // main.ts builds the whole page as it loads, so no test can import it: TIERS is read from its text as namesBench.ts reads it.
  const main = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
  const tiers: { places: string[] }[] = new Function(`return ${/^const TIERS\b[^=]*=\s*([\s\S]*?);\n(?=\S)/m.exec(main)?.[1]}`)();
  const ids = tiers.flatMap((tier) => tier.places);
  expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
});

/** Each place's sides at a few bearings, as they'd go to JSON. */
const asJson = (sides: ((bearing: number) => Side[])[]) => JSON.stringify(sides.map((s) => [0, 37, 90].map((bearing) => s(bearing))));

test("works a joined track's places out a region at a time as alongside() does over the track, and at a join only those the join can move (#733)", () => {
  // Two regions 10 km apart, each a track with a Line along it and a place on it, a third place 2 km east of the first
  // region's, which a place of the second region's comes within REACH of when it joins, a fourth within REACH of
  // the second region's track, but of no place's dot that comes, and a fifth near enough both to look, but beyond REACH (#763).
  const a = [track('a', [-3000, 0], [3000, 0])];
  const b = [track('b', [10000, -3000], [10000, 3000])];
  const slots = drawn([...a, ...b]);
  const networks = [{ network: 'A', shapes: ['a'] }, { network: 'B', shapes: ['b'] }];
  const before = [{ id: 'a1', dot: at(0, 10), served: ['A'] }, { id: 'a2', dot: at(2000, -10), served: ['A'] }, { id: 'far', dot: at(-2900, 5000) }, { id: 'a3', dot: at(7800, 2900), served: ['A'] }, { id: 'a4', dot: at(7300, 0), served: ['A'] }];
  const after = [...before, { id: 'b1', dot: at(10010, -2900), served: ['B'] }, { id: 'b2', dot: at(3500, 0), served: ['B'] }];
  // Each region's track, the same object at every join.
  const [regionA, regionB] = [{ shapes: a }, { shapes: b }];
  const sides = sidesByJoin();
  const first = sides([regionA], slots.slice(0, 1), right, networks.slice(0, 1), new Map(), before);
  expect(asJson(first)).toBe(asJson(before.map(({ dot, served }) => alongside(a, slots.slice(0, 1), right, networks.slice(0, 1), new Map(), before.map((p) => p.dot))(dot, served))));
  const second = sides([regionA, regionB], slots, right, networks, new Map(), after);
  // As alongside() over the joined track has them.
  const whole = alongside([...a, ...b], slots, right, networks, new Map(), after.map((p) => p.dot));
  expect(asJson(second)).toBe(asJson(after.map(({ dot, served }) => whole(dot, served))));
  // a1, far and a4 are further than REACH from b's track and b1's and b2's dots, and kept; a2 is within REACH of b2's dot, and a3 of b's track.
  expect(second.map((s, i) => s === first[i])).toEqual([true, false, true, false, true, false, false]);
  // Only the place that changed is worked out again where nothing joins, and every one where told to.
  const served = after.map((p) => (p.id === 'far' ? { ...p, served: ['A'] } : p));
  const third = sides([regionA, regionB], slots, right, networks, new Map(), served);
  expect(third.map((s, i) => s === second[i])).toEqual([true, true, false, true, true, true, true]);
  const fresh = sides([regionA, regionB], slots, right, networks, new Map(), served, true);
  expect(fresh.some((s, i) => s === third[i])).toBe(false);
  // b leaves, and the places near it with it: a2 and a3 are worked out again, and far, served as it was.
  const fourth = sides([regionA], slots.slice(0, 1), right, networks.slice(0, 1), new Map(), before);
  expect(fourth.map((s, i) => s === fresh[i])).toEqual([true, false, false, false, true]);
  expect(asJson(fourth)).toBe(asJson(first));
});

test("a region's crossings kept from an earlier join are worked out again where the tracks its place runs beside change (#763)", () => {
  // A place served by both Networks, 10 m from the first region's track, which the second region's, 5 m from it on the other side, is nearer.
  const [a, b] = [[track('a', [-3000, 10], [3000, 10])], [track('b', [-3000, -5], [3000, -5])]];
  const slots = drawn([...a, ...b]);
  const networks = [{ network: 'A', shapes: ['a'] }, { network: 'B', shapes: ['b'] }];
  const places = [{ id: 'p', dot: at(0, 0), served: ['A', 'B'] }];
  const [regionA, regionB] = [{ shapes: a }, { shapes: b }];
  const sides = sidesByJoin();
  sides([regionA], slots.slice(0, 1), right, networks.slice(0, 1), new Map(), places);
  const joined = sides([regionA, regionB], slots, right, networks, new Map(), places);
  expect(asJson(joined)).toBe(asJson(places.map(({ dot, served }) => alongside([...a, ...b], slots, right, networks, new Map(), [dot])(dot, served))));
});

test("splits a joined track's names by region only where it's the regions' tracks joined, each with IDs of its own (#733)", () => {
  /** A region's track: a shape, a Line of its Network along it, and a slot of that Line on it. */
  const region = (id: string, shape = id, on = shape): Track => ({
    networks: [{ id, name: id, runningSide: 'right' } as Track['networks'][number]],
    lines: [{ id, network: id, shapes: [shape] } as Track['lines'][number]],
    stations: [],
    shapes: [track(shape, [0, 0], [1, 0])],
    strokes: [],
    rails: [],
    slots: [{ line: id, shape, from: 0, to: 1, side: 0, on, at: [0, 1] }],
    tracks: [],
  });
  const [a, b] = [region('a'), region('b')];
  expect(splitBy(joinTracks([a, b]), [a, b])).toEqual([a, b]);
  expect(splitBy(joinTracks([a, b]), undefined)).toBeUndefined();
  // Not the regions' tracks joined, as where a day of another build is joined in.
  expect(splitBy(joinTracks([b, a]), [a, b])).toBeUndefined();
  expect(splitBy(joinTracks([a]), [a, b])).toBeUndefined();
  // A shape of the same ID in both, or a slot on the other's centreline.
  const twin = region('c', 'a');
  expect(splitBy(joinTracks([a, twin]), [a, twin])).toBeUndefined();
  const across = region('d', 'd', 'a');
  expect(splitBy(joinTracks([a, across]), [a, across])).toBeUndefined();
});
