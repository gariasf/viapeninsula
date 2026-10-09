import { expect, test } from 'vitest';
import type { Station } from '../bundle.ts';
import { collect, comment, diff, type Found, type Spot } from './report.ts';

const station = (id: string, lon: number, lat: number): Station => ({ id, name: `${id}'s name`, lon, lat });
const [A, B, C] = [station('adif:1', 2, 41), station('adif:2', 2.1, 41.1), station('adif:3', 2.2, 41.2)];

/** The report of these spots. */
function report(...found: Found[]) {
  const collected = collect();
  for (const f of found) collected.add(f);
  return collected.spots();
}

test("keys each spot by its kind, its Line or Network and its Stations, never by a Trip, a shape's way back, or a day", () => {
  const spots = report(
    { kind: 'copy', network: 'tram', text: [''] },
    { kind: 'kept', why: 'nopath', line: 'rodalies:R3', shape: 'rodalies:51_R3', stations: [C, B, A], text: [''] },
    { kind: 'turn', line: 'rodalies:R16', shape: 'rodalies:51_R16:back', stations: [B], text: [''] },
    { kind: 'branch', line: 'rodalies:R2N', shape: 'rodalies:51_R2N', stations: [A, B], text: [''] },
    { kind: 'trip', why: 'fast', line: 'metro:L1', trip: 'metro:1.1.11828731', stations: [B, A], text: [''] },
    { kind: 'notrips', network: 'rodalies', day: 2, text: [''] },
    { kind: 'trips', network: 'fgc', text: [''], numbers: { monday: 2041 } },
    { kind: 'length', line: 'rodalies:R16', shape: 'rodalies:51_R16_INV:back', text: [''], numbers: { percent: 0.6 } },
    { kind: 'node', zoom: 7, point: [-3.67716, 40.45778], text: [''], numbers: { size: 15.1 } },
    { kind: 'measures', text: [''], numbers: { breaks: 236 } },
  );
  // In order of key.
  expect(spots.map((s) => s.key)).toEqual([
    'branch rodalies:R2N adif:1 adif:2',
    'copy tram',
    'kept rodalies:R3 adif:1 adif:3 nopath',
    'length rodalies:R16 rodalies:51_R16_INV',
    'measures',
    'node 7 40.458 -3.677',
    'notrips rodalies 2',
    'trip metro:L1 fast adif:1 adif:2',
    'trips fgc',
    'turn rodalies:R16 adif:2',
  ]);
});

test('joins a spot found again: each line of the log once, the ways beside it, the number furthest from 0, and each Trip once a day', () => {
  const spots = report(
    { kind: 'length', line: 'rodalies:R2', shape: 'rodalies:51_R2', text: ['R2: -0.1%'], numbers: { percent: -0.1 } },
    { kind: 'length', line: 'rodalies:R2', shape: 'rodalies:51_R2:back', text: ['R2:back: -0.2%'], numbers: { percent: -0.2 } },
    { kind: 'trip', why: 'off', line: 'rodalies:R2N', trip: 'to França', day: 0, stations: [C], ways: [7, 3], text: ['to França is left out'] },
    { kind: 'trip', why: 'off', line: 'rodalies:R2N', trip: 'to França', day: 0, stations: [C], ways: [5, 3], text: ['to França is left out'] },
    { kind: 'trip', why: 'off', line: 'rodalies:R2N', trip: 'to França later', day: 0, stations: [C], text: ['to França later is left out'] },
    { kind: 'trip', why: 'off', line: 'rodalies:R2N', trip: 'to França', day: 1, stations: [C], text: ['to França is left out'] },
  );
  expect(spots).toEqual([
    { kind: 'length', key: 'length rodalies:R2 rodalies:51_R2', line: 'rodalies:R2', text: ['R2: -0.1%', 'R2:back: -0.2%'], numbers: { percent: -0.2 } },
    {
      kind: 'trip',
      key: 'trip rodalies:R2N off adif:3',
      line: 'rodalies:R2N',
      stations: [{ id: 'adif:3', name: "adif:3's name" }],
      point: [2.2, 41.2],
      zoom: 15,
      ways: [3, 5, 7],
      text: ['to França is left out', 'to França later is left out'],
      numbers: { trips: 2 },
    },
  ]);
});

test('places a spot halfway between its first and last Stations, to about a metre, unless it knows where it is', () => {
  const [kept, node] = report(
    { kind: 'kept', why: 'off', line: 'rodalies:R15', stations: [A, B, station('adif:4', 2.123456789, 41.987654321)], text: [''] },
    { kind: 'node', zoom: 9, point: [2.17598, 41.39514], text: [''], numbers: { size: 13.9 } },
  );
  expect(kept?.point).toEqual([2.06173, 41.49383]);
  expect(node?.point).toEqual([2.17598, 41.39514]);
});

test("gives each spot the zoom the map shows it at: a turn-back's 16, a branch's 15, a node's own, and the closest that fits a run kept, a shape's length or a Trip's Stations across a phone, at most 15", () => {
  const spots = report(
    // About 22 km from north to south: 115 m a pixel at zoom 9, 58 m at zoom 10.
    { kind: 'kept', why: 'off', line: 'rodalies:R3', stations: [A, B, C], text: [''] },
    // 84 m apart.
    { kind: 'kept', why: 'nopath', line: 'rodalies:R4', stations: [A, station('adif:5', 2.001, 41)], text: [''] },
    // About 42 km across: 230 m a pixel at zoom 8, 115 m at zoom 9.
    { kind: 'length', line: 'rodalies:R2', shape: 'rodalies:51_R2', point: [2.25, 41], extent: [[2, 41], [2.25, 41.01], [2.5, 41]], text: [''], numbers: { percent: 0.1 } },
    { kind: 'turn', line: 'rodalies:R16', stations: [B], text: [''] },
    { kind: 'branch', line: 'rodalies:R2N', stations: [A, B], text: [''] },
    { kind: 'trip', why: 'off', line: 'rodalies:R2N', trip: 'to França', stations: [C], text: [''] },
    // Too fast from A to C, as 22 km apart as the first run kept.
    { kind: 'trip', why: 'fast', line: 'cercanias-madrid:C2', trip: '1076L20990C2', stations: [A, C], text: [''] },
    { kind: 'node', zoom: 12, point: [2.17598, 41.39514], text: [''], numbers: { size: 13.9 } },
    { kind: 'notrips', network: 'rodalies', day: 1, text: [''] },
    { kind: 'measures', text: [''], numbers: { breaks: 236 } },
  );
  expect(Object.fromEntries(spots.map((s) => [s.key, s.zoom]))).toEqual({
    'branch rodalies:R2N adif:1 adif:2': 15,
    'kept rodalies:R3 adif:1 adif:3 off': 9,
    'kept rodalies:R4 adif:1 adif:5 nopath': 15,
    'length rodalies:R2 rodalies:51_R2': 8,
    measures: undefined,
    'node 12 41.395 2.176': 12,
    'notrips rodalies 1': undefined,
    'trip cercanias-madrid:C2 fast adif:1 adif:3': 9,
    'trip rodalies:R2N off adif:3': 15,
    'turn rodalies:R16 adif:2': 16,
  });
});

// Spots as the build reports them on 5 Oct 2026's feeds.
const TURN: Spot = {
  kind: 'turn',
  key: 'turn rodalies:R16 adif:65402',
  network: 'rodalies',
  line: 'rodalies:R16',
  stations: [{ id: 'adif:65402', name: "L'Aldea-Amposta-Tortosa" }],
  point: [0.61431, 40.75356],
  zoom: 16,
  ways: [216952562, 216952572],
  text: ["rodalies:51_R16: Camp-redó → Ulldecona-Alcanar-La Sénia turns back at L'Aldea-Amposta-Tortosa"],
};
const NO_TRIPS: Spot = { kind: 'notrips', key: 'notrips rodalies 0', network: 'rodalies', text: ["Rodalies de Catalunya's timetable has no Trips on 2026-10-05"] };
const LENGTH: Spot = {
  kind: 'length',
  key: 'length cercanias-madrid:C1 cercanias-madrid:10_C1',
  network: 'cercanias-madrid',
  line: 'cercanias-madrid:C1',
  point: [-3.67826, 40.48105],
  zoom: 11,
  text: ['cercanias-madrid:10_C1: 17.3 km long. Where the feed has the track: 9.8 km traced against its 9.8 km (+0.1%)'],
  numbers: { percent: 0.1 },
};
const MEASURES: Spot = { kind: 'measures', key: 'measures', text: ['Lines drawn: 236 breaks (181 steps, 29 stubs, 6 swaps, 20 joins)'], numbers: { breaks: 236, steps: 181, 'folds 9': 8 } };
const TRIP: Spot = { kind: 'trip', key: 'trip cercanias-madrid:C2 fast adif:70101 adif:98003', point: [-3.59852, 40.46375], zoom: 15, text: [], numbers: { trips: 5 } };
const NODE: Spot = { kind: 'node', key: 'node 10 40.400 -3.681', point: [-3.68073, 40.4], zoom: 10, text: [], numbers: { size: 14.8 } };

test('says in one line that nothing changed since the last build, where a length moves a point or less', () => {
  expect(diff([LENGTH, MEASURES, TURN], [{ ...LENGTH, numbers: { percent: 1.1 } }, MEASURES, TURN])).toBe('Nothing in the build report is new, gone or changed since the last build.');
});

test('lists the spots new since the last build, then those gone, then those whose numbers moved, each with its links and its lines of the log', () => {
  const longer = { ...LENGTH, text: ['cercanias-madrid:10_C1: 17.4 km long. Where the feed has the track: 9.9 km traced against its 9.8 km (+1.2%)'], numbers: { percent: 1.2 } };
  const fewer = { ...MEASURES, text: ['Lines drawn: 230 breaks (175 steps, 29 stubs, 6 swaps, 20 joins)'], numbers: { breaks: 230, steps: 175, 'folds 9': 8 } };
  expect(diff([LENGTH, MEASURES, NO_TRIPS], [longer, fewer, TURN]).split('\n')).toEqual([
    '### Build report: 1 new, 1 gone, 2 changed since the last build',
    '',
    '#### New',
    '',
    "- `turn rodalies:R16 adif:65402` · [map](https://viapeninsula.gariasf.com/#map=16/40.75356/0.61431&mark=40.75356,0.61431) · [OpenStreetMap](https://www.openstreetmap.org/#map=17/40.75356/0.61431) · [edit](https://www.openstreetmap.org/edit#map=18/40.75356/0.61431) · ways [216952562](https://www.openstreetmap.org/way/216952562), [216952572](https://www.openstreetmap.org/way/216952572)",
    "  - rodalies:51_R16: Camp-redó → Ulldecona-Alcanar-La Sénia turns back at L'Aldea-Amposta-Tortosa",
    '',
    '#### Gone',
    '',
    '- `notrips rodalies 0`',
    "  - Rodalies de Catalunya's timetable has no Trips on 2026-10-05",
    '',
    '#### Changed',
    '',
    '- `length cercanias-madrid:C1 cercanias-madrid:10_C1`: percent (0.1 → 1.2) · [map](https://viapeninsula.gariasf.com/#map=11/40.48105/-3.67826&mark=40.48105,-3.67826) · [OpenStreetMap](https://www.openstreetmap.org/#map=17/40.48105/-3.67826) · [edit](https://www.openstreetmap.org/edit#map=18/40.48105/-3.67826)',
    '  - cercanias-madrid:10_C1: 17.4 km long. Where the feed has the track: 9.9 km traced against its 9.8 km (+1.2%)',
    '- `measures`: breaks (236 → 230), steps (181 → 175)',
    '  - Lines drawn: 230 breaks (175 steps, 29 stubs, 6 swaps, 20 joins)',
  ]);
});

test('links each spot to the map at its zoom and point, with a ring there', () => {
  expect(diff([], [TURN])).toContain('[map](https://viapeninsula.gariasf.com/#map=16/40.75356/0.61431&mark=40.75356,0.61431)');
});

test('counts a Trip count, a node or any other measure as changed when it moves at all, a length only past a point', () => {
  // In order of key, as reports are.
  const changed = diff(
    [LENGTH, MEASURES, NODE, TRIP],
    [{ ...LENGTH, numbers: { percent: -0.9 } }, { ...MEASURES, numbers: { ...MEASURES.numbers, 'folds 15': 0 } }, { ...NODE, numbers: { size: 14.9 } }, { ...TRIP, numbers: { trips: 6 } }],
  );
  expect(changed.split('\n').filter((line) => line.startsWith('- '))).toEqual([
    '- `measures`: folds 15 (none → 0)',
    '- `node 10 40.400 -3.681`: size (14.8 → 14.9) · [map](https://viapeninsula.gariasf.com/#map=10/40.4/-3.68073&mark=40.4,-3.68073) · [OpenStreetMap](https://www.openstreetmap.org/#map=17/40.4/-3.68073) · [edit](https://www.openstreetmap.org/edit#map=18/40.4/-3.68073)',
    '- `trip cercanias-madrid:C2 fast adif:70101 adif:98003`: trips (5 → 6) · [map](https://viapeninsula.gariasf.com/#map=15/40.46375/-3.59852&mark=40.46375,-3.59852) · [OpenStreetMap](https://www.openstreetmap.org/#map=17/40.46375/-3.59852) · [edit](https://www.openstreetmap.org/edit#map=18/40.46375/-3.59852)',
  ]);
});

test("counts a Network's Trips as changed only where a day of the week's dropped by more than a quarter, not where they rose, dropped a quarter or less, or a day is first counted", () => {
  const trips: Spot = { kind: 'trips', key: 'trips fgc', network: 'fgc', text: ["FGC's Trips on 2026-10-06: 2040"], numbers: { monday: 2040, tuesday: 2040 } };
  const counts = (numbers: Record<string, number>) => diff([trips], [{ ...trips, numbers }]);
  expect(counts({ monday: 3000, tuesday: 1530, wednesday: 2040 })).toBe('Nothing in the build report is new, gone or changed since the last build.');
  expect(counts({ monday: 1529, tuesday: 2040 }).split('\n').filter((line) => line.startsWith('- '))).toEqual(['- `trips fgc`: monday (2040 → 1529)']);
});

test('with no last report, every spot is new, and it says so', () => {
  expect(diff(undefined, [NO_TRIPS, TURN]).split('\n').filter((line) => line.startsWith('#') || line.startsWith('- `'))).toEqual([
    '### Build report: no last report to diff against, so all 2 spots are new',
    '#### New',
    '- `notrips rodalies 0`',
    expect.stringMatching(/^- `turn rodalies:R16 adif:65402` · \[map\]/),
  ]);
});

// The run a comment links to.
const RUN = 'https://github.com/gariasf/viapeninsula/actions/runs/37330911997';
/** The keys of the spots a comment lists, in its order. */
const listed = (body?: string) => body?.split('\n').flatMap((line) => line.match(/^- `([^`]+)`/)?.[1] ?? []);

test("comments only on problem spots new since the last build: a run kept, a turn-back, a branch, Trips left out, no Trips or a Network built from its copy, never a length, a node, the measures or a Network's Trips", () => {
  const copy: Spot = { kind: 'copy', key: 'copy tram', network: 'tram', text: ['TRAM is built from the copy of its timetables kept on 2026-10-05: https://opendata.tram.cat/GTFS/zip/TBX.zip: HTTP 499'] };
  const kept: Spot = { kind: 'kept', key: 'kept rodalies:R3 adif:78600 adif:78605 nopath', text: [] };
  const branch: Spot = { kind: 'branch', key: 'branch rodalies:R2N adif:79100 adif:79101', text: [] };
  const trip: Spot = { kind: 'trip', key: 'trip metro:L1 fast tmb:1.111 tmb:1.112', text: [], numbers: { trips: 1 } };
  const trips: Spot = { kind: 'trips', key: 'trips fgc', network: 'fgc', text: [], numbers: { monday: 2041 } };
  const last = [LENGTH, MEASURES, TRIP, trips];
  // A new node, and numbers that moved, a known problem spot's too, and a Network's Trips by half: nothing to comment.
  expect(comment(last, [{ ...LENGTH, numbers: { percent: 3 } }, { ...MEASURES, numbers: { breaks: 1 } }, NODE, { ...TRIP, numbers: { trips: 6 } }, { ...trips, numbers: { monday: 1020 } }], RUN)).toBeUndefined();
  // In order of key, as reports are.
  expect(listed(comment(last, [branch, copy, kept, LENGTH, MEASURES, NODE, NO_TRIPS, { ...TRIP, numbers: { trips: 6 } }, trip, { ...trips, key: 'trips tram', network: 'tram' }, TURN], RUN))).toEqual([
    'branch rodalies:R2N adif:79100 adif:79101',
    'copy tram',
    'kept rodalies:R3 adif:78600 adif:78605 nopath',
    'notrips rodalies 0',
    'trip metro:L1 fast tmb:1.111 tmb:1.112',
    'turn rodalies:R16 adif:65402',
  ]);
});

test("says how many problem spots are new and links the run, whose summary has the whole diff, then lists each with its links and its lines of the log", () => {
  expect(comment([LENGTH], [LENGTH, NO_TRIPS, TURN], RUN)?.split('\n')).toEqual([
    "2 new problem spots since the last build. The whole diff is in [the run's summary](https://github.com/gariasf/viapeninsula/actions/runs/37330911997).",
    '',
    '- `notrips rodalies 0`',
    "  - Rodalies de Catalunya's timetable has no Trips on 2026-10-05",
    "- `turn rodalies:R16 adif:65402` · [map](https://viapeninsula.gariasf.com/#map=16/40.75356/0.61431&mark=40.75356,0.61431) · [OpenStreetMap](https://www.openstreetmap.org/#map=17/40.75356/0.61431) · [edit](https://www.openstreetmap.org/edit#map=18/40.75356/0.61431) · ways [216952562](https://www.openstreetmap.org/way/216952562), [216952572](https://www.openstreetmap.org/way/216952572)",
    "  - rodalies:51_R16: Camp-redó → Ulldecona-Alcanar-La Sénia turns back at L'Aldea-Amposta-Tortosa",
  ]);
  expect(comment([], [TURN], RUN)?.split('\n')[0]).toBe("1 new problem spot since the last build. The whole diff is in [the run's summary](https://github.com/gariasf/viapeninsula/actions/runs/37330911997).");
});

test("cuts the list to fit a GitHub comment's 65,536 characters, counted as UTF-8's bytes, and says how many more there are", () => {
  // Each a kilobyte as listed, in 500 two-byte letters.
  const turns = Array.from({ length: 100 }, (_, i): Spot => ({ kind: 'turn', key: `turn line:L ${String(i).padStart(3, '0')}`, text: ['é'.repeat(500)] }));
  const body = comment([], turns, RUN) ?? '';
  expect(Buffer.byteLength(body)).toBeLessThanOrEqual(65536);
  expect(body.split('\n')[0]).toMatch(/^100 new problem spots since the last build\./);
  expect(listed(body)).toEqual(turns.slice(0, 63).map((s) => s.key));
  expect(body.split('\n').at(-1)).toBe("- …and 37 more, in the run's summary");
});

test('with no last report, every problem spot is new, and it says so', () => {
  expect(listed(comment(undefined, [LENGTH, NO_TRIPS, TURN], RUN))).toEqual(['notrips rodalies 0', 'turn rodalies:R16 adif:65402']);
  expect(comment(undefined, [LENGTH, NO_TRIPS, TURN], RUN)?.split('\n')[0]).toBe(
    "2 new problem spots: with no last report to diff against, every spot is new. The whole diff is in [the run's summary](https://github.com/gariasf/viapeninsula/actions/runs/37330911997).",
  );
});

test("gives each spot only its first line of the log and how many more it has, so one with many Trips left out doesn't push the others out", () => {
  // 600 Trips left out between two Stations: about 72 KB of log.
  const many: Spot = { ...TRIP, text: Array.from({ length: 600 }, (_, i) => `cercanias-madrid:${1000 + i}L20990C2 is left out: it would run Fuente de la Mora → San Fernando de Henares at 142 km/h along its track`), numbers: { trips: 200 } };
  const body = comment([], [NO_TRIPS, many, TURN], RUN);
  expect(listed(body)).toEqual(['notrips rodalies 0', 'trip cercanias-madrid:C2 fast adif:70101 adif:98003', 'turn rodalies:R16 adif:65402']);
  // Under the Trips' spot, after its links.
  expect(body?.split('\n').slice(5, 7)).toEqual([
    '  - cercanias-madrid:1000L20990C2 is left out: it would run Fuente de la Mora → San Fernando de Henares at 142 km/h along its track',
    "  - …and 599 more like it, in the run's summary",
  ]);
});
