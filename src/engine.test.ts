import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { pointAt, type Bundle, type Network, type Report, type Snapshot } from './bundle.ts';
import { noonMinus12h } from './build/gtfs.ts';
import { joinDays, KEEP, trainsAt, unavailable, type Received } from './engine.ts';

/** A speed profile like Rodalies', in metres and seconds, which the times below are worked out from. */
const PROFILE = { acceleration: 1, braking: 1, topSpeed: 160 / 3.6, dwell: 30 };

/** A Trip's call at a Station: arrival, departure, metres along its track, and where the Station is. */
type Row = [station: string, arrival: string, departure: string, dist: number, lon: number, lat: number];

// Stretches of Trips of Thursday 24 September 2026 as the daily build placed them on their track,
// with each track cut down to straight lines from Station to Station.
const TRIPS: Record<string, { line: string; calls: Row[] }> = {
  // Sant Vicenç de Calders to Estació de França: a minute or two at the big Stations, and no time given at the rest.
  'rodalies:5165J25478R2S': {
    line: 'R2S',
    calls: [
      ['Sant Vicenç de Calders', '21:30:00', '21:30:00', 110172, 1.52480358, 41.1862102],
      ['Calafell', '21:35:00', '21:35:00', 114402, 1.57500937, 41.1896703],
      ['Segur de Calafell', '21:38:00', '21:38:00', 117049, 1.60643599, 41.1925787],
      ['Cunit', '21:41:00', '21:41:00', 119202, 1.63194242, 41.1950415],
      ['Cubelles', '21:45:00', '21:45:00', 123032, 1.6759772, 41.2043246],
      ['Vilanova i la Geltrú', '21:49:00', '21:50:00', 128092, 1.73077249, 41.2203207],
      ['Sitges', '21:56:00', '21:57:00', 135376, 1.80969184, 41.2391315],
      ['Castelldefels', '22:12:00', '22:13:00', 150987, 1.97915126, 41.2790474],
      ['Gavà', '22:16:00', '22:17:00', 154759, 2.01053111, 41.3034722],
      ['Viladecans', '22:19:00', '22:19:00', 156319, 2.02741857, 41.3095086],
      ['Barcelona-Sants', '22:34:00', '22:36:00', 169891, 2.14101688, 41.3798632],
      ['Barcelona-Passeig de Gràcia', '22:40:00', '22:41:00', 172341, 2.16533862, 41.3920862],
      ['Barcelona Estació de França', '22:51:00', '22:51:00', 177289, 2.18534785, 41.3844866],
    ],
  },
  // Badalona to El Masnou: two minutes from each Station to the next leave little time to stand.
  'rodalies:5165J25601R1': {
    line: 'R1',
    calls: [
      ['Badalona', '06:19:00', '06:20:00', 18429, 2.24892096, 41.4458838],
      ['Montgat', '06:22:00', '06:22:00', 21147, 2.2721551, 41.4630211],
      ['Montgat-Nord', '06:24:00', '06:24:00', 22525, 2.28669661, 41.468786],
      ['El Masnou', '06:26:00', '06:27:00', 24701, 2.3103772, 41.4770363],
    ],
  },
  // Aguilar de Segarra to Manresa, running its track backwards: RL4's Trips both ways share one shape.
  'rodalies:5165J33520RL4': {
    line: 'RL4',
    calls: [
      ['Aguilar de Segarra', '06:43:00', '06:43:00', 19607, 1.62372, 41.738917],
      ['Rajadell', '06:51:00', '06:51:00', 12667, 1.696275, 41.733159],
      ['Manresa', '07:03:00', '07:03:00', 0, 1.82648564, 41.7203921],
    ],
  },
  // Colera to Portbou, by way of Cerbère, where it turns back.
  'rodalies:5165J15900R11': {
    line: 'R11',
    calls: [
      ['Colera', '08:47:00', '08:47:00', 165937, 3.15434316, 42.4068837],
      ['Portbou', '08:51:00', '08:52:00', 168171, 3.15801841, 42.4245908],
      ['Cerbère', '08:56:00', '09:04:00', 170146, 3.16314935, 42.441664],
      ['Portbou', '09:08:00', '09:08:00', 168171, 3.15801841, 42.4245908],
    ],
  },
  // Montcada-Bifurcació to Cerdanyola Universitat, running its track backwards.
  'rodalies:5165J77865R7': {
    line: 'R7',
    calls: [
      ['Montcada-Bifurcació', '21:26:00', '21:26:00', 9129, 2.18001578, 41.4698402],
      ['Montcada i Reixac-Manresa', '21:29:00', '21:29:00', 7335, 2.1854042, 41.4839402],
      ['Montcada i Reixac-Santa Maria', '21:32:00', '21:32:00', 5697, 2.16698683, 41.4811409],
      ['Cerdanyola del Vallès', '21:34:00', '21:35:00', 3571, 2.14752164, 41.4925608],
      ['Cerdanyola Universitat', '21:40:00', '21:40:00', 0, 2.1153777, 41.4969904],
    ],
  },
  // Granollers Centre to La Llagosta, on the way to El Prat Aeroport.
  'rodalies:5165J28480R2N': {
    line: 'R2N',
    calls: [
      ['Granollers Centre', '21:29:00', '21:29:00', 40546, 2.29126962, 41.5997447],
      ['Montmeló', '21:34:00', '21:34:00', 47790, 2.24544407, 41.5496523],
      ['Mollet-Sant Fost', '21:37:00', '21:38:00', 50838, 2.21766516, 41.5335634],
      ['La Llagosta', '21:41:00', '21:41:00', 53809, 2.19973279, 41.5104566],
    ],
  },
  // Not a real Trip: three kilometres in a minute and a half, quicker than Rodalies' Trains accelerate and brake for.
  'too quick': {
    line: 'R2S',
    calls: [
      ['A', '12:00:00', '12:00:00', 0, 2, 41.5],
      ['B', '12:01:30', '12:02:00', 3000, 2.036, 41.5],
    ],
  },
  // Not a real Trip either: 555 m in 45 s, as FGC's timetable has Gràcia to Sant Gervasi, too quick
  // for 1 m/s² and too short to reach top speed in.
  'short and quick': {
    line: 'R2S',
    calls: [
      ['A', '12:00:00', '12:00:00', 0, 2, 41.5],
      ['B', '12:00:45', '12:01:15', 555, 2.00666, 41.5],
    ],
  },
};

const seconds = (time: string) => time.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);

/** A service day's bundle of these Trips, on one Network, each on a track of its own, headed for its last Station unless it says. */
function bundleOf(serviceDay: string, network: Network, trips: Record<string, { line: string; headsign?: string; calls: Row[] }>): Bundle {
  return {
    serviceDay,
    // Midnight in Barcelona, which is noon less 12 hours on any day the clocks don't change.
    noonMinus12h: Date.parse(`${serviceDay}T00:00:00+02:00`),
    networks: [network],
    lines: [...new Set(Object.values(trips).map((t) => t.line))].map((name) => ({ id: name, network: network.id, name, colour: '#000', shapes: [] })),
    stations: [],
    shapes: Object.entries(trips).map(([id, { calls }]) => {
      const points = [...new Map(calls.map((c) => [c[3], c])).values()].sort((a, b) => a[3] - b[3]);
      return { id, coords: points.map((c): [number, number] => [c[4], c[5]]), dist: points.map((c) => c[3]) };
    }),
    strokes: [],
    trips: Object.entries(trips).map(([id, { line, headsign, calls }]) => ({
      id,
      line,
      shape: id,
      direction: 0,
      headsign: headsign ?? calls.at(-1)?.[0] ?? '',
      calls: calls.map(([station, arrival, departure, dist]) => ({ station, arrival: seconds(arrival), departure: seconds(departure), dist })),
    })),
  };
}

const BUNDLE = bundleOf('2026-09-24', { id: 'rodalies', name: 'Rodalies de Catalunya', profile: PROFILE }, TRIPS);

/** A moment on 24 September 2026, by the clock in Barcelona, and so many seconds on. */
const at = (time: string, plus = 0) => Date.parse(`2026-09-24T${time}+02:00`) + plus * 1000;

/** What the map has received of some live data by a moment by the device's clock. */
const by = (received: Received[], moment: number) => received.filter((r) => r.at <= moment);

/** A Trip's Train at a moment by the device's clock, if it's on the map, with the live data received by then. */
const train = (trip: string, moment: number, received: Received[] = []) => trainsAt(BUNDLE, moment, by(received, moment)).find((t) => t.trip.id === trip);

/** How far along its track a Trip's Train is at a moment, in metres, if it's on the map. */
const where = (trip: string, moment: number, received?: Received[]) => train(trip, moment, received)?.dist;

const R2S = 'rodalies:5165J25478R2S';

test('a Train appears at its first Station just before it leaves, and leaves the map just after it reaches its last', () => {
  expect(where(R2S, at('21:29:29'))).toBeUndefined();
  expect(where(R2S, at('21:29:30'))).toBe(110172);
  expect(where(R2S, at('22:51:30'))).toBe(177289);
  expect(where(R2S, at('22:51:31'))).toBeUndefined();
});

test('leaves every Station exactly when its timetable says, and reaches every Station it has time at exactly when it says', () => {
  const wrong: string[] = [];
  for (const [trip, { calls }] of Object.entries(TRIPS)) {
    for (const [i, [name, arrival, departure, dist]] of calls.entries()) {
      const [before, after] = [calls[i - 1]?.[3], calls[i + 1]?.[3]];
      const between = (x: number | undefined, a = 0, b = 0) => x !== undefined && (x - a) * (x - b) < 0;
      if (after !== undefined) {
        if (where(trip, at(departure)) !== dist) wrong.push(`${trip} isn't at ${name} at ${departure}`);
        if (!between(where(trip, at(departure, 1)), dist, after)) wrong.push(`${trip} hasn't left ${name} at ${departure}`);
      }
      if (before !== undefined && arrival !== departure) {
        if (where(trip, at(arrival)) !== dist) wrong.push(`${trip} isn't at ${name} at ${arrival}`);
        if (!between(where(trip, at(arrival, -1)), before, dist)) wrong.push(`${trip} is at ${name} before ${arrival}`);
      }
    }
  }
  expect(wrong).toEqual([]);
});

test('stands at a Station for as long as its timetable gives it', () => {
  for (let s = 0; s <= 60; s += 5) expect(where(R2S, at('21:49:00', s))).toBe(128092); // Vilanova i la Geltrú
  for (let s = 0; s <= 120; s += 5) expect(where(R2S, at('22:34:00', s))).toBe(169891); // Barcelona-Sants
});

test("stands for the profile's 30 seconds where its timetable gives it no time at a Station, arriving that much before it leaves", () => {
  // Calafell, at 21:35:00.
  expect(where(R2S, at('21:34:29'))).toBeLessThan(114402);
  expect(where(R2S, at('21:34:30'))).toBe(114402);
  expect(where(R2S, at('21:35:00'))).toBe(114402);
  expect(where(R2S, at('21:35:01'))).toBeGreaterThan(114402);
});

test('stands only for half the time its stretch to a Station can spare, where that is less', () => {
  // Montgat is 2,718 m on from Badalona and two minutes later. At full acceleration, top speed and
  // full braking the stretch takes 105.6 s, which leaves 14.4 s to spare: the Train stands for 7.2 s.
  const r1 = 'rodalies:5165J25601R1';
  expect(where(r1, at('06:22:00', -7.3))).toBeLessThan(21147);
  expect(where(r1, at('06:22:00', -7.1))).toBe(21147);
  expect(where(r1, at('06:22:00'))).toBe(21147);
});

/** How far off floating-point sums can be. */
const ROUNDING = 1e-6;

/** A Train's speed each second it's on the map, in metres per second, from how far it runs each second. */
function speeds(trip: string, from: string, to: string, received: Received[] = []): number[] {
  const found: number[] = [];
  for (let t = at(from); t < at(to); t += 1000) {
    const [a, b] = [where(trip, t, received), where(trip, t + 1000, received)];
    if (a !== undefined && b !== undefined) found.push(Math.abs(b - a));
  }
  return found;
}

test('accelerates out of each Station and brakes into the next, within the profile', () => {
  for (const [trip, { calls }] of Object.entries(TRIPS).filter(([t]) => !['too quick', 'short and quick'].includes(t))) {
    const all = speeds(trip, calls[0]?.[1] ?? '', calls.at(-1)?.[2] ?? '');
    expect(Math.max(...all)).toBeLessThanOrEqual(PROFILE.topSpeed + ROUNDING);
    // Its speed changes by no more than the profile's acceleration or braking each second.
    expect(Math.max(...all.slice(1).map((v, i) => Math.abs(v - (all[i] ?? 0))))).toBeLessThanOrEqual(1 + ROUNDING);
    for (const [i, [name, arrival, departure]] of calls.entries()) {
      const [prev, next] = [calls[i - 1], calls[i + 1]];
      if (next) {
        const out = speeds(trip, departure, next[1]).slice(0, 10);
        expect(out, `${trip} out of ${name}`).toEqual([...out].sort((a, b) => a - b));
        expect(out[9], `${trip} out of ${name}`).toBeGreaterThan(out[0] ?? Infinity);
      }
      if (prev && arrival !== departure) {
        const into = speeds(trip, prev[2], arrival).slice(-10);
        expect(into, `${trip} into ${name}`).toEqual([...into].sort((a, b) => b - a));
        expect(into[9], `${trip} into ${name}`).toBeLessThan(into[0] ?? -Infinity);
      }
    }
  }
});

test('keeps to the timetable on a stretch quicker than the profile allows, braking and accelerating harder rather than passing its top speed', () => {
  expect(where('too quick', at('12:00:00'))).toBe(0);
  expect(where('too quick', at('12:01:30'))).toBe(3000);
  expect(Math.max(...speeds('too quick', '12:00:00', '12:01:30'))).toBeLessThanOrEqual(PROFILE.topSpeed + ROUNDING);
});

test("never runs back on a stretch too short to reach top speed in the time it has, braking and accelerating harder instead", () => {
  const each = Array.from({ length: 91 }, (_, i) => where('short and quick', at('12:00:00', i / 2)) ?? NaN);
  expect([each[0], each.at(-1)]).toEqual([0, 555]);
  expect(each).toEqual([...each].sort((a, b) => a - b));
});

test('runs its track whichever way its Trip does, and turns back where it does', () => {
  const minutes = (trip: string, from: string, count: number) => Array.from({ length: count }, (_, m) => where(trip, at(from, m * 60)) ?? NaN);
  // RL4 runs its track backwards, from 19.6 km along it to Manresa at its start.
  const rl4 = minutes('rodalies:5165J33520RL4', '06:43:00', 21);
  expect(rl4).toEqual([...rl4].sort((a, b) => b - a));
  expect([rl4[0], rl4.at(-1)]).toEqual([19607, 0]);
  // R11 runs on to Cerbère, then back to Portbou.
  const r11 = minutes('rodalies:5165J15900R11', '08:47:00', 22);
  expect(r11.slice(0, 10)).toEqual([...r11.slice(0, 10)].sort((a, b) => a - b));
  expect(r11.slice(17)).toEqual([...r11.slice(17)].sort((a, b) => b - a));
  expect([r11[9], r11[21]]).toEqual([170146, 168171]);
});

test('is drawn on its track: at a Station, where the Station is', () => {
  const standing = train(R2S, at('21:49:30')); // at Vilanova i la Geltrú
  expect(standing?.lon).toBeCloseTo(1.73077249, 7);
  expect(standing?.lat).toBeCloseTo(41.2203207, 7);
});

/** A snapshot the fetcher wrote at a moment, having read Renfe's feeds then as it does every 20 s, reporting no Trains. */
const written = (generated: number): Snapshot => ({
  generated,
  feeds: { rodalies: { lastSuccess: generated, lastAttempt: generated, status: 'ok', every: 20_000 } },
  reports: [],
});

test("places Trains by the fetcher's clock on a device whose clock is minutes off", () => {
  // At 21:49:30 the R2S stands at Vilanova i la Geltrú. A device 5 minutes behind receives a
  // snapshot as it's written, at 21:49:00, and asks at what it takes for 21:44:30.
  expect(where(R2S, at('21:44:30'), [{ snapshot: written(at('21:49:00')), at: at('21:44:00') }])).toBe(128092);
  // One 5 minutes ahead, once it has received a second snapshot to show the first wasn't stale.
  const ahead = [
    { snapshot: written(at('21:48:40')), at: at('21:53:40') },
    { snapshot: written(at('21:49:00')), at: at('21:54:00') },
  ];
  expect(where(R2S, at('21:54:30'), ahead)).toBe(128092);
});

test("goes by a device's own clock while the fetcher has stopped, however old its last snapshot", () => {
  // The fetcher last wrote at 21:39:00, and the device, whose clock is right, fetches that snapshot
  // again and again. A device 10 minutes ahead would receive the same, but only a second snapshot tells them apart.
  const stale = [0, 20, 40].map((s) => ({ snapshot: written(at('21:39:00')), at: at('21:49:00', s) }));
  expect(where(R2S, at('21:49:30'), stale)).toBe(128092);
});

test("goes by a device's own clock where it's right, however old a snapshot is when it arrives", () => {
  // The R2S stands at Sitges from 21:56:00. A snapshot can be 20 s old when it arrives: the fetcher
  // writes one every 20 s, and the CDN keeps each for 15 s.
  expect(where(R2S, at('21:56:10'), [{ snapshot: written(at('21:55:50')), at: at('21:56:10') }])).toBe(135376);
});

test('corrects a clock by the freshest snapshot received so far', () => {
  // A device 5 minutes behind receives a snapshot 30 s old, one as it's written, and one 25 s old.
  const received = [
    { snapshot: written(at('21:59:00')), at: at('21:59:30', -300) },
    { snapshot: written(at('21:59:40')), at: at('21:59:40', -300) },
    { snapshot: written(at('22:00:00')), at: at('22:00:25', -300) },
  ];
  expect(where(R2S, at('22:00:30', -300), received)).toBe(where(R2S, at('22:00:30')));
});

test('a Train its operator has cancelled leaves the map', () => {
  const snapshot: Snapshot = { ...written(at('21:49:00')), reports: [{ trip: R2S, at: at('21:48:40'), cancelled: true }] };
  expect(train(R2S, at('21:49:30'))).toBeDefined();
  expect(train(R2S, at('21:49:30'), [{ snapshot, at: at('21:49:10') }])).toBeUndefined();
});

// The snapshot the fetcher makes from Renfe's feeds as recorded at 21:37 on 24 September 2026,
// received as it was written.
const LIVE: Snapshot = JSON.parse(readFileSync(new URL('fetcher/fixtures/snapshot.json', import.meta.url), 'utf8'));
const RECEIVED: Received[] = [{ snapshot: LIVE, at: LIVE.generated }];

const [R7, R2N] = ['rodalies:5165J77865R7', 'rodalies:5165J28480R2N'];

test("a Train Renfe's live data reports is Live, and standing at a Station runs as late or early as Renfe says", () => {
  // Renfe has the R7 standing at Cerdanyola del Vallès at 21:36:46, 2 minutes late: its timetable has it leave at 21:35.
  expect(train(R7, at('21:37:00'), RECEIVED)).toMatchObject({ live: true, dist: 3571 });
  expect(where(R7, at('21:37:00'))).toBeLessThan(3571);
});

test('a Train no live data covers is Scheduled, where its timetable puts it', () => {
  // Renfe didn't report the R2N. Its timetable has it stand at Mollet-Sant Fost from 21:37 to 21:38.
  expect(train(R2N, at('21:37:30'), RECEIVED)).toMatchObject({ live: false, dist: 50838 });
});

test('a Train Renfe gives a Delay for but no position stays Scheduled, and runs as late as Renfe says', () => {
  // Made up: a trip update alone for the R2N, 2 minutes late. It stands at Mollet-Sant Fost from 21:39 rather than 21:37.
  const snapshot: Snapshot = { ...written(at('21:39:00')), reports: [{ trip: R2N, at: at('21:38:50'), delay: 120 }] };
  expect(train(R2N, at('21:39:30'), [{ snapshot, at: at('21:39:05') }])).toMatchObject({ live: false, dist: 50838 });
  expect(where(R2N, at('21:39:30'))).toBeGreaterThan(50838);
});

test('a Train whose operator says when it expects it at a Station, rather than how late it is, runs that late', () => {
  // Made up: the R2N expected at Mollet-Sant Fost at 21:39, 2 minutes after its timetable has it arrive.
  // It stands there from 21:39 to 21:40 rather than from 21:37 to 21:38: Scheduled with no position,
  // and Live where it's reported standing there, as FGC's are.
  const expected = { station: 'Mollet-Sant Fost', at: at('21:39:00') };
  const reported = (report: Partial<Report>): Received[] => [{ snapshot: { ...written(at('21:39:00')), reports: [{ trip: R2N, at: at('21:38:50'), expected, ...report }] }, at: at('21:39:05') }];
  expect(train(R2N, at('21:39:30'), reported({}))).toMatchObject({ live: false, dist: 50838 });
  expect(train(R2N, at('21:39:30'), reported({ position: { near: 'Mollet-Sant Fost' } }))).toMatchObject({ live: true, dist: 50838 });
  expect(where(R2N, at('21:39:30'))).toBeGreaterThan(50838);
  // Its operator's own Delay, where it gives one, comes first.
  expect(where(R2N, at('21:39:30'), reported({ delay: 0 }))).toBeGreaterThan(50838);
});

/** A snapshot, received as it's written, in which Renfe's GPS has a Trip's Train so far along its track, and Renfe's own figure a Delay. */
function gps(trip: string, dist: number, moment: number, delay?: number): Received {
  const shape = BUNDLE.shapes.find((s) => s.id === trip);
  const [lon, lat] = shape ? pointAt(shape, dist) : [NaN, NaN];
  return { snapshot: { ...written(moment), reports: [{ trip, at: moment, position: { lon, lat }, delay }] }, at: moment };
}

test('a Train Live and moving runs as late as its GPS shows, whatever its operator says', () => {
  // Renfe's GPS has the R2S 555 m past Calafell at 21:36:46, where its timetable has it at 21:35:37:
  // it's 69 s late, though Renfe's own figure says a minute. It reaches Segur de Calafell at 21:38:39, not 21:38:30.
  expect(where(R2S, at('21:38:35'), RECEIVED)).toBeLessThan(117049);
  expect(train(R2S, at('21:38:39'), RECEIVED)).toMatchObject({ live: true, dist: 117049 });
  // Made up: Renfe's GPS has each Train where its timetable had it 2 minutes before, though Renfe's
  // own figure says 1. The R2S is between Sitges and Castelldefels, and the R7, which runs its track
  // backwards, between Montcada i Reixac-Manresa and Montcada i Reixac-Santa Maria.
  for (const [trip, moment] of [[R2S, at('22:02:00')], [R7, at('21:32:30')]] as const) {
    const received = [gps(trip, where(trip, moment - 120_000) ?? NaN, moment, 60)];
    expect(where(trip, moment + 30_000, received)).toBeCloseTo(where(trip, moment - 90_000) ?? NaN, 3);
  }
});

/** A snapshot saying a Trip's Train is running so many seconds late, as its operator has it, received as it's written. */
const late = (trip: string, delay: number, moment: number): Received => ({
  snapshot: { ...written(moment), reports: [{ trip, at: moment, delay }] },
  at: moment,
});

/** Where a Trip's Train is each second from one moment to another, in metres along its track. */
const course = (trip: string, from: number, to: number, received: Received[]) =>
  Array.from({ length: (to - from) / 1000 + 1 }, (_, s) => where(trip, from + s * 1000, received) ?? NaN);

test('the first snapshot places each Train outright, however little live data shifts it', () => {
  // The map opens on the R2S between Sitges and Castelldefels, 20 s late.
  expect(where(R2S, at('22:00:00'), [late(R2S, 20, at('22:00:00'))])).toBe(where(R2S, at('21:59:40')));
});

test('never runs back along its track when live data has it later and later', () => {
  // Between Sitges and Castelldefels, the R2S loses 10 s every 20 s.
  const received = [0, 10, 20, 30].map((delay, i) => late(R2S, delay, at('22:00:00', i * 20)));
  const each = course(R2S, at('22:00:00'), at('22:02:00'), received);
  expect(each).toEqual([...each].sort((a, b) => a - b));
});

test('runs on through GPS a few metres short or long, never backing up or standing', () => {
  // Made up: every 20 s, Renfe's GPS has the R2S 30 s late between Sitges and Castelldefels, give or take a few metres.
  const received = [0, 4, -4, 3, -5, 2].map((off, i) => gps(R2S, (where(R2S, at('22:00:00', i * 20 - 30)) ?? NaN) + off, at('22:00:00', i * 20)));
  const each = course(R2S, at('22:00:00'), at('22:02:00'), received);
  expect(Math.min(...each.slice(1).map((d, s) => d - (each[s] ?? NaN)))).toBeGreaterThan(0);
  // It keeps within those few metres of where 30 s late has it, give or take a millimetre.
  const steady = course(R2S, at('21:59:30'), at('22:01:30'), []);
  expect(Math.max(...each.map((d, s) => Math.abs(d - (steady[s] ?? NaN))))).toBeLessThan(5.001);
});

test('a Train that live data shows a little later slows down, back where live data has it by the next snapshot', () => {
  // Between Sitges and Castelldefels, the R2S runs on time until a snapshot at 22:00:00 has it 10 s late.
  const received = [late(R2S, 0, at('21:59:40')), late(R2S, 10, at('22:00:00'))];
  const [eased, due] = [speeds(R2S, '22:00:00', '22:00:20', received), speeds(R2S, '22:00:00', '22:00:20')];
  expect(eased.every((v, s) => v > 0 && v < (due[s] ?? 0))).toBe(true);
  expect(where(R2S, at('22:00:20'), received)).toBeCloseTo(where(R2S, at('22:00:10')) ?? NaN, 3);
});

test('a Train that live data shows stopped between Stations holds there, never running on and jumping back', () => {
  // Between Sitges and Castelldefels, a signal stops the R2S at 21:59:40: every 20 s it's 20 s later.
  const received = [0, 20, 40, 60, 80, 100].map((delay, i) => late(R2S, delay, at('21:59:40', i * 20)));
  const each = course(R2S, at('22:00:00'), at('22:01:40'), received);
  expect(new Set(each).size).toBe(1);
});

test('a Train standing at a Station that live data shows running later holds there until its new time to leave', () => {
  // The R2S stands at Vilanova i la Geltrú from 21:49 to 21:50, on time, until a snapshot at 21:49:50 has it 30 s late.
  const received = [late(R2S, 0, at('21:49:30')), late(R2S, 30, at('21:49:50'))];
  // It leaves at 21:50:30, at its timetable's pace.
  for (let s = 0; s <= 40; s += 5) expect(where(R2S, at('21:49:50', s), received)).toBe(128092);
  expect(where(R2S, at('21:50:31'), received)).toBeCloseTo(where(R2S, at('21:50:01')) ?? NaN, 3);
});

test('a Train that live data shows running earlier speeds up until it catches up, never beyond line speed', () => {
  // Between Sitges and Castelldefels, the R2S runs 30 s late until a snapshot at 22:00:00 has it on time.
  const received = [late(R2S, 30, at('21:59:40')), late(R2S, 0, at('22:00:00'))];
  const each = speeds(R2S, '21:59:50', '22:00:40', received);
  // From 22:00:00 it runs faster than it was, never beyond line speed, and it's soon on time.
  expect(each[10]).toBeGreaterThan((each[0] ?? Infinity) + 10);
  expect(Math.max(...each)).toBeLessThanOrEqual(PROFILE.topSpeed + ROUNDING);
  expect(where(R2S, at('22:00:40'), received)).toBeCloseTo(where(R2S, at('22:00:40')) ?? NaN, 3);
});

test('a Train drawn more than a minute from where live data has it jumps there, whichever way', () => {
  // Between Sitges and Castelldefels, the R2S runs on time, then 90 s late, then on time again.
  const received = [late(R2S, 0, at('21:59:40')), late(R2S, 90, at('22:00:00')), late(R2S, 0, at('22:00:20'))];
  expect(where(R2S, at('22:00:00'), received)).toBeCloseTo(where(R2S, at('21:58:30')) ?? NaN, 3);
  expect(where(R2S, at('22:00:20'), received)).toBeCloseTo(where(R2S, at('22:00:20')) ?? NaN, 3);
});

test('a Train drawn more than 1 km from where live data has it jumps there', () => {
  // The made-up Trip runs at line speed from 12:00:23, so 30 s behind it is 1.2 km back.
  const received = [late('too quick', 0, at('12:00:30')), late('too quick', 30, at('12:00:40'))];
  expect(where('too quick', at('12:00:40'), received)).toBeCloseTo(where('too quick', at('12:00:10')) ?? NaN, 3);
});

test("drops the reports that match none of the day's Trips", () => {
  // Renfe reports 46 Trains, of which this bundle has two.
  expect(LIVE.reports).toHaveLength(46);
  expect(trainsAt(BUNDLE, at('21:37:30'), RECEIVED).map((t) => [t.trip.id, t.live])).toEqual([
    [R2S, true],
    [R7, true],
    [R2N, false],
  ]);
});

/** Snapshots written and received every 20 s from one moment to another, in which Renfe's feeds work but leave every Train out. */
const leftOut = (from: number, to: number): Received[] =>
  Array.from({ length: (to - from) / 20_000 + 1 }, (_, i) => ({ snapshot: written(from + i * 20_000), at: from + i * 20_000 }));

test("a Live Train that live data stops reporting stays Live through two of its feed's updates, and turns Scheduled at the third", () => {
  // Between Sitges and Castelldefels, Renfe's GPS has the R2S at 22:00:00, and then Renfe's feeds leave it out.
  const received = [gps(R2S, where(R2S, at('21:59:30')) ?? NaN, at('22:00:00')), ...leftOut(at('22:00:20'), at('22:01:00'))];
  expect([10, 30, 50, 70].map((s) => train(R2S, at('22:00:00', s), received)?.live)).toEqual([true, true, true, false]);
});

test('a Train that live data stops reporting keeps its last Delay for 30 minutes, then follows its plain timetable', () => {
  // Renfe's GPS has the R2S 2 minutes late between Sitges and Castelldefels at 22:00:00, and then Renfe's feeds leave it out.
  const received = [gps(R2S, where(R2S, at('21:58:00')) ?? NaN, at('22:00:00')), ...leftOut(at('22:00:20'), at('22:31:00'))];
  expect(where(R2S, at('22:29:50'), received)).toBeCloseTo(where(R2S, at('22:27:50')) ?? NaN, 3);
  expect(where(R2S, at('22:30:30'), received)).toBeCloseTo(where(R2S, at('22:30:30')) ?? NaN, 3);
  // By then it's as if live data had never reported it.
  expect(train(R2S, at('22:30:30'), received)).toMatchObject({ live: false, unreported: true });
});

/** What the fetcher wrote at a moment while Renfe's feeds had failed since an earlier snapshot: that snapshot's reports, received as it's written. */
const failing = (moment: number, since: Received): Received => ({
  snapshot: {
    ...since.snapshot,
    generated: moment,
    feeds: { rodalies: { lastSuccess: since.snapshot.generated, lastAttempt: moment, status: 'vehicle_positions: HTTP 503', every: 20_000 } },
  },
  at: moment,
});

test("while Renfe's feeds fail, Rodalies' live data is unavailable from the third failed update, and its Trains turn Scheduled, keeping their Delays", () => {
  // Renfe's GPS has the R2S 30 s late between Sitges and Castelldefels at 22:00:00, and then every run fails.
  const good = gps(R2S, where(R2S, at('21:59:30')) ?? NaN, at('22:00:00'));
  const received = [good, ...[20, 40, 60, 80].map((s) => failing(at('22:00:00', s), good))];
  expect([at('22:00:50'), at('22:01:10')].map((moment) => unavailable(by(received, moment)))).toEqual([[], ['rodalies']]);
  expect([50, 70].map((s) => train(R2S, at('22:00:00', s), received)?.live)).toEqual([true, false]);
  expect(where(R2S, at('22:01:30'), received)).toBeCloseTo(where(R2S, at('22:01:00')) ?? NaN, 3);
});

test('when the fetcher stops, its live data is unavailable soon after its next snapshots would have come, and its Trains turn Scheduled', () => {
  // Renfe's GPS has the R2S between Sitges and Castelldefels in the snapshot the fetcher writes at
  // 22:00:00, its last, which the map finds again every 20 s, as it would if it couldn't fetch one.
  // A running fetcher's snapshot can arrive a minute old and the next 20 s after, so the map counts
  // missed updates from 22:01:20: three make 22:02:20.
  const last = gps(R2S, where(R2S, at('21:59:30')) ?? NaN, at('22:00:00'));
  const received = Array.from({ length: 10 }, (_, i) => ({ ...last, at: at('22:00:00', i * 20) }));
  expect([at('22:02:10'), at('22:02:30')].map((moment) => unavailable(by(received, moment)))).toEqual([[], ['rodalies']]);
  expect([130, 150].map((s) => train(R2S, at('22:00:00', s), received)?.live)).toEqual([true, false]);
});

test("brought back after its tab was hidden, the map shows Trains Scheduled until it hears more, without saying their live data is unavailable", () => {
  // The map last looked at 22:00:00, and looks again at 22:10:00.
  const received = [gps(R2S, where(R2S, at('21:59:30')) ?? NaN, at('22:00:00'))];
  expect(train(R2S, at('22:10:00'), received)?.live).toBe(false);
  expect(unavailable(received)).toEqual([]);
});

test("a Train that a working feed doesn't report stays Scheduled, marked as having no live data, unless the feed is down", () => {
  // Renfe's feeds at 21:37 on 24 September didn't report the R2N, which its timetable has at Mollet-Sant Fost, and did the R2S.
  expect(train(R2N, at('21:37:30'), RECEIVED)).toMatchObject({ live: false, unreported: true });
  expect(train(R2S, at('21:37:30'), RECEIVED)).toMatchObject({ live: true, unreported: false });
  // From the third update after that the feeds fail, the map says their live data is unavailable instead.
  const down = [...RECEIVED, ...[20, 40, 60].map((s) => failing(at('21:37:00', s), { snapshot: LIVE, at: LIVE.generated }))];
  expect(train(R2N, at('21:38:10'), down)).toMatchObject({ live: false, unreported: false });
  // Before any live data comes, there's no telling.
  expect(train(R2N, at('21:37:30'))?.unreported).toBe(false);
});

test('never runs back when its last Delay runs out, among the snapshots the map keeps', () => {
  // Renfe's GPS has the R2S 30 s early between Sitges and Castelldefels at 22:00:00, and then Renfe's feeds leave it out.
  const received = [gps(R2S, where(R2S, at('22:00:30')) ?? NaN, at('22:00:00')), ...leftOut(at('22:00:20'), at('22:32:00'))];
  const kept = (moment: number) => received.filter((r) => r.at > moment - KEEP);
  const each = Array.from({ length: 181 }, (_, s) => where(R2S, at('22:29:00', s), kept(at('22:29:00', s))) ?? NaN);
  expect(each).toEqual([...each].sort((a, b) => a - b));
});

test('a snapshot over KEEP old takes what only it said with it, as the map folds in each new one', () => {
  // Made up: Renfe cancels the R2S at 21:49:00, and then its feeds leave it out.
  const cancelled: Received = { snapshot: { ...written(at('21:49:00')), reports: [{ trip: R2S, at: at('21:48:40'), cancelled: true }] }, at: at('21:49:00') };
  const received = [cancelled, ...leftOut(at('21:49:20'), at('22:25:00'))];
  const kept = (moment: number) => received.filter((r) => r.at > moment - KEEP && r.at <= moment);
  const each = Array.from({ length: 61 }, (_, s) => train(R2S, at('22:23:30', s), kept(at('22:23:30', s))) !== undefined);
  // It's back on the map at 22:24:00, as the snapshot cancelling it goes, 35 minutes after it came.
  expect(each.indexOf(true)).toBe(30);
  expect(each.slice(30).every(Boolean)).toBe(true);
});

// FGC's live data as the fetcher made it into a snapshot at 10:31:15 on Friday 25 September 2026,
// from Geotren and the trip updates as recorded then, received as it was written, and a stretch of
// an S2 that day as the daily build placed it, towards Sabadell Parc del Nord.
const FGC_LIVE: Snapshot = JSON.parse(readFileSync(new URL('fetcher/fixtures/fgc/snapshot.json', import.meta.url), 'utf8'));
const S2 = 'fgc:6c4bdae202757640fd55c1|682dc7e40b';
const FGC: Bundle = bundleOf('2026-09-25', { id: 'fgc', name: 'FGC', profile: { ...PROFILE, topSpeed: 120 / 3.6 } }, {
  [S2]: {
    line: 'fgc:S2',
    calls: [
      ['fgc:SC', '10:23:00', '10:24:00', 15184, 2.078203288, 41.46791038], // Sant Cugat Centre
      ['fgc:VO', '10:25:30', '10:26:00', 16747, 2.072928, 41.481248], // Volpelleres
      ['fgc:SJ', '10:27:00', '10:28:00', 17875, 2.076498641, 41.49015388], // Sant Joan
      ['fgc:BT', '10:29:30', '10:30:00', 19597, 2.090556583, 41.50085844], // Bellaterra
      ['fgc:UN', '10:32:00', '10:33:00', 20863, 2.102510441, 41.50285282], // Universitat Autònoma
    ],
  },
});

test("an FGC Train Geotren has standing at a Station is Live, running as late as FGC's trip update expects it there", () => {
  // Geotren has the S2 standing at Sant Joan at 10:30:11. The trip updates expect it there at 10:30,
  // 3 minutes after its timetable has it arrive, so it leaves at 10:31, and its trip update and its
  // Station go by the same codes as the timetable's.
  const moment = Date.parse('2026-09-25T10:31:20+02:00');
  const s2 = (received: Received[]) => trainsAt(FGC, moment, received).find((t) => t.trip.id === S2);
  expect(s2([{ snapshot: FGC_LIVE, at: FGC_LIVE.generated }])).toMatchObject({ live: true });
  expect(s2([{ snapshot: FGC_LIVE, at: FGC_LIVE.generated }])?.dist).toBeCloseTo(trainsAt(FGC, moment - 180_000).find((t) => t.trip.id === S2)?.dist ?? NaN, 3);
});

test("an FGC Train Geotren has standing at a Station stays there, where FGC's trip update has it leave already", () => {
  // Made up: Geotren has the S2 standing at Sant Joan at 10:30:11, but the trip updates expect it
  // there at 10:28:30, 90 s late, and so gone by 10:29:30. It's held as late as keeps it there at
  // 10:30:11: 131 s, just leaving, as its timetable has it leave at 10:28.
  const [reported, moment] = [Date.parse('2026-09-25T10:30:11+02:00'), Date.parse('2026-09-25T10:30:15+02:00')];
  const standing = (report: Partial<Report>): Received[] => [{
    snapshot: {
      generated: moment,
      feeds: { fgc: { lastSuccess: moment, lastAttempt: moment, status: 'ok', every: 120_000 } },
      reports: [{ trip: S2, at: reported, position: { near: 'fgc:SJ' }, expected: { station: 'fgc:SJ', at: Date.parse('2026-09-25T10:28:30+02:00') }, ...report }],
    },
    at: moment,
  }];
  const s2 = (received: Received[]) => trainsAt(FGC, moment, received).find((t) => t.trip.id === S2);
  const late = (seconds: number) => trainsAt(FGC, moment - seconds * 1000).find((t) => t.trip.id === S2)?.dist ?? NaN;
  expect(s2(standing({}))?.dist).toBeCloseTo(late(131), 3);
  // At its Trip's first Station it can stand long before it leaves, off the map: here at Sant Cugat
  // Centre, expected there at 10:32, 9 minutes after its timetable has it arrive.
  expect(s2(standing({ position: { near: 'fgc:SC' }, expected: { station: 'fgc:SC', at: Date.parse('2026-09-25T10:32:00+02:00') } }))).toBeUndefined();
});

// Three of Montserrat's rack Trips on 25 September 2026, as the daily build had them, and the
// reports the fetcher made of them from Geotren as FGC updated it at 14:46:02, in a snapshot
// written at 14:46:11. Geotren has them on lines M1 and M2, as service 6d4fdaec, which isn't the day's.
const RACK: Bundle = bundleOf('2026-09-25', { id: 'fgc', name: 'FGC', profile: { ...PROFILE, topSpeed: 30 / 3.6 } }, {
  'fgc:6350da917476|652dc7e702': {
    line: 'fgc:MM',
    calls: [
      ['fgc:MM', '14:35:00', '14:35:00', 0, 1.836497527, 41.59225373], // Montserrat
      ['fgc:MP', '14:48:00', '14:48:00', 4132, 1.843723316, 41.61562791], // Monistrol-Vila
    ],
  },
  'fgc:6350da917476|652dc7e703': {
    line: 'fgc:MM',
    calls: [
      ['fgc:MP', '14:35:00', '14:35:00', 978, 1.843723316, 41.61562791], // Monistrol-Vila
      ['fgc:MM', '14:48:00', '14:48:00', 5110, 1.836497527, 41.59225373], // Montserrat
    ],
  },
  // Not the day's MM Trip: one on another Line whose trip_id ends as a rack train's does.
  'fgc:625cdae21f726b1bb950|652dc7e703': {
    line: 'fgc:R5',
    calls: [
      ['fgc:MP', '14:35:00', '14:35:00', 978, 1.843723316, 41.61562791],
      ['fgc:MM', '14:48:00', '14:48:00', 5110, 1.836497527, 41.59225373],
    ],
  },
});
const RACK_WRITTEN = Date.parse('2026-09-25T14:46:11+02:00');
const RACK_RECEIVED: Received[] = [{
  snapshot: {
    generated: RACK_WRITTEN,
    feeds: { fgc: { lastSuccess: RACK_WRITTEN, lastAttempt: RACK_WRITTEN, status: 'ok', every: 120_000 } },
    reports: [
      { trip: 'fgc:6d4fdaec|652dc7e702', line: 'fgc:MM', at: Date.parse('2026-09-25T14:46:02.024+02:00'), position: { lon: 1.83433, lat: 41.610634 }, unitType: 'AM' },
      { trip: 'fgc:6d4fdaec|652dc7e703', line: 'fgc:MM', at: Date.parse('2026-09-25T14:46:02.024+02:00'), position: { lon: 1.836561, lat: 41.601166 }, unitType: 'AMx2' },
    ],
  },
  at: RACK_WRITTEN,
}];

test("a rack train Geotren has on line M1 or M2 is Live as the day's MM Trip whose trip_id ends as its id does after the |", () => {
  const trains = trainsAt(RACK, Date.parse('2026-09-25T14:46:20+02:00'), RACK_RECEIVED);
  expect(trains.map((t) => [t.trip.id, t.live])).toEqual([
    ['fgc:6350da917476|652dc7e702', true],
    ['fgc:6350da917476|652dc7e703', true],
    ['fgc:625cdae21f726b1bb950|652dc7e703', false],
  ]);
});

test("a Train Renfe pins to a Station isn't held there: Renfe's pinned Stations are stale", () => {
  // Made up: Renfe pins the R2N to Mollet-Sant Fost at 21:39:30, with no Delay, though its timetable
  // has it leave at 21:38. It runs on its timetable.
  const snapshot: Snapshot = { ...written(at('21:39:35')), reports: [{ trip: R2N, at: at('21:39:30'), position: { near: 'Mollet-Sant Fost' } }] };
  expect(where(R2N, at('21:39:40'), [{ snapshot, at: at('21:39:35') }])).toBeCloseTo(where(R2N, at('21:39:40')) ?? NaN, 3);
});

// TRAM's live data as the fetcher made it into a snapshot at 11:44:50 on Friday 25 September 2026,
// from where TRAM had its Units and its trip updates as recorded then, received as it was written,
// and stretches of three of its Trips that day from their first Station, as the daily build placed them.
const TRAM_LIVE: Snapshot = JSON.parse(readFileSync(new URL('fetcher/fixtures/tram/snapshot.json', import.meta.url), 'utf8'));
const TRAM_RECEIVED: Received[] = [{ snapshot: TRAM_LIVE, at: TRAM_LIVE.generated }];
const [T1, T2, T5] = ['tram:TBX:2579_0094', 'tram:TBX:2579_0198', 'tram:TBS:1947_0758'];
const TRAM: Bundle = bundleOf('2026-09-25', { id: 'tram', name: 'TRAM', profile: { acceleration: 1.2, braking: 1.2, topSpeed: 70 / 3.6, dwell: 10 } }, {
  // A Trambaix T1 towards Bon Viatge.
  [T1]: {
    line: 'tram:T1',
    calls: [
      ['tram:ST-172', '11:24:00', '11:24:00', 0, 2.143135, 41.3922223], // Francesc Macià
      ['tram:ST-186', '11:43:00', '11:43:10', 5508, 2.0886101, 41.3768574], // Pont d'Esplugues
      ['tram:ST-187', '11:44:30', '11:44:40', 6105, 2.0839786, 41.372794], // La Sardana
      ['tram:ST-188', '11:46:00', '11:46:10', 6537, 2.0809029, 41.3696737], // Montesa
    ],
  },
  // A Trambaix T2 towards Llevant-Les Planes.
  [T2]: {
    line: 'tram:T2',
    calls: [
      ['tram:ST-172', '11:18:00', '11:18:00', 0, 2.143135, 41.3922223], // Francesc Macià
      ['tram:ST-190', '11:43:30', '11:43:40', 7700, 2.0726635, 41.361256], // Ignasi Iglésias
      ['tram:ST-191', '11:45:00', '11:45:10', 8151, 2.0701988, 41.3576808], // Cornellà Centre
      ['tram:ST-192', '11:47:00', '11:47:10', 8563, 2.0660992, 41.3566671], // Les Aigües
    ],
  },
  // A Trambesòs T5 towards Ciutadella.
  [T5]: {
    line: 'tram:T5',
    calls: [
      ['tram:ST-206', '11:40:00', '11:40:00', 0, 2.1874347, 41.4025373], // Glòries
      ['tram:ST-204', '11:43:30', '11:43:40', 962, 2.1869395, 41.3940691], // Marina
      ['tram:ST-203', '11:45:30', '11:45:40', 1450, 2.1885747, 41.3901689], // Wellington|UPF
    ],
  },
});

/** A TRAM Trip's Train at 11:44:50 on 25 September 2026, if it's on the map, with the live data received by then. */
const tram = (trip: string, received: Received[] = [], plus = 0) => trainsAt(TRAM, Date.parse('2026-09-25T11:44:50+02:00') + plus * 1000, received).find((t) => t.trip.id === trip);

test("a TRAM Train between Stations is Live, where its distance since its Trip's first Station puts it, whatever TRAM's Delay says", () => {
  // TRAM has the T1 6,120 m from Francesc Macià, 15 m past La Sardana, which its timetable has it
  // leave at 11:44:40. TRAM's own figure, 10 s late, would have it just leaving.
  expect(tram(T1, TRAM_RECEIVED)).toMatchObject({ live: true });
  expect(tram(T1, TRAM_RECEIVED)?.dist).toBeCloseTo(6120, 3);
  // It has the T5 992 m from Glòries, 30 m past Marina, where its own figure, 68 s late, would have it 2 m past.
  expect(tram(T5, TRAM_RECEIVED)).toMatchObject({ live: true });
  expect(tram(T5, TRAM_RECEIVED)?.dist).toBeCloseTo(992, 3);
});

test("a TRAM Train standing at a Station, where TRAM's distance reads 0, is Live, running as late or early as TRAM says", () => {
  // TRAM has the T2 standing at Cornellà Centre, 82 s early: where its timetable has it 82 s later.
  expect(tram(T2, TRAM_RECEIVED)).toMatchObject({ live: true });
  expect(tram(T2, TRAM_RECEIVED)?.dist).toBeCloseTo(tram(T2, [], 82)?.dist ?? NaN, 3);
});

// TMB's predictions for the Metro as the fetcher made them into snapshots at 13:14:10 and 13:15:41
// on Friday 25 September 2026, from iTransit as recorded then, received as they were written, and
// the ends of four L1 Trips that day at Fondo, where L1 ends, as the daily build placed them.
const METRO_LIVE: Received[] = ['snapshot.json', 'snapshot-1315.json'].map((file) => {
  const snapshot: Snapshot = JSON.parse(readFileSync(new URL(`fetcher/fixtures/metro/${file}`, import.meta.url), 'utf8'));
  return { snapshot, at: snapshot.generated };
});
const [INTO_FONDO, NEXT_INTO_FONDO, OUT_OF_FONDO, NEXT_OUT_OF_FONDO] = ['metro:1.1.11929288', 'metro:1.1.11929315', 'metro:1.1.11929237', 'metro:1.1.11929265'];
const METRO: Bundle = bundleOf('2026-09-25', { id: 'metro', name: 'Metro de Barcelona', profile: { acceleration: 1.3, braking: 1.3, topSpeed: 80 / 3.6, dwell: 20 } }, {
  // Two of L1's Trips into Fondo, 4 minutes 17 apart.
  [INTO_FONDO]: {
    line: 'metro:L1',
    headsign: 'Fondo',
    calls: [
      ['tmb:1.137', '13:11:09', '13:11:28', 17896, 2.193837, 41.448956], // Trinitat Vella
      ['tmb:1.138', '13:12:36', '13:12:55', 18427, 2.199563, 41.449936], // Baró de Viver
      ['tmb:1.139', '13:14:15', '13:14:37', 19161, 2.207969, 41.451067], // Santa Coloma
      ['tmb:1.140', '13:16:00', '13:16:00', 20055, 2.218435, 41.451583], // Fondo
    ],
  },
  [NEXT_INTO_FONDO]: {
    line: 'metro:L1',
    headsign: 'Fondo',
    calls: [
      ['tmb:1.137', '13:15:26', '13:15:45', 17896, 2.193837, 41.448956], // Trinitat Vella
      ['tmb:1.138', '13:16:53', '13:17:12', 18427, 2.199563, 41.449936], // Baró de Viver
      ['tmb:1.139', '13:18:32', '13:18:54', 19161, 2.207969, 41.451067], // Santa Coloma
      ['tmb:1.140', '13:20:17', '13:20:17', 20055, 2.218435, 41.451583], // Fondo
    ],
  },
  // Two of its Trips out of Fondo, back towards Hospital de Bellvitge.
  [OUT_OF_FONDO]: {
    line: 'metro:L1',
    headsign: 'Hospital de Bellvitge',
    calls: [
      ['tmb:1.140', '13:12:56', '13:12:56', 0, 2.218435, 41.451583], // Fondo
      ['tmb:1.139', '13:14:23', '13:14:45', 894, 2.207969, 41.451067], // Santa Coloma
      ['tmb:1.138', '13:16:09', '13:16:28', 1629, 2.199563, 41.449936], // Baró de Viver
    ],
  },
  [NEXT_OUT_OF_FONDO]: {
    line: 'metro:L1',
    headsign: 'Hospital de Bellvitge',
    calls: [
      ['tmb:1.140', '13:17:13', '13:17:13', 0, 2.218435, 41.451583], // Fondo
      ['tmb:1.139', '13:18:40', '13:19:02', 894, 2.207969, 41.451067], // Santa Coloma
      ['tmb:1.138', '13:20:26', '13:20:45', 1629, 2.199563, 41.449936], // Baró de Viver
    ],
  },
});

/** A Metro Trip's Train at a moment on 25 September 2026, by the clock in Barcelona, and so many seconds on, if it's on the map, with the live data received by then. */
const metro = (trip: string, time: string, received: Received[] = [], plus = 0) => {
  const moment = Date.parse(`2026-09-25T${time}+02:00`) + plus * 1000;
  return trainsAt(METRO, moment, by(received, moment)).find((t) => t.trip.id === trip);
};

test("a Metro Train is Live where TMB expects it: its Block runs the Trip on its Line headed its way whose timetable has it at the Station it comes to next closest to when TMB expects it there", () => {
  // At 13:14:09 TMB expects L1's 112 at Fondo at 13:15:38, 22 s before the Trip into Fondo at 13:16:00.
  expect(metro(INTO_FONDO, '13:14:20', METRO_LIVE)).toMatchObject({ live: true });
  expect(metro(INTO_FONDO, '13:14:20', METRO_LIVE)?.dist).toBeCloseTo(metro(INTO_FONDO, '13:14:20', [], 22)?.dist ?? NaN, 3);
});

/** The first Metro snapshot with only some of L1's Blocks' reports, by TMB's numbers for them, in that order. */
const onlyL1 = (...numbers: string[]): Received[] => {
  const [{ snapshot, at }] = METRO_LIVE as [Received];
  return [{ snapshot: { ...snapshot, reports: numbers.flatMap((n) => snapshot.reports.filter((r) => r.block?.line === 'metro:L1' && r.block.number === n)) }, at }];
};

test('never matches a Block to a Trip running the other way, however close its time there', () => {
  // TMB expects L1's 113 at Santa Coloma at 13:14:58, on its way into Fondo. The Trip out of Fondo
  // calls there at 13:14:23, 35 s off, and the one into Fondo at 13:14:15, 43 s off.
  expect(metro(OUT_OF_FONDO, '13:14:20', onlyL1('113'))).toMatchObject({ live: false });
  expect(metro(INTO_FONDO, '13:14:20', onlyL1('113'))).toMatchObject({ live: true });
});

test('where two Blocks come closest to the same Trip, the one TMB expects nearer its time runs it, whichever TMB lists last', () => {
  // At 13:14:09 TMB expects L1's 112 at Fondo 22 s before the Trip into Fondo is due there, and its
  // 113 at Santa Coloma 43 s after that Trip is due there. The next into Fondo is 3½ minutes further off.
  expect(metro(INTO_FONDO, '13:14:20', onlyL1('112', '113'))?.dist).toBeCloseTo(metro(INTO_FONDO, '13:14:20', [], 22)?.dist ?? NaN, 3);
});

test("a Block that no Trip headed its way reaches within half an hour of when TMB expects it runs none of them", () => {
  // Made up: at 13:47:50 TMB expects L1's 112 at Fondo 30¼ minutes after the last Trip into Fondo is due there, at 13:20:17.
  const expecting = (time: string): Received[] => {
    const generated = Date.parse('2026-09-25T13:47:50+02:00');
    const report: Report = { block: { line: 'metro:L1', number: '112' }, headsign: 'Fondo', at: generated, position: { next: { station: 'tmb:1.140', at: Date.parse(`2026-09-25T${time}+02:00`) } } };
    return [{ snapshot: { generated, feeds: { metro: { lastSuccess: generated, lastAttempt: generated, status: 'ok', every: 40_000 } }, reports: [report] }, at: generated }];
  };
  const live = (received: Received[]) => trainsAt(METRO, Date.parse('2026-09-25T13:48:00+02:00'), received).filter((t) => t.live).map((t) => t.trip.id);
  expect(live(expecting('13:50:32'))).toEqual([]);
  // 29¾ minutes after, it runs that Trip, 29¾ minutes late.
  expect(live(expecting('13:50:02'))).toEqual([NEXT_INTO_FONDO]);
});

test('a Block that turns back at the end of its Line runs the Trip back from there', () => {
  // At 13:15:40 TMB has L1's 112 in at Fondo, which it reached at 13:15:38 as the Trip into Fondo,
  // and expects it back at Santa Coloma at 13:17:31: 69 s before the next Trip out of Fondo is due there.
  expect(metro(NEXT_OUT_OF_FONDO, '13:15:50', METRO_LIVE)).toMatchObject({ live: true, dist: 0 });
  expect(metro(NEXT_OUT_OF_FONDO, '13:15:50', METRO_LIVE, 60)?.dist).toBeCloseTo(metro(NEXT_OUT_OF_FONDO, '13:15:50', [], 60 + 69)?.dist ?? NaN, 3);
});

test('a Metro Train held outside the end of its Line is drawn no further back than the Station before it', () => {
  // Made up after L1's 115 in #12's recording: at 13:19:39, having left Santa Coloma, it's held
  // outside Fondo, and TMB expects it there at 13:23:49, 3½ minutes after the Trip's timetable does.
  // That Delay alone has it two Stations back, between Trinitat Vella and Baró de Viver.
  const generated = Date.parse('2026-09-25T13:19:39+02:00');
  const report: Report = { block: { line: 'metro:L1', number: '115' }, headsign: 'Fondo', at: generated, position: { next: { station: 'tmb:1.140', at: Date.parse('2026-09-25T13:23:49+02:00') } } };
  const held: Received[] = [{ snapshot: { generated, feeds: { metro: { lastSuccess: generated, lastAttempt: generated, status: 'ok', every: 40_000 } }, reports: [report] }, at: generated }];
  expect(metro(NEXT_INTO_FONDO, '13:19:39', held)).toMatchObject({ live: true, dist: 19161 });
  // As seen, with the Trip after it due at Fondo at 13:24:34: TMB's time matches the Block to that
  // Trip, 45 s early, which alone has it two Stations short of Santa Coloma.
  const LATER = 'metro:1.1.later';
  const later = bundleOf('2026-09-25', METRO.networks[0] as Network, {
    [LATER]: {
      line: 'metro:L1',
      headsign: 'Fondo',
      calls: [
        ['tmb:1.137', '13:19:43', '13:20:02', 17896, 2.193837, 41.448956], // Trinitat Vella
        ['tmb:1.138', '13:21:10', '13:21:29', 18427, 2.199563, 41.449936], // Baró de Viver
        ['tmb:1.139', '13:22:49', '13:23:11', 19161, 2.207969, 41.451067], // Santa Coloma
        ['tmb:1.140', '13:24:34', '13:24:34', 20055, 2.218435, 41.451583], // Fondo
      ],
    },
  });
  expect(trainsAt(later, generated, held).find((t) => t.trip.id === LATER)).toMatchObject({ live: true, dist: 19161 });
});

// 45 minutes of production snapshots of all four Networks as the map received them, every 20 s from
// 16:00 on Friday 25 September 2026, and that day's bundle cut to the Trips they could name.
const RECORDED: { bundle: Bundle; received: Received[] } = JSON.parse(gunzipSync(readFileSync(new URL('fixtures/replay-2026-09-25.json.gz', import.meta.url))).toString());

test('folding each snapshot into the last replay draws the Trains as replaying every snapshot kept does, as those over KEEP old go', () => {
  const { bundle, received } = RECORDED;
  // What the map keeps as each snapshot arrives, and every second until the next.
  const kept = received.map((r, i) => received.slice(0, i + 1).filter((k) => k.at > r.at - KEEP));
  // Snapshots received anew each time are replayed from the oldest kept.
  const draw = (anew: boolean) =>
    kept.flatMap((snapshots, i) => {
      const [from, to] = [received[i]?.at ?? NaN, received[i + 1]?.at ?? Infinity];
      const as = anew ? snapshots.map((r) => ({ ...r })) : snapshots;
      return Array.from({ length: Math.min(20, Math.ceil((to - from) / 1000)) }, (_, s) =>
        trainsAt(bundle, from + s * 1000, as).map(({ trip, dist, live, unreported }) => ({ trip: trip.id, dist: Math.round(dist * 100) / 100, live, unreported })),
      );
    });
  expect(kept.at(-1)?.[0]).not.toBe(received[0]);
  expect(draw(false)).toEqual(draw(true));
});

// Made up: an R1 Trip from Badalona to El Masnou each night, from 23:50 to 00:20, on every day's
// timetable, and on Saturday's one from 00:05 to 00:30.
const R1_NIGHT: Row[] = [
  ['Badalona', '23:50:00', '23:50:00', 18429, 2.24892096, 41.4458838],
  ['El Masnou', '24:20:00', '24:20:00', 24701, 2.3103772, 41.4770363],
];
const R1_EARLY: Row[] = [
  ['Badalona', '00:05:00', '00:05:00', 18429, 2.24892096, 41.4458838],
  ['El Masnou', '00:30:00', '00:30:00', 24701, 2.3103772, 41.4770363],
];
const RODALIES: Network = { id: 'rodalies', name: 'Rodalies de Catalunya', profile: PROFILE };
const [FRIDAY, SATURDAY] = [
  bundleOf('2026-09-25', RODALIES, { night: { line: 'R1', calls: R1_NIGHT } }),
  bundleOf('2026-09-26', RODALIES, { night: { line: 'R1', calls: R1_NIGHT }, early: { line: 'R1', calls: R1_EARLY } }),
];
const FRIDAY_NIGHT = joinDays([FRIDAY, SATURDAY]);
const onSaturday = (time: string) => Date.parse(`2026-09-26T${time}+02:00`);

test("after midnight the map shows the previous day's late Trains and the new day's first, each once", () => {
  const moment = onSaturday('00:10:00');
  const [late, early] = [trainsAt(FRIDAY, moment)[0], trainsAt(SATURDAY, moment)[0]];
  expect(trainsAt(FRIDAY_NIGHT, moment).map((t) => [t.trip.id, t.dist])).toEqual([
    ['2026-09-25/night', late?.dist],
    ['early', early?.dist],
  ]);
});

test("before midnight the map already shows the next day's Trains as they come, and the day's own as before", () => {
  const moment = Date.parse('2026-09-25T23:55:00+02:00');
  expect(trainsAt(FRIDAY_NIGHT, moment).map((t) => [t.trip.id, t.dist])).toEqual(trainsAt(FRIDAY, moment).map((t) => [`2026-09-25/${t.trip.id}`, t.dist]));
});

test('a report for a Trip that runs on both days is about the Train running then', () => {
  // Renfe says the night's Train is 2 minutes late at 00:10: Friday's, since Saturday's hasn't left.
  const moment = onSaturday('00:10:00');
  const received = [{ snapshot: { ...written(moment), reports: [{ trip: 'night', at: moment, delay: 120 }] }, at: moment }];
  const [late] = trainsAt(FRIDAY_NIGHT, moment, received);
  expect(late).toMatchObject({ trip: { id: '2026-09-25/night' }, live: false, dist: trainsAt(FRIDAY, moment - 120_000)[0]?.dist });
  expect(trainsAt(FRIDAY_NIGHT, moment, received)).toHaveLength(2);
});

test('on the night the clocks go back, the previous day runs an hour longer, and both days keep their times', () => {
  // 25 October's timetable starts at 01:00 summer time, noon less 12 hours: 24 October's 25:30 and
  // 25 October's 00:30 are one moment, 01:30 summer time.
  const saturday = bundleOf('2026-10-24', RODALIES, { night: { line: 'R1', calls: [['Badalona', '25:20:00', '25:20:00', 18429, 2.24892096, 41.4458838], ['El Masnou', '25:50:00', '25:50:00', 24701, 2.3103772, 41.4770363]] } });
  const sunday = {
    ...bundleOf('2026-10-25', RODALIES, { early: { line: 'R1', calls: [['Badalona', '00:20:00', '00:20:00', 18429, 2.24892096, 41.4458838], ['El Masnou', '00:50:00', '00:50:00', 24701, 2.3103772, 41.4770363]] } }),
    noonMinus12h: noonMinus12h('2026-10-25'),
  };
  const moment = Date.parse('2026-10-25T01:30:00+02:00');
  expect(trainsAt(joinDays([saturday, sunday]), moment).map((t) => [t.trip.id, t.dist])).toEqual([
    ['2026-10-24/night', trainsAt(saturday, moment)[0]?.dist],
    ['early', trainsAt(sunday, moment)[0]?.dist],
  ]);
  // Both are 10 minutes out of Badalona then.
  expect(trainsAt(saturday, moment)[0]?.dist).toBe(trainsAt(sunday, moment)[0]?.dist);
});
