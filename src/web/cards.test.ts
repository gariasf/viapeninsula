import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { DEGREE, type Alert, type AlertFeed, type Alerts, type Bundle, type Call, type Line, type Trip } from '../bundle.ts';
import type { Pass } from '../engine.ts';
import { ALERTS_START, readAlerts } from '../fetcher/alerts.ts';
import { ago, boardAsks, boardList, cardAlerts, countdownTo, due, inNameOrder, linesCallingAt, linesOnBoard, linkedTrip, linkedWords, minutesTo, nearbyRows, nextOnItsWay, passedPlace, progress, tripsState, untilTick, whereabouts, type Part } from './cards.ts';

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

test("a followed Train's countdown is in whole seconds from 59 s out, rounded up, and 0 only once its time has come (#456)", () => {
  const to = (ms: number) => countdownTo(NOW + ms, NOW);
  expect(to(59_000)).toEqual({ n: 59, unit: 'seconds' });
  expect(to(40_000)).toEqual({ n: 40, unit: 'seconds' });
  expect(to(1_000)).toEqual({ n: 1, unit: 'seconds' });
  // A part of a second to go is a second, not 0 s: it reads now only when the time has come.
  expect(to(1_001)).toEqual({ n: 2, unit: 'seconds' });
  expect(to(400)).toEqual({ n: 1, unit: 'seconds' });
  expect(to(1)).toEqual({ n: 1, unit: 'seconds' });
  expect(to(0)).toEqual({ n: 0, unit: 'seconds' });
});

test("a followed Train's countdown reads now for a time that is past, as a board's minutes do, though its Train hasn't come (#456)", () => {
  expect(countdownTo(NOW - 1, NOW)).toEqual({ n: 0, unit: 'seconds' });
  expect(countdownTo(NOW - 20_000, NOW)).toEqual({ n: 0, unit: 'seconds' });
  expect(countdownTo(at(8, 10), NOW)).toEqual({ n: 0, unit: 'seconds' });
  expect(minutesTo(NOW - 20_000, NOW)).toBe(0);
});

test("a followed Train's countdown is the minutes a board shows for that time until its last minute, so that the card and a board agree to the minute (#456)", () => {
  expect(countdownTo(NOW + 60_000, NOW)).toEqual({ n: 1, unit: 'minutes' });
  // Shown at 8:15, at 8:12: three minutes by the clock, 2 min 40 s by the Train.
  expect(countdownTo(at(8, 15, 10), NOW)).toEqual({ n: 3, unit: 'minutes' });
  for (const ms of [60_000, 61_000, 95_000, 125_000, 600_000, 3_000_000]) expect(countdownTo(NOW + ms, NOW)).toEqual({ n: minutesTo(NOW + ms, NOW), unit: 'minutes' });
});

test("a time 59 s and a part out within one clock minute is a minute out, not now, though minutesTo() has it as 0 (#456)", () => {
  // 8:12:00.2 to 8:12:59.7: one clock minute, which a board reads as 0 min.
  const [from, due] = [at(8, 12, 0) + 200, at(8, 12, 59) + 700];
  expect(minutesTo(due, from)).toBe(0);
  expect(countdownTo(due, from)).toEqual({ n: 1, unit: 'minutes' });
  expect(countdownTo(due, from + 1_000)).toEqual({ n: 59, unit: 'seconds' });
});

test('counted every second, a countdown takes each number from 59 to 1 once and then reads now, whichever part of a second the time to go has (#456)', () => {
  const due = at(8, 14, 10);
  for (const part of [0, 1, 250, 500, 999]) {
    // 80 s and a part out, then every second to 10 s past it.
    const reads = Array.from({ length: 91 }, (_, i) => countdownTo(due, due - 80_000 - part + i * 1_000));
    expect(reads.filter((r) => r.unit === 'seconds' && r.n > 0).map((r) => r.n)).toEqual(Array.from({ length: 59 }, (_, i) => 59 - i));
    // Minutes before, now after, in order.
    expect(reads.map((r) => (r.unit === 'minutes' ? 'm' : r.n ? 's' : 'now')).join('').replace(/m+s+(now)+/, 'ok')).toBe('ok');
  }
});

test("a countdown in seconds changes as a second of it ends, so that a card refreshed then shows each number once, where a fixed second late each time skips one (#456)", () => {
  expect(untilTick(NOW + 40_300, NOW)).toBe(300);
  expect(untilTick(NOW + 40_000, NOW)).toBe(1_000);
  expect(untilTick(NOW + 1, NOW)).toBe(1);
  // Counted every second, as the card is refreshed, a frame (17 ms) late each time.
  const due = at(8, 14, 10) + 123;
  const shown = (step: (now: number) => number) => {
    const seen: number[] = [];
    for (let now = due - 70_000; now < due; now += step(now)) {
      const read = countdownTo(due, now);
      if (read.unit === 'seconds' && read.n > 0) seen.push(read.n);
    }
    return seen;
  };
  const all = Array.from({ length: 59 }, (_, i) => 59 - i);
  expect(shown((now) => untilTick(due, now) + 17)).toEqual(all);
  expect(shown(() => 1_017)).toHaveLength(58);
});

test("a countdown that reads now has no second to end, so its card is refreshed as any is, every second, not every frame (#456)", () => {
  expect(untilTick(NOW, NOW)).toBe(1_000);
  expect(untilTick(NOW - 3_000, NOW)).toBe(1_000);
  // A Train held at a Station is expected exactly now, which float arithmetic on a time in ms since 1970 can make a step of its precision (2^-12 ms) either side.
  expect(untilTick(NOW + 2 ** -12, NOW)).toBe(1_000);
  expect(untilTick(NOW - 2 ** -12, NOW)).toBe(1_000);
  expect(countdownTo(NOW + 2 ** -12, NOW)).toEqual({ n: 0, unit: 'seconds' });
  expect(countdownTo(NOW + 0.4, NOW)).toEqual({ n: 0, unit: 'seconds' });
});

test("a followed Train is expected at the Station it comes to when it arrives there, and at the one it stands at when it leaves, with a countdown to either (#607)", () => {
  const call = { arrival: at(8, 14), departure: at(8, 14, 30) };
  expect(due(call, false, false)).toEqual({ at: at(8, 14), countdown: true });
  expect(due(call, true, false)).toEqual({ at: at(8, 14, 30), countdown: true });
  expect(due(call, false, true)).toEqual({ at: at(8, 14), countdown: true });
});

test("a followed Train standing at its Trip's last Station is expected there when it arrived, with no countdown: it doesn't leave there, and the dwell the engine makes up isn't a time it goes at (#607)", () => {
  const call = { arrival: at(8, 14), departure: at(8, 14, 30) };
  expect(due(call, true, true)).toEqual({ at: at(8, 14), countdown: false });
});

test("a followed Train held at the Station it stands at has no countdown to when it leaves, a time its operator keeps moving or that has come already: it waits there until a report has it move (#689)", () => {
  const call = { arrival: at(8, 14), departure: at(8, 14, 30) };
  expect(due(call, true, false, true)).toMatchObject({ countdown: false });
  expect(due(call, true, false, false)).toEqual({ at: at(8, 14, 30), countdown: true });
});

test("how long ago live data placed a Train is to the second under a minute and to the minute after, each number joined to its unit by a no-break space so that a line never ends between them (#612)", () => {
  expect(ago(0)).toBe('0\u00A0s');
  expect(ago(12_400)).toBe('12\u00A0s');
  expect(ago(59_000)).toBe('59\u00A0s');
  expect(ago(60_000)).toBe('1\u00A0min');
  expect(ago(150_000)).toBe('3\u00A0min');
  // A clock that's a little off can have it placed after it arrived: not a negative number.
  expect(ago(-4_000)).toBe('0\u00A0s');
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

test("a board's list is its label alone while the day's Trips are on their way, and that none can be had once they've come with none left or have failed to come (#379)", () => {
  // A page opened on a Station's link shows its board before the Trips come, which can be seconds: none to come isn't known yet.
  expect(boardList('coming', 0)).toBe('label');
  // Once they've come, a Station with none left says so, and one with some lists them, down to its last.
  expect(boardList('came', 0)).toBe('none');
  expect(boardList('came', 1)).toBe('rows');
  expect(boardList('came', 4)).toBe('rows');
  // Where they fail to come, as the map looks again each minute, a board ends in what it says where none can be had, not in its label for good.
  expect(boardList('failed', 0)).toBe('none');
});

test("a board with none left today is its label alone while the next day's Trips, which it asked for, are on their way, then their rows, or that none can be had where they fail (#596)", () => {
  // Asked for tomorrow's Trips at 22:30, with the map looking for them: the bundle has only today's, which has none left.
  expect(boardList('came', 0, true)).toBe('label');
  // Their rows once they have come, which the look for them is no more of.
  expect(boardList('came', 3, false)).toBe('rows');
  // Where they failed to come, the look had a file fail, and none can be had; the map's look again each minute doesn't take the board back to its label.
  expect(boardList('failed', 0, true)).toBe('none');
  expect(boardList('failed', 0, false)).toBe('none');
  // With the next day not on its way, none.
  expect(boardList('came', 0, false)).toBe('none');
  // A board whose Trips are still on their way is its label alone, with the next day asked for or not.
  expect(boardList('coming', 0, true)).toBe('label');
  // A board with some left lists them while the next day's come, as it did.
  expect(boardList('came', 1, true)).toBe('rows');
});

test("a board with none left asks for the next day's Trips once its own regions' have come, once a day, and not while they're on their way or where they failed (#597, #657)", () => {
  // Its own regions' Trips have come: the next day's, and not again the same day.
  expect(boardAsks(true, false)).toBe(true);
  expect(boardAsks(true, true)).toBe(false);
  // Its own still on their way, or failed, which the map looks for again soon itself: it has none because they haven't come.
  expect(boardAsks(false, false)).toBe(false);
});

test("the next day's Trips that a board asked for are on their way while the map is looking and the last day of its bundle isn't past today (#596)", () => {
  expect(nextOnItsWay(true, true, '2026-10-11', '2026-10-11')).toBe(true);
  // A bundle left from the day before, as a tab hidden overnight has until the new day's have come, is behind today.
  expect(nextOnItsWay(true, true, '2026-10-10', '2026-10-11')).toBe(true);
  // Without a bundle there's no last day, and today stands for it.
  expect(nextOnItsWay(true, true, undefined, '2026-10-11')).toBe(true);
  // On the map once its last day is the day after today: a board with none even then says so, and not its label for each look.
  expect(nextOnItsWay(true, true, '2026-10-12', '2026-10-11')).toBe(false);
  // Not once the look is over, nor for a board that hasn't asked today.
  expect(nextOnItsWay(false, true, '2026-10-11', '2026-10-11')).toBe(false);
  expect(nextOnItsWay(true, false, '2026-10-11', '2026-10-11')).toBe(false);
});

test("a board's Trips are on their way while a region the map has loaded hasn't come, though another's have, and failed where the last look had a file fail (#379)", () => {
  // The page's first look: none has come.
  expect(tripsState(['catalonia'], ['catalonia'], new Set(), false)).toBe('coming');
  // Catalonia's have come, and the map has since loaded Madrid's, whose track is drawn and whose Trips aren't in: the bundle has only Catalonia's.
  const both = ['catalonia', 'cercanias-madrid'];
  expect(tripsState(both, both, new Set(['catalonia']), false)).toBe('coming');
  expect(tripsState(both, both, new Set(both), false)).toBe('came');
  // A look that had a file fail leaves it to the next, a minute on: a board says that none can be had meanwhile.
  expect(tripsState(both, both, new Set(['catalonia']), true)).toBe('failed');
});

test("a board's Trips are on their way while a region the map needs isn't loaded yet, as long distance's isn't until the map's second look, though those it has loaded have come (#739)", () => {
  // Vic's board by its link at 22:30, with none left today: Catalonia's Trips have come at the map's first look, and long distance's, which every view needs, come at its second (#262).
  expect(tripsState(['catalonia'], ['catalonia', 'long-distance'], new Set(['catalonia']), false)).toBe('coming');
  // Once the second look has brought them.
  expect(tripsState(['catalonia', 'long-distance'], ['catalonia', 'long-distance'], new Set(['catalonia', 'long-distance']), false)).toBe('came');
  // A region loaded and no longer needed, as Madrid's once the view is back at Barcelona, is still waited for: a board opened at Atocha by a tap has it as its own.
  expect(tripsState(['catalonia', 'cercanias-madrid'], ['catalonia'], new Set(['catalonia']), false)).toBe('coming');
  // Madrid's, needed as it comes into view after a look that lost today's files, isn't loaded until the next: none can be had meanwhile, as where a region loaded hasn't come, not its label for good.
  expect(tripsState(['catalonia'], ['catalonia', 'cercanias-madrid'], new Set(['catalonia']), true)).toBe('failed');
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

/** A Trip A (0 m), B (2,000 m) and C (4,000 m) with 100 s legs: the same as cardVsMap.test.ts's. */
const ABC: Call[] = [
  { station: 'a', arrival: 0, departure: 30, dist: 0 },
  { station: 'b', arrival: 130, departure: 160, dist: 2000 },
  { station: 'c', arrival: 260, departure: 260, dist: 4000 },
];
const [A, B, C] = ABC as [Call, Call, Call];

test("a Train is arriving at the Station it comes to within its pill's reach of it, leaving the one it left within as far after it, and between them otherwise", () => {
  // Past A, with B and C still to leave, and a pill reaching 100 m either side of it.
  const says = (dist: number) => whereabouts(ABC, dist, 2, false, 100);
  expect(says(1000)).toEqual({ at: 'between', last: A, next: B });
  expect(says(1900)).toEqual({ at: 'arriving', next: B });
  expect(says(1999)).toEqual({ at: 'arriving', next: B });
  expect(says(100)).toEqual({ at: 'leaving', last: A, next: B });
  expect(says(1)).toEqual({ at: 'leaving', last: A, next: B });
});

test('a Train standing at a Station is at it, whatever else is near, as at its first with the next Station 40 m on', () => {
  expect(whereabouts(ABC, 2000, 2, true, 100)).toEqual({ at: 'standing', next: B });
  expect(whereabouts(ABC, 0, 3, true, 100)).toEqual({ at: 'standing', next: A });
  const close = [A, { ...B, dist: 40 }, C];
  expect(whereabouts(close, 0, 3, true, 100)).toEqual({ at: 'standing', next: A });
});

test("on a leg shorter than twice the pill's reach it's arriving where it's within reach of both Stations, and leaving only for as long as the next is out of reach", () => {
  // A leg of 150 m and a pill reaching 130 m: B is within reach from 20 m out of A.
  const short = [A, { ...B, dist: 150 }];
  expect(whereabouts(short, 10, 1, false, 130)).toMatchObject({ at: 'leaving' });
  expect(whereabouts(short, 20, 1, false, 130)).toMatchObject({ at: 'arriving' });
  expect(whereabouts(short, 75, 1, false, 130)).toMatchObject({ at: 'arriving' });
});

test("at its Trip's last Station it arrives there and then stands there, and having left it has none to say", () => {
  expect(whereabouts(ABC, 3950, 1, false, 100)).toEqual({ at: 'arriving', next: C });
  expect(whereabouts(ABC, 4000, 1, true, 100)).toEqual({ at: 'standing', next: C });
  expect(whereabouts(ABC, 4000, 0, false, 100)).toBeUndefined();
  // Between B and C, having left B.
  expect(whereabouts(ABC, 3000, 1, false, 100)).toEqual({ at: 'between', last: B, next: C });
});

test("a Train with no Station before it is on its way to its first, and one on a Trip that runs back along its track is by its way along it, as progress() has it", () => {
  expect(whereabouts(ABC, 10, 3, false, 100)).toEqual({ at: 'arriving', next: A });
  // However far short of it it's drawn, as it has no Station it has left to be leaving or between.
  expect(whereabouts(ABC, 500, 3, false, 100)).toEqual({ at: 'arriving', next: A });
  // Out 4 km and back to 2.5 km, 1 km into its way back, 500 m short of its last Station and 1 km past the one it left.
  const back = [A, { ...B, dist: 4000 }, { ...C, dist: 2500 }];
  expect(whereabouts(back, 3000, 1, false, 400)).toMatchObject({ at: 'between', last: back[1], next: back[2] });
  expect(whereabouts(back, 3000, 1, false, 500)).toMatchObject({ at: 'arriving', next: back[2] });
  expect(whereabouts(back, 3600, 1, false, 400)).toMatchObject({ at: 'leaving', last: back[1] });
});

test('a pill that reaches nothing makes a Train arriving only where it is drawn at the Station', () => {
  expect(whereabouts(ABC, 1999.5, 2, false, 0)).toMatchObject({ at: 'between' });
  expect(whereabouts(ABC, 2000, 2, false, 0)).toMatchObject({ at: 'arriving' });
});

test("a Train is arriving at or leaving a Station too where it's drawn within its pill's reach of the dot its place is shown by, which is the middle of an interchange's Stations, not where its own Line stops (#455)", () => {
  // The pill reaches 120 m. How far it's drawn from A's place's dot and B's, where no dot is known: none; the dots are not far from the platforms.
  const says = (dist: number, a = Infinity, b = Infinity) => whereabouts(ABC, dist, 2, false, 120, (call) => ({ away: call.station === 'a' ? a : call.station === 'b' ? b : Infinity, offset: 0 }));
  // Drawn 1,650 m along, it's 350 m short of B's platform: B's place is shown 100 m ahead of it.
  expect(says(1650)).toEqual({ at: 'between', last: A, next: B });
  expect(says(1650, undefined, 100)).toEqual({ at: 'arriving', next: B });
  // 300 m past A's platform, with A's place shown 100 m behind it.
  expect(says(300)).toEqual({ at: 'between', last: A, next: B });
  expect(says(300, 100)).toEqual({ at: 'leaving', last: A, next: B });
  // Out of reach of both dots as of both platforms.
  expect(says(1000, 1000, 1000)).toEqual({ at: 'between', last: A, next: B });
});

test('a Station no place on the map shows has no dot to go by, only where its platform is along the Trip', () => {
  expect(whereabouts(ABC, 1950, 2, false, 100, () => ({ away: Infinity, offset: 0 }))).toEqual({ at: 'arriving', next: B });
  expect(whereabouts(ABC, 1000, 2, false, 100, () => ({ away: Infinity, offset: 0 }))).toEqual({ at: 'between', last: A, next: B });
});

test("a Train stays arriving, or leaving, across the stretch between a dot and its platform where they're more than two reaches apart, as Passeig de Gràcia's L3 Station is 204 m from its place's dot (#609)", () => {
  // The pill reaches 73 m, as a Metro badge's does at zoom 13. B's dot is 204 m before its platform, along the way in.
  const arriving = (dist: number) => whereabouts(ABC, dist, 2, false, 73, (call) => (call.station === 'b' ? { away: Math.abs(1796 - dist), offset: 204 } : { away: Infinity, offset: 0 }));
  // From 73 m short of the dot to 73 m short of the platform, and at it, by one rule: no stretch of between in the middle.
  for (const dist of [1723, 1750, 1796, 1850, 1900, 1927, 1960]) expect(arriving(dist)).toEqual({ at: 'arriving', next: B });
  expect(arriving(1700)).toEqual({ at: 'between', last: A, next: B });
  // And leaving, where the dot is 204 m past the platform along the way out.
  const leaving = (dist: number) => whereabouts(ABC, dist, 2, false, 73, (call) => (call.station === 'a' ? { away: Math.abs(204 - dist), offset: 204 } : { away: Infinity, offset: 0 }));
  for (const dist of [30, 73, 120, 204, 270]) expect(leaving(dist)).toEqual({ at: 'leaving', last: A, next: B });
  expect(leaving(400)).toEqual({ at: 'between', last: A, next: B });
  // A dot past the platform, in the way in, is not an earlier arrival: the platform's reach is the pill's.
  const dotAhead = (dist: number) => whereabouts(ABC, dist, 2, false, 73, (call) => (call.station === 'b' ? { away: Math.abs(2204 - dist), offset: 204 } : { away: Infinity, offset: 0 }));
  expect(dotAhead(1900)).toEqual({ at: 'between', last: A, next: B });
  expect(dotAhead(1930)).toEqual({ at: 'arriving', next: B });
  // The track needn't run along the line between them: 100 m short of the platform and 200 m from the dot, which is 100 m off it, is still the stretch, as 100 and 260 m are not, by the two reaches' slack.
  const beside = (away: number) => whereabouts(ABC, 1900, 2, false, 73, (call) => (call.station === 'b' ? { away, offset: 204 } : { away: Infinity, offset: 0 }));
  expect(beside(200)).toEqual({ at: 'arriving', next: B });
  expect(beside(260)).toEqual({ at: 'between', last: A, next: B });
});

/** The Network the Train in these tests runs for, and whose Trains stop at the places the map shows unless they say. */
const NET = 'rodalies';
/** A place the map shows `metres` due north of where a Train is drawn, at 2° E and 41° N, named by its ID, with its Stations' IDs, which are its own where none is given, and `NET`'s Trains stopping there. */
const north = (id: string, metres: number, ...stations: string[]) => ({ id, name: id, stations: stations.length ? stations : [id], networks: [NET], lon: 2, lat: 41 + metres / DEGREE });
const HERE = { lon: 2, lat: 41 };
/** The Stations a Trip calls at, as passedPlace() has them: by ID, and by the name they're shown with, which is their ID's here. */
const calledAt = (...stations: string[]) => stations.map((station) => ({ station, name: station }));

test("a Train between its Stations is passing the place it's drawn nearest, within its pill's reach of its dot, where it has no call, and arriving at a Station or leaving one says that first (#457)", () => {
  const X = north('x', 60);
  const passing = (dist: number, away: number, toLeave = 2, standing = false) => whereabouts(ABC, dist, toLeave, standing, 100, undefined, { place: X, away });
  expect(passing(1000, 60)).toEqual({ at: 'passing', last: A, next: B, place: X });
  expect(passing(1000, 100)).toEqual({ at: 'passing', last: A, next: B, place: X });
  expect(passing(1000, 101)).toEqual({ at: 'between', last: A, next: B });
  // Within reach of B, which it has still to leave, or of A, which it has left: the card names them, as it did.
  expect(passing(1950, 20)).toEqual({ at: 'arriving', next: B });
  expect(passing(50, 20)).toEqual({ at: 'leaving', last: A, next: B });
  // And at B, where it stands.
  expect(passing(2000, 20, 2, true)).toEqual({ at: 'standing', next: B });
});

test("a Train with no place it passes says what it said before, and one with no Station left to leave says nothing (#457)", () => {
  expect(whereabouts(ABC, 1000, 2, false, 100, undefined, undefined)).toEqual({ at: 'between', last: A, next: B });
  expect(whereabouts(ABC, 4000, 0, false, 100, undefined, { place: north('x', 10), away: 10 })).toBeUndefined();
  // On its way to its first Station, which it has none before, it's arriving at it, whatever it's passing.
  expect(whereabouts(ABC, 500, 3, false, 100, undefined, { place: north('x', 10), away: 10 })).toEqual({ at: 'arriving', next: A });
});

test("of the places a Train is drawn near, it passes the nearest that its Trip has no call at, which is within its pill's reach of it, and says how far (#457)", () => {
  const places = [north('far', 90), north('x', 60), north('y', 80), north('behind', 70)];
  const hit = passedPlace(places, HERE, [], 100, NET);
  expect(hit?.place.id).toBe('x');
  expect(hit?.away).toBeCloseTo(60, 3);
  // The reach is how far its dot is from the Train, on any side: due west as due north, in metres, not in degrees of longitude.
  const west = (metres: number) => ({ ...north('west', 0), lon: 2 - metres / (DEGREE * Math.cos((41 * Math.PI) / 180)) });
  expect(passedPlace(places, HERE, [], 59, NET)).toBeUndefined();
  expect(passedPlace([west(50)], HERE, [], 60, NET)?.away).toBeCloseTo(50, 3);
  expect(passedPlace([west(70)], HERE, [], 60, NET)).toBeUndefined();
});

test("a place one of whose Stations its Trip calls at is not passed, as a metro place of several Lines isn't where it calls at one of them, and one it calls at none of is (#457)", () => {
  // Passeig de Gràcia's three Stations, one for each Line (ADR-0005), as the Metro's one place.
  const place = { ...north('tmb:P.6660327', 40, 'tmb:1.325', 'tmb:1.327', 'tmb:1.328'), networks: ['metro'] };
  expect(passedPlace([place], HERE, calledAt('tmb:1.327', 'tmb:1.300'), 100, 'metro')).toBeUndefined();
  expect(passedPlace([place], HERE, calledAt('tmb:1.300'), 100, 'metro')?.place.id).toBe('tmb:P.6660327');
});

test("a place of its own Network shown with the name of one of the Trip's calls is not passed, which to the viewer is the same Station, and one shown otherwise is (#457)", () => {
  // Two places of the TRAM the map shows apart, with one name: made up, as no Network has two on 10 Oct's track.
  const twin = { ...north('tram:ST-300', 50), name: 'Glòries', networks: ['tram'] };
  const called = [{ station: 'tram:ST-206', name: 'Glòries' }, { station: 'tram:ST-207', name: 'Ca l’Aranyó' }];
  expect(passedPlace([twin], HERE, called, 100, 'tram')).toBeUndefined();
  // Another name there is passed, and the name is the exact one it's shown with.
  expect(passedPlace([{ ...twin, name: 'Glòries (nord)' }], HERE, called, 100, 'tram')?.place.id).toBe('tram:ST-300');
  expect(passedPlace([twin], HERE, [{ station: 'tram:ST-207', name: 'Ca l’Aranyó' }], 100, 'tram')?.place.id).toBe('tram:ST-300');
});

test("of the places the pill is on, only its own Network's are passed, a metro station nearer than the railway station beside it not being one to a Rodalies Train, and a track that names no Networks passes none (#457)", () => {
  const places = [{ ...north('tmb:P.6660117', 20), networks: ['metro'] }, { ...north('adif:72303', 30), networks: ['rodalies'] }];
  expect(passedPlace(places, HERE, calledAt('adif:70000'), 100, 'rodalies')?.place.id).toBe('adif:72303');
  expect(passedPlace(places, HERE, calledAt('adif:70000'), 100, 'metro')?.place.id).toBe('tmb:P.6660117');
  expect(passedPlace(places, HERE, calledAt('adif:70000'), 100, 'fgc')).toBeUndefined();
  // A place several Networks' Trains stop at, as Martorell Central is, is each one's, whichever comes first.
  const shared = { ...north('adif:79009', 10), networks: ['fgc', 'rodalies'] };
  expect(passedPlace([shared], HERE, [], 100, 'rodalies')?.place.id).toBe('adif:79009');
  expect(passedPlace([shared], HERE, [], 100, 'fgc')?.place.id).toBe('adif:79009');
  // A track built before #243 names no place's Networks.
  expect(passedPlace([{ ...north('x', 10), networks: [] }], HERE, [], 100, 'rodalies')).toBeUndefined();
});

/** A Trip on a Line, calling at these Stations. */
const trip = (line: string, ...stations: string[]): Trip => ({ id: `${line} ${stations.join()}`, line, shape: line, headsign: '', calls: stations.map((station, i) => ({ station, arrival: 60 * i, departure: 60 * i, dist: 1000 * i })) });

test("a board's Lines are those whose Trips call at any of its place's Stations, in the order of the Lines it's given", () => {
  // Sants, Rodalies' and the Metro's Stations, from their Trips.
  const trips = [trip('R2', 'adif:71801', 'adif:71802'), trip('L3', 'tmb:1.326'), trip('R1', 'adif:79400', 'adif:71801'), trip('R4', 'adif:78805'), trip('R2', 'adif:72305', 'adif:71801')];
  expect(linesCallingAt(trips, ['adif:71801', 'tmb:1.326'], ['R1', 'R2', 'R4', 'L3'])).toEqual(['R1', 'R2', 'L3']);
});

/**
 * 25 Sep 2026's recording, whose bundle lists the Lines as their timetables do: Rodalies' R1, R2N, R2S,
 * R2, R3, R4, R8, R7, RL4, R11 …, TRAM's T2, T3, T1 …, and has real Trips of T1, T2 and T3 at Montesa.
 */
const RECORDED: { bundle: Bundle } = JSON.parse(gunzipSync(readFileSync(new URL('../fixtures/replay-2026-09-25.json.gz', import.meta.url))).toString());

/** A Network's Lines' names, in the order they come. */
const namesIn = (lines: Pick<Line, 'network' | 'name'>[], network: string) => lines.filter((l) => l.network === network).map((l) => l.name);

test("a Network's Lines are named in the order of their names, digits as numbers, not as its timetable lists them (#399)", () => {
  const { lines } = RECORDED.bundle;
  // As the timetables list them.
  expect(namesIn(lines, 'tram')).toEqual(['T2', 'T3', 'T1', 'T4', 'T5', 'T6']);
  expect(namesIn(lines, 'rodalies').slice(0, 10)).toEqual(['R1', 'R2N', 'R2S', 'R2', 'R3', 'R4', 'R8', 'R7', 'RL4', 'R11']);
  const named = inNameOrder(lines);
  expect(namesIn(named, 'tram')).toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'T6']);
  // R2 before R2N and R2S, R11 after R8, and RL4 after R11 and R16.
  expect(namesIn(named, 'rodalies')).toEqual(['R1', 'R2', 'R2N', 'R2S', 'R3', 'R4', 'R7', 'R8', 'R11', 'R13', 'R14', 'R15', 'R16', 'RG1', 'RL4']);
  expect(namesIn(named, 'fgc')).toEqual(['L6', 'L7', 'L8', 'L12', 'R5', 'R6', 'RL2', 'S1', 'S2', 'S3', 'S4', 'S8']);
  expect(namesIn(named, 'metro')).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L11']);
});

test("Networks stay in the order the track lists them, each one's Lines together, and the track's own order is left alone", () => {
  // With a Line only a later day has, which the days joined put last (joinDays()): made up, as R17 is on 10 Oct.
  const lines = [...RECORDED.bundle.lines, { id: 'rodalies:R17', network: 'rodalies', name: 'R17' }];
  const [before, named] = [lines.map((l) => l.id), inNameOrder(lines)];
  expect(named).toHaveLength(lines.length);
  // Each Network starts one run of Lines, none of its Lines among another's.
  expect(named.flatMap((l, i) => (l.network === named[i - 1]?.network ? [] : [l.network]))).toEqual(['rodalies', 'fgc', 'tram', 'metro']);
  expect(namesIn(named, 'rodalies').slice(-4)).toEqual(['R16', 'R17', 'RG1', 'RL4']);
  expect(lines.map((l) => l.id)).toEqual(before);
});

test("digits count as numbers, and a letter after them sorts after that number and before the next: C4, C4a, C4b, C5 … C8b, C10", () => {
  // Cercanías Madrid's Lines, as 10 Oct 2026's track lists them.
  const madrid = ['C1', 'C10', 'C2', 'C3', 'C4', 'C4a', 'C4b', 'C5', 'C8a', 'C7', 'C8b'].map((name) => ({ network: 'cercanias-madrid', name }));
  expect(inNameOrder(madrid).map((l) => l.name)).toEqual(['C1', 'C2', 'C3', 'C4', 'C4a', 'C4b', 'C5', 'C7', 'C8a', 'C8b', 'C10']);
});

test("a board at Montesa names T1, T2 and T3 in that order, though TRAM's timetable lists them T2, T3, T1 (#399)", () => {
  const { lines, trips } = RECORDED.bundle;
  // tram:ST-188, as 10 Oct's track names Montesa: this recording's bundle has no Stations, but its Trips call at it.
  const montesa = ['tram:ST-188'];
  // Given the track's order, a board names them as it has them.
  expect(linesCallingAt(trips, montesa, lines.map((l) => l.id))).toEqual(['tram:T2', 'tram:T3', 'tram:T1']);
  expect(linesCallingAt(trips, montesa, inNameOrder(lines).map((l) => l.id))).toEqual(['tram:T1', 'tram:T2', 'tram:T3']);
});

/**
 * alerts.json at 8:12 on 7 Oct 2026, cut down: Renfe's Alerts on R3, R2, and R1, R2 and R4 together,
 * read at 8:11, and TRAM's on T1–T3, read at 8:10, each feed's newest first; and one made up, on a
 * lift at Barcelona-Sants, by its Station.
 */
const ALERTS: Alerts = {
  renfe: {
    read: at(8, 11, 40),
    status: 'ok',
    alerts: [
      {
        id: 'AVISO_518337',
        lines: ['rodalies:R3'],
        stations: [],
        from: at(7, 23),
        description: [
          { language: 'es', text: 'Circulación ferroviaria entre La Garriga - Puigcerdà/La Tor de Querol con afectaciones.' },
          { language: 'ca', text: 'Circulació ferroviària entre la Garriga i Puigcerdà/La Tor de Querol amb afectacions.' },
        ],
      },
      {
        id: 'AVISO_518352',
        lines: ['rodalies:R2'],
        stations: [],
        from: at(7, 2),
        description: [
          { language: 'es', text: 'Sin servicio ferroviario.' },
          { language: 'ca', text: 'Sense servei ferroviari.' },
        ],
      },
      { id: 'INFO_SANTS', lines: [], stations: ['adif:71801'], from: at(6, 50), description: [{ language: 'es', text: 'Ascensor de la vía 5 fuera de servicio.' }] },
      {
        id: 'AVISO_518298',
        lines: ['rodalies:R1', 'rodalies:R2', 'rodalies:R4'],
        stations: [],
        from: at(5, 42),
        description: [
          { language: 'es', text: 'Por causas ajenas a Rodalies no se puede garantizar la prestación del servicio.' },
          { language: 'ca', text: 'Per causes alienes a Rodalies no es pot garantir la prestació del servei.' },
        ],
      },
    ],
  },
  tram: {
    read: at(8, 10, 5),
    status: 'ok',
    alerts: [
      {
        id: 'sc-287',
        lines: ['tram:T3', 'tram:T1', 'tram:T2'],
        stations: [],
        from: at(7, 0),
        to: at(23, 0),
        effect: 'MODIFIED_SERVICE',
        header: [
          { language: 'ca', text: 'Afectació T1, T2 i T3' },
          { language: 'es', text: 'Afectación T1, T2 y T3' },
          { language: 'en', text: 'T1, T2 and T3 affected' },
        ],
        description: [
          { language: 'ca', text: 'Sense servei entre Francesc Macià i Montesa.' },
          { language: 'es', text: 'Sin servicio entre Francesc Macià y Montesa.' },
          { language: 'en', text: 'No service between Francesc Macià and Montesa.' },
        ],
      },
    ],
  },
};

test("a followed Train's card has its Line's Alerts, and a board those naming its place's Stations and those of the Lines that call there", () => {
  expect(cardAlerts(ALERTS, { lines: ['rodalies:R2'], stations: [] }, 'en', NOW).alerts.map((a) => a.id)).toEqual(['AVISO_518352', 'AVISO_518298']);
  expect(cardAlerts(ALERTS, { lines: ['tram:T1'], stations: [] }, 'en', NOW).alerts.map((a) => a.id)).toEqual(['sc-287']);
  // Sants, where R2 and R4 call: an Alert on both of them shows once.
  expect(cardAlerts(ALERTS, { lines: ['rodalies:R2', 'rodalies:R4'], stations: ['adif:71801', 'tmb:1.326'] }, 'en', NOW).alerts.map((a) => a.id)).toEqual(['AVISO_518352', 'INFO_SANTS', 'AVISO_518298']);
  expect(cardAlerts(ALERTS, { lines: ['rodalies:R8'], stations: ['adif:79400'] }, 'en', NOW).alerts).toEqual([]);
});

test("a board names the Lines of its place's timetable, whether or not a Trip of them calls that day, with or without an Alert, in the order of the Lines it's given (#529)", () => {
  // Made up, as San Sebastián's on 10 Oct: no Trip calls at Martutene that day, and its Lines' timetable does.
  const order = ['rodalies:R1', 'rodalies:R2', 'rodalies:R4', 'tram:T1'];
  const martutene = { stations: ['adif:11509'], lines: ['rodalies:R2', 'rodalies:R1'] };
  // Those two, in the order's and not the timetable's, and not R4 or T1, which its timetable doesn't have there: no Line is made up.
  expect(linesOnBoard([], martutene, order)).toEqual(['rodalies:R1', 'rodalies:R2']);
  // With no Alert on either, which #392 named none for, as Santander's 11 Stations have none: C1 and C2, on two gauges.
  const santander = { stations: ['adif:14100'], lines: ['cercanias-santander:C2', 'cercanias-santander:C1'] };
  expect(linesOnBoard([], santander, ['cercanias-santander:C1', 'cercanias-santander:C2'])).toEqual(['cercanias-santander:C1', 'cercanias-santander:C2']);
  // Those that call and those of the timetable, each once, in the order's.
  expect(linesOnBoard([trip('rodalies:R4', 'adif:11509')], { stations: ['adif:11509'], lines: ['rodalies:R2', 'tram:T1'] }, order)).toEqual(['rodalies:R2', 'rodalies:R4', 'tram:T1']);
  // A Line that calls is named whatever the timetable says of it, as a track that names no Lines gives those that call, as before.
  expect(linesOnBoard([trip('rodalies:R7', 'adif:11509')], { stations: ['adif:11509'], lines: ['rodalies:R8'] }, [...order, 'rodalies:R7'])).toEqual(['rodalies:R7']);
  expect(linesOnBoard([trip('rodalies:R4', 'adif:11509')], { stations: ['adif:11509'] }, order)).toEqual(['rodalies:R4']);
  // A Line of the timetable that the days on the map have no Line of is not one to name.
  expect(linesOnBoard([], { stations: ['adif:11509'], lines: ['rodalies:R9'] }, order)).toEqual([]);
});

test("a link's Trip is the ID it has among the days joined: led by its day but for the last day's, and a bare ID is the last day's (#593)", () => {
  const link = '2026-10-10/metro:1.1.11781651';
  // Joined with the 11th, the 10th's Trips are led by their day, as joinDays() has them.
  expect(linkedTrip(link, '2026-10-11')).toBe(link);
  // The 10th alone, or last, its own IDs.
  expect(linkedTrip(link, '2026-10-10')).toBe('metro:1.1.11781651');
  // No days on the map yet: the link as it is, which no Trip has.
  expect(linkedTrip(link, undefined)).toBe(link);
  // A link without a day, as follow() takes one, is a Trip of the last day.
  expect(linkedTrip('metro:1.1.11781651', '2026-10-11')).toBe('metro:1.1.11781651');
  // A day is the day only at the start of a link, as follow() has it: not one that an ID has in it, nor a day with no Trip after it.
  expect(linkedTrip('metro:2026-10-10/1.1', '2026-10-10')).toBe('metro:2026-10-10/1.1');
  expect(linkedTrip('2026-10-10/', '2026-10-10')).toBe('2026-10-10/');
});

test("a board names the same Lines while its Trips are on their way and once they've come, so that its pills are there before its rows and don't change as they come (#594)", () => {
  // Onze de Setembre, as 10 Oct's track names it: L9N and L10N, where the Trips of the days on the map call at it.
  const [L9N, L10N] = ['metro:L9N', 'metro:L10N'];
  const place = { stations: ['tmb:1.932'], lines: [L10N, L9N] };
  const order = ['metro:L1', L9N, L10N];
  const coming = linesOnBoard([], place, order);
  const came = linesOnBoard([trip(L9N, 'tmb:1.932', 'tmb:1.933'), trip(L10N, 'tmb:1.931', 'tmb:1.932'), trip('metro:L1', 'tmb:1.100')], place, order);
  expect(coming).toEqual([L9N, L10N]);
  expect(came).toEqual(coming);
});

test("a board's Alert names the Lines it's on of those that call there, in the board's order, as Rodalies' words don't, and its Station's none", () => {
  const sants = cardAlerts(ALERTS, { lines: ['rodalies:R4', 'rodalies:R2'], stations: ['adif:71801'] }, 'en', NOW).alerts;
  expect(sants.map(({ id, lines }) => [id, lines])).toEqual([
    ['AVISO_518352', ['rodalies:R2']],
    ['INFO_SANTS', []],
    ['AVISO_518298', ['rodalies:R4', 'rodalies:R2']],
  ]);
});

test("a card's Alerts are newest first, whichever operator's they are, and one that doesn't say when it began goes last", () => {
  // Made up: a place where R2 and T1 both call, and an Alert of TRAM's with no start.
  const tram = ALERTS.tram as AlertFeed;
  const alerts = { ...ALERTS, tram: { ...tram, alerts: [...tram.alerts, { id: 'sc-1', lines: ['tram:T1'], stations: [], description: [{ language: 'ca', text: 'Avís' }] }] } };
  expect(cardAlerts(alerts, { lines: ['rodalies:R2', 'tram:T1'], stations: [] }, 'en', NOW).alerts.map((a) => a.id)).toEqual(['AVISO_518352', 'sc-287', 'AVISO_518298', 'sc-1']);
});

test("an Alert is in the viewer's language where its feed has it, or else in its feed's own, with its language and whose words they are, and when it began", () => {
  const R2 = { lines: ['rodalies:R2'], stations: [] };
  expect(cardAlerts(ALERTS, R2, 'ca', NOW).alerts[0]).toEqual({ id: 'AVISO_518352', lines: ['rodalies:R2'], description: { language: 'ca', text: 'Sense servei ferroviari.' }, from: at(7, 2), by: 'Renfe' });
  // An English-speaking viewer reads Renfe's in Spanish.
  expect(cardAlerts(ALERTS, R2, 'en', NOW).alerts[0]).toEqual({ id: 'AVISO_518352', lines: ['rodalies:R2'], description: { language: 'es', text: 'Sin servicio ferroviario.' }, from: at(7, 2), by: 'Renfe' });
  // TRAM's title and words both, in English, and a Basque-speaking viewer's in TRAM's own Catalan.
  const T1 = { lines: ['tram:T1'], stations: [] };
  expect(cardAlerts(ALERTS, T1, 'en', NOW).alerts[0]).toEqual({
    id: 'sc-287',
    lines: ['tram:T1'],
    header: { language: 'en', text: 'T1, T2 and T3 affected' },
    description: { language: 'en', text: 'No service between Francesc Macià and Montesa.' },
    from: at(7, 0),
    by: 'TRAM',
  });
  expect(cardAlerts(ALERTS, T1, 'eu', NOW).alerts[0]).toMatchObject({ header: { language: 'ca', text: 'Afectació T1, T2 i T3' }, description: { language: 'ca', text: 'Sense servei entre Francesc Macià i Montesa.' } });
});

test("a Catalan viewer reads Valencia's Alert in its second entry, in Valencian, and a Spanish viewer in its first, as the fetcher tags the file Renfe gave on 7 Oct", () => {
  // Renfe's Alerts of Valencia, Bilbao, San Sebastián and Murcia with a second entry, as the fetcher writes them (#371).
  const text = readFileSync(new URL('../fetcher/fixtures/alerts/renfe-second-entries.json', import.meta.url), 'utf8');
  const renfe = readAlerts(ALERTS_START, { renfe: { alerts: { status: 200, body: { text } } } }, NOW).file ?? {};
  const C2 = { lines: ['cercanias-valencia:C2'], stations: [] };
  const first = { language: 'es', text: "Línea C2. Tren con salida prevista a las 08:30h de la estación de València Nord con destino l'Alcúdia, efectúa su salida con 17 minutos de retraso. Incidencia operativa." };
  const second = { language: 'ca', text: "Línia C2. Tren amb eixida prevista a les 08:30h de l'estació de València Nord amb destinació l'Alcúdia, efectua la seua eixida amb 17 minuts de retard. Incidència operativa." };
  expect(cardAlerts(renfe, C2, 'ca', NOW).alerts[0]).toMatchObject({ id: 'AVISO_518349', description: second, by: 'Renfe' });
  expect(cardAlerts(renfe, C2, 'es', NOW).alerts[0]).toMatchObject({ id: 'AVISO_518349', description: first, by: 'Renfe' });
  // An English-speaking viewer, as for Rodalies', reads Renfe's own first entry, in Spanish, which the card names as its language.
  expect(cardAlerts(renfe, C2, 'en', NOW).alerts[0]).toMatchObject({ id: 'AVISO_518349', description: first });
  // A Station's Alert, which names no Line, stays Spanish for a Catalan viewer: Carcaixent's lift gives its second entry tagged es.
  const lift = cardAlerts(renfe, { lines: [], stations: ['adif:64103'] }, 'ca', NOW).alerts.find((a) => a.id === 'AVISO_518170');
  expect(lift?.description).toEqual({ language: 'es', text: 'Ascensor de la estación de Carcaixent, sentido Xàtiva de vía 2, se encuentra fuera de servicio. Disculpen las molestias.' });
});

/** What the fetcher writes from Renfe's six Alerts of Madrid that name Lines, of 7 October, whole and as Renfe gave them (#359). */
const MADRID: Alerts = readAlerts(ALERTS_START, { renfe: { alerts: { status: 200, body: { text: readFileSync(new URL('../fetcher/fixtures/alerts/renfe-madrid.json', import.meta.url), 'utf8') } } } }, NOW).file ?? {};

test("a C8a or a C8b Train's card shows Madrid's AVISO_517064, which Renfe names for C8, as the fetcher writes it, and a board where both call shows it once (#359)", () => {
  const [C8a, C8b, C4] = ['cercanias-madrid:C8a', 'cercanias-madrid:C8b', 'cercanias-madrid:C4'];
  // Newest first: 517064 from 1 Oct, and 467462, Cercedilla's toilets, which names C8 and C9, from 12 Dec 2025.
  for (const line of [C8a, C8b]) {
    expect(cardAlerts(MADRID, { lines: [line], stations: [] }, 'es', NOW).alerts.map(({ id, lines }) => [id, lines])).toEqual([
      ['AVISO_517064', [line]],
      ['AVISO_467462', [line]],
    ]);
  }
  expect(cardAlerts(MADRID, { lines: [C8a, C8b], stations: [] }, 'es', NOW).alerts.map(({ id, lines }) => [id, lines])).toEqual([
    ['AVISO_517064', [C8a, C8b]],
    ['AVISO_467462', [C8a, C8b]],
  ]);
  // None of C4's, whose own Alerts are on it as before.
  expect(cardAlerts(MADRID, { lines: [C4], stations: [] }, 'es', NOW).alerts.map((a) => a.id)).toEqual(['AVISO_518335', 'AVISO_518347']);
});

test("a board at Cercedilla, where no Trip of C8b calls on the days on the map, as AVISO_517064 says, but its timetable does, names C8b and shows that Alert, which names C8 (#359)", () => {
  // As the track names it (#392): Cercedilla is on C8b's shapes, and on none of C8a's.
  const cercedilla = { stations: ['adif:12006'], lines: ['cercanias-madrid:C8b'] };
  const lines = linesOnBoard([], cercedilla, ['cercanias-madrid:C8a', 'cercanias-madrid:C8b']);
  expect(lines).toEqual(['cercanias-madrid:C8b']);
  expect(cardAlerts(MADRID, { lines, stations: cercedilla.stations }, 'es', NOW).alerts.map((a) => a.id)).toEqual(['AVISO_517064', 'AVISO_467462']);
});

test("a card says when its Alerts were read where that's over 15 minutes ago, by the feed read longest ago of those whose Alerts it shows", () => {
  const on = (...lines: string[]) => ({ lines, stations: [] });
  const [R2, T1, both] = [on('rodalies:R2'), on('tram:T1'), on('rodalies:R2', 'tram:T1')];
  // Renfe's were read at 8:11:40, and TRAM's at 8:10:05. TRAM's, read every 5 minutes into a file
  // written every 5, can be 12 minutes old by the time the page has the file, while all works (#339).
  expect(cardAlerts(ALERTS, both, 'en', NOW).asOf).toBeUndefined();
  expect(cardAlerts(ALERTS, T1, 'en', at(8, 22, 5)).asOf).toBeUndefined();
  expect(cardAlerts(ALERTS, T1, 'en', at(8, 25, 5)).asOf).toBeUndefined();
  expect(cardAlerts(ALERTS, T1, 'en', at(8, 25, 6)).asOf).toBe(at(8, 10, 5));
  expect(cardAlerts(ALERTS, R2, 'en', at(8, 25, 6)).asOf).toBeUndefined();
  expect(cardAlerts(ALERTS, both, 'en', at(8, 25, 6)).asOf).toBe(at(8, 10, 5));
  // A card with no Alerts says nothing.
  expect(cardAlerts(ALERTS, { lines: ['rodalies:R8'], stations: [] }, 'en', at(9, 0)).asOf).toBeUndefined();
});

test("a card says when a feed's file last changed where that's over 24 hours before the map's time, for each feed whose Alerts it shows, and nothing where it's no longer ago or the feed says none (#390)", () => {
  const on = (...lines: string[]) => ({ lines, stations: [] });
  const [renfe, tram] = [ALERTS.renfe as AlertFeed, ALERTS.tram as AlertFeed];
  // Made up: Renfe's file as it stood on the 4th at 9:32, nearly 3 days before the map's time, and TRAM's, as TRAM writes its files when asked, 2 hours before it.
  const stood = Date.UTC(2026, 9, 4, 7, 32, 52);
  const feeds: Alerts = { renfe: { ...renfe, changed: stood }, tram: { ...tram, changed: at(6, 12) } };
  expect(cardAlerts(feeds, on('rodalies:R2'), 'en', NOW).changed).toEqual([{ by: 'Renfe', at: stood }]);
  // TRAM's is within the day, as is where it's alone on a card; and a card with none of Renfe's Alerts says nothing of its file.
  expect(cardAlerts(feeds, on('tram:T1'), 'en', NOW).changed).toEqual([]);
  expect(cardAlerts(feeds, on('rodalies:R8'), 'en', NOW).changed).toEqual([]);
  // A board where both call says it of Renfe's, once, though Renfe has two Alerts on its Lines.
  expect(cardAlerts(feeds, on('rodalies:R1', 'rodalies:R2', 'rodalies:R4', 'tram:T1'), 'en', NOW).changed).toEqual([{ by: 'Renfe', at: stood }]);
  // Both, where both are old, Renfe's first as the feeds are.
  const both: Alerts = { ...feeds, tram: { ...tram, changed: at(8, 0) - 2 * 24 * 3_600_000 } };
  expect(cardAlerts(both, on('rodalies:R2', 'tram:T1'), 'en', NOW).changed).toEqual([
    { by: 'Renfe', at: stood },
    { by: 'TRAM', at: at(8, 0) - 2 * 24 * 3_600_000 },
  ]);
  // Over 24 hours: a file changed exactly that long before is no older than a day, and one second more is.
  const changedAt = (changed: number) => cardAlerts({ renfe: { ...renfe, changed } }, on('rodalies:R2'), 'en', NOW).changed;
  expect(changedAt(NOW - 24 * 3_600_000)).toEqual([]);
  expect(changedAt(NOW - 24 * 3_600_000 - 1000)).toHaveLength(1);
  // None, from a feed whose file says none, or from one that changed after the map's time, as a device's clock can be behind.
  expect(cardAlerts(ALERTS, on('rodalies:R2'), 'en', at(8, 12) + 5 * 24 * 3_600_000).changed).toEqual([]);
  expect(changedAt(NOW + 60_000)).toEqual([]);
});

test("a card says the same of a feed's file beside when its Alerts were read, and not instead of it (#390)", () => {
  const renfe = ALERTS.renfe as AlertFeed;
  // Made up: Renfe's file as it stood on the 4th at 9:32.
  const stood = Date.UTC(2026, 9, 4, 7, 32, 52);
  // 8:27 is over 15 minutes after Renfe's were read, at 8:11:40.
  const card = cardAlerts({ renfe: { ...renfe, changed: stood } }, { lines: ['rodalies:R2'], stations: [] }, 'en', at(8, 27));
  expect(card.asOf).toBe(at(8, 11, 40));
  expect(card.changed).toEqual([{ by: 'Renfe', at: stood }]);
});

/**
 * alerts.json as the fetcher wrote it at 23:20 on Friday 9 October 2026, as it was: 68 of Renfe's
 * Alerts across Spain and 3 of TRAM's (#396). 4 of Renfe's and 1 of TRAM's have an address in their
 * words (#391).
 */
const NIGHT: Alerts = JSON.parse(readFileSync(new URL('../fetcher/fixtures/alerts/alerts-2026-10-09.json', import.meta.url), 'utf8'));
/** An Alert of that file, by its ID. */
const night = (id: string): Alert => {
  const found = Object.values(NIGHT).flatMap((feed) => feed.alerts).find((a) => a.id === id);
  if (!found) throw new Error(`No Alert ${id} in 9 Oct's file`);
  return found;
};

test("an address in an Alert's words is picked out as written, and the words before it stay as they were (#391)", () => {
  // AVISO_512648, Valencia's C3, in each of its two entries: "… Consulte los horarios en: https://renfe.com/…/horarios#/buscar"
  const address = 'https://renfe.com/es/es/cercanias/cercanias-valencia/horarios#/buscar';
  const { description } = night('AVISO_512648');
  expect(description).toHaveLength(2);
  for (const { text } of description) {
    expect(text.endsWith(`en: ${address}`)).toBe(true);
    expect(linkedWords(text)).toEqual([text.slice(0, -address.length), { address }]);
  }
});

test("TRAM's press page, on a line of its own after two line breaks, is an address in each language, and the line breaks stay in the words before it (#391)", () => {
  // sc-287, T1–T3's works of 10–12 Oct: "… Metro L3, L5 i L9Sud. \n\nhttps://tram.cat/ca/premsa/2295", and its press page in Spanish and English.
  const { description } = night('sc-287');
  expect(description.map(({ language, text }) => [language, linkedWords(text).at(-1)])).toEqual([
    ['ca', { address: 'https://tram.cat/ca/premsa/2295' }],
    ['es', { address: 'https://tram.cat/es/prensa/2296' }],
    ['en', { address: 'https://tram.cat/en/press/2297' }],
  ]);
  for (const { text } of description) {
    const parts = linkedWords(text);
    expect(parts).toHaveLength(2);
    // The card keeps its line breaks as the operator gave them (white-space: pre-line), which stay in the text, not in the link.
    expect(parts[0]).toMatch(/\n\n$/);
    expect(parts[0]).toBe(text.slice(0, text.lastIndexOf('https://')));
  }
});

test("a . , ; : or ) after an address is left outside it, and what's inside it, a fragment, a query, a port, parentheses, stays, and no other mark ends one (#391)", () => {
  // Made up, on Valencia's address (AVISO_512648): the words given other ends, as a sentence or a bracket would.
  const address = 'https://renfe.com/es/es/cercanias/cercanias-valencia/horarios#/buscar';
  for (const mark of ['.', ',', ';', ':', ')', ').', '),', '.)', '...']) {
    expect(linkedWords(`Consulte los horarios en ${address}${mark} Gracias.`)).toEqual(['Consulte los horarios en ', { address }, `${mark} Gracias.`]);
    expect(linkedWords(`Consulte los horarios en ${address}${mark}`)).toEqual(['Consulte los horarios en ', { address }, mark]);
  }
  expect(linkedWords(`(Consulte los horarios en: ${address})`)).toEqual(['(Consulte los horarios en: ', { address }, ')']);
  // Inside it, they're the address's own.
  const inside = 'https://renfe.com:8443/es/es/cercanias/horarios;linea=C3,C5?dia=sab&hora=9:30#/buscar(1)/plan.html';
  expect(linkedWords(`Más en ${inside}.`)).toEqual(['Más en ', { address: inside }, '.']);
  // And no other ends it: a closing quote, `!`, `?` or `]` is the address's own, as written, the ticket's set being those five.
  for (const end of ['!', '?', ']', '"', '»']) expect(linkedWords(`Más en ${address}${end}`)).toEqual(['Más en ', { address: `${address}${end}` }]);
});

test("only http: and https: addresses are picked out, in any case and as written, and every other kind, javascript: and data: among them, stays text (#391)", () => {
  // Made up, on TRAM's press page (sc-287): its words with an address of another kind.
  const page = 'tram.cat/ca/premsa/2295';
  for (const other of ['javascript:alert(document.cookie)', 'data:text/html,<script>alert(1)</script>', `ftp://${page}`, 'mailto:premsa@tram.cat', `www.${page}`, page, `https:${page}`]) {
    const words = `Més informació: ${other}`;
    expect(linkedWords(words)).toEqual([words]);
  }
  expect(linkedWords(`Més informació: http://${page}`)).toEqual(['Més informació: ', { address: `http://${page}` }]);
  expect(linkedWords(`Més informació: HTTPS://${page.toUpperCase()}`)).toEqual(['Més informació: ', { address: `HTTPS://${page.toUpperCase()}` }]);
});

test("addresses one after the other, or one to a line, are each picked out, and one that begins or ends the words has no text before or after it (#391)", () => {
  // Made up, on TRAM's press pages in Catalan and Spanish (sc-287).
  const [ca, es] = ['https://tram.cat/ca/premsa/2295', 'https://tram.cat/es/prensa/2296'];
  expect(linkedWords(`${ca} ${es}`)).toEqual([{ address: ca }, ' ', { address: es }]);
  expect(linkedWords(`${ca}\n\n${es}`)).toEqual([{ address: ca }, '\n\n', { address: es }]);
  expect(linkedWords(`${ca},\n${es}.`)).toEqual([{ address: ca }, ',\n', { address: es }, '.']);
  expect(linkedWords(ca)).toEqual([{ address: ca }]);
  expect(linkedWords(`${ca} i ${es}`)).toEqual([{ address: ca }, ' i ', { address: es }]);
});

test("of the 71 Alerts of 9 Oct, 5 have an address in their words, and the words of every one come out exactly as they were (#391)", () => {
  /** What the parts, put back together, say: the address as it was. */
  const said = (parts: Part[]) => parts.map((part) => (typeof part === 'string' ? part : part.address)).join('');
  const withAddress: string[] = [];
  let entries = 0;
  for (const alert of Object.values(NIGHT).flatMap((feed) => feed.alerts)) {
    for (const { text } of [...(alert.header ?? []), ...alert.description]) {
      const parts = linkedWords(text);
      entries++;
      expect(said(parts)).toBe(text);
      if (parts.some((part) => typeof part !== 'string')) withAddress.push(alert.id);
      // Words with no address are the text as it is, one part, or none where an entry is empty.
      else expect(parts).toEqual(text ? [text] : []);
    }
  }
  expect(entries).toBe(128);
  // Each of Renfe's 4 in both its entries, and TRAM's in each language: 8 and 3.
  expect(withAddress).toHaveLength(11);
  expect([...new Set(withAddress)]).toEqual(['AVISO_512648', 'AVISO_470390', 'AVISO_446239', 'AVISO_442947', 'sc-287']);
});
