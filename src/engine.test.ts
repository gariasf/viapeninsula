import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { pointAt, type Bundle, type Snapshot } from './bundle.ts';
import { KEEP, trainsAt, unavailable, type Received } from './engine.ts';

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

const BUNDLE: Bundle = {
  serviceDay: '2026-09-24',
  // Midnight in Barcelona, which is noon less 12 hours on any day the clocks don't change.
  noonMinus12h: Date.parse('2026-09-24T00:00:00+02:00'),
  networks: [{ id: 'rodalies', name: 'Rodalies de Catalunya', profile: PROFILE }],
  lines: [...new Set(Object.values(TRIPS).map((t) => t.line))].map((name) => ({ id: name, network: 'rodalies', name, colour: '#000', shapes: [] })),
  stations: [],
  shapes: Object.entries(TRIPS).map(([id, { calls }]) => {
    const points = [...new Map(calls.map((c) => [c[3], c])).values()].sort((a, b) => a[3] - b[3]);
    return { id, coords: points.map((c): [number, number] => [c[4], c[5]]), dist: points.map((c) => c[3]) };
  }),
  strokes: [],
  trips: Object.entries(TRIPS).map(([id, { line, calls }]) => ({
    id,
    line,
    shape: id,
    direction: 0,
    headsign: calls.at(-1)?.[0] ?? '',
    calls: calls.map(([station, arrival, departure, dist]) => ({ station, arrival: seconds(arrival), departure: seconds(departure), dist })),
  })),
};

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
