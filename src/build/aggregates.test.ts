import { expect, test } from 'vitest';
import { trainKey, type Trip } from '../bundle.ts';
import { aggregate, summarize, yearOf, type LinesFile, type TrainsFile } from './aggregates.ts';
import type { DayRecord } from './punctuality.ts';

/** A Trip of a Line calling at Stations a, b and c, leaving at `departure`. */
const trip = (line: string, number: string, departure = 25_000): Trip => ({
  id: `${line}:${number}`,
  line,
  shape: 'x',
  headsign: 'c',
  number,
  calls: ['a', 'b', 'c'].map((station, i) => ({ station, arrival: departure + i * 300, departure: departure + i * 300, dist: i * 1000 })),
});

/** A Train's figures in its Network's file, by its key: days seen, mean, days on time, worst. */
const figures = (file: TrainsFile | undefined, key: string) => {
  const i = file?.trains.keys.indexOf(key) ?? -1;
  return i < 0 ? undefined : [file?.trains.seen[i], file?.trains.mean[i], file?.trains.onTime[i], file?.trains.worst[i]];
};

/** A Network's record of a day: its Trips' Delays and where each came from, the feed working `minutes` of 1,440. */
const record = (network: string, day: string, delays: DayRecord['delays'], from: DayRecord['from'], minutes = 1440): DayRecord => ({
  day,
  track: 'days/track.json',
  trips: `days/${day}.json`,
  commit: 'c0ffee',
  rules: 'engine-hash',
  runs: 4320,
  feeds: { [network]: minutes },
  cancelled: [],
  unreported: [],
  unmatched: { reports: 0, trips: 0 },
  delays,
  from,
});

test('unconfirmed GPS Delays are left out of every figure (#808, pick 5)', () => {
  const trips = [trip('rodalies:R2S', '25478')];
  // Measured at a and b, then at c a GPS Delay no report after it confirmed (8 + 1), 20 minutes early.
  const { lines, stations, trains } = aggregate([summarize('rodalies', record('rodalies', '2026-10-17', [[60, 400, -1200]], [[1, 1, 9]]), trips)]);
  // Two Calls with a Delay, one within 1 minute and one within 15.
  expect(lines.lines['rodalies:R2S']).toEqual([[1, 0, 1, 1, 0, 0, 1, 0]]);
  expect(stations.stations.c).toBeUndefined();
  expect(stations.stations.b).toEqual([[1, 0, 400]]);
  // The Train's day figure is its Delay at b, its last Call with one that counts.
  expect(figures(trains.get('rodalies'), trainKey(trips[0] as Trip))).toEqual([1, 400, 0, 400]);
});

test("a Network's day its feed worked under 90% of the minutes of is left out, and the files say so (#808, section 5)", () => {
  const trips = [trip('tram:T1', '1')];
  // TRAM's feed worked 1,115 minutes of 18 October 2026's 1,440 (77%), Rodalies' all day.
  const summaries = [
    summarize('tram', record('tram', '2026-10-17', [[0, 30, 60]], [[1, 1, 1]], 1437), trips),
    summarize('tram', record('tram', '2026-10-18', [[0, 30, 900]], [[1, 1, 1]], 1115), trips),
    summarize('rodalies', record('rodalies', '2026-10-18', [[0, 30, 60]], [[1, 1, 1]]), [trip('rodalies:R1', '25000')]),
  ];
  const { lines, stations, trains } = aggregate(summaries);
  expect(lines.days).toEqual(['2026-10-17', '2026-10-18']);
  expect(lines.gaps).toEqual({ tram: ['2026-10-18'] });
  expect(lines.lines['tram:T1']).toEqual([[1, 0, 1, 3, 0, 0, 0, 0], 0]);
  expect(lines.lines['rodalies:R1']?.[1]).toEqual([1, 0, 1, 3, 0, 0, 0, 0]);
  // Rodalies' Calls at c count on the 18th; TRAM's don't.
  expect(stations.stations.c).toEqual([[1, 1, 60], [1, 1, 60]]);
  expect(trains.get('tram')?.gaps).toEqual({ tram: ['2026-10-18'] });
  expect(figures(trains.get('tram'), 'tram:T1/1')).toEqual([1, 60, 1, 60]);
});

test('on time means within 5 minutes, early too, for a Train and at a Station, and a Line counts within 1, 3, 5 and 15 minutes (#808, pick 3)', () => {
  const trips = [trip('fgc:S1', '1')];
  // Three days of one Train: 5 minutes late at its end, 5 minutes and a second, and 4 minutes early. From 4 is a
  // last Call's last-known Delay, which counts (pick 4).
  const day = (date: string, last: number) => summarize('fgc', record('fgc', date, [[-30, 179, last]], [[3, 1, 4]]), trips);
  const { lines, stations, trains } = aggregate([day('2026-10-17', 300), day('2026-10-18', 301), day('2026-10-19', -240)]);
  expect(figures(trains.get('fgc'), 'fgc:S1/1')).toEqual([3, 120, 2, 301]);
  expect(stations.stations.c).toEqual([[1, 1, 300], [1, 0, 301], [1, 1, -240]]);
  expect(lines.lines['fgc:S1']).toEqual([
    [1, 0, 1, 1, 1, 1, 0, 0],
    [1, 0, 1, 1, 1, 0, 1, 0],
    [1, 0, 1, 2, 1, 0, 0, 0],
  ]);
});

test("the Lines and Networks with no figure are left out: FGC's rack, funicular, RL1 and RL2 (section 4), and Euskotren, whose Delays are always 0 s (#825)", () => {
  const delays = [[0, 0, 0]];
  const from = [[3, 3, 3]];
  const { lines, trains } = aggregate([summarize('fgc', record('fgc', '2026-10-17', [...delays, ...delays], [...from, ...from]), [trip('fgc:MM', '1'), trip('fgc:S1', '2')]), summarize('euskotren', record('euskotren', '2026-10-17', delays, from), [trip('euskotren:E1', '3')])]);
  expect(Object.keys(lines.lines)).toEqual(['fgc:S1']);
  expect([...trains.keys()]).toEqual(['fgc']);
});

test("the Lines' year keeps the year file's days before the 30 worked out again, up to 365 days in all (#808)", () => {
  const file = (days: string[], lines: LinesFile['lines'], gaps: LinesFile['gaps'] = {}): LinesFile => ({ days, rules: days.map(() => 'r'), gaps, lines });
  const day = (n: number): [number, number, number, number, number, number, number, number] => [n, 0, n, n, 0, 0, 0, 0];
  // 2025-10-19 is the 366th day back from 2026-10-19, and S9 ran only then.
  const old = file(['2025-10-19', '2025-10-20', '2026-10-17', '2026-10-18'], { 'fgc:S1': [day(1), day(2), day(3), day(4)], 'fgc:S9': [day(9), 0, 0, 0] }, { tram: ['2025-10-20', '2026-10-18'] });
  const fresh = file(['2026-10-18', '2026-10-19'], { 'fgc:S1': [day(5), day(6)], 'fgc:S2': [0, day(7)] });
  expect(yearOf(old, fresh)).toEqual(
    file(['2025-10-20', '2026-10-17', '2026-10-18', '2026-10-19'], { 'fgc:S1': [day(2), day(3), day(5), day(6)], 'fgc:S2': [0, 0, 0, day(7)] }, { tram: ['2025-10-20'] }),
  );
  expect(yearOf(undefined, fresh)).toEqual(fresh);
});
