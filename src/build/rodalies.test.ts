import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { dirSource } from './gtfs.ts';
import { buildRodalies } from './rodalies.ts';

// Rows cut verbatim from Renfe's Cercanías feed of 2026-09-24: an R2S and an R7 Trip, an R3
// rail-replacement bus, and a C1 Trip in Madrid.
const rodalies = await buildRodalies(dirSource(fileURLToPath(new URL('fixtures/rodalies', import.meta.url))));
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

test('gives each Line its track, with the distance along it', () => {
  expect(line('R2S')?.shapes).toEqual(['rodalies:51_R2S']);
  expect(rodalies.shapes.map((s) => s.id).sort()).toEqual(['rodalies:51_R2S', 'rodalies:51_R7']);

  const r2s = rodalies.shapes.find((s) => s.id === 'rodalies:51_R2S');
  expect(r2s?.coords).toHaveLength(338);
  expect(r2s?.dist).toHaveLength(338);
  expect(r2s?.dist[0]).toBe(0);
  expect(r2s?.dist.every((d, i, all) => i === 0 || d >= (all[i - 1] ?? 0))).toBe(true);
  // Sant Vicenç de Calders to Estació de França is about 70 km of track.
  expect(r2s?.dist.at(-1)).toBeGreaterThan(60_000);
  expect(r2s?.dist.at(-1)).toBeLessThan(80_000);
});
