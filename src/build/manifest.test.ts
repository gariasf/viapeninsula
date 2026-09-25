import { expect, test } from 'vitest';
import type { Bundle } from '../bundle.ts';
import { noonMinus12h } from './gtfs.ts';
import { manifestDay, manifestOf } from './manifest.ts';

const PROFILE = { acceleration: 1, braking: 1, topSpeed: 44, dwell: 30 };

/** A day's bundle with Trips from one time to another, in seconds into its service day. */
const day = (serviceDay: string, ...trips: [from: number, to: number][]): Bundle => ({
  serviceDay,
  noonMinus12h: noonMinus12h(serviceDay),
  networks: [{ id: 'rodalies', name: 'Rodalies de Catalunya', profile: PROFILE }],
  lines: [{ id: 'rodalies:R1', network: 'rodalies', name: 'R1', colour: '#000', shapes: [] }],
  stations: [],
  shapes: [],
  strokes: [],
  trips: trips.map(([from, to], i) => ({
    id: `${i}`,
    line: 'rodalies:R1',
    shape: 's',
    direction: 0,
    headsign: '',
    calls: [
      { station: 'a', arrival: from, departure: from, dist: 0 },
      { station: 'b', arrival: to, departure: to, dist: 1000 },
    ],
  })),
});

test("names each day's bundle with when its first Train comes onto the map and its last leaves it, past midnight", () => {
  // From 05:00 to 00:30 the next morning, as GTFS has it, 24:30:00, standing 30 s at each end.
  expect(manifestDay(day('2026-09-25', [18000, 20000], [80000, 88200]), 'days/2026-09-25-abc.json')).toEqual({
    date: '2026-09-25',
    bundle: 'days/2026-09-25-abc.json',
    from: Date.parse('2026-09-25T04:59:30+02:00'),
    to: Date.parse('2026-09-26T00:30:30+02:00'),
  });
});

test('on the night the clocks go back, a day runs an hour longer by the clock', () => {
  // 25 October's 00:30:00 is 01:30 summer time, and its 26:30:00 is 02:30 winter time.
  expect(manifestDay(day('2026-10-25', [1800, 9000]), 'k')).toMatchObject({
    from: Date.parse('2026-10-25T01:29:30+02:00'),
    to: Date.parse('2026-10-25T02:30:30+01:00'),
  });
});

test('keeps the day before the ones built, where the last manifest named it, since its last Trains can run past midnight', () => {
  const entry = (date: string, key = date) => manifestDay(day(date, [18000, 88200]), `days/${key}.json`);
  const built = ['2026-09-26', '2026-09-27', '2026-09-28'].map((d) => entry(d));
  const last = { days: [entry('2026-09-24'), entry('2026-09-25'), entry('2026-09-26'), entry('2026-09-27', 'old')] };
  expect(manifestOf(built, last)).toEqual({ days: [entry('2026-09-25'), ...built] });
  expect(manifestOf(built)).toEqual({ days: built });
});
