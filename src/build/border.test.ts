import { expect, test } from 'vitest';
import type { Shape, Station } from '../bundle.ts';
import { crop } from './border.ts';
import type { FeedTrip } from './trips.ts';

// Track drawn in metres east (x) and north (y) of a point near Riba-roja d'Ebre, with the border
// running north–south 5 km east of it: Catalonia lies east of the border.
const M = (6_371_008.8 * Math.PI) / 180; // metres in a degree of latitude
const LON = 0.3;
const LAT = 41.2;
const COS = Math.cos((LAT * Math.PI) / 180);
const at = (x: number, y: number): [number, number] => [LON + x / (M * COS), LAT + y / M];

/** Catalonia as a box east of x = 5 km, drawn as two ways that meet, as OpenStreetMap maps a boundary. */
const BORDER = [
  [at(5000, -50_000), at(5000, 50_000), at(100_000, 50_000)],
  [at(100_000, 50_000), at(100_000, -50_000), at(5000, -50_000)],
];

const station = (id: string, x: number): Station => {
  const [lon, lat] = at(x, 0);
  return { id, name: id, lon, lat };
};

/** Caspe and Nonaspe in Aragon, Riba-roja and Móra in Catalonia, along a track due east. */
const STATIONS = [station('caspe', -20_000), station('nonaspe', 0), station('ribaroja', 10_000), station('mora', 30_000)];
const TRACK: Shape = { id: 'r15', coords: [-20_000, 0, 10_000, 30_000].map((x) => at(x, 0)), dist: [0, 20_000, 30_000, 50_000] };

/** A Trip on a track calling at the named Stations, ten minutes apart. */
const trip = (id: string, stations: string, shape = 'r15'): FeedTrip => ({
  id,
  line: 'R15',
  shape,
  headsign: stations.split(' ').at(-1) ?? '',
  calls: stations.split(' ').map((station, i) => ({ station, arrival: i * 600, departure: i * 600 })),
});

test('keeps the Stations and the track within Catalonia, cutting the track at the border', () => {
  const { stations, shapes } = crop(BORDER, STATIONS, [TRACK], []);
  expect(stations.map((s) => s.id)).toEqual(['ribaroja', 'mora']);
  const [shape] = shapes;
  // The track still counts from where it started, so Trips' distances along it hold.
  expect(shape?.dist).toEqual([25_000, 30_000, 50_000]);
  expect(shape?.coords[0]?.[0]).toBeCloseTo(at(5000, 0)[0], 5);
  expect(shape?.coords.slice(1)).toEqual([at(10_000, 0), at(30_000, 0)]);
});

test('a Trip crossing the border keeps its calls in Catalonia and the first beyond it, so its Train runs to the border', () => {
  const { days } = crop(BORDER, STATIONS, [TRACK], [[trip('out', 'mora ribaroja nonaspe caspe'), trip('in', 'caspe nonaspe ribaroja mora')]]);
  expect(days[0]?.map((t) => t.calls.map((c) => c.station))).toEqual([
    ['mora', 'ribaroja', 'nonaspe'],
    ['nonaspe', 'ribaroja', 'mora'],
  ]);
  // Their times hold: the Train comes back onto the map when it reaches the border.
  expect(days[0]?.[1]?.calls.map((c) => c.arrival)).toEqual([600, 1200, 1800]);
});

test('leaves out a Trip that never comes into Catalonia', () => {
  const { days } = crop(BORDER, STATIONS, [TRACK], [[trip('aragon', 'caspe nonaspe')]]);
  expect(days).toEqual([[]]);
});

test("ends a Trip at its last Station in Catalonia where its track doesn't reach the first beyond the border", () => {
  // Renfe's R15 shape stops at Riba-roja, and OpenStreetMap's rails at the border, so Nonaspe is off the track.
  const short: Shape = { id: 'short', coords: [3000, 10_000, 30_000].map((x) => at(x, 0)), dist: [0, 7000, 27_000] };
  const { days } = crop(BORDER, STATIONS, [short], [[trip('caspe', 'mora ribaroja nonaspe caspe', 'short')]]);
  expect(days[0]?.map((t) => t.calls.map((c) => c.station))).toEqual([['mora', 'ribaroja']]);
});
