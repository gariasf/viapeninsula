import { featureFilter, type Feature, type ICanonicalTileID } from '@maplibre/maplibre-gl-style-spec';
import { assert, expect, test, vi } from 'vitest';
import { DEGREE, type Point, type Shape, type Stroke } from '../bundle.ts';
import { alongside, CAP, namedTwice, nameOffset, nearestSide, NETWORK_OF, type Side, type Spot } from './names.ts';

// Made up, on the equator, where a degree is DEGREE metres both ways.
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
  return (dot: Point, stations?: string[]) => {
    const place = spots(dot, stations);
    return (bearing: number): Spot => place(bearing)[0]?.clear ?? assert.fail('no side');
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
  expect(first([far], [], right)(at(0, 0))(0)).toEqual({ from: at(0, 0), anchor: 'bottom', normal: [0, -1], dot: 0, lines: [] });
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
  expect(spots(at(0, 0), ['adif:78805'])(0).anchor).toBe('bottom');
  expect(spots(at(0, 0), ['tmb:1'])(0).anchor).toBe('left');
  // With no track of its own Network within 200 m, it goes by the nearest of any.
  expect(spots(at(0, 0), ['fgc:EN'])(0).anchor).toBe('left');
});

test("each Station's operator runs one Network", async () => {
  const feeds = await import('../build/networks.ts');
  const operators = [feeds.RODALIES_FEED, feeds.FGC_FEED, feeds.TRAMBAIX_FEED, feeds.TRAMBESOS_FEED, feeds.METRO_FEED].map((f) => [f.operator, f.network.id]);
  expect(Object.fromEntries(operators)).toEqual(NETWORK_OF);
});

test("where another track crosses its own near the place, it takes the side of its own that's clear", () => {
  // Its own track runs east to west through the dot, and another leaves it north-east.
  const own = track('own', [-500, 0], [500, 0]);
  const branch = track('branch', [0, 5], [300, 300]);
  const place = first([own, branch], [], right)(at(0, 0));
  expect(place(0).anchor).toBe('top');
  expect(rounded(place(0).normal)).toEqual([0, 1]);
  // Upside down, north is below on screen, so it stays above.
  expect(place(180).anchor).toBe('bottom');
  // Where a track crosses right over its own, neither side is clear, and it goes as it would.
  const across = track('across', [-300, -300], [300, 300]);
  expect(first([own, across], [], right)(at(0, 0))(0).anchor).toBe('bottom');
  // Only a track's stretch within 200 m of the place counts: this one crosses its own 212 m east.
  const beyond = track('beyond', [-100, 312], [500, -288]);
  expect(first([own, beyond], [], right)(at(0, 0))(0).anchor).toBe('top');
  // Right of a track that runs north to south, crossed to the east, it goes left of it.
  const upright = first([heading(0), track('east', [5, 0], [300, 200])], [], right)(at(0, 0))(0);
  expect(upright.anchor).toBe('right');
  expect(rounded(upright.normal)).toEqual([-1, 0]);
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

test("where it goes from a track beyond the dot, it keeps how far behind that, in metres, the dot and each Line's track lie", () => {
  // R1 is drawn along the track nearest the dot, 5 m south of it, and R2 along one 25 m north of it.
  const station = [track('near', [-500, 0], [500, 0]), track('far', [-500, 30], [500, 30])];
  const sides: Stroke[] = [
    { line: 'R1', shape: 'near', from: 0, to: 1000, side: 0 },
    { line: 'R2', shape: 'far', from: 0, to: 1000, side: 0 },
  ];
  const place = first(station, sides, right)(at(0, 5));
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
  const { lines } = first(tracks, sides, (line) => (line === 'L' ? -1 : 1))(at(0, 3))(0);
  const sorted = lines.map(({ line, toward }) => `${line} ${rounded([toward])}`).sort();
  expect(sorted).toEqual(['L 0.5', 'R1 1.5', 'R1 2.5', 'R2 -0.5', 'R2 -1.5']);
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

test('it can go either side of its track, its own first, unless another track crosses one side and not the other', () => {
  const own = track('own', [-500, 0], [500, 0]);
  const sides = (tracks: Shape[]) => alongside(tracks, [], right)(at(0, 0))(0).map(({ clear }) => `${clear.anchor} ${rounded(clear.normal).join(',')}`);
  expect(sides([own])).toEqual(['bottom 0,-1', 'top 0,1']);
  expect(sides([heading(0)])).toEqual(['left 1,0', 'right -1,0']);
  // A branch leaves it north-east: only south is clear.
  expect(sides([own, track('branch', [0, 5], [300, 300])])).toEqual(['top 0,1']);
  // One crosses right over it: neither is.
  expect(sides([own, track('across', [-300, -305], [300, 295])])).toEqual(['bottom 0,-1', 'top 0,1']);
});

test("near its dot, it goes from the dot or its nearest track, clear of only that track's Lines' strokes", () => {
  // R1 is drawn a line width north of the track nearest the dot, 5 m south of it, and R2 along one 25 m north of it.
  const station = [track('near', [-500, 0], [500, 0]), track('far', [-500, 30], [500, 30])];
  const sides: Stroke[] = [
    { line: 'R1', shape: 'near', from: 0, to: 1000, side: -1 },
    { line: 'R2', shape: 'far', from: 0, to: 1000, side: 0 },
  ];
  const [north, south] = alongside(station, sides, right)(at(0, 5))(0);
  expect(metres(north?.near.from ?? [0, 0])).toEqual([0, 5]);
  expect(north?.near.dot).toBe(0);
  expect(north?.near.lines.map(({ line, toward, behind, stroke }) => [line, rounded([toward, behind]), stroke])).toEqual([['R1', [1, 5], true]]);
  // South, the track lies beyond the dot, and the stroke a line width back from it.
  expect(metres(south?.near.from ?? [0, 0])).toEqual([0, 0]);
  expect(rounded([south?.near.dot ?? NaN])).toEqual([5]);
  expect(south?.near.lines.map(({ line, toward, behind }) => [line, rounded([toward, behind])])).toEqual([['R1', [-1, 0]]]);
});

test(`it takes the side where it's clear nearest its dot, and past ${CAP} px on both, the nearest clear of its own track's Lines`, () => {
  /** A side whose spots lie so many px from the dot, as `far` measures them by their `dot`. */
  const side = (anchor: Spot['anchor'], clear: number, near: number): Side => {
    const spot = (px: number): Spot => ({ from: [0, 0], anchor, normal: [0, 1], dot: px, lines: [] });
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
