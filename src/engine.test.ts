import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { beside, DEGREE, pointAt, type Bundle, type Network, type Point, type Report, type Shape, type Snapshot, type Trip } from './bundle.ts';
import { noonMinus12h } from './build/gtfs.ts';
import { boardAt, joinDays, KEEP, nearbyAt, trainAt, trainsAt, unavailable, type Received } from './engine.ts';
import { jumps } from './jumps.ts';

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
function bundleOf(serviceDay: string, network: Omit<Network, 'runningSide' | 'colour'>, trips: Record<string, { line: string; headsign?: string; calls: Row[] }>): Bundle {
  return {
    serviceDay,
    // Midnight in Barcelona, which is noon less 12 hours on any day the clocks don't change.
    noonMinus12h: Date.parse(`${serviceDay}T00:00:00+02:00`),
    networks: [{ ...network, runningSide: 'right', colour: '#000' }],
    lines: [...new Set(Object.values(trips).map((t) => t.line))].map((name) => ({ id: name, network: network.id, name, colour: '#000', shapes: [] })),
    stations: [],
    shapes: Object.entries(trips).map(([id, { calls }]) => {
      const points = [...new Map(calls.map((c) => [c[3], c])).values()].sort((a, b) => a[3] - b[3]);
      return { id, coords: points.map((c): [number, number] => [c[4], c[5]]), dist: points.map((c) => c[3]) };
    }),
    strokes: [],
    rails: [],
    slots: [],
    tracks: [],
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

/** A Trip's Train at a moment by the device's clock, if it's on the map, with the live data received by then, in `BUNDLE` unless it says. */
const train = (trip: string, moment: number, received: Received[] = [], bundle = BUNDLE) => trainsAt(bundle, moment, by(received, moment)).find((t) => t.trip.id === trip);

/** How far along its track a Trip's Train is at a moment, in metres, if it's on the map, in `BUNDLE` unless it says. */
const where = (trip: string, moment: number, received?: Received[], bundle?: Bundle) => train(trip, moment, received, bundle)?.dist;

const R2S = 'rodalies:5165J25478R2S';

test('a Train appears at its first Station just before it leaves, and leaves the map just after it reaches its last', () => {
  expect(where(R2S, at('21:29:29'))).toBeUndefined();
  expect(where(R2S, at('21:29:30'))).toBe(110172);
  expect(where(R2S, at('22:51:30'))).toBe(177289);
  expect(where(R2S, at('22:51:31'))).toBeUndefined();
});

test("is off the map where its track isn't, as beyond Catalonia's border, and comes back onto it where the track does", () => {
  // The build cuts track at the border, and it counts on from where it started: say it started at Vilanova.
  const VILANOVA = 128092;
  const cut = (s: Bundle['shapes'][number]) => ({ ...s, coords: s.coords.filter((_, i) => (s.dist[i] ?? 0) >= VILANOVA), dist: s.dist.filter((d) => d >= VILANOVA) });
  const bundle = { ...BUNDLE, shapes: BUNDLE.shapes.map((s) => (s.id === R2S ? cut(s) : s)) };
  const on = (moment: number) => trainsAt(bundle, moment).find((t) => t.trip.id === R2S)?.dist;
  expect(on(at('21:29:30'))).toBeUndefined();
  expect(on(at('21:45:00'))).toBeUndefined();
  expect(on(at('21:50:00'))).toBe(VILANOVA);
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

test('says which Station it stands at, while it stands at one: its first before it leaves, and its last once it arrives', () => {
  const standsAt = (time: string) => train(R2S, at(time))?.standsAt;
  expect(standsAt('21:29:45')).toBe('Sant Vicenç de Calders');
  expect(standsAt('21:30:30')).toBeUndefined();
  // With no live data, it stands at Vilanova i la Geltrú from 21:49 to 21:50.
  expect(standsAt('21:49:30')).toBe('Vilanova i la Geltrú');
  expect(standsAt('21:50:01')).toBeUndefined();
  expect(standsAt('22:51:15')).toBe('Barcelona Estació de França');
});

// Made up, at the equator, where a degree is DEGREE metres both ways: a track from A 3 km east, round
// a bend 2 km north to B, and on from B 2 km west to C.
const KM = 1000 / DEGREE;
const BEND: Bundle = {
  ...bundleOf('2026-09-24', { id: 'rodalies', name: 'Rodalies de Catalunya', profile: PROFILE }, {
    bend: {
      line: 'R2S',
      calls: [
        ['A', '12:00:00', '12:00:00', 0, 0, 0],
        ['B', '12:05:00', '12:06:00', 5000, 3 * KM, 2 * KM],
        ['C', '12:09:00', '12:09:00', 7000, KM, 2 * KM],
      ],
    },
  }),
  shapes: [{ id: 'bend', coords: [[0, 0], [3 * KM, 0], [3 * KM, 2 * KM], [KM, 2 * KM]], dist: [0, 3000, 5000, 7000] }],
};

/** Which way a Trip's Train heads at a moment on the made-up track, in degrees clockwise from north. */
const heading = (moment: number) => train('bend', moment, [], BEND)?.heading;

test('heads the way it runs along its track, round a bend between Stations too', () => {
  expect(heading(at('12:01:00'))).toBeCloseTo(90); // about 0.9 km east of A
  expect(heading(at('12:04:00'))).toBeCloseTo(0); // about 1.1 km north of the bend
});

test('standing at a Station heads the way it runs next, and at its last Station the way it came', () => {
  expect(heading(at('11:59:45'))).toBeCloseTo(90); // at A, before it leaves
  expect(heading(at('12:05:30'))).toBeCloseTo(270); // at B, come in from the south, to go on west
  expect(heading(at('12:09:15'))).toBeCloseTo(270); // at C, where its track ends
});

test('heads back along its track where its Trip runs it backwards, as R11 turns back at Cerbère for Portbou', () => {
  const r11 = (time: string) => train('rodalies:5165J15900R11', at(time))?.heading;
  const there = r11('08:54:00') ?? NaN; // from Portbou to Cerbère, a little east of north
  expect(there).toBeGreaterThan(0);
  expect(there).toBeLessThan(45);
  expect(r11('09:00:00')).toBeCloseTo(there + 180); // standing at Cerbère, where its track ends
  expect(r11('09:06:00')).toBeCloseTo(there + 180); // on its way back to Portbou
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

const [R7, R2N] = ['rodalies:5165J77865R7', 'rodalies:5165J28480R2N'];

// The snapshot the fetcher makes from Renfe's feeds as recorded at 15:57 on Friday 25 September 2026,
// received as it was written, and stretches of three Rodalies Trips that day as the daily build
// placed them, each track cut down to straight lines from Station to Station.
const LIVE: Snapshot = JSON.parse(readFileSync(new URL('fetcher/fixtures/snapshot.json', import.meta.url), 'utf8'));
const RECEIVED: Received[] = [{ snapshot: LIVE, at: LIVE.generated }];
const [RG1, R1, R4] = ['rodalies:5166V15261RG1', 'rodalies:5166V25647R1', 'rodalies:5166V77636R4'];
const RENFE = bundleOf('2026-09-25', { id: 'rodalies', name: 'Rodalies de Catalunya', profile: PROFILE }, {
  // Sils to Girona, towards Figueres: Renfe's GPS has it between Sils and Caldes de Malavella.
  [RG1]: {
    line: 'RG1',
    calls: [
      ['Sils', '15:53:00', '15:54:00', 7554, 2.74500729, 41.8075996],
      ['Caldes de Malavella', '15:59:00', '16:00:00', 13529, 2.80076692, 41.84111],
      ['Riudellots', '16:05:00', '16:05:00', 19808, 2.81157037, 41.896297],
      ['Fornells de la Selva', '16:09:00', '16:09:00', 24511, 2.80978324, 41.935043],
      ['Girona', '16:14:00', '16:15:00', 29686, 2.81693689, 41.9793629],
    ],
  },
  // Caldes d'Estrac to Sant Pol de Mar, towards Maçanet-Massanes: Renfe has it standing at Arenys de Mar.
  [R1]: {
    line: 'R1',
    calls: [
      ["Caldes d'Estrac", '15:50:00', '15:50:00', 45599, 2.52598143, 41.5686082],
      ['Arenys de Mar', '15:52:00', '15:53:00', 47795, 2.54933744, 41.577699],
      ['Canet de Mar', '15:57:00', '15:57:00', 50668, 2.58128887, 41.5866691],
      ['Sant Pol de Mar', '16:01:00', '16:03:00', 54667, 2.62459756, 41.6017549],
    ],
  },
  // Sabadell Centre to Terrassa Est, towards Terrassa Estació del Nord: Renfe doesn't report it.
  [R4]: {
    line: 'R4',
    calls: [
      ['Sabadell Centre', '15:55:00', '15:55:00', 101558, 2.11560767, 41.5464197],
      ['Sabadell Nord', '15:58:00', '15:58:00', 104106, 2.09622844, 41.5619773],
      ['Terrassa Est', '16:02:00', '16:02:00', 108856, 2.03963639, 41.5675296],
    ],
  },
});

/** A moment on 25 September 2026, by the clock in Barcelona, and so many seconds on. */
const onFriday = (time: string, plus = 0) => Date.parse(`2026-09-25T${time}+02:00`) + plus * 1000;

test("a Train Renfe's live data reports is Live, and standing at a Station runs as late or early as Renfe says", () => {
  // Renfe has the R1 standing at Arenys de Mar at 15:57:06, 5 minutes late: its timetable has it leave at 15:53.
  expect(train(R1, onFriday('15:57:40'), RECEIVED, RENFE)).toMatchObject({ live: true, dist: 47795 });
  expect(where(R1, onFriday('15:57:40'), [], RENFE)).toBeGreaterThan(47795);
});

test('a Train no live data covers is Scheduled, where its timetable puts it', () => {
  // Renfe didn't report the R4. Its timetable gives it no time at Sabadell Nord, so it stands there
  // for the profile's 30 s, from 15:57:30 to 15:58.
  expect(train(R4, onFriday('15:57:40'), RECEIVED, RENFE)).toMatchObject({ live: false, dist: 104106 });
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
  // Renfe's GPS has the RG1 2,979 m past Sils at 15:57:06, where its timetable has it at 15:56:29:
  // it's 36.5 s late, though Renfe's own figure says a minute. It reaches Caldes de Malavella at 15:59:36.5, not 16:00.
  expect(train(RG1, onFriday('15:57:40'), RECEIVED, RENFE)).toMatchObject({ live: true });
  expect(where(RG1, onFriday('15:59:30'), RECEIVED, RENFE)).toBeLessThan(13529);
  expect(where(RG1, onFriday('15:59:37'), RECEIVED, RENFE)).toBe(13529);
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

/** A snapshot in which Renfe has a Trip's Train at or near a Station, running so many seconds late, received as it's written. */
const near = (trip: string, station: string, delay: number, moment: number): Received => ({
  snapshot: { ...written(moment), reports: [{ trip, at: moment, position: { near: station }, delay }] },
  at: moment,
});

test('counts the jumps of Live Trains for each Network, forward and back', () => {
  // Between Sitges and Castelldefels, Renfe has the R2S on time, then 90 s late, then on time again.
  const received = [0, 90, 0].map((delay, i) => near(R2S, 'Sitges', delay, at('21:59:40', i * 20)));
  expect(jumps(BUNDLE, received)).toEqual({ rodalies: { forward: 1, back: 1, liveSeconds: 41 } });
});

test("doesn't count a Live Train easing back where live data has it, or a Train that isn't Live", () => {
  const received = [0, 10, 20].map((delay, i) => near(R2S, 'Sitges', delay, at('21:59:40', i * 20)));
  expect(jumps(BUNDLE, received)).toEqual({ rodalies: { forward: 0, back: 0, liveSeconds: 41 } });
  // Renfe gives Delays with no position: the R2S jumps, but it's Scheduled.
  expect(jumps(BUNDLE, [0, 90, 0].map((delay, i) => late(R2S, delay, at('21:59:40', i * 20))))).toEqual({});
});

test('a Train drawn more than 1 km from where live data has it jumps there', () => {
  // The made-up Trip runs at line speed from 12:00:23, so 30 s behind it is 1.2 km back.
  const received = [late('too quick', 0, at('12:00:30')), late('too quick', 30, at('12:00:40'))];
  expect(where('too quick', at('12:00:40'), received)).toBeCloseTo(where('too quick', at('12:00:10')) ?? NaN, 3);
});

test("drops the reports that match none of the day's Trips", () => {
  // Renfe reports 67 Trains, of which this bundle has two.
  expect(LIVE.reports).toHaveLength(67);
  expect(trainsAt(RENFE, onFriday('15:57:40'), RECEIVED).map((t) => [t.trip.id, t.live])).toEqual([
    [RG1, true],
    [R1, true],
    [R4, false],
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

/** What the fetcher wrote at a moment while a Network's feeds had failed since an earlier snapshot, Renfe's unless it says: that snapshot's reports, received as it's written. */
const failing = (moment: number, since: Received, network = 'rodalies'): Received => ({
  snapshot: {
    ...since.snapshot,
    generated: moment,
    feeds: { [network]: { lastSuccess: since.snapshot.generated, lastAttempt: moment, status: 'HTTP 503', every: since.snapshot.feeds[network]?.every ?? 20_000 } },
  },
  at: moment,
});

/** The Networks whose live data is unavailable at a moment by the device's clock, with the live data received by then, in `BUNDLE` unless it says. */
const unavailableAt = (moment: number, received: Received[], bundle = BUNDLE) => unavailable(bundle, moment, by(received, moment));

test("while Renfe's feeds fail, Rodalies' live data is unavailable from the third failed update, and its Trains turn Scheduled, keeping their Delays", () => {
  // Renfe's GPS has the R2S 30 s late between Sitges and Castelldefels at 22:00:00, and then every run fails.
  const good = gps(R2S, where(R2S, at('21:59:30')) ?? NaN, at('22:00:00'));
  const received = [good, ...[20, 40, 60, 80].map((s) => failing(at('22:00:00', s), good))];
  expect([at('22:00:50'), at('22:01:10')].map((moment) => unavailableAt(moment, received))).toEqual([[], ['rodalies']]);
  // Before the day's Trips have come, too.
  expect(unavailable(undefined, at('22:01:10'), received)).toEqual(['rodalies']);
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
  expect([at('22:02:10'), at('22:02:30')].map((moment) => unavailableAt(moment, received))).toEqual([[], ['rodalies']]);
  expect([130, 150].map((s) => train(R2S, at('22:00:00', s), received)?.live)).toEqual([true, false]);
});

test("brought back after its tab was hidden, the map shows Trains Scheduled until it hears more, without saying their live data is unavailable", () => {
  // The map last looked at 22:00:00, and looks again at 22:10:00.
  const received = [gps(R2S, where(R2S, at('21:59:30')) ?? NaN, at('22:00:00'))];
  expect(train(R2S, at('22:10:00'), received)?.live).toBe(false);
  expect(unavailableAt(at('22:10:00'), received)).toEqual([]);
});

test("a Train that a working feed doesn't report stays Scheduled, marked as having no live data, unless the feed is down", () => {
  // Renfe's feeds at 15:57 on 25 September didn't report the R4, which its timetable has at Sabadell Nord, and did the RG1.
  expect(train(R4, onFriday('15:57:40'), RECEIVED, RENFE)).toMatchObject({ live: false, unreported: true });
  expect(train(RG1, onFriday('15:57:40'), RECEIVED, RENFE)).toMatchObject({ live: true, unreported: false });
  // From the third update after that the feeds fail, the map says their live data is unavailable instead.
  const down = [...RECEIVED, ...[20, 40, 60].map((s) => failing(onFriday('15:57:11', s), { snapshot: LIVE, at: LIVE.generated }))];
  expect(train(R4, onFriday('15:58:21'), down, RENFE)).toMatchObject({ live: false, unreported: false });
  // Before any live data comes, there's no telling.
  expect(train(R4, onFriday('15:57:40'), [], RENFE)?.unreported).toBe(false);
});

/** A bundle's Trips, and copies of one of them so many minutes later, each a Trip of its own on the same track. */
function withCopies(bundle: Bundle, id: string, minutes: number[]): Bundle {
  const trip = bundle.trips.find((t) => t.id === id) as Trip;
  const later = (m: number): Trip => ({ ...trip, id: `${id} +${m}`, calls: trip.calls.map((c) => ({ ...c, arrival: c.arrival + m * 60, departure: c.departure + m * 60 })) });
  return { ...bundle, trips: [...bundle.trips, ...minutes.map(later)] };
}

// Made up: the R2S every 10 minutes from Sant Vicenç de Calders, from 21:30 to 22:10. Five of
// Rodalies' Trains are on the map from 22:09:30, as the last comes onto it, to 22:51:30, as the first
// leaves it, and four in the 10 minutes before.
const EVERY_10 = withCopies(BUNDLE, R2S, [10, 20, 30, 40]);

test("where Renfe's feeds work but have had none of Rodalies' Trains in them for three of their updates, while five or more are on the map, its live data is unavailable", () => {
  // Renfe's GPS has the R2S between Castelldefels and Gavà at 22:14:00. Then Renfe's feeds have a
  // header and no Trains, as they did on 28 September: they work, but leave every Train out.
  const received = [gps(R2S, where(R2S, at('22:13:30')) ?? NaN, at('22:14:00')), ...leftOut(at('22:14:20'), at('22:16:00'))];
  expect([at('22:14:50'), at('22:15:10')].map((moment) => unavailableAt(moment, received, EVERY_10))).toEqual([[], ['rodalies']]);
  // With four of its Trains on the map, it isn't an outage, until the fifth comes onto it at 22:09:30.
  const earlier = [gps(R2S, where(R2S, at('21:59:30')) ?? NaN, at('22:00:00')), ...leftOut(at('22:00:20'), at('22:10:00'))];
  expect([at('22:01:10'), at('22:09:20'), at('22:09:40')].map((moment) => unavailableAt(moment, earlier, EVERY_10))).toEqual([[], [], ['rodalies']]);
  // On a map opened while they have no Trains in them, as far as the map knows they've never had one.
  expect(unavailableAt(at('22:15:10'), leftOut(at('22:15:00'), at('22:15:00')), EVERY_10)).toEqual(['rodalies']);
});

test("while Rodalies' live data is unavailable that way, its Trains are Scheduled, each keeping its last Delay, and none is marked as having no live data", () => {
  // Renfe's GPS has the R2S 30 s late between Castelldefels and Gavà at 22:14:00, and then Renfe's
  // feeds have no Trains in them. Until their third update with none, the four Trains they leave out
  // are marked as having no live data, as ever.
  const received = [gps(R2S, where(R2S, at('22:13:30')) ?? NaN, at('22:14:00')), ...leftOut(at('22:14:20'), at('22:16:00'))];
  const marks = (moment: number) => trainsAt(EVERY_10, moment, by(received, moment)).map((t) => [t.trip.id, t.live, t.unreported]);
  expect(marks(at('22:14:50'))).toEqual([[R2S, true, false], ...[10, 20, 30, 40].map((m) => [`${R2S} +${m}`, false, true])]);
  // From then, none is.
  const moment = at('22:15:30');
  expect(marks(moment)).toEqual([R2S, ...[10, 20, 30, 40].map((m) => `${R2S} +${m}`)].map((id) => [id, false, false]));
  expect(where(R2S, moment, received, EVERY_10)).toBeCloseTo(where(R2S, at('22:15:00')) ?? NaN, 3);
  expect(followed(`${R2S} +10`, moment, received, EVERY_10)).toMatchObject({ live: false, unreported: false });
  expect(board(['Barcelona-Sants'], moment, received, EVERY_10).map((d) => [d.live, d.unreported])).toEqual(Array(5).fill([false, false]));
});

test("Rodalies' live data is available again from the first snapshot in which Renfe's feeds have one of its Trains", () => {
  // Made up: after four updates with none, Renfe's trip updates have the R2S 10 minutes behind the first on time at 22:16:00.
  const received = [gps(R2S, where(R2S, at('22:13:30')) ?? NaN, at('22:14:00')), ...leftOut(at('22:14:20'), at('22:15:40')), late(`${R2S} +10`, 0, at('22:16:00'))];
  expect([at('22:15:50'), at('22:16:00')].map((moment) => unavailableAt(moment, received, EVERY_10))).toEqual([['rodalies'], []]);
});

/** A Trip's Train as the follow panel has it at a moment by the device's clock, if it's on the map, with the live data received by then, in `BUNDLE` unless it says. */
const followed = (trip: string, moment: number, received: Received[] = [], bundle = BUNDLE) => trainAt(bundle, moment, by(received, moment), trip);

test("a followed Train's upcoming Stations are those it has still to leave, each expected when its timetable has it there", () => {
  // With no live data, the R2S has left Calafell at 21:35 and runs on to Segur de Calafell, where it stands from 21:37:30 to 21:38.
  const upcoming = followed(R2S, at('21:36:00'))?.upcoming;
  expect(upcoming?.map((u) => u.station)).toEqual(TRIPS[R2S]?.calls.slice(2).map(([station]) => station));
  expect(upcoming?.[0]).toEqual({ station: 'Segur de Calafell', arrival: at('21:37:30'), departure: at('21:38:00') });
  expect(upcoming?.at(-1)).toEqual({ station: 'Barcelona Estació de França', arrival: at('22:51:00'), departure: at('22:51:30') });
  // Standing at Vilanova i la Geltrú, from 21:49 to 21:50, it still has that Station to leave.
  expect(followed(R2S, at('21:49:30'))?.upcoming[0]).toEqual({ station: 'Vilanova i la Geltrú', arrival: at('21:49:00'), departure: at('21:50:00') });
  expect(followed(R2S, at('21:49:30'))).toMatchObject({ delay: 0, live: false });
});

test("a followed Train running late is expected at each Station as late as it's drawn, and gets there then", () => {
  // Renfe's GPS has the RG1 36.5 s late past Sils at 15:57:06.
  const followedAt = followed(RG1, onFriday('15:57:11'), RECEIVED, RENFE);
  expect(followedAt?.delay).toBeCloseTo(36.5, 0);
  expect(followedAt?.upcoming[0]?.arrival).toBeCloseTo(onFriday('15:59:36', 0.5), -3);
  for (const { station, arrival, departure } of followedAt?.upcoming.slice(0, 3) ?? []) {
    const dist = RENFE.trips.find((t) => t.id === RG1)?.calls.find((c) => c.station === station)?.dist;
    expect([where(RG1, arrival, RECEIVED, RENFE), where(RG1, departure, RECEIVED, RENFE)]).toEqual([dist, dist]);
  }
});

test('a followed Train says how long ago live data last placed it, as of when its operator reported it', () => {
  // Renfe's GPS placed the RG1 at 15:57:06, and has it Live; Renfe didn't report the R4.
  expect(followed(RG1, onFriday('15:57:40'), RECEIVED, RENFE)).toMatchObject({ live: true, since: 34_000 });
  // Through the minute its feed leaves it out, it's Live for two updates, then Scheduled, still saying when it was last placed.
  const quiet = [...RECEIVED, ...leftOut(onFriday('15:57:31'), onFriday('15:58:31'))];
  expect(followed(RG1, onFriday('15:58:31'), quiet, RENFE)).toMatchObject({ live: false, since: 85_000 });
  expect(followed(R4, onFriday('15:57:40'), RECEIVED, RENFE)).toMatchObject({ live: false, unreported: true, since: undefined });
});

test("a followed Train's modelled speed is its speed profile's: none standing at a Station, and cruising between Stations at the lowest speed that arrives on time", () => {
  expect(followed(R2S, at('21:49:30'))?.speed).toBe(0);
  // Sitges to Castelldefels is 15,611 m in 15 minutes: at 1 m/s² each way, it cruises at 17.69 m/s.
  expect(followed(R2S, at('22:05:00'))?.speed).toBeCloseTo(17.69, 2);
});

test("a followed Train easing towards where live data has it runs as late as live data says, and is expected at its Stations that late", () => {
  // The R2S runs on time until a snapshot at 22:00:00 has it 10 s late, and slows down until it is.
  const received = [late(R2S, 0, at('21:59:40')), late(R2S, 10, at('22:00:00'))];
  const easing = followed(R2S, at('22:00:05'), received);
  expect(easing?.delay).toBe(10);
  expect(easing?.upcoming[0]).toMatchObject({ station: 'Castelldefels', arrival: at('22:12:10') });
  expect(where(R2S, at('22:12:10'), received)).toBe(150987);
});

test('a followed Train that live data shows stopped between Stations, held there, runs at no speed', () => {
  // A signal stops the R2S between Sitges and Castelldefels at 21:59:40: every 20 s it's 20 s later.
  const received = [0, 20, 40, 60].map((delay, i) => late(R2S, delay, at('21:59:40', i * 20)));
  expect(followed(R2S, at('22:00:50'), received)).toMatchObject({ speed: 0, standsAt: undefined });
  expect(followed(R2S, at('21:49:30'))).toMatchObject({ standsAt: 'Vilanova i la Geltrú' });
});

/** A board of the next departures from some Stations at a moment by the device's clock, with the live data received by then, in `BUNDLE` unless it says. */
const board = (stations: string[], moment: number, received: Received[] = [], bundle = BUNDLE) => boardAt(bundle, moment, by(received, moment), stations);

test("a Station's board lists each Train still to leave it, expected when its timetable has it leave, and not one that ends there", () => {
  // With no live data, the R2S stands at Vilanova i la Geltrú from 21:49 to 21:50.
  expect(board(['Vilanova i la Geltrú'], at('21:20:00'))).toMatchObject([{ trip: { id: R2S }, station: 'Vilanova i la Geltrú', departure: at('21:50:00'), delay: 0, live: false, cancelled: false }]);
  expect(board(['Vilanova i la Geltrú'], at('21:49:30'))).toHaveLength(1);
  expect(board(['Vilanova i la Geltrú'], at('21:50:01'))).toEqual([]);
  // Its last Station, where it only arrives.
  expect(board(['Barcelona Estació de França'], at('22:40:00'))).toEqual([]);
});

test("a board's times agree with where each Train is on the map: it leaves the Station when the board says", () => {
  // Renfe's GPS has the RG1 36.5 s late past Sils at 15:57:06.
  const [caldes] = board(['Caldes de Malavella'], onFriday('15:57:11'), RECEIVED, RENFE);
  expect(caldes).toMatchObject({ trip: { id: RG1 }, live: true });
  expect(caldes?.delay).toBeCloseTo(36.5, 0);
  expect(caldes?.departure).toBe(followed(RG1, onFriday('15:57:11'), RECEIVED, RENFE)?.upcoming.find((u) => u.station === 'Caldes de Malavella')?.departure);
  const departure = caldes?.departure ?? NaN;
  expect(where(RG1, departure, RECEIVED, RENFE)).toBe(13529);
  expect(where(RG1, departure + 1000, RECEIVED, RENFE)).toBeGreaterThan(13529);
});

test('a Train not yet on the map is on the board as late as live data has it, and leaves then', () => {
  // Made up: a trip update at 21:19 has the R2S, due out of Sant Vicenç de Calders at 21:30, 2 minutes late.
  const received = [late(R2S, 120, at('21:19:00'))];
  expect(train(R2S, at('21:20:00'), received)).toBeUndefined();
  expect(board(['Vilanova i la Geltrú'], at('21:20:00'), received)).toMatchObject([{ departure: at('21:52:00'), delay: 120, live: false }]);
  expect(where(R2S, at('21:52:00'), received)).toBe(128092);
  expect(where(R2S, at('21:52:01'), received)).toBeGreaterThan(128092);
});

test('a Train live data places before it comes onto the map is Live on the board', () => {
  // Made up: Renfe has the R2S standing at Sant Vicenç de Calders at 21:25, 2 minutes late, before its timetable brings it onto the map.
  const snapshot: Snapshot = { ...written(at('21:25:00')), reports: [{ trip: R2S, at: at('21:25:00'), position: { near: 'Sant Vicenç de Calders' }, delay: 120 }] };
  const received = [{ snapshot, at: at('21:25:00') }];
  expect(train(R2S, at('21:26:00'), received)).toBeUndefined();
  expect(board(['Vilanova i la Geltrú'], at('21:26:00'), received)).toMatchObject([{ departure: at('21:52:00'), live: true }]);
});

test("a board's times are by the fetcher's clock on a device whose clock is minutes off", () => {
  // A device 5 minutes behind receives a snapshot as it's written, at 21:49:00, and asks at what it takes for 21:44:30.
  const behind = board(['Vilanova i la Geltrú'], at('21:44:30'), [{ snapshot: written(at('21:49:00')), at: at('21:44:00') }]);
  expect(behind).toMatchObject([{ trip: { id: R2S }, departure: at('21:50:00') }]);
  // Standing there from 21:49 to 21:50, it's still to leave; a minute later it's gone.
  expect(board(['Vilanova i la Geltrú'], at('21:45:30'), [{ snapshot: written(at('21:49:00')), at: at('21:44:00') }])).toEqual([]);
});

test("a departure whose Train a working feed doesn't report is marked on the board as having no live data, as in the follow panel", () => {
  // Renfe's feeds at 15:57 on 25 September didn't report the R4, standing at Sabadell Nord until 15:58, and did the RG1.
  expect(board(['Sabadell Nord'], onFriday('15:57:40'), RECEIVED, RENFE)).toMatchObject([{ trip: { id: R4 }, live: false, unreported: true }]);
  expect(board(['Caldes de Malavella'], onFriday('15:57:40'), RECEIVED, RENFE)).toMatchObject([{ trip: { id: RG1 }, live: true, unreported: false }]);
  // With no live data at all, it's plain Scheduled.
  expect(board(['Sabadell Nord'], onFriday('15:57:40'), [], RENFE)).toMatchObject([{ trip: { id: R4 }, live: false, unreported: false }]);
});

test('a cancelled Train stays on the board, marked cancelled, when its timetable has it leave', () => {
  const snapshot: Snapshot = { ...written(at('21:49:00')), reports: [{ trip: R2S, at: at('21:48:40'), cancelled: true }] };
  expect(board(['Sitges'], at('21:49:30'), [{ snapshot, at: at('21:49:10') }])).toMatchObject([{ trip: { id: R2S }, departure: at('21:57:00'), cancelled: true, live: false }]);
});

test("a board lists only its own Stations' departures, soonest first", () => {
  // Made up, as TMB's timetable has Passeig de Gràcia: a Station for each of its Lines (ADR-0005), and Diagonal's beside it.
  const row = (station: string, time: string, dist: number, lon: number, lat: number): Row => [station, time, time, dist, lon, lat];
  const day = bundleOf('2026-09-24', { id: 'metro', name: 'Metro', profile: PROFILE }, {
    l2: { line: 'L2', calls: [row('tmb:1.225', '12:05:00', 0, 2.1693, 41.3927), row('tmb:1.226', '12:07:00', 800, 2.1754, 41.3947)] },
    l3: { line: 'L3', calls: [row('tmb:1.327', '12:03:00', 0, 2.1649, 41.3918), row('tmb:1.328', '12:05:00', 900, 2.1611, 41.3979)] },
    l5: { line: 'L5', calls: [row('tmb:1.532', '12:01:00', 0, 2.1607, 41.3969), row('tmb:1.533', '12:03:00', 700, 2.1666, 41.4020)] },
  });
  const ids = (stations: string[]) => boardAt(day, at('12:00:00'), [], stations).map((d) => d.trip.id);
  // Passeig de Gràcia's L2 and L3 Stations, and Diagonal's L5.
  expect(ids(['tmb:1.225', 'tmb:1.327'])).toEqual(['l3', 'l2']);
  expect(ids(['tmb:1.532'])).toEqual(['l5']);
});

/** The Trains passing within a radius of a point, 1.5 km unless it says, in the next hour, at a moment by the device's clock, with the live data received by then. */
const nearby = (point: Point, moment: number, received: Received[] = [], radius = 1500) => nearbyAt(BUNDLE, moment, by(received, moment), point, radius, 60 * 60_000);

/** How far a Trip's Train is from a point at a moment, in metres, flat around the point, if it's on the map. */
const away = (trip: string, moment: number, point: Point) => {
  const t = train(trip, moment);
  return t ? metresApart([t.lon, t.lat], point) : NaN;
};

/** How far apart two points are, in metres, flat around the second. */
const metresApart = (a: Point, b: Point) => Math.hypot((a[0] - b[0]) * DEGREE * Math.cos((b[1] * Math.PI) / 180), (a[1] - b[1]) * DEGREE);

/** A point so many metres to the right of the R2S's track, `dist` metres along it. */
const offTrack = (dist: number, metres: number) => beside(BUNDLE.shapes.find((s) => s.id === R2S) as Shape, dist, metres);

/** Halfway from Sitges to Castelldefels, where the R2S cruises. */
const MIDWAY = (135376 + 150987) / 2;

test('a Train passing near a point is listed with when it comes within the radius of it', () => {
  const point = offTrack(MIDWAY, 1000);
  const [pass] = nearby(point, at('21:30:00'));
  expect(pass).toMatchObject({ trip: { id: R2S }, delay: 0, live: false });
  expect(away(R2S, pass?.at ?? NaN, point)).toBeCloseTo(1500, -1);
  expect(away(R2S, (pass?.at ?? NaN) - 5000, point)).toBeGreaterThan(1500);
});

test('only Trains whose track comes within the radius pass near a point', () => {
  expect(nearby(offTrack(MIDWAY, 1490), at('21:30:00')).map((p) => p.trip.id)).toEqual([R2S]);
  expect(nearby(offTrack(MIDWAY, 1510), at('21:30:00'))).toEqual([]);
});

test('only Trains passing within the time window pass near a point, and not one that has left the radius already', () => {
  const point = offTrack(MIDWAY, 1000);
  const passes = nearby(point, at('21:30:00'))[0]?.at ?? NaN;
  const ids = (moment: number) => nearby(point, moment).map((p) => p.trip.id);
  expect(ids(passes - 60 * 60_000 + 1000)).toEqual([R2S]);
  expect(ids(passes - 60 * 60_000 - 1000)).toEqual([]);
  expect(ids(passes - 1000)).toEqual([R2S]);
  // Within the radius it passes now, until it leaves it, well before Castelldefels.
  expect(nearby(point, passes + 1000)).toMatchObject([{ trip: { id: R2S }, at: passes + 1000 }]);
  expect(ids(at('22:12:00'))).toEqual([]);
});

test('a Train that stands at a Station within the radius passes now while it stands there', () => {
  // 500 m on from Estació de França the way the R2S comes in, where it stands from 22:51:00 to 22:51:30.
  const [[lon, lat], [fromLon, fromLat]] = [[2.18534785, 41.3844866], [2.16533862, 41.3920862]];
  const point: Point = [lon + (lon - fromLon) * 0.27, lat + (lat - fromLat) * 0.27];
  const [pass] = nearby(point, at('22:40:00'));
  expect(pass?.at).toBeLessThan(at('22:51:00'));
  expect(away(R2S, pass?.at ?? NaN, point)).toBeCloseTo(1500, -1);
  expect(nearby(point, at('22:51:10'))).toMatchObject([{ trip: { id: R2S }, at: at('22:51:10') }]);
  expect(nearby(point, at('22:51:31'))).toEqual([]);
});

test('a Train running late passes near a point that much later, and a Cancelled one not at all', () => {
  const point = offTrack(MIDWAY, 1000);
  const onTime = nearby(point, at('21:59:50'))[0]?.at ?? NaN;
  const late2 = nearby(point, at('21:59:50'), [late(R2S, 120, at('21:59:40'))])[0];
  expect(late2?.delay).toBe(120);
  expect(late2?.at).toBeCloseTo(onTime + 120_000, -1);
  const cancelled: Snapshot = { ...written(at('21:59:40')), reports: [{ trip: R2S, at: at('21:59:40'), cancelled: true }] };
  expect(nearby(point, at('21:59:50'), [{ snapshot: cancelled, at: at('21:59:40') }])).toEqual([]);
});

test('a Train already past its nearest point is listed once, for when its track comes back within the radius', () => {
  // Made up: a Line that runs 4 km east, 2 km north and back west, past a point 1.1 km from both of its long stretches.
  const hairpin = bundleOf('2026-09-24', { id: 'rodalies', name: 'Rodalies de Catalunya', profile: PROFILE }, {
    hairpin: {
      line: 'R0',
      calls: [
        ['A', '10:00:00', '10:00:00', 0, 2.0, 41.0],
        ['B', '10:04:00', '10:04:00', 4200, 2.05, 41.0],
        ['C', '10:07:00', '10:07:00', 6400, 2.05, 41.02],
        ['D', '10:11:00', '10:11:00', 10600, 2.0, 41.02],
      ],
    },
  });
  const point: Point = [2.01, 41.01];
  const passes = (moment: number) => nearbyAt(hairpin, moment, [], point, 1500, 60 * 60_000);
  const fromPoint = (moment: number) => {
    const t = trainsAt(hairpin, moment)[0];
    return t ? metresApart([t.lon, t.lat], point) : NaN;
  };
  // At 10:03 it has left the radius on its way east: it's listed once, for when it comes back within it.
  const [pass, ...more] = passes(at('10:03:00'));
  expect(more).toEqual([]);
  expect(pass?.at).toBeGreaterThan(at('10:07:00'));
  expect(fromPoint(pass?.at ?? NaN)).toBeCloseTo(1500, -1);
  expect(fromPoint((pass?.at ?? NaN) - 5000)).toBeGreaterThan(1500);
  // Before it leaves, it's listed once, for now: it's within the radius already.
  expect(passes(at('10:00:10'))).toMatchObject([{ trip: { id: 'hairpin' }, at: at('10:00:10') }]);
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
  // But it's held from leaving: expected there on time, at 10:23, it's held as late as keeps it
  // there at 10:30:11, 371 s, as its timetable has it leave at 10:24, so it leaves then.
  expect(s2(standing({ position: { near: 'fgc:SC' }, expected: { station: 'fgc:SC', at: Date.parse('2026-09-25T10:23:00+02:00') } }))?.dist).toBeCloseTo(late(371), 3);
});

// Two of Montserrat's rack Trips on 25 September 2026, as the daily build had them, and the
// reports the fetcher made of them from Geotren as FGC updated it at 14:46:02, in a snapshot
// written at 14:46:11. Geotren has them on lines M1 and M2, under a calendar, 6d4fdaec, that isn't the day's.
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
  // Made up: a Trip on another Line whose trip_id ends as a rack Train's does.
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

test("a rack Train Geotren has on line M1 or M2 is Live as the day's MM Trip it runs, running as late as its position shows", () => {
  const moment = Date.parse('2026-09-25T14:46:20+02:00');
  const trains = trainsAt(RACK, moment, RACK_RECEIVED);
  expect(trains.map((t) => [t.trip.id, t.live])).toEqual([
    ['fgc:6350da917476|652dc7e702', true],
    ['fgc:6350da917476|652dc7e703', true],
    ['fgc:625cdae21f726b1bb950|652dc7e703', false],
  ]);
  // Geotren has both about 3 minutes behind their timetables, which the trip updates don't cover.
  const scheduled = trainsAt(RACK, moment);
  for (const i of [0, 1]) expect(trains[i]?.dist).toBeLessThan((scheduled[i]?.dist ?? NaN) - 400);
});

test('a followed Train shows the type of Unit it runs as, where its operator reports one', () => {
  const moment = Date.parse('2026-09-25T14:46:20+02:00');
  expect(trainAt(RACK, moment, RACK_RECEIVED, 'fgc:6350da917476|652dc7e703')?.unitType).toBe('AMx2');
  expect(trainAt(RACK, moment, RACK_RECEIVED, 'fgc:625cdae21f726b1bb950|652dc7e703')?.unitType).toBeUndefined();
});

test("a Train Renfe pins to a Station isn't held there: Renfe's pinned Stations are stale", () => {
  // Made up: Renfe pins the R2N to Mollet-Sant Fost at 21:39:30, with no Delay, though its timetable
  // has it leave at 21:38. It runs on its timetable.
  const snapshot: Snapshot = { ...written(at('21:39:35')), reports: [{ trip: R2N, at: at('21:39:30'), position: { near: 'Mollet-Sant Fost' } }] };
  expect(where(R2N, at('21:39:40'), [{ snapshot, at: at('21:39:35') }])).toBeCloseTo(where(R2N, at('21:39:40')) ?? NaN, 3);
});

test("a Train Renfe pins to a Station, or gives no position for, carries on from its last GPS Delay, whatever Renfe's own figure says", () => {
  // Made up: Renfe's GPS has the R2S 30 s late between Sitges and Castelldefels at 22:00:00. Then
  // Renfe pins it to Castelldefels, 3 and then 4 minutes late by its own figure, and then gives it no
  // position, 5 minutes late. It runs on 30 s late.
  const received = [gps(R2S, where(R2S, at('21:59:30')) ?? NaN, at('22:00:00')), near(R2S, 'Castelldefels', 180, at('22:00:20')), near(R2S, 'Castelldefels', 240, at('22:00:40')), late(R2S, 300, at('22:01:00'))];
  for (const s of [30, 50, 70]) expect(where(R2S, at('22:00:00', s), received)).toBeCloseTo(where(R2S, at('21:59:30', s)) ?? NaN, 3);
});

test("a Train Renfe pins to a Station runs as late as Renfe's own figure says once its last GPS Delay is 30 minutes old", () => {
  // Made up: Renfe's GPS has the R2S 30 s late between Sitges and Castelldefels at 22:00:00, and
  // from then on Renfe pins it to Barcelona-Sants, 2 minutes late by its own figure.
  const pinned = Array.from({ length: 93 }, (_, i) => near(R2S, 'Barcelona-Sants', 120, at('22:00:20', i * 20)));
  const received = [gps(R2S, where(R2S, at('21:59:30')) ?? NaN, at('22:00:00')), ...pinned];
  expect(where(R2S, at('22:29:50'), received)).toBeCloseTo(where(R2S, at('22:29:20')) ?? NaN, 3);
  expect(where(R2S, at('22:30:30'), received)).toBeCloseTo(where(R2S, at('22:28:30')) ?? NaN, 3);
});

test("Renfe's GPS unchanged since a Train's last report counts as no position: it runs on as late as its GPS last had it, and turns Scheduled at its feed's third update", () => {
  // Made up: Renfe's GPS has the R2S 30 s late between Sitges and Castelldefels at 22:00:00, and at the same spot every 20 s after.
  const spot = where(R2S, at('21:59:30')) ?? NaN;
  const received = [0, 20, 40, 60].map((s) => gps(R2S, spot, at('22:00:00', s)));
  expect(where(R2S, at('22:00:50'), received)).toBeCloseTo(where(R2S, at('22:00:20')) ?? NaN, 3);
  expect([10, 30, 50, 70].map((s) => train(R2S, at('22:00:00', s), received)?.live)).toEqual([true, true, true, false]);
  // The map finds the last of those snapshots again at 22:01:20: it's still Scheduled, 30 s late.
  const again = [...received, { ...(received.at(-1) as Received), at: at('22:01:20') }];
  expect(train(R2S, at('22:01:30'), again)?.live).toBe(false);
  expect(where(R2S, at('22:01:30'), again)).toBeCloseTo(where(R2S, at('22:01:00')) ?? NaN, 3);
});

/** A snapshot, received as it's written, in which Renfe's GPS has the R2S where its timetable has it so many seconds late. */
const behind = (delay: number, moment: number) => gps(R2S, where(R2S, moment - delay * 1000) ?? NaN, moment);

test("Renfe's GPS more than 2 minutes off its GPS report before counts only once its next GPS report agrees: until then a Train runs on as late as before", () => {
  // Made up: Renfe's GPS has the R2S between Sitges and Castelldefels 30 s late at 22:04:40 and
  // 22:05:00, 5 minutes late at 22:05:20, and 30 s late again at 22:05:40. It runs on 30 s late.
  const once = [behind(30, at('22:04:40')), behind(30, at('22:05:00')), behind(300, at('22:05:20')), behind(30, at('22:05:40'))];
  for (const s of [30, 50]) expect(where(R2S, at('22:05:00', s), once)).toBeCloseTo(where(R2S, at('22:04:30', s)) ?? NaN, 3);
  // Where its GPS has it 4 minutes late at 22:05:20 and again at 22:05:40, it runs on 30 s late until 22:05:40, and then 4 minutes late.
  const twice = [behind(30, at('22:04:40')), behind(30, at('22:05:00')), behind(240, at('22:05:20')), behind(240, at('22:05:40'))];
  expect(where(R2S, at('22:05:30'), twice)).toBeCloseTo(where(R2S, at('22:05:00')) ?? NaN, 3);
  expect(where(R2S, at('22:05:50'), twice)).toBeCloseTo(where(R2S, at('22:01:50')) ?? NaN, 3);
});

test("Renfe's GPS heard again, as the map records its last snapshot again or the fetcher keeps Renfe's last good response, doesn't agree with itself", () => {
  // Made up: Renfe's GPS has the R2S between Sitges and Castelldefels 30 s late at 22:04:40 and
  // 22:05:00, and 5 minutes late at 22:05:20, which comes again at 22:05:40. It runs on 30 s late.
  const outlier = behind(300, at('22:05:20'));
  const heard = [behind(30, at('22:04:40')), behind(30, at('22:05:00')), outlier];
  for (const again of [{ ...outlier, at: at('22:05:40') }, failing(at('22:05:40'), outlier)]) {
    expect(where(R2S, at('22:05:50'), [...heard, again])).toBeCloseTo(where(R2S, at('22:05:20')) ?? NaN, 3);
  }
});

test("Renfe's GPS that puts a Train where it only ever stands, as at its first Station before it leaves, gives no GPS Delay to carry on from", () => {
  // Made up: Renfe's GPS has the R2N at Granollers Centre, its first Station, at 21:28:50, 20 s late
  // by Renfe's own figure, and then Renfe pins it to Montmeló, a minute late. It runs a minute late.
  const received = [gps(R2N, 40546, at('21:28:50'), 20), near(R2N, 'Montmeló', 60, at('21:29:10'))];
  expect(where(R2N, at('21:29:40'), received)).toBeCloseTo(where(R2N, at('21:28:40')) ?? NaN, 3);
});

test("Renfe's first GPS for a Train in over 2 minutes counts only once its next GPS report agrees, as after Renfe pins it to a Station a while: until then it runs on as late as its GPS last had it that counts", () => {
  // Made up: Renfe's GPS has the R2S between Sitges and Castelldefels 30 s late at 21:59:40 and
  // 22:00:00, then Renfe pins it to Castelldefels until 22:02:40, and then its GPS has it 2½ minutes
  // late at 22:03:00 and 22:03:20. It runs on 30 s late until 22:03:20, and then 2½ minutes late.
  const pinned = Array.from({ length: 8 }, (_, i) => near(R2S, 'Castelldefels', 60, at('22:00:20', i * 20)));
  const received = [behind(30, at('21:59:40')), behind(30, at('22:00:00')), ...pinned, behind(150, at('22:03:00')), behind(150, at('22:03:20'))];
  expect(where(R2S, at('22:03:10'), received)).toBeCloseTo(where(R2S, at('22:02:40')) ?? NaN, 3);
  expect(where(R2S, at('22:03:30'), received)).toBeCloseTo(where(R2S, at('22:01:00')) ?? NaN, 3);
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

/** Where and when TMB expects one of L1's Blocks: by TMB's number for it, the Station and when. */
type Expected = [number: string, station: string, at: string];

/** A made-up Metro snapshot, written at a moment on 25 September 2026 and received as it was written, in which TMB expects some of L1's Blocks headed for a Station. */
const headedFor = (headsign: string) => (time: string, ...expected: Expected[]): Received => {
  const generated = Date.parse(`2026-09-25T${time}+02:00`);
  const reports = expected.map(([number, station, at]): Report => ({ block: { line: 'metro:L1', number }, headsign, at: generated, position: { next: { station, at: Date.parse(`2026-09-25T${at}+02:00`) } } }));
  return { snapshot: { generated, feeds: { metro: { lastSuccess: generated, lastAttempt: generated, status: 'ok', every: 40_000 } }, reports }, at: generated };
};
const [intoFondo, outOfFondo] = [headedFor('Fondo'), headedFor('Hospital de Bellvitge')];

/**
 * Made-up Metro snapshots, written every 20 s from one moment to another on 25 September 2026 and
 * received as they were written, in which TMB's feed works but names only L1's 113, coming to a
 * Station none of these Trips calls at: so no Block runs any of them.
 */
const elsewhere = (from: string, to: string): Received[] => {
  const [start = 0, end = 0] = [from, to].map((time) => Date.parse(`2026-09-25T${time}+02:00`));
  const time = (moment: number) => new Date(moment).toLocaleTimeString('en-GB', { timeZone: 'Europe/Madrid' });
  return Array.from({ length: (end - start) / 20_000 + 1 }, (_, i) => intoFondo(time(start + i * 20_000), ['113', 'tmb:1.136', time(start + i * 20_000 + 60_000)]));
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
  const expecting = (time: string) => [intoFondo('13:47:50', ['112', 'tmb:1.140', time])];
  const live = (received: Received[]) => trainsAt(METRO, Date.parse('2026-09-25T13:48:00+02:00'), received).filter((t) => t.live).map((t) => t.trip.id);
  expect(live(expecting('13:50:32'))).toEqual([]);
  // 29¾ minutes after, it runs that Trip, 29¾ minutes late.
  expect(live(expecting('13:50:02'))).toEqual([NEXT_INTO_FONDO]);
});

/** The Metro Trips drawn Live at a moment on 25 September 2026, with the live data received by then. */
const liveMetro = (time: string, received: Received[]) => {
  const moment = Date.parse(`2026-09-25T${time}+02:00`);
  return trainsAt(METRO, moment, by(received, moment)).filter((t) => t.live).map((t) => t.trip.id);
};

test("a Block TMB has out of a Trip's first Station doesn't run it while it's due to leave there more than 8 minutes later, as before the Metro opens", () => {
  // Made up: at 12:58:00, 13½ minutes before the Trip into Fondo is due to leave Trinitat Vella, at
  // 13:11:28, TMB expects L1's 112 at Santa Coloma at 12:59:00, so out of there since 12:56:13.
  const received = [intoFondo('12:58:00', ['112', 'tmb:1.139', '12:59:00'])];
  expect(liveMetro('12:58:10', received)).toEqual([]);
  expect(metro(INTO_FONDO, '12:58:10', received)).toBeUndefined();
});

test("a Block TMB has out of a Trip's first Station runs it within 8 minutes of when it's due to leave there", () => {
  // Made up: at 13:03:40, 7 minutes 48 before the Trip into Fondo is due to leave Trinitat Vella, TMB
  // expects L1's 112 at Santa Coloma at 13:06:00, so out of there since 13:03:13.
  expect(liveMetro('13:03:50', [intoFondo('13:03:40', ['112', 'tmb:1.139', '13:06:00'])])).toEqual([INTO_FONDO]);
});

test("a Block too early for the closest Trip no Block keeps runs it once it's due to leave its first Station within 8 minutes", () => {
  // Made up: L1's 113 runs the Trip into Fondo on time. At 13:07:00 TMB expects 112 at Santa Coloma
  // at 13:08:30, so out of Trinitat Vella since 13:05:43, 8¾ minutes before the next Trip into Fondo
  // is due to leave there, at 13:15:45. At 13:08:50, 6 minutes 55 before, it expects 112 there at 13:10:30.
  const on = ['113', 'tmb:1.139', '13:14:15'] as Expected;
  const received = [intoFondo('13:06:40', on), intoFondo('13:07:00', on, ['112', 'tmb:1.139', '13:08:30']), intoFondo('13:08:50', on, ['112', 'tmb:1.139', '13:10:30'])];
  expect(liveMetro('13:07:10', received)).toEqual([INTO_FONDO]);
  expect(liveMetro('13:09:00', received)).toEqual([INTO_FONDO, NEXT_INTO_FONDO]);
});

test("a Trip whose Block TMB then has out of its first Station too early turns Scheduled at once, and waits for a Block as one never placed does", () => {
  // Made up: at 13:01:00 TMB expects L1's 112 at Trinitat Vella at 13:02:00, 9 minutes before the Trip
  // into Fondo is due there, so it runs that Trip. At 13:02:30 it expects 112 at Baró de Viver at
  // 13:03:30, so out of Trinitat Vella since 13:02:22, while the Trip is due to leave there 9 minutes on.
  const received = [intoFondo('13:01:00', ['112', 'tmb:1.137', '13:02:00']), intoFondo('13:02:30', ['112', 'tmb:1.138', '13:03:30']), intoFondo('13:03:10', ['112', 'tmb:1.139', '13:05:00'])];
  expect(metro(INTO_FONDO, '13:01:10', received)).toMatchObject({ live: true });
  // Scheduled, it isn't drawn before its timetable has it at Trinitat Vella, rather than Live where the Block was.
  expect(metro(INTO_FONDO, '13:02:40', received)).toBeUndefined();
  // Not drawn out of Trinitat Vella ahead of its timetable, near Santa Coloma at 19,138 m, on the refused report's Delay.
  expect(metro(INTO_FONDO, '13:05:00', received)).toBeUndefined();
  expect(metro(INTO_FONDO, '13:11:20', received)).toMatchObject({ live: false, dist: 17896 });
  // Then it waits there for a Block, as one live data never placed does while TMB's feed works (#125).
  for (const time of ['13:11:20', '13:12:00']) expect(metro(INTO_FONDO, time, received)).toEqual(metro(INTO_FONDO, time, elsewhere('13:01:00', '13:03:00')));
});

test("a Block waiting at the end of its Line, expected at the Station after, runs the Trip back from there however long before it's due to leave", () => {
  // Made up: at 13:02:00, 11 minutes before the Trip out of Fondo is due to leave it, TMB expects L1's
  // 112 at Santa Coloma at 13:14:30, as that Trip is due there at 13:14:23.
  expect(metro(OUT_OF_FONDO, '13:02:10', [outOfFondo('13:02:00', ['112', 'tmb:1.139', '13:14:30'])])).toMatchObject({ live: true, dist: 0 });
});

// Made up: an L9 Sud Trip from Zona Universitària to Collblanc, on its own track, beside the Metro's Trips above.
const L9 = bundleOf('2026-09-25', METRO.networks[0] as Network, {
  'metro:9.1.1': { line: 'metro:L9S', calls: [['tmb:1.915', '13:13:00', '13:13:30', 0, 2.1123, 41.3854], ['tmb:1.914', '13:16:00', '13:16:30', 1500, 2.1285, 41.3778]] },
});
const WITH_L9: Bundle = { ...METRO, lines: [...METRO.lines, ...L9.lines], shapes: [...METRO.shapes, ...L9.shapes], trips: [...METRO.trips, ...L9.trips] };

test("a Metro Train on a Line TMB publishes no predictions for, as L9's, isn't marked as having no live data, while one TMB leaves out on its Line is", () => {
  // TMB reports only L1's 113, which runs the Trip into Fondo, and so leaves out the Train out of Fondo.
  const trains = trainsAt(WITH_L9, Date.parse('2026-09-25T13:14:20+02:00'), onlyL1('113'));
  expect(trains.map((t) => [t.trip.id, t.live, t.unreported])).toEqual([
    [INTO_FONDO, true, false],
    [OUT_OF_FONDO, false, true],
    ['metro:9.1.1', false, false],
  ]);
});

test('a Block that turns back at the end of its Line runs the Trip back from there', () => {
  // At 13:15:40 TMB has L1's 112 in at Fondo, which it reached at 13:15:38 as the Trip into Fondo,
  // and expects it back at Santa Coloma at 13:17:31: 69 s before the next Trip out of Fondo is due
  // there, so it's expected to leave Fondo at 13:16:04. No report after has it gone, so it stays there.
  expect(metro(NEXT_OUT_OF_FONDO, '13:15:50', METRO_LIVE)).toMatchObject({ live: true, dist: 0 });
  expect(metro(NEXT_OUT_OF_FONDO, '13:15:50', METRO_LIVE, 60)).toMatchObject({ live: true, dist: 0 });
  expect(followed(NEXT_OUT_OF_FONDO, Date.parse('2026-09-25T13:15:50+02:00'), METRO_LIVE, METRO)?.upcoming[0]).toMatchObject({ station: 'tmb:1.140', departure: Date.parse('2026-09-25T13:16:04+02:00') });
});

test('a Metro Train whose Block goes on to run another Trip turns Scheduled at once, where it was drawn', () => {
  // At 13:14:09 L1's 112 runs the Trip into Fondo, and at 13:15:40 TMB has it turned back there, running the next Trip out of Fondo.
  expect(metro(INTO_FONDO, '13:15:30', METRO_LIVE)).toMatchObject({ live: true });
  expect(metro(INTO_FONDO, '13:15:50', METRO_LIVE)).toMatchObject({ live: false, dist: 20055 });
});

// Made up: L1's 112 runs the Trip into Fondo 2 minutes late, expected at Baró de Viver at 13:14:36.
// Then TMB expects it at Santa Coloma at 13:16:45: 150 s after that Trip is due there, and 107 s
// before the next Trip into Fondo is.
const [LATE_112, LATER_112]: [Expected, Expected] = [['112', 'tmb:1.138', '13:14:36'], ['112', 'tmb:1.139', '13:16:45']];

test('a Block keeps the Trip it ran in the snapshot before, while that Trip still calls at the Station it comes to next, however much closer the next Trip comes to when TMB expects it there', () => {
  // Matched afresh it runs the next Trip. The engine matches each snapshot's Blocks once, as it first
  // replays the snapshot, so this is a snapshot of its own.
  expect(metro(NEXT_INTO_FONDO, '13:16:30', [intoFondo('13:15:55', LATER_112)])).toMatchObject({ live: true });
  const received = [intoFondo('13:14:00', LATE_112), intoFondo('13:15:55', LATER_112)];
  expect(metro(NEXT_INTO_FONDO, '13:16:30', received)).toMatchObject({ live: false });
  expect(metro(INTO_FONDO, '13:16:30', received)).toMatchObject({ live: true });
  expect(metro(INTO_FONDO, '13:16:30', received)?.dist).toBeCloseTo(metro(INTO_FONDO, '13:16:30', [], -150)?.dist ?? NaN, 3);
});

test('a Block whose closest Trip another Block keeps runs the closest Trip that no Block keeps', () => {
  // As 112 keeps the Trip into Fondo, TMB first reports L1's 113, expecting it at Fondo at 13:16:30:
  // 30 s after that Trip is due there, and 227 s before the next Trip into Fondo is.
  const received = [intoFondo('13:14:00', LATE_112), intoFondo('13:15:55', LATER_112, ['113', 'tmb:1.140', '13:16:30'])];
  expect(metro(NEXT_INTO_FONDO, '13:16:00', received)).toMatchObject({ live: true });
  expect(metro(NEXT_INTO_FONDO, '13:16:00', received)?.dist).toBeCloseTo(metro(NEXT_INTO_FONDO, '13:16:00', [], 227)?.dist ?? NaN, 3);
});

test('a Block whose Trip no longer calls at the Station it comes to next runs another', () => {
  // Made up: a Trip headed for Fondo whose timetable goes only as far as Baró de Viver, where L1's
  // 112 is expected 3 s after it. Then TMB expects 112 at Santa Coloma, 50 s after the Trip into Fondo is due there.
  const SHORT = 'metro:1.1.short';
  const short = bundleOf('2026-09-25', METRO.networks[0] as Network, {
    [SHORT]: {
      line: 'metro:L1',
      headsign: 'Fondo',
      calls: [
        ['tmb:1.137', '13:12:10', '13:12:29', 17896, 2.193837, 41.448956], // Trinitat Vella
        ['tmb:1.138', '13:13:37', '13:13:37', 18427, 2.199563, 41.449936], // Baró de Viver
      ],
    },
  });
  const both: Bundle = { ...METRO, shapes: [...METRO.shapes, ...short.shapes], trips: [...METRO.trips, ...short.trips] };
  const received = [intoFondo('13:13:00', ['112', 'tmb:1.138', '13:13:40']), intoFondo('13:13:40', ['112', 'tmb:1.139', '13:15:05'])];
  const live = (time: string) => trainsAt(both, Date.parse(`2026-09-25T${time}+02:00`), by(received, Date.parse(`2026-09-25T${time}+02:00`))).filter((t) => t.live).map((t) => t.trip.id);
  expect(live('13:13:10')).toEqual([SHORT]);
  expect(live('13:13:50')).toEqual([INTO_FONDO]);
});

test("after a gap of 2 minutes or more in TMB's reports of a Block, it's matched afresh: by then it may have run its Trip to the end and come back along it", () => {
  // Made up: 3 minutes after it was expected at Baró de Viver running the Trip into Fondo 2 minutes
  // late, TMB next reports L1's 112 expected at Santa Coloma 52 s before the next Trip into Fondo is.
  const received = [intoFondo('13:14:00', LATE_112), intoFondo('13:17:10', ['112', 'tmb:1.139', '13:17:40'])];
  expect(metro(NEXT_INTO_FONDO, '13:17:20', received)).toMatchObject({ live: true });
  expect(metro(INTO_FONDO, '13:17:20', received)).toMatchObject({ live: false });
});

test('a Metro Train held outside the end of its Line is drawn no further back than the Station before it', () => {
  // Made up after L1's 115 in #12's recording: at 13:19:39, having left Santa Coloma, it's held
  // outside Fondo, and TMB expects it there at 13:23:49, 3½ minutes after the Trip's timetable does.
  // That Delay alone has it two Stations back, between Trinitat Vella and Baró de Viver.
  const held = [intoFondo('13:19:39', ['115', 'tmb:1.140', '13:23:49'])];
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
  expect(trainsAt(later, Date.parse('2026-09-25T13:19:39+02:00'), held).find((t) => t.trip.id === LATER)).toMatchObject({ live: true, dist: 19161 });
});

// Made up: L1's 112 runs the Trip into Fondo on time, due there at 13:16:00. Past Santa Coloma, TMB
// lists it under its way back, naming Fondo as the Station it comes to next and expecting it there
// when it leaves, at 13:17:13, as the next Trip out of Fondo does. That Trip's timetable has it at
// Fondo only from 13:16:53.
const TURNING_112 = [intoFondo('13:15:00', ['112', 'tmb:1.140', '13:16:00']), outOfFondo('13:15:20', ['112', 'tmb:1.140', '13:17:13'])];

test("a Live Metro Train whose Block waits at the end of its Line stands at its Trip's first Station, whichever Station TMB names next", () => {
  expect(metro(NEXT_OUT_OF_FONDO, '13:16:30', TURNING_112)).toMatchObject({ live: true, dist: 0 });
  // Made up: on a map opened at 13:17:20, with 112 still at Fondo once its time to leave has gone,
  // TMB expects it at Santa Coloma at 13:19:40, a minute after the Trip's timetable does. Running
  // that late, the Trip is at Fondo only from 13:17:53.
  expect(metro(NEXT_OUT_OF_FONDO, '13:17:30', [outOfFondo('13:17:20', ['112', 'tmb:1.139', '13:19:40'])])).toMatchObject({ live: true, dist: 0 });
});

test('a Metro Train whose Block waits at the end of its Line comes onto the map only once the Trip its Block ran in on has left it', () => {
  // Live while TMB names Fondo as where its Block comes next, the Trip into Fondo runs in until 13:16:00 and stands there until 13:16:20.
  expect(metro(INTO_FONDO, '13:15:40', TURNING_112)?.dist).toBeLessThan(20055);
  expect(metro(INTO_FONDO, '13:16:10', TURNING_112)).toMatchObject({ live: true, dist: 20055 });
  for (const time of ['13:15:40', '13:16:10']) expect(metro(NEXT_OUT_OF_FONDO, time, TURNING_112)).toBeUndefined();
});

test('the Trip a Metro Block runs into the end of its Line on stays Live, on its last Delay, while TMB names that end as where the Block comes next, until it has run in', () => {
  // Made up: at 13:14:00 TMB expects L1's 112 at Santa Coloma at 13:14:20, running the Trip into Fondo
  // 5 s late. From 13:14:40 it lists 112 under its way back, naming Fondo, which it leaves at 13:17:13.
  const received = [intoFondo('13:14:00', ['112', 'tmb:1.139', '13:14:20']), ...['13:14:40', '13:15:20', '13:16:00'].map((time) => outOfFondo(time, ['112', 'tmb:1.140', '13:17:13']))];
  expect(metro(INTO_FONDO, '13:15:40', received)).toMatchObject({ live: true });
  expect(metro(INTO_FONDO, '13:15:40', received)?.dist).toBeCloseTo(metro(INTO_FONDO, '13:15:40', [], -5)?.dist ?? NaN, 3);
  // Standing at Fondo from 13:16:05 to 13:16:25, over two minutes since TMB last reported it on that
  // Trip, and confirmed by its Block's report of 13:16:00.
  expect(metro(INTO_FONDO, '13:16:10', received)).toMatchObject({ live: true, dist: 20055 });
  expect(followed(INTO_FONDO, Date.parse('2026-09-25T13:16:10+02:00'), received, METRO)).toMatchObject({ live: true, since: 10_000 });
  // Then the Block's next Trip stands there.
  expect(metro(INTO_FONDO, '13:16:30', received)).toBeUndefined();
  expect(metro(NEXT_OUT_OF_FONDO, '13:16:30', received)).toMatchObject({ live: true, dist: 0 });
});

test('the Trip a Metro Block ran turns Scheduled at once where its Block goes on to another Trip headed its way, even one TMB expects at its last Station', () => {
  // Made up: TMB expects L1's 112 at Santa Coloma at 13:14:30, running the Trip into Fondo 15 s late. After
  // a gap of over 2 minutes in its reports, it expects 112 at Fondo at 13:20:00, so 112 runs the next Trip
  // into Fondo, and the Trip into Fondo, still running in, turns Scheduled.
  const received = [intoFondo('13:13:50', ['112', 'tmb:1.139', '13:14:30']), intoFondo('13:16:00', ['112', 'tmb:1.140', '13:20:00'])];
  expect(metro(NEXT_INTO_FONDO, '13:16:10', received)).toMatchObject({ live: true });
  expect(metro(INTO_FONDO, '13:16:10', received)).toMatchObject({ live: false });
  expect(metro(INTO_FONDO, '13:16:10', received)?.dist).toBeLessThan(20055);
});

test('two Trips of one Block that each start where the other ends never wait on each other', () => {
  // Made up: a shuttle between two Stations, whose Block TMB has short of the first before it runs out
  // to the second, and then lists under its way back, naming the second, while the Trip out, 30 s late,
  // is still short of its first Station. Each is then Live, and short of where it starts.
  const [row, a, b] = [(station: string, time: string, dist: number, lon: number): Row => [station, time, time, dist, lon, 41.45], 'tmb:1.901', 'tmb:1.902'];
  const shuttle = bundleOf('2026-09-25', METRO.networks[0] as Network, {
    out: { line: 'metro:L1', headsign: 'B', calls: [row(a, '13:00:00', 0, 2.2), row(b, '13:02:00', 1000, 2.212)] },
    back: { line: 'metro:L1', headsign: 'A', calls: [row(b, '13:03:00', 1000, 2.212), row(a, '13:05:00', 0, 2.2)] },
  });
  const received = [headedFor('B')('12:59:00', ['1', a, '13:00:30']), headedFor('A')('12:59:30', ['1', b, '13:03:00'])];
  expect(() => trainsAt(shuttle, Date.parse('2026-09-25T12:59:40+02:00'), received)).not.toThrow();
});

test("a Live Metro Train at its Trip's first Station stays there until a report has it gone, whichever Station TMB names next, and then leaves without jumping", () => {
  // Made up: L1's 112 waits at Fondo. At 13:16:40 TMB expects it to leave at 13:17:13, as the next Trip
  // out of Fondo is due to. Then it names Santa Coloma, 87 s on by that Trip's timetable: at 13:17:20
  // and 13:18:00 it expects 112 there 100 s later, so still at Fondo, and at 13:18:40 70 s later, so
  // gone since 13:18:23. Each ETA has it leave soon after it was reported: at 13:17:13, 13:17:33 and 13:18:13.
  const received = [
    outOfFondo('13:16:40', ['112', 'tmb:1.140', '13:17:13']),
    outOfFondo('13:17:20', ['112', 'tmb:1.139', '13:19:00']),
    outOfFondo('13:18:00', ['112', 'tmb:1.139', '13:19:40']),
    outOfFondo('13:18:40', ['112', 'tmb:1.139', '13:19:50']),
  ];
  for (const time of ['13:17:19', '13:17:50', '13:18:30', '13:18:39']) expect(metro(NEXT_OUT_OF_FONDO, time, received)).toMatchObject({ live: true, dist: 0 });
  // Held past when the report of 13:18:00 has it leave, it's leaving now, in the follow panel, on the board and nearby.
  const moment = Date.parse('2026-09-25T13:18:30+02:00');
  const panel = followed(NEXT_OUT_OF_FONDO, moment, received, METRO);
  expect(panel).toMatchObject({ standsAt: 'tmb:1.140', speed: 0 });
  expect(panel?.upcoming[0]).toMatchObject({ station: 'tmb:1.140', departure: moment });
  expect(board(['tmb:1.140'], moment, received, METRO)).toMatchObject([{ trip: { id: NEXT_OUT_OF_FONDO }, departure: moment, live: true }]);
  expect(nearbyAt(METRO, moment, by(received, moment), [2.218435, 41.451583], 300, 60 * 60_000).find((p) => p.trip.id === NEXT_OUT_OF_FONDO)).toMatchObject({ at: moment }); // Fondo
  // Leaving 17 s behind the report that has it gone, it catches up, never faster than line speed.
  const dists = Array.from({ length: 41 }, (_, s) => metro(NEXT_OUT_OF_FONDO, '13:18:40', received, s)?.dist ?? NaN);
  expect(dists[0]).toBe(0);
  expect(dists[10]).toBeGreaterThan(0);
  for (let s = 1; s < dists.length; s++) expect((dists[s] ?? NaN) - (dists[s - 1] ?? NaN)).toBeGreaterThanOrEqual(0);
  for (let s = 1; s < dists.length; s++) expect((dists[s] ?? NaN) - (dists[s - 1] ?? NaN)).toBeLessThanOrEqual(80 / 3.6 + 1e-6);
  expect(dists[40]).toBeCloseTo(metro(NEXT_OUT_OF_FONDO, '13:18:40', [], 40 - 70)?.dist ?? NaN, 3);
});

test('a Metro Train held at its first Station eases out however long after it left the report that has it gone comes', () => {
  // Made up: TMB has L1's 112 waiting at Fondo at 13:17:20, as in the test before, then leaves it out
  // of its reports. At 13:19:20 it expects it at Santa Coloma at 13:19:20, so gone since 13:17:53, 87 s
  // before, and at 13:19:40 at Baró de Viver at 13:21:06, as late. It's still well behind by then.
  const received = [
    outOfFondo('13:16:40', ['112', 'tmb:1.140', '13:17:13']),
    outOfFondo('13:17:20', ['112', 'tmb:1.139', '13:19:00']),
    ...['13:18:00', '13:18:40'].map((time) => outOfFondo(time)),
    outOfFondo('13:19:20', ['112', 'tmb:1.139', '13:19:20']),
    outOfFondo('13:19:40', ['112', 'tmb:1.138', '13:21:06']),
  ];
  expect(metro(NEXT_OUT_OF_FONDO, '13:19:19', received)).toMatchObject({ live: true, dist: 0 });
  const dists = Array.from({ length: 61 }, (_, s) => metro(NEXT_OUT_OF_FONDO, '13:19:19', received, s)?.dist ?? NaN);
  expect(dists[60]).toBeGreaterThan(0);
  // Near Fondo while it catches up, it passes there now.
  const moment = Date.parse('2026-09-25T13:19:25+02:00');
  expect(nearbyAt(METRO, moment, by(received, moment), [2.218435, 41.451583], 300, 60 * 60_000).find((p) => p.trip.id === NEXT_OUT_OF_FONDO)).toMatchObject({ at: moment }); // Fondo
  for (let s = 1; s < dists.length; s++) expect((dists[s] ?? NaN) - (dists[s - 1] ?? NaN)).toBeGreaterThanOrEqual(0);
  for (let s = 1; s < dists.length; s++) expect((dists[s] ?? NaN) - (dists[s - 1] ?? NaN)).toBeLessThanOrEqual(80 / 3.6 + 1e-6);
});

test('a Metro Train held at its first Station leaves the map at once where the next snapshot the map gets has its Trip over', () => {
  // Made up: the map, holding 112 at Fondo as at 13:17:20 in the tests before, gets no snapshot until
  // 13:30:00, as while its tab was hidden. By then the Trip out of Fondo, 20 s late, has ended.
  const received = [outOfFondo('13:16:40', ['112', 'tmb:1.140', '13:17:13']), outOfFondo('13:17:20', ['112', 'tmb:1.139', '13:19:00']), outOfFondo('13:30:00')];
  expect(metro(NEXT_OUT_OF_FONDO, '13:30:01', received)).toBeUndefined();
});

test("a Metro Train its timetable has taken out of its first Station, once it has waited there for its Block as long as it waits, isn't run back where live data first places it there", () => {
  // Made up: with no Block running it, the next Trip out of Fondo, due to leave at 13:17:13, waits
  // there until 13:20:13. At 13:20:20 TMB first reports L1's 112, expecting it at Santa Coloma at
  // 13:22:05, 205 s late: still at Fondo.
  const received = [...elsewhere('13:16:00', '13:20:00'), outOfFondo('13:20:20', ['112', 'tmb:1.139', '13:22:05'])];
  const dists = ['13:20:20', '13:20:25', '13:20:30', '13:20:35'].map((time) => metro(NEXT_OUT_OF_FONDO, time, received)?.dist ?? NaN);
  expect(dists[0]).toBeGreaterThan(0);
  for (let i = 1; i < dists.length; i++) expect(dists[i]).toBeGreaterThanOrEqual(dists[i - 1] ?? NaN);
});

test("a Live Metro Train let out of its first Station stays out where a later report has its Block back there, standing where it's drawn until its Delay catches up, and then runs on without jumping", () => {
  // Made up: L1's 112 waits at Fondo. At 13:16:40 TMB expects it to leave at 13:17:13, as the next Trip
  // out of Fondo is due to, and at 13:17:20 at Santa Coloma at 13:18:45, 5 s late, so gone since
  // 13:17:18. Then it expects it there at 13:20:00, 80 s late: at 13:18:00 still at Fondo, and gone
  // from 13:18:33. By 13:18:00 it's drawn 42 s out of Fondo.
  const received = [
    outOfFondo('13:16:40', ['112', 'tmb:1.140', '13:17:13']),
    outOfFondo('13:17:20', ['112', 'tmb:1.139', '13:18:45']),
    ...['13:18:00', '13:18:40', '13:19:20'].map((time) => outOfFondo(time, ['112', 'tmb:1.139', '13:20:00'])),
    outOfFondo('13:20:00', ['112', 'tmb:1.138', '13:21:46']),
  ];
  const dists = Array.from({ length: 191 }, (_, s) => metro(NEXT_OUT_OF_FONDO, '13:17:20', received, s)?.dist ?? NaN);
  // It stands from 13:18:00 until 13:19:15, when it's where its Delay has it.
  expect(dists[40]).toBeGreaterThan(0);
  for (let s = 41; s <= 115; s++) expect(dists[s]).toBe(dists[40]);
  expect(dists[120]).toBeGreaterThan(dists[40] ?? NaN);
  expect(metro(NEXT_OUT_OF_FONDO, '13:18:30', received)).toMatchObject({ live: true });
  for (let s = 1; s < dists.length; s++) expect((dists[s] ?? NaN) - (dists[s - 1] ?? NaN)).toBeGreaterThanOrEqual(0);
  for (let s = 1; s < dists.length; s++) expect((dists[s] ?? NaN) - (dists[s - 1] ?? NaN)).toBeLessThanOrEqual(80 / 3.6 + 1e-6);
  expect(dists[190]).toBeCloseTo(metro(NEXT_OUT_OF_FONDO, '13:20:30', [], -80)?.dist ?? NaN, 3);
});

test("a Scheduled Metro Train waits at its Trip's first Station for its Block, leaving now on its board and nearby, and its Block takes over there", () => {
  // Made up: no Block runs the next Trip out of Fondo, due to leave at 13:17:13, until at 13:18:20 TMB
  // first lists L1's 112 for it, expecting it at Santa Coloma at 13:19:55, 75 s late: still at Fondo.
  // At 13:19:00 it expects 112 there at 13:20:00, so gone since 13:18:33.
  const received = [...elsewhere('13:16:00', '13:18:00'), outOfFondo('13:18:20', ['112', 'tmb:1.139', '13:19:55']), outOfFondo('13:19:00', ['112', 'tmb:1.139', '13:20:00'])];
  for (const time of ['13:17:12', '13:17:40', '13:18:19']) expect(metro(NEXT_OUT_OF_FONDO, time, received)).toMatchObject({ live: false, dist: 0 });
  const moment = Date.parse('2026-09-25T13:17:40+02:00');
  expect(followed(NEXT_OUT_OF_FONDO, moment, received, METRO)).toMatchObject({ standsAt: 'tmb:1.140', speed: 0, upcoming: [{ station: 'tmb:1.140', departure: moment }, {}, {}] });
  expect(board(['tmb:1.140'], moment, received, METRO).find((d) => d.trip.id === NEXT_OUT_OF_FONDO)).toMatchObject({ departure: moment, live: false });
  expect(nearbyAt(METRO, moment, by(received, moment), [2.218435, 41.451583], 300, 60 * 60_000).find((p) => p.trip.id === NEXT_OUT_OF_FONDO)).toMatchObject({ at: moment }); // Fondo
  // Its Block's first report has it there, and it stays there until the next has it gone, when it eases out.
  for (const time of ['13:18:20', '13:18:59']) expect(metro(NEXT_OUT_OF_FONDO, time, received)).toMatchObject({ live: true, dist: 0 });
  const dists = Array.from({ length: 61 }, (_, s) => metro(NEXT_OUT_OF_FONDO, '13:19:00', received, s)?.dist ?? NaN);
  expect(dists[60]).toBeGreaterThan(0);
  for (let s = 1; s < dists.length; s++) expect((dists[s] ?? NaN) - (dists[s - 1] ?? NaN)).toBeGreaterThanOrEqual(0);
  for (let s = 1; s < dists.length; s++) expect((dists[s] ?? NaN) - (dists[s - 1] ?? NaN)).toBeLessThanOrEqual(80 / 3.6 + 1e-6);
});

test("a Scheduled Metro Train whose Block never comes leaves its Trip's first Station 3 minutes after its timetable has it leave, and catches up with its timetable at up to line speed", () => {
  // Made up: no Block ever runs the next Trip out of Fondo, due to leave at 13:17:13 and to reach
  // Baró de Viver, where it ends, at 13:20:26.
  const received = elsewhere('13:16:00', '13:25:00');
  expect(metro(NEXT_OUT_OF_FONDO, '13:20:13', received)).toMatchObject({ live: false, dist: 0 });
  const dists = Array.from({ length: 138 }, (_, s) => metro(NEXT_OUT_OF_FONDO, '13:20:13', received, s)?.dist);
  // It runs faster than its timetable 3 minutes late would have it, and has run in by 13:22:30, when
  // that would have it only past Santa Coloma.
  expect(dists[2]).toBeGreaterThan(0);
  expect(dists[30]).toBeGreaterThan(metro(NEXT_OUT_OF_FONDO, '13:17:43')?.dist ?? NaN);
  expect(dists[137]).toBeUndefined();
  expect(metro(NEXT_OUT_OF_FONDO, '13:19:30')).toBeDefined();
  const drawn = dists.filter((d) => d !== undefined);
  for (let s = 1; s < drawn.length; s++) expect((drawn[s] ?? NaN) - (drawn[s - 1] ?? NaN)).toBeGreaterThanOrEqual(0);
  for (let s = 1; s < drawn.length; s++) expect((drawn[s] ?? NaN) - (drawn[s - 1] ?? NaN)).toBeLessThanOrEqual(80 / 3.6 + 1e-6);
});

test("a Metro Train whose Block's reports stop isn't drawn back as if it had waited for its Block once the snapshots that placed it have gone, among the snapshots the map keeps", () => {
  // Made up: an hour-long L1 Trip, which L1's 112 is at its first Station for at 12:59:40 and has
  // left on time at 13:00:20. Then TMB names only 113, and the snapshots with 112 go at 13:35:20.
  const long = bundleOf('2026-09-25', METRO.networks[0] as Network, {
    long: {
      line: 'metro:L1',
      headsign: 'Hospital de Bellvitge',
      calls: [['tmb:1.901', '13:00:00', '13:00:00', 0, 2, 41.45], ['tmb:1.902', '13:30:00', '13:30:20', 20000, 2.24, 41.45], ['tmb:1.903', '14:00:00', '14:00:00', 40000, 2.48, 41.45]],
    },
  });
  const received = [...['12:59:40', '13:00:20'].map((time) => outOfFondo(time, ['112', 'tmb:1.902', '13:30:00'])), ...elsewhere('13:00:40', '13:37:00')];
  const kept = (moment: number) => received.filter((r) => r.at > moment - KEEP && r.at <= moment);
  const each = Array.from({ length: 151 }, (_, s) => {
    const moment = Date.parse('2026-09-25T13:34:30+02:00') + s * 1000;
    return trainsAt(long, moment, kept(moment)).find((t) => t.trip.id === 'long')?.dist ?? NaN;
  });
  expect(each).toEqual([...each].sort((a, b) => a - b));
});

test("a Scheduled Metro Train on a Line TMB publishes no predictions for, as L9's, runs its timetable, as does every Metro Train while the Metro's live data is unavailable", () => {
  // With TMB's live data working, the Trip out of Fondo, due to leave at 13:12:56, waits there for a
  // Block, but L9's, due to leave Zona Universitària at 13:13:30, has left on time.
  const working = elsewhere('13:12:00', '13:15:00');
  const moment = Date.parse('2026-09-25T13:14:20+02:00');
  const trains = trainsAt(WITH_L9, moment, by(working, moment));
  expect(trains.find((t) => t.trip.id === OUT_OF_FONDO)).toMatchObject({ live: false, dist: 0 });
  expect(trains.find((t) => t.trip.id === 'metro:9.1.1')?.dist).toBeCloseTo(trainsAt(WITH_L9, moment, []).find((t) => t.trip.id === 'metro:9.1.1')?.dist ?? NaN, 3);
  // Made up: from 13:15:20, TMB's data fails to come, and the Metro's live data is unavailable from
  // 13:17:00. The next Trip out of Fondo leaves when its timetable has it leave, at 13:17:13.
  const last = working.at(-1) as Received;
  const failed = [...working, ...Array.from({ length: 9 }, (_, i) => failing(last.at + (i + 1) * 20_000, last, 'metro'))];
  expect(unavailableAt(Date.parse('2026-09-25T13:17:00+02:00'), failed, WITH_L9)).toEqual(['metro']);
  expect(metro(NEXT_OUT_OF_FONDO, '13:17:30', failed)?.dist).toBeCloseTo(metro(NEXT_OUT_OF_FONDO, '13:17:30')?.dist ?? NaN, 3);
  expect(metro(NEXT_OUT_OF_FONDO, '13:17:30')?.dist).toBeGreaterThan(0);
});

test("every Scheduled Metro Train runs its timetable while TMB's feed works but has had none of the Metro's Trains in it for three of its updates, with five or more on the map", () => {
  // Made up: four more of L1's Trips into Fondo, from 2 to 5 minutes after the first, so that at
  // 13:17:30 six of the Metro's Trains are on the map. From 13:15:00, TMB's live data names only
  // L1's 113, which runs none of them, and the Metro's live data is unavailable.
  const bundle = withCopies(METRO, INTO_FONDO, [2, 3, 4, 5]);
  const received = elsewhere('13:15:00', '13:18:00');
  const moment = Date.parse('2026-09-25T13:17:30+02:00');
  expect(unavailableAt(moment, received, bundle)).toEqual(['metro']);
  // The next Trip out of Fondo leaves when its timetable has it leave, at 13:17:13, rather than waiting there for its Block.
  const nextOut = (on: Bundle, got: Received[]) => trainsAt(on, moment, by(got, moment)).find((t) => t.trip.id === NEXT_OUT_OF_FONDO)?.dist;
  expect(nextOut(bundle, received)).toBeCloseTo(nextOut(bundle, []) ?? NaN, 3);
  expect(nextOut(bundle, [])).toBeGreaterThan(0);
  // With two on the map, it waits.
  expect(nextOut(METRO, received)).toBe(0);
});

test('a followed Metro Train whose Block waits at the end of its Line stands at its first Station, expected to leave when TMB expects it to', () => {
  const panel = followed(NEXT_OUT_OF_FONDO, Date.parse('2026-09-25T13:16:30+02:00'), TURNING_112, METRO);
  expect(panel).toMatchObject({ live: true, standsAt: 'tmb:1.140', speed: 0 });
  expect(panel?.upcoming[0]).toMatchObject({ station: 'tmb:1.140', departure: Date.parse('2026-09-25T13:17:13+02:00') });
});

test('a Metro Train whose Block waits at the end of its Line passes near a point there now', () => {
  const moment = Date.parse('2026-09-25T13:16:30+02:00');
  const passes = nearbyAt(METRO, moment, by(TURNING_112, moment), [2.218435, 41.451583], 300, 60 * 60_000); // Fondo
  expect(passes.find((p) => p.trip.id === NEXT_OUT_OF_FONDO)).toMatchObject({ at: moment, live: true });
});

test("a Metro Train gives no Delay, however far its Block runs from its Trip's time, while another Network's Train does", () => {
  // Made up: at 13:47:50 TMB expects L1's 112 at Santa Coloma at 13:48:20, so it runs the last Trip into Fondo 29 minutes 48 late.
  const received = [intoFondo('13:47:50', ['112', 'tmb:1.139', '13:48:20'])];
  const moment = Date.parse('2026-09-25T13:48:00+02:00');
  const panel = followed(NEXT_INTO_FONDO, moment, received, METRO);
  expect(panel).toMatchObject({ live: true });
  expect(panel?.delay).toBeUndefined();
  // It's still expected where TMB expects it, and when.
  expect(panel?.upcoming[0]).toMatchObject({ station: 'tmb:1.139', arrival: Date.parse('2026-09-25T13:48:20+02:00') });
  const departures = board(['tmb:1.139'], moment, received, METRO);
  expect(departures).toMatchObject([{ trip: { id: NEXT_INTO_FONDO }, departure: Date.parse('2026-09-25T13:48:42+02:00'), live: true }]);
  expect(departures[0]?.delay).toBeUndefined();
  const passes = nearbyAt(METRO, moment, received, [2.218435, 41.451583], 300, 60 * 60_000); // Fondo
  expect(passes).toMatchObject([{ trip: { id: NEXT_INTO_FONDO }, live: true }]);
  expect(passes[0]?.delay).toBeUndefined();
  // Nor one on its timetable, with no live data: the Trip into Fondo at 13:13.
  const scheduled = followed(INTO_FONDO, Date.parse('2026-09-25T13:13:00+02:00'), [], METRO);
  expect(scheduled).toMatchObject({ live: false });
  expect(scheduled?.delay).toBeUndefined();
  // The R2S, 10 s late, gives its Delay.
  expect(followed(R2S, at('22:00:05'), [late(R2S, 10, at('22:00:00'))])?.delay).toBe(10);
});

// 45 minutes of production snapshots of all four Networks as the map received them, every 20 s from
// 15:57 to 16:42 on Friday 25 September 2026, and that day's bundle cut to the Trips they could name.
const RECORDED: { bundle: Bundle; received: Received[] } = JSON.parse(gunzipSync(readFileSync(new URL('fixtures/replay-2026-09-25.json.gz', import.meta.url))).toString());

test('folding each snapshot into the last replay draws the Trains as replaying every snapshot kept does, as those over KEEP old go', () => {
  const { bundle, received } = RECORDED;
  // What the map keeps as each snapshot arrives, and every second until the next.
  const kept = received.map((r, i) => received.slice(0, i + 1).filter((k) => k.at > r.at - KEEP));
  // Snapshots received anew each time are replayed from the oldest kept. They're the same snapshots,
  // as on a device, so the Metro's Blocks go on from the Trips they were first matched to.
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
  // Replaying 45 minutes second by second, twice, takes about 5 s here and longer on CI's runners.
}, 60_000);

test("counts each Network's jumps over 45 minutes of live data as the map received it", () => {
  // Per Train-minute, (forward + back) / (liveSeconds / 60): Rodalies 0.075, FGC 0.031, TRAM 0.0023,
  // the Metro 0.0028. They're the baseline the tickets that make Trains jump less, such as #39 and
  // #46, measure against: one that changes how often they jump changes these. The Metro's rose by 11
  // with #105: each is where a Train used to vanish or appear off its Trip's first Station, and now
  // stands at that Station instead. And by one with #108, which keeps the Trip a Block runs into the
  // end of its Line on Live: L2's 208 jumps back into Badalona Pompeu Fabra at 16:41:10, as TMB lists
  // it under its way in again, later, and it jumped there before too, but Scheduled. It fell by 11
  // with #107, which holds a Metro Train at its Trip's first Station until a report has it gone, and
  // then eases it out however far behind: gone are six jumps back there as a later ETA had it wait
  // longer, 135–883 m, and five forward out of it. It fell by six with #125, which keeps a Metro
  // Train out of there once it's out, standing where it's drawn until its Delay catches up, where a
  // later ETA has its Block back there: gone are four jumps back there, 430–713 m, and two back onto
  // a first stretch, five of the six as TMB's ETAs moved later at once at 16:36:25. The 13 left were
  // twelve of L4's then, further along its Line, and L2's 208's at 16:41:10. It rose by one with #146,
  // which keeps a Block from running a Trip it has out of its first Station more than 8 minutes before
  // it's due: at 16:15:29 the L2 Block TMB numbers "???", which ran a Trip due to leave its first Station
  // 10 minutes later, runs one 28 minutes late, whose Train jumps back 11.7 km from where the Block
  // that ran it before left it.
  expect(jumps(RECORDED.bundle, RECORDED.received)).toEqual({
    rodalies: { forward: 66, back: 123, liveSeconds: 152139 },
    fgc: { forward: 25, back: 51, liveSeconds: 148634 },
    tram: { forward: 3, back: 0, liveSeconds: 77809 },
    metro: { forward: 0, back: 14, liveSeconds: 304017 },
  });
}, 60_000);

// 45 minutes of production snapshots as the map received them, every 20 s from 08:20 to 09:05 on
// Monday 28 September 2026, a weekday morning (#100), and that day's bundle cut to the Trips they
// could name. Renfe served its Cercanías feeds with no Trains in them all that time (#124), so the
// replay has no Rodalies Train Live, and TRAM's feed stopped answering at 08:38.
const MORNING: { bundle: Bundle; received: Received[] } = JSON.parse(gunzipSync(readFileSync(new URL('fixtures/replay-2026-09-28.json.gz', import.meta.url))).toString());

test("counts each Network's jumps over 45 minutes of a weekday morning's live data as the map received it", () => {
  // Per Train-minute: FGC 0.040, TRAM none, the Metro 0.0015, against 0.053 before #45. The Metro's
  // fell from 27 with #125, which keeps a Train out of its Trip's first Station once it's out, where TMB
  // has its Block leave later: gone are nine jumps back there, 576–767 m, and nine back onto a first
  // stretch. The nine left come as TMB's data comes again after it went quiet at 08:25 and 08:35.
  expect(jumps(MORNING.bundle, MORNING.received)).toEqual({
    fgc: { forward: 44, back: 86, liveSeconds: 193927 },
    tram: { forward: 0, back: 0, liveSeconds: 35240 },
    metro: { forward: 0, back: 9, liveSeconds: 369373 },
  });
}, 60_000);

test("over both replays, a Network's live data is unavailable only while its feed fails, as each working feed has its Trains in it", () => {
  /** Each time a snapshot arrives that changes which Networks' live data is unavailable, by the clock in Barcelona, and which they are then. */
  const changes = ({ bundle, received }: typeof RECORDED) => {
    let before = '';
    return received.flatMap((r, i) => {
      const now = unavailable(bundle, r.at, received.slice(0, i + 1));
      if (now.join() === before) return [];
      before = now.join();
      return [[new Date(r.at).toLocaleTimeString('en-GB', { timeZone: 'Europe/Madrid' }), now]];
    });
  };
  expect(changes(RECORDED)).toEqual([]);
  // Geotren's positions were stuck from 08:24 to 08:33, and TRAM's API stopped answering at 08:38, as
  // before #124. Monday's bundle has no Rodalies Trips, so Renfe's feeds with none in them change nothing.
  expect(changes(MORNING)).toEqual([['08:31:32', ['fgc']], ['08:33:13', []], ['08:39:37', ['tram']]]);
}, 60_000);

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
const RODALIES: Network = { id: 'rodalies', name: 'Rodalies de Catalunya', profile: PROFILE, runningSide: 'right', colour: '#000' };
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

test("late in the evening, once a Station's last departure has gone, its board lists the next day's first", () => {
  const moment = Date.parse('2026-09-25T23:51:00+02:00');
  expect(boardAt(FRIDAY, moment, [], ['Badalona'])).toEqual([]);
  expect(boardAt(FRIDAY_NIGHT, moment, [], ['Badalona']).map((d) => [d.trip.id, d.departure])).toEqual([
    ['early', onSaturday('00:05:00')],
    ['night', onSaturday('23:50:00')],
  ]);
});

test("near midnight, the next day's Trains passing within the hour are nearby", () => {
  const moment = Date.parse('2026-09-25T23:10:00+02:00');
  const badalona: Point = [2.24892096, 41.4458838];
  // Each arrives at Badalona the profile's 30 seconds before it leaves.
  expect(nearbyAt(FRIDAY_NIGHT, moment, [], badalona, 1500, 60 * 60_000).map((p) => [p.trip.id, p.at + 30_000])).toEqual([
    ['2026-09-25/night', Date.parse('2026-09-25T23:50:00+02:00')],
    ['early', onSaturday('00:05:00')],
  ]);
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
