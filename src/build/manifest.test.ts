import { expect, test } from 'vitest';
import type { Bundle, Closure, Manifest, ManifestDay, Network, Trip } from '../bundle.ts';
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

test("carries each day's Closures, every Network's, none where it has none, and logs and reports each Network's today, where it has any", () => {
  const [log, found]: [string[], Found[]] = [[], []];
  const closure = (line: string, from: number): Closure => ({ line, stations: ['adif:73100', 'adif:78400'], from, to: from + 3600, kind: 'buses' });
  const [r3, r13] = [closure('rodalies:R3', 20000), closure('rodalies:R13', 17280)];
  const days = dayTrips(
    ['2026-10-07', '2026-10-08'],
    [
      { network: RODALIES, trips: [[trip('1', 'rodalies:R3')], [trip('2', 'rodalies:R3')]], closures: [[r3, r13], []] },
      { network: FGC, trips: [[trip('3', 'fgc:S1')], [trip('4', 'fgc:S1')]] },
    ],
    (l) => log.push(l),
    (f) => found.push(f),
  );
  expect(days.map((d) => d.closures)).toEqual([[r3, r13], undefined]);
  expect(log).toEqual(["Rodalies de Catalunya's Trips on 2026-10-07: 1", "Rodalies de Catalunya's Closures on 2026-10-07: 2", "FGC's Trips on 2026-10-07: 1"]);
  expect(found.filter((f) => f.kind === 'closures')).toEqual([{ kind: 'closures', network: 'rodalies', text: [log[1]], numbers: { closures: 2 } }]);
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

test("leaves it to the build of every region to fail where no Network has Trips today, as a region's Networks may have none that day", () => {
  const both = (days: Trip[][]) => [{ network: RODALIES, trips: days }, { network: FGC, trips: days }];
  expect(dayTrips(['2026-10-05', '2026-10-06'], both([[], [trip('2', 'fgc:S1')]]), () => {}).map((d) => d.trips.length)).toEqual([0, 2]);
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

test("keeps each region's day before the ones built, where the last manifest named it, since its last Trains can run past midnight", () => {
  const entry = (date: string, key = date) => manifestDay(day(date, [18000, 88200]), { track: 'days/track-t.json', trips: `days/${key}.json` });
  const built = ['2026-09-26', '2026-09-27', '2026-09-28'].map((d) => entry(d));
  const last: Manifest = { regions: [{ id: 'catalonia', days: [entry('2026-09-24'), entry('2026-09-25'), entry('2026-09-26'), entry('2026-09-27', 'old')] }] };
  expect(manifestOf([{ id: 'catalonia', days: built }], last)).toEqual({ regions: [{ id: 'catalonia', days: [entry('2026-09-25'), ...built] }] });
  expect(manifestOf([{ id: 'catalonia', days: built }])).toEqual({ regions: [{ id: 'catalonia', days: built }] });
});

test("leaves out the day before where the last manifest named it in a bundle of one file, or of a file for each day, which the map can't read", () => {
  const built = [manifestDay(day('2026-09-26', [18000, 88200]), { track: 'days/track-t.json', trips: 'days/2026-09-26.json' })];
  const oneFile = { days: [{ date: '2026-09-25', bundle: 'days/2026-09-25.json', from: 0, to: 0 }] };
  const eachDay = { days: [{ date: '2026-09-25', track: 'days/track-t.json', trips: 'days/2026-09-25.json', from: 0, to: 0 }] };
  for (const last of [oneFile, eachDay]) {
    expect(manifestOf([{ id: 'catalonia', days: built }], last as unknown as Manifest)).toEqual({ regions: [{ id: 'catalonia', days: built }] });
  }
});

test('building the same days again gives the same manifest, so a second run the same day publishes the same result', () => {
  const entry = (date: string) => manifestDay(day(date, [18000, 88200]), { track: 'days/track-t.json', trips: `days/${date}.json` });
  const built = ['2026-09-26', '2026-09-27', '2026-09-28'].map(entry);
  const first = manifestOf([{ id: 'catalonia', days: built }], { regions: [{ id: 'catalonia', days: [entry('2026-09-25'), entry('2026-09-26'), entry('2026-09-27')] }] });
  expect(manifestOf([{ id: 'catalonia', days: built }], first)).toEqual(first);
});

test("keeps a region whose build failed at the files the last manifest names for it, from the day before the built ones, while the others publish what they built", () => {
  const entry = (date: string, key: string) => manifestDay(day(date, [18000, 88200]), { track: `days/track-${key}.json`, trips: `days/${date}-${key}.json` });
  const dates = ['2026-10-10', '2026-10-11', '2026-10-12'];
  // Yesterday's build named Madrid's for the 9th to the 11th, and Catalonia's the same.
  const last: Manifest = {
    regions: [
      { id: 'catalonia', days: ['2026-10-09', '2026-10-10', '2026-10-11'].map((d) => entry(d, 'old')) },
      { id: 'cercanias-madrid', days: ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'].map((d) => entry(d, 'old')) },
    ],
  };
  const manifest = manifestOf(
    [
      { id: 'catalonia', days: dates.map((d) => entry(d, 'new')) },
      { id: 'cercanias-madrid' },
    ],
    last,
  );
  // Madrid's last files, for the day before and for the days it has that are built now, and none for the 12th, which it has none of.
  expect(manifest.regions.map((r) => [r.id, r.days.map((d) => d.trips)])).toEqual([
    ['catalonia', ['days/2026-10-09-old.json', 'days/2026-10-10-new.json', 'days/2026-10-11-new.json', 'days/2026-10-12-new.json']],
    ['cercanias-madrid', ['days/2026-10-09-old.json', 'days/2026-10-10-old.json', 'days/2026-10-11-old.json']],
  ]);
  // Its tracks too: each day's Trips are those of the track built with them.
  expect(manifest.regions[1]?.days.map((d) => d.track)).toEqual(Array(3).fill('days/track-old.json'));
});

test("leaves out a region whose build failed and that the last manifest names no day for that's still wanted, so that a stale day never stands for today", () => {
  const entry = (date: string) => manifestDay(day(date, [18000, 88200]), { track: 'days/track-t.json', trips: `days/${date}.json` });
  const built = ['2026-10-12', '2026-10-13'].map(entry);
  const last: Manifest = { regions: [{ id: 'cercanias-madrid', days: ['2026-10-09', '2026-10-10'].map(entry) }] };
  expect(manifestOf([{ id: 'catalonia', days: built }, { id: 'cercanias-madrid' }, { id: 'cercanias-leon' }], last).regions.map((r) => r.id)).toEqual(['catalonia']);
});

test("fails where a region's build failed and the last manifest isn't one by region, which leaves it no files of its last build to keep, rather than have it go from the map", () => {
  const entry = (date: string) => manifestDay(day(date, [18000, 88200]), { track: 'days/track-t.json', trips: `days/${date}.json` });
  const built = ['2026-10-10', '2026-10-11'].map(entry);
  const regions = [{ id: 'catalonia', days: built }, { id: 'cercanias-madrid' }];
  // The shape before regions, whose files hold every Network: the page can't take Madrid's from them.
  const oneBundle = { days: [{ date: '2026-10-09', track: 'days/track-a.json', trips: 'days/2026-10-09-b.json', from: 0, to: 1 }] } as unknown as Manifest;
  expect(() => manifestOf(regions, oneBundle)).toThrow(/cercanias-madrid/);
  // Or none that could be read.
  expect(() => manifestOf(regions)).toThrow(/cercanias-madrid/);
  // A manifest by region that never named Madrid's has none to keep, and Madrid, new or never built, goes without as the others publish.
  expect(manifestOf(regions, { regions: [] }).regions.map((r) => r.id)).toEqual(['catalonia']);
});

test("lists the regions in the order given, whether built or kept", () => {
  const entry = (date: string, key: string) => manifestDay(day(date, [18000, 88200]), { track: `days/track-${key}.json`, trips: `days/${date}-${key}.json` });
  const last: Manifest = { regions: [{ id: 'b', days: [entry('2026-10-10', 'b')] }] };
  const manifest = manifestOf([{ id: 'a', days: [entry('2026-10-10', 'a')] }, { id: 'b' }, { id: 'c', days: [entry('2026-10-10', 'c')] }], last);
  expect(manifest.regions.map((r) => r.id)).toEqual(['a', 'b', 'c']);
});

test('fails where no region was built, as a manifest of the last one alone would only name days gone by', () => {
  expect(() => manifestOf([{ id: 'catalonia' }, { id: 'cercanias-madrid' }])).toThrow('No region was built');
});
