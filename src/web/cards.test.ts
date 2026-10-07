import { expect, test } from 'vitest';
import type { Call, Trip } from '../bundle.ts';
import type { Pass } from '../engine.ts';
import { linesCallingAt, minutesTo, nearbyRows, progress } from './cards.ts';

/** A time of day in Barcelona on Wednesday 7 Oct 2026, in summer time, in ms since 1970. */
const at = (hours: number, minutes: number, seconds = 0) => Date.UTC(2026, 9, 7, hours - 2, minutes, seconds);
/** 8:12:30. */
const NOW = at(8, 12, 30);

test("counts the minutes to a time as a clock reads them, as a board shows a Train's time", () => {
  // Shown at 8:15, at 8:12.
  expect(minutesTo(at(8, 15, 40), NOW)).toBe(3);
  expect(minutesTo(at(8, 13, 1), NOW)).toBe(1);
  expect(minutesTo(at(9, 12), NOW)).toBe(60);
});

test('a time this minute, or past, is no minutes away', () => {
  expect(minutesTo(at(8, 12, 50), NOW)).toBe(0);
  expect(minutesTo(at(8, 10), NOW)).toBe(0);
});

/** A Train passing nearby on a Line, headed somewhere, at a time of day, Live or Scheduled. */
const pass = (id: string, line: string, headsign: string, when: number, live: boolean, delay?: number): Pass => {
  const trip: Trip = { id, line, shape: line, headsign, calls: [] };
  return { trip, at: when, live, ...(delay !== undefined && { delay }) };
};

test("Nearby has a row for each Line and destination, in the order of each one's next Train, with that Train", () => {
  const passes = [
    pass('a', 'R2S', 'Barcelona Estació de França', at(8, 12, 50), true, 29 * 60),
    pass('b', 'L7', 'Barcelona - Plaça Catalunya', at(8, 14), true, 5 * 60),
    pass('c', 'R2S', 'Barcelona Estació de França', at(8, 16, 10), false),
    pass('d', 'R2S', 'Vilanova i la Geltrú', at(8, 20), true, 0),
  ];
  const rows = nearbyRows(passes, NOW);
  expect(rows.map((row) => row.next.trip.id)).toEqual(['a', 'b', 'd']);
});

test("a row's next three passes count down in minutes, Live or Scheduled, and passes in the same minute count once", () => {
  const passes = [
    pass('a', 'R2S', 'Barcelona Estació de França', at(8, 12, 50), true),
    pass('c', 'R2S', 'Barcelona Estació de França', at(8, 16, 10), false),
    pass('e', 'R2S', 'Barcelona Estació de França', at(8, 16, 40), true),
    pass('f', 'R2S', 'Barcelona Estació de França', at(8, 31), true),
    pass('g', 'R2S', 'Barcelona Estació de França', at(8, 40), true),
  ];
  expect(nearbyRows(passes, NOW)[0]?.passes).toEqual([
    { minutes: 0, live: true },
    { minutes: 4, live: false },
    { minutes: 19, live: true },
  ]);
});

/** A Trip's calls, at Stations these many metres along its shape. */
const calls = (...dists: number[]): Call[] => dists.map((dist, i) => ({ station: `s${i}`, arrival: 60 * i, departure: 60 * i, dist }));

test("a Train's way along its Trip adds up its legs from Station to Station, as far as it's drawn", () => {
  // Between its second and third Stations, with the third and fourth still to leave.
  expect(progress(calls(0, 1000, 3000, 6000), 2000, 2)).toEqual({ done: 2000, length: 6000 });
});

test('a Trip that runs back along its track adds up both ways', () => {
  // Out 4 km and back 1.5 km, and 1 km into its way back.
  expect(progress(calls(0, 4000, 2500), 3000, 1)).toEqual({ done: 5000, length: 5500 });
});

test('a Train at its first Station has gone nowhere, and one with no Station left to leave has gone the whole way', () => {
  expect(progress(calls(0, 1000, 3000), 0, 3).done).toBe(0);
  expect(progress(calls(0, 1000, 3000), 3000, 0).done).toBe(3000);
});

/** A Trip on a Line, calling at these Stations. */
const trip = (line: string, ...stations: string[]): Trip => ({ id: `${line} ${stations.join()}`, line, shape: line, headsign: '', calls: stations.map((station, i) => ({ station, arrival: 60 * i, departure: 60 * i, dist: 1000 * i })) });

test("a board's Lines are those whose Trips call at any of its place's Stations, in the order the days list them", () => {
  // Sants, Rodalies' and the Metro's Stations, from their Trips.
  const trips = [trip('R2', 'adif:71801', 'adif:71802'), trip('L3', 'tmb:1.326'), trip('R1', 'adif:79400', 'adif:71801'), trip('R4', 'adif:78805'), trip('R2', 'adif:72305', 'adif:71801')];
  expect(linesCallingAt(trips, ['adif:71801', 'tmb:1.326'], ['R1', 'R2', 'R4', 'L3'])).toEqual(['R1', 'R2', 'L3']);
});
