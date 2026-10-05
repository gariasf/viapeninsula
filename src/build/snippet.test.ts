import { expect, test } from 'vitest';
import type { Point, Station } from '../bundle.ts';
import type { OsmWay } from './osm.ts';
import { cut } from './snippet.ts';

// A small railway, drawn in metres east (x) and north (y) of a point near Manresa, cut 2 km around it.
const M = (6_371_008.8 * Math.PI) / 180; // metres in a degree of latitude
const [LON, LAT] = [1.8, 41.7];
const COS = Math.cos((LAT * Math.PI) / 180);
const at = (x: number, y: number): Point => [LON + x / (M * COS), LAT + y / M];

/** A way through points given in metres. */
const way = (id: number, ...points: [number, number][]): OsmWay => ({
  id,
  nodes: points.map((_, i) => id * 10 + i),
  geometry: points.map((p) => {
    const [lon, lat] = at(...p);
    return { lon, lat };
  }),
  tags: { railway: 'rail' },
});

test('keeps each way that comes within the distance, whole, and no other', () => {
  const rails = [
    way(1, [-500, 0], [500, 0]),
    // Its end is within it, and it runs on 4 km beyond.
    way(2, [1500, 0], [6000, 0]),
    // It passes 1 km off, but has no point within 2 km.
    way(3, [-4000, 1000], [4000, 1000]),
    way(4, [3000, 0], [5000, 0]),
  ];
  expect(cut({ rails, shapes: [], stations: [] }, at(0, 0), 2000).rails).toEqual(rails.slice(0, 3));
});

test("keeps each shape's points within the distance, and the Stations there that its Trips serve", () => {
  const station = (id: string, x: number, y: number): Station => {
    const [lon, lat] = at(x, y);
    return { id, name: id, lon, lat };
  };
  const [a, b, c, d, e] = [station('A', -2500, 10), station('B', 0, 10), station('C', 1900, 10), station('D', 4000, 510), station('E', 100, 10)];
  const shapes = [
    { id: 'R1', line: 'rodalies:R1', coords: [at(-3000, 0), at(-1000, 0), at(1000, 0), at(3000, 0)], stations: ['A', 'B', 'C'] },
    { id: 'R2', line: 'rodalies:R2', coords: [at(3000, 500), at(5000, 500)], stations: ['C', 'D'] },
  ];
  const kept = cut({ rails: [], shapes, stations: [a, b, c, d, e] }, at(0, 0), 2000);
  expect(kept.shapes).toEqual([{ id: 'R1', line: 'rodalies:R1', coords: [at(-1000, 0), at(1000, 0)], stations: ['B', 'C'] }]);
  // E is there, but no shape's Trips serve it.
  expect(kept.stations).toEqual([b, c]);
});

test("keeps a shape's way back only where its Trips run it no other way", () => {
  // R1's Trips run it both ways; R7's run it only backwards, so the build has it only as R7:back.
  const coords = [at(-1000, 0), at(1000, 0)];
  const shapes = ['R1', 'R1:back', 'R7:back'].map((id) => ({ id, line: 'line', coords, stations: [] }));
  expect(cut({ rails: [], shapes, stations: [] }, at(0, 0), 2000).shapes.map((s) => s.id)).toEqual(['R1', 'R7:back']);
});
