import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { dirSource, parseLine, rows } from './gtfs.ts';

const renfe = dirSource(fileURLToPath(new URL('fixtures/rodalies', import.meta.url)));

test('strips the padding around every field', () => {
  expect(parseLine('51T0007R2S  ,R2S  ,Sant Vicenc de Calders   -Barcelona-Estació de França   ,2,146520,FFFFFF     ')).toEqual(
    ['51T0007R2S', 'R2S', 'Sant Vicenc de Calders   -Barcelona-Estació de França', '2', '146520', 'FFFFFF'],
  );
});

test('keeps commas and escaped quotes inside quoted fields', () => {
  expect(parseLine(' 1 ,"Pl. Catalunya, Barcelona" ,"the ""R2"" line"')).toEqual(['1', 'Pl. Catalunya, Barcelona', 'the "R2" line']);
});

test("reads rows by header name, with Renfe's padded headers and IDs trimmed", async () => {
  const trips = [];
  for await (const t of rows(renfe, 'trips.txt', ['route_id', 'trip_id', 'shape_id'])) trips.push(t);
  expect(trips).toContainEqual({ route_id: '51T0007R2S', trip_id: '5165J25478R2S', shape_id: '51_R2S' });

  const routes = [];
  for await (const r of rows(renfe, 'routes.txt', ['route_id', 'route_text_color'])) routes.push(r);
  expect(routes).toContainEqual({ route_id: '51T0007R2S', route_text_color: 'FFFFFF' });
});

test('fails on a missing column instead of reading empty values', async () => {
  const read = async () => {
    for await (const _ of rows(renfe, 'trips.txt', ['trip_id', 'direction_id'])) void _;
  };
  await expect(read()).rejects.toThrow('trips.txt has no direction_id column');
});
