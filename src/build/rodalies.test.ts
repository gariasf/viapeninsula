import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { dirSource } from './gtfs.ts';
import { buildRodalies, onRodaliesRails } from './rodalies.ts';

// Rows cut verbatim from Renfe's Cercanías feed of 2026-09-24: an R2S and an R7 Trip, an R3
// rail-replacement bus, and a C1 Trip in Madrid, all running on Thursday 24 September.
const renfe = dirSource(fileURLToPath(new URL('fixtures/rodalies', import.meta.url)));
const rodalies = await buildRodalies(renfe, '2026-09-24');
const line = (name: string) => rodalies.lines.find((l) => l.name === name);

test('keeps only Rodalies Lines that run Trains', () => {
  // Not C1 (Madrid), and not R3, whose only Trip here is a bus.
  expect(rodalies.lines.map((l) => l.name).sort()).toEqual(['R2S', 'R7']);
});

test("uses Renfe's Line colours, fixing the ones it gets wrong", () => {
  expect(line('R2S')?.colour).toBe('#146520');
  expect(line('R7')?.colour).toBe('#B57CBB');
});

test('keeps the Stations Rodalies Trains serve, with Adif codes and names as published', () => {
  expect(rodalies.stations).toHaveLength(18);
  expect(rodalies.stations).toContainEqual({ id: 'adif:71801', name: 'Barcelona-Sants', lon: 2.14101688, lat: 41.3798632 });
  expect(rodalies.stations.map((s) => s.name)).toContain('Barcelona Estació de França');
  const ids = rodalies.stations.map((s) => s.id);
  expect(ids).not.toContain('adif:77102'); // La Garriga, served only by the bus here
  expect(ids).not.toContain('adif:18000'); // Madrid-Atocha
});

test("gives each Line its shapes as the feed draws them, with the Stations their Trips serve", () => {
  expect(line('R2S')?.shapes).toEqual(['rodalies:51_R2S']);
  expect(rodalies.shapes.map((s) => s.id).sort()).toEqual(['rodalies:51_R2S', 'rodalies:51_R7']);

  const r2s = rodalies.shapes.find((s) => s.id === 'rodalies:51_R2S');
  expect(r2s?.coords).toHaveLength(338);
  expect(r2s?.coords[0]).toEqual([1.5229805, 41.1856559]);
  expect(r2s?.stations).toHaveLength(13);
  const r7 = rodalies.shapes.find((s) => s.id === 'rodalies:51_R7');
  expect([...(r7?.stations ?? [])].sort()).toEqual(['adif:72503', 'adif:78706', 'adif:78707', 'adif:78708', 'adif:78800']);
});

test('runs on Iberian-gauge rails only, so never on the high-speed line', () => {
  const kinds: Record<string, string>[] = [
    { gauge: '1668' },
    { gauge: '1435;1668' }, // three rails, for both gauges
    { gauge: '1668', highspeed: 'yes' }, // the line to València past Vandellòs, which R16 takes
    { gauge: '1435', highspeed: 'yes' }, // the high-speed line
    { gauge: '1000' },
  ];
  expect(kinds.map((tags) => onRodaliesRails({ id: 1, nodes: [], geometry: [], tags: { railway: 'rail', ...tags } }))).toEqual([true, true, true, false, false]);
});

test("keeps the day's Trips that are Trains, with their Line, destination, Train number and calls", () => {
  // Not the C1 (Madrid), and not the R3 bus.
  expect(rodalies.trips.map((t) => t.id)).toEqual(['rodalies:5165J25478R2S', 'rodalies:5165J77801R7']);
  expect(rodalies.trips.find((t) => t.id === 'rodalies:5165J77801R7')).toEqual({
    id: 'rodalies:5165J77801R7',
    line: 'rodalies:R7',
    shape: 'rodalies:51_R7',
    // Renfe publishes no headsigns, so it's the last Station's name.
    headsign: 'Cerdanyola Universitat',
    number: '77801',
    // Seconds into the service day: 06:26 is 23,160 s.
    calls: [
      { station: 'adif:78800', arrival: 23160, departure: 23160 },
      { station: 'adif:78708', arrival: 23340, departure: 23340 },
      { station: 'adif:78707', arrival: 23520, departure: 23520 },
      { station: 'adif:78706', arrival: 23640, departure: 23700 },
      { station: 'adif:72503', arrival: 24000, departure: 24000 },
    ],
  });
});

test('leaves out the Trips of other days, but not the Lines and Stations they serve', async () => {
  const friday = await buildRodalies(renfe, '2026-09-25');
  expect(friday.trips).toEqual([]);
  expect(friday.lines).toEqual(rodalies.lines);
  expect(friday.stations).toEqual(rodalies.stations);
});
