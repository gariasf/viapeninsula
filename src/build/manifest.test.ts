import { expect, test } from 'vitest';
import type { Bundle, ManifestDay, Network, Trip } from '../bundle.ts';
import { noonMinus12h } from './gtfs.ts';
import { dayTrips, manifestDay, manifestOf } from './manifest.ts';
import { collect, diff, type Found, type Spot } from './report.ts';

const PROFILE = { acceleration: 1, braking: 1, topSpeed: 44, dwell: 30 };
const RODALIES: Network = { id: 'rodalies', name: 'Rodalies de Catalunya', profile: PROFILE, runningSide: 'right', colour: '#000', pillZoom: 10, credit: { text: '', url: '' } };
const FGC: Network = { ...RODALIES, id: 'fgc', name: 'FGC' };

/** A Trip on a Line from one Station to another, from one time to the other, in seconds into its service day. */
const trip = (id: string, line: string, from = 18000, to = 20000): Trip => ({
  id,
  line,
  shape: 's',
  direction: 0,
  headsign: '',
  calls: [
    { station: 'a', arrival: from, departure: from, dist: 0 },
    { station: 'b', arrival: to, departure: to, dist: 1000 },
  ],
});

/** A day's bundle with Trips from one time to another, in seconds into its service day. */
const day = (serviceDay: string, ...trips: [from: number, to: number][]): Bundle => ({
  serviceDay,
  noonMinus12h: noonMinus12h(serviceDay),
  networks: [RODALIES],
  lines: [{ id: 'rodalies:R1', network: 'rodalies', name: 'R1', colour: '#000', shapes: [], kind: 'commuter' }],
  stations: [],
  shapes: [],
  strokes: [],
  rails: [],
  slots: [],
  tracks: [],
  trips: trips.map(([from, to], i) => trip(`${i}`, 'rodalies:R1', from, to)),
});

test("builds each day's Trips from the other Networks where one's timetable has none that day, today's included, and logs and reports it", () => {
  const [log, found]: [string[], Found[]] = [[], []];
  const days = dayTrips(
    ['2026-10-05', '2026-10-06'],
    [
      { network: RODALIES, trips: [[], []] },
      { network: FGC, trips: [[trip('1', 'fgc:S1')], [trip('2', 'fgc:S1')]] },
    ],
    (l) => log.push(l),
    (f) => found.push(f),
  );
  expect(days).toEqual([
    { serviceDay: '2026-10-05', noonMinus12h: Date.parse('2026-10-05T00:00:00+02:00'), trips: [trip('1', 'fgc:S1')] },
    { serviceDay: '2026-10-06', noonMinus12h: Date.parse('2026-10-06T00:00:00+02:00'), trips: [trip('2', 'fgc:S1')] },
  ]);
  expect(log).toEqual([
    "Rodalies de Catalunya's timetable has no Trips on 2026-10-05",
    "Rodalies de Catalunya's timetable has no Trips on 2026-10-06",
    "Rodalies de Catalunya's Trips on 2026-10-05: 0",
    "FGC's Trips on 2026-10-05: 1",
  ]);
  // By the day after today, not its date, and today's Trips by the day of the week.
  expect(found).toEqual([
    { kind: 'notrips', network: 'rodalies', day: 0, text: [log[0]] },
    { kind: 'notrips', network: 'rodalies', day: 1, text: [log[1]] },
    { kind: 'trips', network: 'rodalies', text: [log[2]], numbers: {} },
    { kind: 'trips', network: 'fgc', text: [log[3]], numbers: { monday: 1 } },
  ]);
});

test('keeps the Trips of a Network that has lost more than a quarter of them against the last report on the same day of the week, and names it in the summary', () => {
  // The last report, with each Network's Trips on the days of the week built so far.
  const last: Spot[] = [
    { kind: 'trips', key: 'trips fgc', network: 'fgc', text: ["FGC's Trips on 2026-10-06: 4"], numbers: { monday: 4, tuesday: 4 } },
    { kind: 'trips', key: 'trips rodalies', network: 'rodalies', text: ["Rodalies de Catalunya's Trips on 2026-10-06: 2"], numbers: { monday: 2, tuesday: 2 } },
  ];
  // Monday 12 October, with FGC's timetable cut by half.
  const fgc = [[trip('1', 'fgc:S1'), trip('2', 'fgc:S1')], [trip('3', 'fgc:S1')]];
  const rodalies = [[trip('4', 'rodalies:R1'), trip('5', 'rodalies:R1')], [trip('6', 'rodalies:R1')]];
  const log: string[] = [];
  const report = collect();
  const days = dayTrips(['2026-10-12', '2026-10-13'], [{ network: RODALIES, trips: rodalies }, { network: FGC, trips: fgc }], (l) => log.push(l), report.add, last);
  expect(days.map((d) => d.trips.map((t) => t.id))).toEqual([['4', '5', '1', '2'], ['6', '3']]);
  expect(log).toEqual(["Rodalies de Catalunya's Trips on 2026-10-12: 2", "FGC's Trips on 2026-10-12: 2"]);
  // The other days of the week carry over from the last report.
  expect(report.spots().map((s) => s.numbers)).toEqual([{ monday: 2, tuesday: 4 }, { monday: 2, tuesday: 2 }]);
  expect(diff(last, report.spots()).split('\n')).toEqual([
    '### Build report: 0 new, 0 gone, 1 changed since the last build',
    '',
    '#### Changed',
    '',
    '- `trips fgc`: monday (4 → 2)',
    "  - FGC's Trips on 2026-10-12: 2",
  ]);
});

test("keeps the last report's count for a day of the week a Network has no Trips, which no Trips names, so that the next week compares with the last day it had some", () => {
  const last: Spot[] = [{ kind: 'trips', key: 'trips rodalies', network: 'rodalies', text: ["Rodalies de Catalunya's Trips on 2026-10-05: 950"], numbers: { monday: 950, tuesday: 950 } }];
  const report = collect();
  dayTrips(['2026-10-12'], [{ network: RODALIES, trips: [[]] }, { network: FGC, trips: [[trip('1', 'fgc:S1')]] }], () => {}, report.add, last);
  expect(report.spots().find((s) => s.key === 'trips rodalies')?.numbers).toEqual({ monday: 950, tuesday: 950 });
});

test("counts a last report it can't read, as one of an older shape, as none, rather than stop the build", () => {
  for (const odd of [{ spots: [] }, [null]]) {
    const report = collect();
    dayTrips(['2026-10-12'], [{ network: FGC, trips: [[trip('1', 'fgc:S1')]] }], () => {}, report.add, odd as unknown as Spot[]);
    expect(report.spots().map((s) => s.numbers)).toEqual([{ monday: 1 }]);
  }
});

test("fails when no Network has Trips today, which is a broken build rather than a day without Trains, but not on a later day", () => {
  const both = (days: Trip[][]) => [{ network: RODALIES, trips: days }, { network: FGC, trips: days }];
  expect(() => dayTrips(['2026-10-05', '2026-10-06'], both([[], [trip('2', 'fgc:S1')]]), () => {})).toThrow("No Network's timetable has Trips on 2026-10-05");
  expect(dayTrips(['2026-10-05', '2026-10-06'], both([[trip('1', 'fgc:S1')], []]), () => {}).map((d) => d.trips.length)).toEqual([2, 0]);
});

test("names each day's track and Trips with when its first Train comes onto the map and its last leaves it, past midnight", () => {
  // From 05:00 to 00:30 the next morning, as GTFS has it, 24:30:00, standing 30 s at each end.
  const files = { track: 'days/track-def.json', trips: 'days/2026-09-25-abc.json' };
  expect(manifestDay(day('2026-09-25', [18000, 20000], [80000, 88200]), files)).toEqual({
    date: '2026-09-25',
    ...files,
    from: Date.parse('2026-09-25T04:59:30+02:00'),
    to: Date.parse('2026-09-26T00:30:30+02:00'),
  });
});

test('names the Networks with no Trips that day, and times the day by the others', () => {
  const files = { track: 'days/track-t.json', trips: 'days/2026-10-05-abc.json' };
  const bundle = day('2026-10-05');
  bundle.networks.push(FGC);
  bundle.lines.push({ id: 'fgc:S1', network: 'fgc', name: 'S1', colour: '#000', shapes: [], kind: 'commuter' });
  bundle.trips.push(trip('1', 'fgc:S1', 18000, 20000));
  expect(manifestDay(bundle, files)).toEqual({
    date: '2026-10-05',
    ...files,
    from: Date.parse('2026-10-05T04:59:30+02:00'),
    to: Date.parse('2026-10-05T05:33:50+02:00'),
    noTrips: ['rodalies'],
  });
});

test('on the night the clocks go back, a day runs an hour longer by the clock', () => {
  // 25 October's 00:30:00 is 01:30 summer time, and its 26:30:00 is 02:30 winter time.
  expect(manifestDay(day('2026-10-25', [1800, 9000]), { track: 't', trips: 'k' })).toMatchObject({
    from: Date.parse('2026-10-25T01:29:30+02:00'),
    to: Date.parse('2026-10-25T02:30:30+01:00'),
  });
});

test('keeps the day before the ones built, where the last manifest named it, since its last Trains can run past midnight', () => {
  const entry = (date: string, key = date) => manifestDay(day(date, [18000, 88200]), { track: 'days/track-t.json', trips: `days/${key}.json` });
  const built = ['2026-09-26', '2026-09-27', '2026-09-28'].map((d) => entry(d));
  const last = { days: [entry('2026-09-24'), entry('2026-09-25'), entry('2026-09-26'), entry('2026-09-27', 'old')] };
  expect(manifestOf(built, last)).toEqual({ days: [entry('2026-09-25'), ...built] });
  expect(manifestOf(built)).toEqual({ days: built });
});

test("leaves out the day before where the last manifest named it in a bundle of one file, which the map can't read", () => {
  const built = [manifestDay(day('2026-09-26', [18000, 88200]), { track: 'days/track-t.json', trips: 'days/2026-09-26.json' })];
  const last = { days: [{ date: '2026-09-25', bundle: 'days/2026-09-25.json', from: 0, to: 0 } as unknown as ManifestDay] };
  expect(manifestOf(built, last)).toEqual({ days: built });
});

test('building the same days again gives the same manifest, so a second run the same day publishes the same result', () => {
  const entry = (date: string) => manifestDay(day(date, [18000, 88200]), { track: 'days/track-t.json', trips: `days/${date}.json` });
  const built = ['2026-09-26', '2026-09-27', '2026-09-28'].map(entry);
  const first = manifestOf(built, { days: [entry('2026-09-25'), entry('2026-09-26'), entry('2026-09-27')] });
  expect(manifestOf(built, first)).toEqual(first);
});
