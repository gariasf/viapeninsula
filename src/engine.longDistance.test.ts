// How Renfe's long-distance Trains run (#260): each Line at its own speed, falling back to its
// Network's, a snap counted in time rather than by a kilometre, no hold at Stations, and a position
// that holds counted as none.

import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { DEGREE, type Bundle, type LineProfile, type LiveTraits, type Network, type Report, type SpeedProfile } from './bundle.ts';
import { trainsAt, type Received } from './engine.ts';
import { jumps } from './jumps.ts';
import { AVE_LARGA_DISTANCIA, MEDIA_DISTANCIA_AVANT, type NetworkConfig } from './networks.ts';

/** Metres to a degree of longitude along 41° N, which the made-up track below runs east along. */
const KX = DEGREE * Math.cos((41 * Math.PI) / 180);

const ROUNDING = 1e-6;

/** A moment on Saturday 10 October 2026, by the clock in Spain, and so many seconds on. */
const at = (time: string, plus = 0) => Date.parse(`2026-10-10T${time}+02:00`) + plus * 1000;

const seconds = (time: string) => time.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);

/** A Network as the bundle has it, running as the profile says, and reading its live data as `live` says. */
const network = (profile: SpeedProfile, live?: LiveTraits): Network => ({
  id: 'ld',
  name: 'Long distance',
  profile,
  runningSide: 'right',
  colour: '#000',
  pillZoom: 10,
  credit: { text: '', url: '' },
  live,
});

/** A call: its Station, arrival, departure, and how many km along the track it is. */
type Row = [station: string, arrival: string, departure: string, km: number];

/** A Network's Lines with the profile each has of its own, by name: `undefined` where it has none. */
type Lines = Record<string, LineProfile | undefined>;

/**
 * A service day of one Network's Trips, each of a Line of the Network, on a straight track of its
 * own east along 41° N, as long as its last call is far.
 */
function day(net: Network, lines: Lines, trips: Record<string, { line: string; calls: Row[] }>): Bundle {
  return {
    serviceDay: '2026-10-10',
    noonMinus12h: Date.parse('2026-10-10T00:00:00+02:00'),
    networks: [net],
    lines: Object.entries(lines).map(([name, profile]) => ({ id: name, network: net.id, name, colour: '#000', shapes: [], kind: 'long-distance', ...(profile && { profile }) })),
    stations: [],
    shapes: Object.entries(trips).map(([id, { calls }]) => {
      const end = Math.max(...calls.map((c) => c[3])) * 1000;
      return { id, coords: [[0, 41], [end / KX, 41]], dist: [0, end] };
    }),
    strokes: [],
    rails: [],
    slots: [],
    tracks: [],
    trips: Object.entries(trips).map(([id, { line, calls }]) => ({
      id,
      line,
      shape: id,
      headsign: calls.at(-1)?.[0] ?? '',
      calls: calls.map(([station, arrival, departure, km]) => ({ station, arrival: seconds(arrival), departure: seconds(departure), dist: km * 1000 })),
    })),
  };
}

/** A config's Network as the bundle has it, and its Lines named, each with the profile its config gives it, as the daily build makes them (readFeed()). */
function configured({ profile, live, lines }: Pick<NetworkConfig, 'profile' | 'live' | 'lines'>, names: string[]): [Network, Lines] {
  return [network(profile, live), Object.fromEntries(names.map((name) => [name, lines.profiles?.[name]]))];
}

/** How far along its track a Trip's Train is at a moment, in metres, if it's on the map, given the snapshots received by then. */
const where = (bundle: Bundle, trip: string, moment: number, received: Received[] = []) =>
  trainsAt(bundle, moment, received.filter((r) => r.at <= moment)).find((t) => t.trip.id === trip)?.dist;

/** A Train's place each second from a moment, in metres along its track, for so many seconds. */
const course = (bundle: Bundle, trip: string, from: number, length: number, received: Received[] = []) =>
  Array.from({ length }, (_, s) => where(bundle, trip, from + s * 1000, received) ?? NaN);

/** A Train's speed each second, in metres per second, from where it is each second. */
const speeds = (each: number[]) => each.slice(1).map((d, s) => d - (each[s] ?? NaN));

/** What the fetcher wrote at a moment, having read the Network's live data every other run (40 s), with these reports, received as written. */
const heard = (moment: number, reports: Report[]): Received => ({
  snapshot: { generated: moment, feeds: { ld: { lastSuccess: moment, lastAttempt: moment, status: 'ok', every: 40_000 } }, reports },
  at: moment,
});

/** A report of a Trip's GPS, so many km along its track, at the header time of the feed it came in, and Renfe's own figure where it has one. */
const gps = (trip: string, km: number, moment: number, delay?: number): Report => ({ trip, at: moment, position: { lon: (km * 1000) / KX, lat: 41 }, delay });

/** How Cercanías' live data reads: its GPS Delay carried on, and a kilometre the most a Train is drawn off where live data has it. */
const CERCANIAS: LiveTraits = { delay: 'gps', near: 'pinned' };

const RODALIES_PROFILE = { acceleration: 1, braking: 1, topSpeed: 160 / 3.6, dwell: 30 };

/** 200 km in an hour, 200 km/h on average, which an AVE or an Alvia runs at 57 m/s between Stations, and 100 km in an hour, which an MD runs at 28 m/s. */
const FAST: Row[] = [['A', '10:00:00', '10:00:00', 0], ['B', '11:00:00', '11:00:00', 200]];
const SLOW: Row[] = [['A', '10:00:00', '10:00:00', 0], ['B', '11:00:00', '11:00:00', 100]];

test("each Line of Renfe's long-distance Networks has the profile its Network's config gives it, with its source: AVE y Larga Distancia's 250 km/h at 0.5 m/s², AVE, Avlo and AVE Int's at 300, and Media Distancia y Avant's Rodalies' 160 km/h at 1, with Avant's and Avant Exp's at 250 and 0.5", () => {
  const kmh = (profile: SpeedProfile) => Math.round(profile.topSpeed * 3.6);
  const [ave, aveLines] = configured(AVE_LARGA_DISTANCIA, ['AVE', 'Avlo', 'AVE Int', 'Alvia', 'Euromed', 'Intercity', 'Trencelta']);
  expect(Object.entries(aveLines).map(([name, own]) => [name, kmh({ ...ave.profile, ...own }), { ...ave.profile, ...own }.acceleration])).toEqual([
    ['AVE', 300, 0.5], ['Avlo', 300, 0.5], ['AVE Int', 300, 0.5], ['Alvia', 250, 0.5], ['Euromed', 250, 0.5], ['Intercity', 250, 0.5], ['Trencelta', 250, 0.5],
  ]);
  const [md, mdLines] = configured(MEDIA_DISTANCIA_AVANT, ['Avant', 'Avant Exp', 'MD', 'Regional', 'Reg.Exp.', 'Proximidad']);
  expect(md.profile).toEqual(RODALIES_PROFILE);
  expect(Object.entries(mdLines).map(([name, own]) => [name, kmh({ ...md.profile, ...own }), { ...md.profile, ...own }.acceleration])).toEqual([
    ['Avant', 250, 0.5], ['Avant Exp', 250, 0.5], ['MD', 160, 1], ['Regional', 160, 1], ['Reg.Exp.', 160, 1], ['Proximidad', 160, 1],
  ]);
  // Both read their live data as Rodalies' is, and snap by the minute.
  expect(ave.live).toEqual({ delay: 'gps', near: 'pinned', snap: 60 });
  expect(md.live).toEqual({ delay: 'gps', near: 'pinned', snap: 60 });
});

test("a Line with a profile of its own accelerates as it says, and one without accelerates as its Network's does", () => {
  // MD y Avant's Network runs at Rodalies' 1 m/s², and its Avant at 0.5.
  const bundle = day(network(RODALIES_PROFILE, CERCANIAS), { Avant: { acceleration: 0.5, braking: 0.5, topSpeed: 250 / 3.6 }, MD: undefined }, {
    avant: { line: 'Avant', calls: SLOW },
    md: { line: 'MD', calls: SLOW },
  });
  // Twenty seconds out of A, a Train accelerating at a has gone ½·a·20² metres.
  expect(where(bundle, 'avant', at('10:00:20'))).toBeCloseTo(100, 3);
  expect(where(bundle, 'md', at('10:00:20'))).toBeCloseTo(200, 3);
});

test("a late Train catches up at up to its Line's top speed, and no faster: an AVE's 300 km/h, an Alvia's 250 as its Network's, and an MD's 160", () => {
  // Between A and B, 20 minutes in, GPS has the Train 15 s late at 10:20:00, and on time at 10:20:40.
  const catchUp = (bundle: Bundle, trip: string) => {
    const km = (moment: number) => (where(bundle, trip, moment) ?? NaN) / 1000;
    const received = [heard(at('10:20:00'), [gps(trip, km(at('10:19:45')), at('10:20:00'))]), heard(at('10:20:40'), [gps(trip, km(at('10:20:40')), at('10:20:40'))])];
    return Math.max(...speeds(course(bundle, trip, at('10:20:40'), 91, received)));
  };
  const [ave, aveLines] = configured(AVE_LARGA_DISTANCIA, ['AVE', 'Alvia']);
  const fast = day(ave, aveLines, { ave: { line: 'AVE', calls: FAST }, alvia: { line: 'Alvia', calls: FAST } });
  expect(catchUp(fast, 'ave')).toBeCloseTo(300 / 3.6, 3);
  expect(catchUp(fast, 'ave')).toBeLessThanOrEqual(300 / 3.6 + ROUNDING);
  expect(catchUp(fast, 'alvia')).toBeCloseTo(250 / 3.6, 3);
  expect(catchUp(fast, 'alvia')).toBeLessThanOrEqual(250 / 3.6 + ROUNDING);
  const [md, mdLines] = configured(MEDIA_DISTANCIA_AVANT, ['MD']);
  const slow = day(md, mdLines, { md: { line: 'MD', calls: SLOW } });
  expect(catchUp(slow, 'md')).toBeCloseTo(160 / 3.6, 3);
  expect(catchUp(slow, 'md')).toBeLessThanOrEqual(160 / 3.6 + ROUNDING);
});

test("a Train is snapped by the time it's off, not by a kilometre, where its Network's positions have no age, as Renfe's long-distance ones have: 30 s late at 200 km/h is 1.7 km", () => {
  const [ave, aveLines] = configured(AVE_LARGA_DISTANCIA, ['AVE']);
  const trips = { ave: { line: 'AVE', calls: FAST } };
  const [minute, kilometre] = [day(ave, aveLines, trips), day({ ...ave, live: CERCANIAS }, aveLines, trips)];
  // GPS has the Train on time at 10:20:00, and at 10:20:40 where its timetable had it so many seconds before.
  const late = (behind: number) => {
    const km = (moment: number) => (where(minute, 'ave', moment) ?? NaN) / 1000;
    return [heard(at('10:20:00'), [gps('ave', km(at('10:20:00')), at('10:20:00'))]), heard(at('10:20:40'), [gps('ave', km(at('10:20:40') - behind * 1000), at('10:20:40'))])];
  };
  expect(jumps(kilometre, late(30))).toEqual({ ld: { forward: 0, back: 1, liveSeconds: 41 } });
  expect(jumps(minute, late(30))).toEqual({ ld: { forward: 0, back: 0, liveSeconds: 41 } });
  // A minute and a half late is a jump on either: a minute is the time.
  expect(jumps(kilometre, late(90))).toEqual({ ld: { forward: 0, back: 1, liveSeconds: 41 } });
  expect(jumps(minute, late(90))).toEqual({ ld: { forward: 0, back: 1, liveSeconds: 41 } });
});

test("counts a jump as a move faster than the Line's top speed allows, not its Network's: an AVE running at 300 km/h isn't jumping", () => {
  // 100 km in 20 minutes, 300 km/h on average, which only an AVE's 300 km/h top speed has room for.
  const [ave, aveLines] = configured(AVE_LARGA_DISTANCIA, ['AVE']);
  const bundle = day(ave, aveLines, { ave: { line: 'AVE', calls: [['A', '10:00:00', '10:00:00', 0], ['B', '10:20:00', '10:20:00', 100]] } });
  const received = [heard(at('10:05:00'), [gps('ave', 25, at('10:05:00'))]), heard(at('10:05:20'), [gps('ave', 25 + (20 * 300) / 3.6 / 1000, at('10:05:20'))])];
  expect(jumps(bundle, received)).toEqual({ ld: { forward: 0, back: 0, liveSeconds: 21 } });
});

// An AVE from A to C by B, 200 km in 70 minutes, standing 2 at B.
const [LD, LD_LINES] = configured(AVE_LARGA_DISTANCIA, ['AVE']);
const BY_B: Row[] = [['A', '10:00:00', '10:00:00', 0], ['B', '10:30:00', '10:32:00', 100], ['C', '11:10:00', '11:10:00', 200]];
const VIA_B = day(LD, LD_LINES, { ave: { line: 'AVE', calls: BY_B } });

test("no position holds a long-distance Train at a Station: where Renfe's report has it STOPPED_AT the Station it's due at next, as its stopId does, it stays where its timetable has it", () => {
  // At 10:50:00 the timetable has the Train 18 minutes out of B, about 150 km along. Renfe's report,
  // read as Cercanías' are, names C, 50 km on, on time.
  const near: Received[] = [heard(at('10:50:00'), [{ trip: 'ave', at: at('10:50:00'), position: { near: 'C' }, delay: 0 }])];
  const due = where(VIA_B, 'ave', at('10:50:30'));
  expect(due).toBeGreaterThan(140_000);
  expect(due).toBeLessThan(160_000);
  expect(where(VIA_B, 'ave', at('10:50:30'), near)).toBeCloseTo(due ?? NaN, 3);
  // A Network that holds Trains at the Stations they're reported at, as FGC's, has it at C.
  const held = day(network(LD.profile, { delay: 'operator', near: 'standing' }), LD_LINES, { ave: { line: 'AVE', calls: BY_B } });
  expect(where(held, 'ave', at('10:50:30'), near)).toBe(200_000);
});

test("a long-distance Train carries on from its last GPS Delay, whatever Renfe's own figure says, and goes by Renfe's figure only where its GPS has given none", () => {
  const behind = (late: number, moment: number) => gps('ave', (where(VIA_B, 'ave', moment - late * 1000) ?? NaN) / 1000, moment);
  // GPS has the Train 30 s late between B and C at 10:50:00 and 10:50:40, where Renfe's figure says 5
  // minutes. Then Renfe gives it no position, still 5 minutes late. It runs on 30 s late.
  const carried = [
    heard(at('10:50:00'), [{ ...behind(30, at('10:50:00')), delay: 300 }]),
    heard(at('10:50:40'), [{ ...behind(30, at('10:50:40')), delay: 300 }]),
    heard(at('10:51:20'), [{ trip: 'ave', at: at('10:51:20'), delay: 300 }]),
  ];
  for (const s of [10, 30, 50]) expect(where(VIA_B, 'ave', at('10:51:20', s), carried)).toBeCloseTo(where(VIA_B, 'ave', at('10:50:50', s)) ?? NaN, 3);
  // With no GPS Delay to carry on from, it runs as late as Renfe says: 5 minutes.
  const figure = [heard(at('10:51:20'), [{ trip: 'ave', at: at('10:51:20'), delay: 300 }])];
  expect(where(VIA_B, 'ave', at('10:51:30'), figure)).toBeCloseTo(where(VIA_B, 'ave', at('10:46:30')) ?? NaN, 3);
});

test("a long-distance Train that vanishes from its feed for minutes, as in Guadarrama's 28 km tunnel, runs on its last GPS Delay, Scheduled, and is Live again where its position comes back, without a jump", () => {
  const behind = (late: number, moment: number) => gps('ave', (where(VIA_B, 'ave', moment - late * 1000) ?? NaN) / 1000, moment);
  // GPS has the Train 30 s late at 10:40:00 and 10:40:40, then the feed has none for it for 6 minutes
  // with its other Trains in it, and then has it 30 s late again at 10:46:40.
  const received = [
    heard(at('10:40:00'), [behind(30, at('10:40:00'))]),
    heard(at('10:40:40'), [behind(30, at('10:40:40'))]),
    ...[0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300].map((s) => heard(at('10:40:40', 20 + s), [])),
    heard(at('10:46:40'), [behind(30, at('10:46:40'))]),
  ];
  const train = (moment: number) => trainsAt(VIA_B, moment, received.filter((r) => r.at <= moment)).find((t) => t.trip.id === 'ave');
  expect(train(at('10:41:10'))?.live).toBe(true);
  // Scheduled from its feed's third update on, 30 s late.
  expect(train(at('10:44:00'))).toMatchObject({ live: false });
  expect(train(at('10:44:00'))?.dist).toBeCloseTo(where(VIA_B, 'ave', at('10:43:30')) ?? NaN, 3);
  expect(train(at('10:46:50'))).toMatchObject({ live: true });
  expect(jumps(VIA_B, received)).toMatchObject({ ld: { forward: 0, back: 0 } });
});

test("a long-distance position that holds counts as none, so the Train neither stalls where it's held nor jumps when it moves again", () => {
  // GPS has the Train on time at 10:40:00, and at the same spot every 40 s for another 160, as the
  // feed's does while a position freezes, where Renfe's figure grows a minute every 40 s. At 10:43:20
  // it's where its timetable has it on time, 9 km on.
  const spot = (where(VIA_B, 'ave', at('10:40:00')) ?? NaN) / 1000;
  const held = [0, 40, 80, 120, 160].map((s) => heard(at('10:40:00', s), [{ ...gps('ave', spot, at('10:40:00', s)), delay: s * 1.5 }]));
  const moved = heard(at('10:43:20'), [{ ...gps('ave', (where(VIA_B, 'ave', at('10:43:20')) ?? NaN) / 1000, at('10:43:20')), delay: 0 }]);
  const received = [...held, moved];
  const each = course(VIA_B, 'ave', at('10:40:00'), 201, received);
  expect(Math.min(...speeds(each))).toBeGreaterThan(20);
  expect(each.at(-1)).toBeCloseTo(where(VIA_B, 'ave', at('10:43:20')) ?? NaN, 3);
  expect(jumps(VIA_B, received)).toMatchObject({ ld: { forward: 0, back: 0 } });
  // Going by each position instead, as a Network does that has no GPS Delay to carry on from, the
  // Train is snapped back a kilometre or so at each held report, which has it that much later, or,
  // snapping only by the minute, stands where the first held it, and then jumps on 7 km.
  const goesBy = (live: LiveTraits) => day(network(LD.profile, live), LD_LINES, { ave: { line: 'AVE', calls: BY_B } });
  expect(jumps(goesBy({ delay: 'operator', near: 'pinned' }), received)).toMatchObject({ ld: { forward: 1, back: 4 } });
  const stood = speeds(course(goesBy({ delay: 'operator', near: 'pinned', snap: 60 }), 'ave', at('10:40:00'), 201, received));
  expect(stood.filter((v) => v === 0).length).toBeGreaterThan(150);
  expect(Math.max(...stood)).toBeGreaterThan(7000);
});

// 12 minutes of Renfe's long-distance feeds on Saturday 10 October 2026, 11:47–11:59 UTC, read every
// other run as the fetcher will (#261): one report for each Train number, its GPS whatever its
// `currentStatus`, its Delay from the trip updates, and its time the file's header's. The Trains are
// the 23 whose position held for a minute or more and then moved a kilometre or more, as 177 did on 4
// October (their positions weren't kept), each Trip cut to the legs they run along and traced along
// OpenStreetMap's rails of 9 October as #259 will, crudely: high-speed Trips on standard gauge, the
// rest on every rail, with a copy of the build's own tracing, and each shape simplified to 20 m.
const REPLAY: { bundle: Bundle; received: Received[] } = JSON.parse(gunzipSync(readFileSync(new URL('fixtures/replay-2026-10-10-long-distance.json.gz', import.meta.url))).toString());
const CONFIGS = [AVE_LARGA_DISTANCIA, MEDIA_DISTANCIA_AVANT];
/** The replay's bundle with each Network's profile and live traits, and each Line's profile, as src/networks.ts has them, or `live` for the Networks' traits. */
function replayed(live?: LiveTraits): Bundle {
  const bundle: Bundle = structuredClone(REPLAY.bundle);
  for (const n of bundle.networks) {
    const config = CONFIGS.find((c) => c.id === n.id);
    if (config) [n.profile, n.live] = [config.profile, live ?? config.live];
  }
  for (const l of bundle.lines) {
    const own = CONFIGS.find((c) => c.id === l.network)?.lines.profiles?.[l.name];
    if (own) l.profile = own;
  }
  return bundle;
}

/**
 * The replay's holds: each Train's position unchanged for a minute or more, and then moved a kilometre
 * or more, with when the first snapshot that held it arrived and when the one that moved it did.
 */
function holds(received: Received[]) {
  const found: { trip: string; from: number; to: number }[] = [];
  const reports = (trip: string) => received.map((r) => r.snapshot.reports.find((x) => x.trip === trip));
  for (const trip of new Set(received.flatMap((r) => r.snapshot.reports.map((x) => x.trip ?? '')))) {
    const at = reports(trip);
    for (let i = 0; i < at.length; i++) {
      const p = at[i]?.position;
      if (!p || !('lon' in p)) continue;
      let j = i;
      const same = (k: number) => {
        const q = at[k]?.position;
        return !!q && 'lon' in q && q.lon === p.lon && q.lat === p.lat;
      };
      while (j + 1 < at.length && same(j + 1)) j++;
      const next = at[j + 1]?.position;
      // Not one that held from before the third snapshot: the first two place each Train outright.
      if (i >= 2 && j > i && next && 'lon' in next && ((at[j]?.at ?? 0) - (at[i]?.at ?? 0)) / 1000 >= 60) {
        if (Math.hypot((next.lon - p.lon) * 84_000, (next.lat - p.lat) * 111_195) >= 1000) found.push({ trip, from: received[i]?.at ?? 0, to: received[j + 1]?.at ?? 0 });
      }
      i = j;
    }
  }
  return found;
}

/**
 * What a bundle draws through each of the replay's holds: how many have the Train stand still for the
 * 40 s before its position moves, standing more than 20 m from a Station its Trip calls at, and in the
 * 30 s from then how many snap it back, and how many on, more than its Line's top speed has it run in a second.
 */
function through(bundle: Bundle, found: ReturnType<typeof holds>) {
  const [stood, back, on] = [new Set<string>(), new Set<string>(), new Set<string>()];
  const at = (trip: string, moment: number) => trainsAt(bundle, moment, REPLAY.received.filter((r) => r.at <= moment)).find((t) => t.trip.id === trip);
  for (const { trip, to } of found) {
    const t = bundle.trips.find((x) => x.id === trip);
    const line = bundle.lines.find((l) => l.id === t?.line);
    const top = ({ ...bundle.networks.find((n) => n.id === line?.network)?.profile, ...line?.profile }.topSpeed ?? Infinity) * 1.05;
    const [before, held] = [at(trip, to - 40_000), at(trip, to - 1000)];
    const near = Math.min(...(t?.calls ?? []).map((c) => Math.abs(c.dist - (held?.dist ?? Infinity))));
    if (before && held && Math.abs(held.dist - before.dist) < 100 && near > 20) stood.add(`${trip} ${to}`);
    const way = (t?.calls.at(-1)?.dist ?? 0) > (t?.calls[0]?.dist ?? 0) ? 1 : -1;
    let last = held?.dist;
    for (let s = 0; s <= 30; s++) {
      const now = at(trip, to + s * 1000)?.dist;
      if (last !== undefined && now !== undefined) {
        if ((now - last) * way < -top) back.add(`${trip} ${to}`);
        if ((now - last) * way > top) on.add(`${trip} ${to}`);
      }
      last = now;
    }
  }
  return { holds: found.length, stood: stood.size, back: back.size, on: on.size };
}

test("replaying long-distance positions that held and then moved, a Train neither stands where its position is held nor snaps back when it moves: counting a position that holds as none is what keeps it going", () => {
  const found = holds(REPLAY.received);
  // 25 holds of a minute or more, ending in moves of 1 to 18 km, in 23 Trains: Reg.Exp. 12601 snaps
  // back 1.8 km as its position moves, the 72 s it lost in the 297 s it was held, and two jump on.
  expect(through(replayed(), found)).toEqual({ holds: 25, stood: 0, back: 1, on: 2 });
  // Going by each position as it comes, as a Network does that has no GPS Delay to carry on from, 8
  // stand still where they're held for the 40 s before it moves, and 22 jump on, by up to 18 km.
  expect(through(replayed({ delay: 'operator', near: 'pinned' }), found)).toEqual({ holds: 25, stood: 8, back: 1, on: 22 });
}, 60_000);

test("counts each long-distance Network's jumps over 12 minutes of its live data, as the fetcher will read it: fewer snapped by the minute than by the kilometre", () => {
  // Per Train-minute, (forward + back) / (liveSeconds / 60): AVE y Larga Distancia 0.105 and Media
  // Distancia y Avant 0.081, in the replay's 23 Trains, whose positions held and then moved.
  expect(jumps(replayed(), REPLAY.received)).toEqual({
    'ave-larga-distancia': { forward: 3, back: 3, liveSeconds: 3426 },
    'media-distancia-avant': { forward: 10, back: 3, liveSeconds: 9571 },
  });
  // As Rodalies' are, snapped past a kilometre, a Train jumps about twice as often.
  expect(jumps(replayed({ delay: 'gps', near: 'pinned' }), REPLAY.received)).toEqual({
    'ave-larga-distancia': { forward: 7, back: 12, liveSeconds: 3426 },
    'media-distancia-avant': { forward: 13, back: 6, liveSeconds: 9571 },
  });
}, 60_000);
