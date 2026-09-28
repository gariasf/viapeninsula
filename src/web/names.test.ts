import { featureFilter, type Feature, type ICanonicalTileID } from '@maplibre/maplibre-gl-style-spec';
import { expect, test, vi } from 'vitest';
import { DEGREE, type Point, type Shape, type Stroke } from '../bundle.ts';
import { alongside, namedTwice, nameOffset, type Spot } from './names.ts';

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

test("a place's name goes above a track that runs east–west, from its dot", () => {
  const spot = alongside([track('ew', [-500, 0], [500, 0])], [], right)(at(0, 0))(0);
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
  const steep = alongside([heading(29)], [], right)(at(0, 0))(0);
  expect(steep.anchor).toBe('left');
  expect(rounded(steep.normal)).toEqual([0.875, 0.485]);
  const slanting = alongside([heading(31)], [], right)(at(0, 0))(0);
  expect(slanting.anchor).toBe('bottom');
  expect(rounded(slanting.normal)).toEqual([-0.857, -0.515]);
});

test('turned, it goes beside its track as the track lies on screen', () => {
  const place = alongside([heading(90)], [], right)(at(0, 0));
  // Facing east, the track runs up the screen, and the name goes right of it, south of the track.
  expect(place(90).anchor).toBe('left');
  expect(rounded(place(90).normal)).toEqual([1, 0]);
  // Upside down, it goes above the track on screen, south of it.
  expect(place(180).anchor).toBe('bottom');
  expect(rounded(place(180).normal)).toEqual([0, -1]);
});

test('with no track within 200 m of its dot, it goes above the dot', () => {
  const far = track('far', [300, -500], [300, 500]);
  expect(alongside([far], [], right)(at(0, 0))(0)).toEqual({ from: at(0, 0), anchor: 'bottom', normal: [0, -1], dot: 0, lines: [] });
  expect(alongside([far], [], right)(at(150, 0))(0).anchor).toBe('left');
});

test('where several tracks meet at a place, it follows the one nearest the dot', () => {
  const spot = alongside([heading(0), track('ew', [-500, 20], [500, 20])], [], right)(at(0, 10))(0);
  expect(spot.anchor).toBe('left');
  const other = alongside([heading(0), track('ew', [-500, 20], [500, 20])], [], right)(at(15, 10))(0);
  expect(other.anchor).toBe('bottom');
});

test('where the dot lies the other side of its track, it goes from the track', () => {
  expect(metres(alongside([heading(90)], [], right)(at(0, -20))(0).from)).toEqual([0, 0]);
  expect(metres(alongside([heading(90)], [], right)(at(0, 20))(0).from)).toEqual([0, 20]);
});

test("where tracks run alongside it, as at a Station with more, it goes from the furthest the name's way", () => {
  const station = [heading(90), track('north', [-500, 30], [500, 30]), track('south', [-500, -30], [500, -30])];
  expect(metres(alongside(station, [], right)(at(0, 5))(0).from)).toEqual([0, 30]);
  // One more than 50 m further from the dot than the nearest, or running across it, isn't alongside.
  const others = [heading(90), track('far', [-500, 70], [500, 70]), track('across', [-500, -460], [500, 540])];
  expect(metres(alongside(others, [], right)(at(0, 5))(0).from)).toEqual([0, 5]);
});

test("where it goes from a track beyond the dot, it keeps how far behind that, in metres, the dot and each Line's track lie", () => {
  // R1 is drawn along the track nearest the dot, 5 m south of it, and R2 along one 25 m north of it.
  const station = [track('near', [-500, 0], [500, 0]), track('far', [-500, 30], [500, 30])];
  const sides: Stroke[] = [
    { line: 'R1', shape: 'near', from: 0, to: 1000, side: 0 },
    { line: 'R2', shape: 'far', from: 0, to: 1000, side: 0 },
  ];
  const place = alongside(station, sides, right)(at(0, 5));
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
  const { lines } = alongside(tracks, sides, (line) => (line === 'L' ? -1 : 1))(at(0, 3))(0);
  const sorted = lines.map(({ line, toward }) => `${line} ${rounded([toward])}`).sort();
  expect(sorted).toEqual(['L 0.5', 'R1 1.5', 'R1 2.5', 'R2 -0.5', 'R2 -1.5']);
});

test("its box keeps a given distance from its track, however the track slants: straight out along its normal", () => {
  // The corners of a name `w`×`h` px that MapLibre anchors at a point by its bottom or its left.
  const corners = (anchor: Spot['anchor'], [x, y]: [number, number], [w, h]: [number, number]) =>
    anchor === 'left' ? [[x, y - h / 2], [x + w, y - h / 2], [x, y + h / 2], [x + w, y + h / 2]] : [[x - w / 2, y - h], [x + w / 2, y - h], [x - w / 2, y], [x + w / 2, y]];
  const size: [number, number] = [100, 26];
  for (const degrees of [0, 20, 45, 90, 135, 160]) {
    const spot = alongside([heading(degrees)], [], right)(at(0, 0))(0);
    const clear = Math.min(...corners(spot.anchor, nameOffset(spot, 10, size), size).map(([x = 0, y = 0]) => x * spot.normal[0] + y * spot.normal[1]));
    expect(rounded([clear])).toEqual([10]);
  }
  // Over a flat track, it's centred over the dot; beside an upright one, level with it.
  expect(rounded(nameOffset(alongside([heading(90)], [], right)(at(0, 0))(0), 10, size))).toEqual([0, -10]);
  expect(rounded(nameOffset(alongside([heading(0)], [], right)(at(0, 0))(0), 10, size))).toEqual([10, 0]);
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
