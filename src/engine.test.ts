import { expect, test } from 'vitest';
import type { Bundle } from './bundle.ts';
import { trainsAt } from './engine.ts';

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

/** A Trip's Train at a moment, if it's on the map. */
const train = (trip: string, moment: number) => trainsAt(BUNDLE, moment).find((t) => t.trip.id === trip);

/** How far along its track a Trip's Train is at a moment, in metres, if it's on the map. */
const where = (trip: string, moment: number) => train(trip, moment)?.dist;

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
function speeds(trip: string, from: string, to: string): number[] {
  const found: number[] = [];
  for (let t = at(from); t < at(to); t += 1000) {
    const [a, b] = [where(trip, t), where(trip, t + 1000)];
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
