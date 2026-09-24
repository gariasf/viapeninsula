import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { dirSource, noonMinus12h, parseLine, rows, serviceIdsOn, type Source } from './gtfs.ts';

const renfe = dirSource(fileURLToPath(new URL('fixtures/rodalies', import.meta.url)));

/** A feed held in memory: each file's lines. */
const feed =
  (files: Record<string, string[]>): Source =>
  (file) => {
    const lines = files[file];
    return lines && (async function* () { yield* lines; })();
  };

const CALENDAR = 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date';

test('runs the service_ids calendar.txt gives the day, less those calendar_dates.txt removes and plus those it adds', async () => {
  // Made up: none of the feeds read so far removes a day. Renfe's has no calendar_dates.txt, and TRAM's only adds days.
  const gtfs = feed({
    'calendar.txt': [
      CALENDAR,
      'weekdays,1,1,1,1,1,0,0,20260901,20261231',
      'thursdays,0,0,0,1,0,0,0,20260901,20261231',
      'sundays,0,0,0,0,0,0,1,20260901,20261231',
      'summer,1,1,1,1,1,1,1,20260601,20260831',
    ],
    'calendar_dates.txt': [
      'service_id,date,exception_type',
      // 24 September 2026, a Thursday, is La Mercè: Thursday's timetable is off and Sunday's runs.
      'thursdays,20260924,2',
      'sundays,20260924,1',
      'weekdays,20260925,2',
    ],
  });
  expect(await serviceIdsOn(gtfs, '2026-09-24')).toEqual(new Set(['weekdays', 'sundays']));
  expect(await serviceIdsOn(gtfs, '2026-09-25')).toEqual(new Set());
});

test("reads service days from either file alone, as TRAM's feed has only calendar_dates.txt and Renfe's only calendar.txt", async () => {
  // Rows cut verbatim from TRAM's Trambaix feed of 2026-09-24.
  const tram = feed({ 'calendar_dates.txt': ['service_id,date,exception_type', '2578,20260924,1', '2579,20260925,1'] });
  expect(await serviceIdsOn(tram, '2026-09-24')).toEqual(new Set(['2578']));
  expect(await serviceIdsOn(renfe, '2026-09-24')).toEqual(new Set(['1065J', '5165J']));
});

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

test("starts a service day's clock at noon less 12 hours, which is an hour off midnight on the night the clocks go back", () => {
  expect(new Date(noonMinus12h('2026-09-24')).toISOString()).toBe('2026-09-23T22:00:00.000Z'); // midnight in Barcelona
  expect(new Date(noonMinus12h('2026-10-25')).toISOString()).toBe('2026-10-24T23:00:00.000Z'); // 01:00, still summer time
});
