import { expect, test } from 'vitest';
import { beside, daysNeeded, DEGREE, type ManifestDay, type Shape } from './bundle.ts';

test('finds the point a distance along a line, moved to its right, or its left where negative', () => {
  // 1 km east along the equator, where a degree is DEGREE metres both ways.
  const east: Shape = { id: 'east', coords: [[0, 0], [1000 / DEGREE, 0]], dist: [0, 1000] };
  const metres = ([lon, lat]: [number, number]) => [lon * DEGREE, lat * DEGREE].map((m) => Math.round(m * 100) / 100);
  expect(metres(beside(east, 400, 5))).toEqual([400, -5]);
  expect(metres(beside(east, 400, -5))).toEqual([400, 5]);
  // At either end, it looks along the line's first or last metres.
  expect(metres(beside(east, 0, 5))).toEqual([0, -5]);
  expect(metres(beside(east, 1000, 5))).toEqual([1000, -5]);
});

// Made up: Friday's first Train comes onto the map at 05:00 and its last leaves it at 00:40, Saturday's
// first at 00:05 and its last at 23:30, and Sunday's first at 06:00.
const madrid = (moment: string) => Date.parse(`${moment}+02:00`);
const day = (date: string, from: string, to: string): ManifestDay => ({ date, track: `${date}.track`, trips: `${date}.trips`, from: madrid(from), to: madrid(to) });
const WEEKEND = [
  day('2026-09-25', '2026-09-25T05:00', '2026-09-26T00:40'),
  day('2026-09-26', '2026-09-26T00:05', '2026-09-26T23:30'),
  day('2026-09-27', '2026-09-27T06:00', '2026-09-28T00:10'),
];
const needed = (moment: string, emptyBoard?: string) => daysNeeded(WEEKEND, madrid(moment), { early: 60 * 60_000, late: 60 * 60_000, emptyBoard })?.days.map((d) => d.date);

test('in the daytime the map needs only today', () => {
  expect(needed('2026-09-26T12:00')).toEqual(['2026-09-26']);
  expect(needed('2026-09-26T03:00')).toEqual(['2026-09-26']);
});

test("the map needs the next day from `early` before its first Train, and the day before until `late` after its last", () => {
  expect(needed('2026-09-25T23:04')).toEqual(['2026-09-25']);
  expect(needed('2026-09-25T23:05')).toEqual(['2026-09-25', '2026-09-26']);
  expect(needed('2026-09-26T01:40')).toEqual(['2026-09-25', '2026-09-26']);
  expect(needed('2026-09-26T01:41')).toEqual(['2026-09-26']);
});

test("the map needs the next day once today's last Train has left the map", () => {
  expect(needed('2026-09-26T23:29')).toEqual(['2026-09-26']);
  expect(needed('2026-09-26T23:30')).toEqual(['2026-09-26', '2026-09-27']);
});

test('the map needs the next day while a Station board has had no departures left today', () => {
  expect(needed('2026-09-26T21:00', '2026-09-26')).toEqual(['2026-09-26', '2026-09-27']);
  // One left empty the day before counts for nothing.
  expect(needed('2026-09-26T21:00', '2026-09-25')).toEqual(['2026-09-26']);
});

test("where the manifest is out of date, its last day stands for today, with no next day", () => {
  expect(needed('2026-09-29T12:00', '2026-09-27')).toEqual(['2026-09-27']);
});
