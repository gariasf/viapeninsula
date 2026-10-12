import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { DEGREE, type Bundle } from './bundle.ts';
import { differences, type Moment } from './cardVsMap.ts';
import type { Received } from './engine.ts';
import { jumps } from './jumps.ts';
import { NETWORKS } from './networks.ts';

// A Trip A (0 m) – B (2,000 m) – C (4,000 m): 100 s legs, the second day's noon-minus-12h at 0, so seconds into the day are ms / 1000.
const calls = [
  { station: 'a', key: 'A', arrival: 0, departure: 30, dist: 0 },
  { station: 'b', key: 'B', arrival: 130, departure: 160, dist: 2000 },
  { station: 'c', key: 'C', arrival: 260, departure: 260, dist: 4000 },
];
const profile = { acceleration: 1, braking: 1, topSpeed: 20, dwell: 30 };
// A Train drawn `dist` m along at `time` s, the card's clock on the timetable's, with nothing near it.
const moment = (time: number, dist: number, over: Partial<Moment> = {}): Moment => ({
  at: time * 1000,
  noon: 0,
  now: time,
  time,
  delay: 0,
  dist,
  calls,
  standing: false,
  near: [],
  reach: { pill: 100, arrow: 150, at: 50 },
  profile,
  ...over,
});

describe('differences', () => {
  it('has none for a Train mid-leg that nothing is near, which the card says is between its Stations', () => {
    expect(differences(moment(80, 1000))).toMatchObject({ says: { at: 'between', key: 'A – B' }, at: undefined, pill: undefined, arrow: undefined, nowFar: false, readsNow: false, pinnedAway: undefined, timeOff: 0 });
  });

  it('says nothing of a Train with no Station left to leave', () => {
    expect(differences(moment(300, 4000))).toBeUndefined();
  });

  it('has the card say it is arriving at the next Station as the pill covers it, so that nothing differs (#455)', () => {
    const d = differences(moment(125, 1950, { near: [{ key: 'B', metres: 50 }] }));
    expect(d).toMatchObject({ says: { at: 'arriving', key: 'B' }, atNextBeforeArriving: false, at: undefined, pill: undefined, arrow: undefined, graced: false });
  });

  it('has the card between its Stations where the pill is short of the next one, though its arrow covers it and the Train is drawn at it', () => {
    // A pill reaching 40 m, and its arrow 100 m, as at a zoom in.
    const d = differences(moment(125, 1950, { near: [{ key: 'B', metres: 50 }], reach: { pill: 40, arrow: 100, at: 50 } }));
    expect(d).toMatchObject({ says: { at: 'between', key: 'A – B' }, atNextBeforeArriving: true, at: 'next', pill: undefined, arrow: 'next', graced: true });
  });

  it('has the card say it is leaving the Station it left as far after it as the pill reaches, and that Station is the one it has it at', () => {
    const d = differences(moment(40, 100, { near: [{ key: 'A', metres: 100 }] }));
    expect(d).toMatchObject({ says: { at: 'leaving', key: 'A' }, at: undefined, pill: undefined });
  });

  it("has the card say it is arriving at the next Station where the pill covers its place's dot, though its platform is further along its Trip, as at an interchange (#455)", () => {
    // 350 m short of B's platform, with the pill reaching 100 m, and B's place's dot 80 m from it.
    const d = differences(moment(110, 1650, { near: [{ key: 'B', metres: 80 }] }));
    expect(d).toMatchObject({ says: { at: 'arriving', key: 'B' }, atNextBeforeArriving: false, at: undefined, pill: undefined, arrow: undefined });
  });

  it("goes by a call's own distance to its place's dot where it has one, and by `near` where it hasn't, so that near can be each Station by its coordinates", () => {
    // 350 m short of B's platform, the pill reaching 100 m, and the dot 80 m from the Train: `near` has only another Station of the place, 300 m away.
    const dotted = calls.map((c) => (c.key === 'B' ? { ...c, away: 80 } : c));
    expect(differences(moment(110, 1650, { near: [{ key: 'B', metres: 300 }], calls: dotted }))).toMatchObject({ says: { at: 'arriving', key: 'B' } });
    expect(differences(moment(110, 1650, { near: [{ key: 'B', metres: 300 }] }))).toMatchObject({ says: { at: 'between', key: 'A – B' } });
  });

  it('has its arrow, which points ahead, cover no Station it has left, and the next one as it comes into reach', () => {
    // 130 m past A, the pill reaching 100 m and its arrow 150: A is behind it.
    expect(differences(moment(40, 130, { near: [{ key: 'A', metres: 130 }] }))).toMatchObject({ says: { at: 'between' }, pill: undefined, arrow: undefined });
    // 140 m short of B: its arrow covers it, though the pill doesn't.
    expect(differences(moment(120, 1860, { near: [{ key: 'B', metres: 140 }] }))).toMatchObject({ says: { at: 'between' }, pill: undefined, arrow: 'next' });
  });

  it('has the pill cover the Station it left where the card says it is arriving at the next, on a leg shorter than twice its reach', () => {
    // 150 m from A to B, which the Train has 130 m to: A is 20 m behind it and B 130 m ahead, the pill reaching 130 m.
    const short = [{ station: 'a', key: 'A', arrival: 0, departure: 30, dist: 0 }, { station: 'b', key: 'B', arrival: 60, departure: 90, dist: 150 }];
    const d = differences(moment(40, 20, { calls: short, near: [{ key: 'A', metres: 20 }, { key: 'B', metres: 130 }], reach: { pill: 130, arrow: 180, at: 50 } }));
    expect(d).toMatchObject({ says: { at: 'arriving', key: 'B' }, at: 'otherCall', pill: 'otherCall', atNextBeforeArriving: false });
  });

  it("has a Train at a Station only within AT px of its dot, which is fewer metres the further in the zoom, so that a pill that reaches 32 m is not short of a dot 40 m off (#608)", () => {
    // Zoom 15: the pill reaches 32 m, its arrow 44.5 m and 7 px is 12.5 m. 40 m short of B's dot the card says between, the arrow covers it, and the Train is not at it.
    const zoomedIn = { pill: 32, arrow: 44.5, at: 12.5 };
    expect(differences(moment(125, 1960, { near: [{ key: 'B', metres: 40 }], reach: zoomedIn }))).toMatchObject({ says: { at: 'between', key: 'A – B' }, atNext: false, atNextBeforeArriving: false, at: undefined, arrow: 'next' });
    // As 50 m, which is 28 px there, it would be: drawn at B, which the card has no words for.
    expect(differences(moment(125, 1960, { near: [{ key: 'B', metres: 40 }], reach: { ...zoomedIn, at: 50 } }))).toMatchObject({ atNext: true, atNextBeforeArriving: true });
    // 10 m short of it the card says arriving, as the pill reaches that, and the Train is at it.
    expect(differences(moment(125, 1990, { near: [{ key: 'B', metres: 10 }], reach: zoomedIn }))).toMatchObject({ says: { at: 'arriving', key: 'B' }, atNext: true, atNextBeforeArriving: false });
  });

  it("counts a place the Train is drawn at only within AT px of its dot, as it counts the next Station (#608)", () => {
    // Between A and B, 30 m from X, which is no call: at it by 50 m, not by 7 px at zoom 15, where the pill reaches 32 m and covers it.
    const near = [{ key: 'X', metres: 30 }];
    expect(differences(moment(80, 1000, { near, reach: { pill: 100, arrow: 150, at: 50 } }))).toMatchObject({ at: 'notCall', atKey: 'X', pill: 'notCall' });
    expect(differences(moment(80, 1000, { near, reach: { pill: 32, arrow: 44.5, at: 12.5 } }))).toMatchObject({ at: undefined, atKey: undefined, pill: 'notCall' });
  });

  it('names a Station passed without stopping as not a call', () => {
    expect(differences(moment(60, 700, { near: [{ key: 'X', metres: 20 }] }))).toMatchObject({ at: 'notCall', pill: 'notCall', graced: false });
  });

  it('has the card say it is passing the place it passes without stopping, which it names, so that it is not a Station the card leaves unnamed (#457)', () => {
    // Between A and B, 1,000 m along: X, which it has no call at, 40 m away, under the pill (100 m) and within AT.
    const d = differences(moment(80, 1000, { near: [{ key: 'X', metres: 40 }], passed: { key: 'X', metres: 40 } }));
    expect(d).toMatchObject({ says: { at: 'passing', key: 'X' }, at: undefined, pill: undefined, arrow: undefined, atKey: undefined });
    // The same, the card not saying it: the Station it is drawn at and the pill covers is not a call, which cause 4 counted.
    expect(differences(moment(80, 1000, { near: [{ key: 'X', metres: 40 }] }))).toMatchObject({ says: { at: 'between', key: 'A – B' }, at: 'notCall', atKey: 'X', pill: 'notCall' });
  });

  it('leaves unnamed a second place that is as near, which the card has none of its words for, and one past its pill, as the card goes by the nearest within reach (#457)', () => {
    const near = [{ key: 'X', metres: 30 }, { key: 'Y', metres: 45 }, { key: 'Z', metres: 120 }];
    const d = differences(moment(80, 1000, { near, passed: { key: 'X', metres: 30 } }));
    expect(d).toMatchObject({ says: { at: 'passing', key: 'X' }, at: 'notCall', atKey: 'Y', pill: 'notCall' });
    // A place its pill doesn't reach is not named, and the card says between, as it did.
    const out = differences(moment(80, 1000, { near: [{ key: 'Z', metres: 120 }], passed: { key: 'Z', metres: 120 } }));
    expect(out).toMatchObject({ says: { at: 'between', key: 'A – B' }, at: undefined, pill: undefined, arrow: 'notCall' });
  });

  it('has the card name the Station it is arriving at, leaving or standing at before one it passes, as it did, so that what it passes is counted if drawn at it (#457)', () => {
    // 50 m short of B and within 50 m of X: arriving at B, the nearest it hasn't named is X.
    const arriving = differences(moment(125, 1950, { near: [{ key: 'B', metres: 50 }, { key: 'X', metres: 49 }], passed: { key: 'X', metres: 49 } }));
    expect(arriving).toMatchObject({ says: { at: 'arriving', key: 'B' }, at: 'notCall', atKey: 'X' });
    const leaving = differences(moment(40, 60, { near: [{ key: 'A', metres: 60 }, { key: 'X', metres: 30 }], passed: { key: 'X', metres: 30 } }));
    expect(leaving).toMatchObject({ says: { at: 'leaving', key: 'A' }, at: 'notCall', atKey: 'X' });
    const standing = differences(moment(140, 2000, { standing: true, near: [{ key: 'B', metres: 0 }, { key: 'X', metres: 30 }], passed: { key: 'X', metres: 30 } }));
    expect(standing).toMatchObject({ says: { at: 'standing', key: 'B' }, at: 'notCall', atKey: 'X' });
  });

  it('has the card at the Station it stands at, and the header saying so', () => {
    const d = differences(moment(140, 2000, { standing: true, near: [{ key: 'B', metres: 0 }] }));
    expect(d).toMatchObject({ says: { at: 'standing', key: 'B' }, standingHeaderNext: false, at: undefined, pill: undefined, atNextBeforeArriving: false });
  });

  it('has the minute-reading card, as a board reads, say now by the minute while the clock has not come to the card’s time, and by the Delay once it has', () => {
    // 1,500 m short of B at 2:05 (125 s), B due at 2:10 (130 s) in the same minute: the minute alone reads 0.
    expect(differences(moment(125, 500))).toMatchObject({ nowFar: true, nowByMinute: true, nowByDelay: false, toGo: 5 });
    // The clock past B's time by the Delay (+30 s) and the drawn Train still far short.
    expect(differences(moment(100, 500, { at: 170_000, delay: 30 }))).toMatchObject({ nowFar: true, nowByMinute: false, nowByDelay: true });
  });

  it('has the followed Train’s countdown read the seconds to go where the minute-reading card said now by the minute, and now only by the Delay (#456)', () => {
    // The same Train at 2:05, B due at 2:10: 5 s, where the minute alone read now.
    expect(differences(moment(125, 500))).toMatchObject({ reads: { n: 5, unit: 'seconds' }, nowFar: true, nowByMinute: true, countdownNowFar: false });
    // At 2:08, 2 s out.
    expect(differences(moment(128, 500))).toMatchObject({ reads: { n: 2, unit: 'seconds' }, nowFar: true, countdownNowFar: false });
    // The clock past B's time by the Delay (+30 s: B at 2:40) and the drawn Train still far short: now, by the Delay.
    expect(differences(moment(100, 500, { at: 170_000, delay: 30 }))).toMatchObject({ reads: { n: 0, unit: 'seconds' }, nowFar: true, nowByDelay: true, countdownNowFar: true });
    // B at 2:59.7 by the Delay (+49.7 s) and the clock at 2:00.2: the minute alone reads 0, but it's 59.5 s out, which is a minute and not 59 s.
    expect(differences(moment(100, 500, { at: 120_200, delay: 49.7 }))).toMatchObject({ readsNow: true, nowFar: true, nowByMinute: true, reads: { n: 1, unit: 'minutes' }, countdownNowFar: false });
  });

  it('has the countdown read the minutes a board shows before its last minute, and count to when the Train leaves while it stands (#456)', () => {
    // At 0:40, B due at 2:10 (90 s out): two minutes by the clock, which is what its board row reads.
    expect(differences(moment(40, 500))?.reads).toEqual({ n: 2, unit: 'minutes' });
    // Standing at B from 130 s to 160 s: its seconds to go are to its departure at 160 s, not its arrival at 130 s.
    expect(differences(moment(120, 2000, { standing: true, near: [{ key: 'B', metres: 0 }] }))?.reads).toEqual({ n: 40, unit: 'seconds' });
    expect(differences(moment(140, 2000, { standing: true, near: [{ key: 'B', metres: 0 }] }))?.reads).toEqual({ n: 20, unit: 'seconds' });
  });

  it('counts the card’s time with its Delay, by the map’s time `at`, and says which Station and which of its times', () => {
    const d = differences(moment(100, 1000, { at: 100_000, delay: 20 }));
    expect(d).toMatchObject({ expected: 150_000, countsTo: 'B arrives', reads: { n: 50, unit: 'seconds' } });
    expect(differences(moment(140, 2000, { standing: true }))).toMatchObject({ countsTo: 'B leaves' });
  });

  it('counts the card’s times with the Delay the Train is drawn at, and gives the time a board’s row has, which runs the Delay live data gave (#610)', () => {
    // 5 s late at 100 s, B due at 130 s: the card has B at 135 s. Live data said 20 s, which has it at 150 s: the card is 15 s earlier, and the drawn Train is 15 s ahead of that.
    const d = differences(moment(95, 1000, { now: 100, at: 100_000, delay: 5, reported: 20 }));
    expect(d).toMatchObject({ expected: 135_000, reportedAt: 150_000, reads: { n: 35, unit: 'seconds' }, timeOff: 15 });
    // With no report's Delay given, it's the card's.
    expect(differences(moment(95, 1000, { now: 100, at: 100_000, delay: 5 }))).toMatchObject({ expected: 135_000, reportedAt: 135_000, timeOff: 0 });
  });

  it('has the minute-reading card, as a board’s rows are, go by the Delay live data gave, which the card no longer runs (#610)', () => {
    // B due at 130 s. Drawn on time, with live data saying 30 s late: the card reads 20 s at 110 s, and a board's row, at 160 s, is in the next minute.
    const d = differences(moment(110, 1500, { at: 110_000, delay: 0, reported: 30 }));
    expect(d).toMatchObject({ expected: 130_000, reportedAt: 160_000, reads: { n: 20, unit: 'seconds' } });
    // At 2:05 it reads 5 s, and a board's row, by the report's 2:40, the minute alone: 0 minutes, with the Train 500 m short.
    expect(differences(moment(125, 1500, { at: 125_000, delay: 0, reported: 30 }))).toMatchObject({ readsNow: true, nowFar: true, nowByMinute: true, nowByDelay: false });
    // With live data a minute on, a board's row, 3:10, is in the next minute at 2:05, 1 minute, where the card's own time, 2:10 and 5 s, is not.
    expect(differences(moment(125, 1500, { at: 125_000, delay: 0, reported: 60 }))).toMatchObject({ readsNow: false, nowFar: false, reads: { n: 5, unit: 'seconds' } });
  });

  it('has no countdown for a Train standing at its Trip’s last Station, whose time is when it arrived, though the engine has it leave a dwell later (#607)', () => {
    // C is the last Station, due at 260 s, and the Train stays on the map until 290 s.
    const dwelt = [...calls.slice(0, 2), { station: 'c', key: 'C', arrival: 260, departure: 290, dist: 4000 }];
    const standing = differences(moment(270, 4000, { standing: true, calls: dwelt, near: [{ key: 'C', metres: 0 }] }));
    expect(standing).toMatchObject({ says: { at: 'standing', key: 'C' }, countdown: false, countsTo: 'C arrives', expected: 260_000, reportedAt: 260_000 });
    // On its way in it counts down to its arrival, and at B, before its last Station, to when it leaves.
    expect(differences(moment(250, 3800, { calls: dwelt }))).toMatchObject({ countdown: true, countsTo: 'C arrives', reads: { n: 10, unit: 'seconds' } });
    expect(differences(moment(140, 2000, { standing: true, calls: dwelt, near: [{ key: 'B', metres: 0 }] }))).toMatchObject({ countdown: true, countsTo: 'B leaves', reads: { n: 20, unit: 'seconds' } });
  });

  it('says whether the drawn Train is at its next Station without standing there, the last of its way in', () => {
    expect(differences(moment(125, 1980, { near: [{ key: 'B', metres: 20 }] }))).toMatchObject({ atNext: true, reads: { n: 5, unit: 'seconds' } });
    expect(differences(moment(140, 2000, { standing: true, near: [{ key: 'B', metres: 0 }] }))).toMatchObject({ atNext: false });
    expect(differences(moment(80, 1000))).toMatchObject({ atNext: false });
  });

  it('gives how far the Delay live data gave is from how late the Train is drawn, positive where the Train is drawn ahead of it', () => {
    // Live data's Delay has B at 130 + 90 s; drawn: 20 s behind its timetable at 100 s, so at B at 150 s.
    expect(differences(moment(80, 1000, { now: 100, at: 100_000, delay: 90 }))?.timeOff).toBeCloseTo(70);
  });

  it('flags a report pinned to a Station the Train is drawn far from', () => {
    expect(differences(moment(80, 1000, { pin: { dist: 2000, call: 1 } }))?.pinnedAway).toBe('short');
    expect(differences(moment(140, 2400, { pin: { dist: 0, call: 0 } }))?.pinnedAway).toBe('past');
    expect(differences(moment(80, 1900, { pin: { dist: 2000, call: 1 } }))?.pinnedAway).toBeUndefined();
  });
});

describe('the runner', () => {
  // 45 minutes of the rains of 7 October 2026, 16 Trips of Rodalies and Cercanías Madrid, as its replay is kept.
  const file = fileURLToPath(new URL('fixtures/replay-2026-10-07.json.gz', import.meta.url));
  const { bundle, received } = JSON.parse(gunzipSync(readFileSync(file)).toString()) as { bundle: Bundle; received: Received[] };
  // The runner takes each Network's live traits from src/networks.ts, as an older bundle's can differ.
  for (const network of bundle.networks) network.live = NETWORKS.find((n) => n.id === network.id)?.live ?? network.live;

  /** The runner's counts of every Train-second drawn, by Network, with the followed pill's zoom `zoom`, over the rains' replay or another. */
  function counted(zoom: number, replay: { bundle: Bundle; received: Received[] } = { bundle, received }): Record<string, Record<string, number>> {
    const dir = mkdtempSync(join(tmpdir(), 'card-vs-map-test-'));
    try {
      writeFileSync(join(dir, 'bundle.json'), JSON.stringify(replay.bundle));
      writeFileSync(join(dir, 'replay.json.gz'), gzipSync(JSON.stringify({ received: replay.received })));
      const script = fileURLToPath(new URL('./cardVsMapRun.ts', import.meta.url));
      const run = execFileSync(process.execPath, [script, dir], { encoding: 'utf8', env: { ...process.env, ZOOM: String(zoom) }, stdio: ['ignore', 'pipe', 'ignore'] });
      const results = JSON.parse(run).results[dir] as Record<string, { all: Record<string, number> }>;
      return Object.fromEntries(Object.entries(results).map(([network, { all }]) => [network, all]));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("counts a jump only for a Train that is Live in both seconds, as jumps() does, so that the second a report first places a Scheduled Train is not one (#534)", () => {
    // Kept as a Scheduled Train's distance too, the runner counts Rodalies' 18 and Madrid's 26.
    const theirs = Object.fromEntries(Object.entries(jumps(bundle, received)).map(([network, j]) => [network, j.forward + j.back]));
    expect(Object.fromEntries(Object.entries(counted(13)).map(([network, all]) => [network, all['delay.jumps'] ?? 0]))).toEqual(theirs);
  }, 60_000);

  it("counts no Train as drawn at its next Station without the card saying it is arriving at zoom 15, where the pill reaches 22 to 32 m and 50 m is 28 px (#608)", () => {
    // At 50 m, which is the zoom 13's 7 px, the runner counted 36 seconds of each of Rodalies' and Madrid's.
    const at15 = counted(15);
    // Trains drawn at all, so that the 0 is a count and not an absence.
    for (const all of Object.values(at15)) expect(all.seconds).toBeGreaterThan(5000);
    expect(Object.fromEntries(Object.entries(at15).map(([network, all]) => [network, all['1.atNextBeforeArriving'] ?? 0]))).toEqual({ rodalies: 0, 'cercanias-madrid': 0 });
  }, 60_000);

  it("has the card say arriving across the stretch between a Station's platform and the dot its place is shown by, as the runner reads the Stations' own coordinates, where Passeig de Gràcia's L3 Station is 204 m from its dot (#609)", () => {
    // A – B – C a kilometre apart along a line of latitude, and D of B's place 408 m before B: the place's dot, the middle of B and D, is 204 m before B's platform, over
    // twice the 73 m a two-letter badge's followed pill reaches at zoom 13. Without the stretch the card says arriving at the dot, between, and arriving at the platform.
    const [lat, day] = [41.4, '2026-10-07'];
    const lon = (metres: number) => 2.15 + metres / (DEGREE * Math.cos((lat * Math.PI) / 180));
    const noon = Date.parse(`${day}T00:00:00+02:00`);
    const where: [id: string, metres: number, place?: string][] = [['a', 0], ['b', 1000, 'bd'], ['c', 2000], ['d', 592, 'bd']];
    const interchange: Bundle = {
      serviceDay: day,
      noonMinus12h: noon,
      networks: [{ id: 'test', name: 'Test', profile: { acceleration: 1.3, braking: 1.3, topSpeed: 80 / 3.6, dwell: 20 }, runningSide: 'right', colour: '#000', pillZoom: 12, credit: { text: '', url: '' } }],
      lines: [{ id: 'L3', network: 'test', name: 'L3', colour: '#000', shapes: ['s'], kind: 'metro' }],
      stations: where.map(([id, metres, place]) => ({ id, name: id, lon: lon(metres), lat, ...(place && { place }) })),
      shapes: [{ id: 's', coords: [[lon(0), lat], [lon(2000), lat]], dist: [0, 2000] }],
      strokes: [],
      rails: [],
      slots: [],
      tracks: [],
      trips: [{ id: 't', line: 'L3', shape: 's', headsign: 'C', calls: [{ station: 'a', arrival: 36000, departure: 36000, dist: 0 }, { station: 'b', arrival: 36090, departure: 36120, dist: 1000 }, { station: 'c', arrival: 36210, departure: 36210, dist: 2000 }] }],
    };
    // From 10 s after its Train leaves A to 10 s after it comes to B, with no report: a Scheduled Train, drawn by its timetable.
    const read = (at: number): Received => ({ at, snapshot: { generated: at, feeds: {}, reports: [] } });
    const all = counted(13, { bundle: interchange, received: [read(noon + 36_010_000), read(noon + 36_100_000)] }).test ?? {};
    // The Train drawn, and arriving for some of it, so that no flap is a count and not an absence.
    expect(all.seconds).toBeGreaterThan(80);
    expect(all['w.arriving']).toBeGreaterThan(20);
    expect(all['w.flaps.other'] ?? 0).toBe(0);
  }, 60_000);

  // A – B – C a kilometre apart along a line of latitude, for the two tests below: a metro Line's Trip from A at 10:00:00 to C at 10:03:30, with a dwell of 30 s at C, which is its last Station.
  const [lat, day] = [41.4, '2026-10-07'];
  const lon = (metres: number) => 2.15 + metres / (DEGREE * Math.cos((lat * Math.PI) / 180));
  const noon = Date.parse(`${day}T00:00:00+02:00`);
  const line: Bundle = {
    serviceDay: day,
    noonMinus12h: noon,
    networks: [{ id: 'test', name: 'Test', profile: { acceleration: 1.3, braking: 1.3, topSpeed: 80 / 3.6, dwell: 30 }, runningSide: 'right', colour: '#000', pillZoom: 12, credit: { text: '', url: '' } }],
    lines: [{ id: 'L3', network: 'test', name: 'L3', colour: '#000', shapes: ['s'], kind: 'metro' }],
    stations: [['a', 0], ['b', 1000], ['c', 2000]].map(([id, metres]) => ({ id: String(id), name: String(id), lon: lon(Number(metres)), lat })),
    shapes: [{ id: 's', coords: [[lon(0), lat], [lon(2000), lat]], dist: [0, 2000] }],
    strokes: [],
    rails: [],
    slots: [],
    tracks: [],
    trips: [{ id: 't', line: 'L3', shape: 's', headsign: 'C', calls: [{ station: 'a', arrival: 36000, departure: 36000, dist: 0 }, { station: 'b', arrival: 36090, departure: 36120, dist: 1000 }, { station: 'c', arrival: 36210, departure: 36210, dist: 2000 }] }],
  };
  /** A snapshot a second `s` after 10:00:00, with live data's figure for the Trip's Delay where it gives one: no position, so the Train stays Scheduled by it. */
  const read = (s: number, delay?: number): Received => {
    const at = noon + (36_000 + s) * 1000;
    const feed = { lastSuccess: at, lastAttempt: at, status: 'ok' as const, every: 20_000 };
    return { at, snapshot: { generated: at, feeds: { test: feed }, reports: delay === undefined ? [] : [{ trip: 't', at, delay }] } };
  };

  it('counts the steps of a followed Train’s countdown by the Delay it is drawn at, which eases as a snapshot gives it a new one, so that none is a step as it arrives (#610)', () => {
    // On time at 10:00:20, and 15 s late at 10:00:50, 40 s from B: the Train slows to a quarter of its speed until it is, 20 s on. By live data's Delay it would be a step of 15 s to B's time.
    const all = counted(13, { bundle: line, received: [read(20, 0), read(50, 15), read(110)] }).test ?? {};
    expect(all['s.steps.of']).toBeGreaterThan(30);
    expect(all['s.steps.later2'] ?? 0).toBe(0);
    expect(all['s.steps.later10'] ?? 0).toBe(0);
    // The card's time is not the report's while it eases, which is what it's counted against, for its seconds, and the number stands still in some.
    expect(all['s.vsData.earlier5']).toBeGreaterThan(5);
    expect(all['s.vsData.later5'] ?? 0).toBe(0);
    expect(all['s.vsData.stood']).toBeGreaterThan(5);
  }, 60_000);

  it('counts the seconds the card’s time is later than live data’s by more than 5 s, which a Train drawn behind where a report has it is while it catches up, with no step of its own (#610)', () => {
    // 30 s late at 10:00:20, and on time at 10:00:50, 40 s from B: it's drawn 30 s behind where that has it, and runs faster, up to line speed, until it has caught up.
    const all = counted(13, { bundle: line, received: [read(20, 30), read(50, 0), read(110)] }).test ?? {};
    expect(all['s.vsData.later5']).toBeGreaterThan(5);
    expect(all['s.vsData.earlier5'] ?? 0).toBe(0);
    expect(all['s.steps.later2'] ?? 0).toBe(0);
  }, 60_000);

  it('counts the step of a Train standing at a Station apart, as its Delay is its timetable’s place at once where live data has it earlier, with nothing to ease (#610)', () => {
    // Standing at B from 10:01:30 to 10:02:00, on time. At 10:01:40 live data has it 15 s early: it leaves at 10:01:45, so its countdown goes from 20 s to 5 s.
    const all = counted(13, { bundle: line, received: [read(20, 0), read(100, -15), read(130)] }).test ?? {};
    expect(all['s.steps.earlier2']).toBe(1);
    expect(all['s.steps.earlier10']).toBe(1);
    expect(all['s.steps.earlier2.standing']).toBe(1);
    expect(all['s.steps.earlier2.jumped'] ?? 0).toBe(0);
  }, 60_000);

  it('counts the step of a Train that itself jumped apart: a report that has it 45 s early moves it over a kilometre at once, which is the map’s jump, not the card’s step (#610)', () => {
    // 8 km in 260 s at up to 160 km/h; at 10:03:30, 50 s from C, live data has it 45 s early: more than a kilometre ahead of where it's drawn, so it jumps there, 5 s from C.
    const quick: Bundle = {
      ...line,
      networks: [{ ...(line.networks[0] as Bundle['networks'][number]), profile: { ...profile, topSpeed: 160 / 3.6 } }],
      stations: [['a', 0], ['c', 8000]].map(([id, metres]) => ({ id: String(id), name: String(id), lon: lon(Number(metres)), lat })),
      shapes: [{ id: 's', coords: [[lon(0), lat], [lon(8000), lat]], dist: [0, 8000] }],
      trips: [{ id: 't', line: 'L3', shape: 's', headsign: 'C', calls: [{ station: 'a', arrival: 36000, departure: 36000, dist: 0 }, { station: 'c', arrival: 36260, departure: 36260, dist: 8000 }] }],
    };
    const all = counted(13, { bundle: quick, received: [read(20, 0), read(210, -45), read(240)] }).test ?? {};
    expect(all['s.steps.earlier2']).toBe(1);
    expect(all['s.steps.earlier2.jumped']).toBe(1);
    expect(all['s.steps.earlier2.standing'] ?? 0).toBe(0);
  }, 60_000);

  it('has no countdown for the seconds a Train stands at its Trip’s last Station, which it counted down in until its dwell was out, and counts how often it comes to stand there (#607)', () => {
    // It reaches C, its last Station, at 10:03:30, and stays 30 s.
    const all = counted(13, { bundle: line, received: [read(20), read(250)] }).test ?? {};
    expect(all['s.last.passages']).toBe(1);
    expect(all['s.last']).toBeGreaterThanOrEqual(30);
    expect(all['s.last']).toBeLessThanOrEqual(31);
    expect(all['s.reads.none']).toBe(all['s.last']);
    // The card counted down to the dwell's end there: seconds, and now once, or a few times.
    expect((all['s.last.was.seconds'] ?? 0) + (all['s.last.was.now'] ?? 0)).toBe(all['s.last']);
    expect(all['s.last.was.seconds']).toBeGreaterThanOrEqual(29);
    // None of those seconds is one of a countdown's steps, and a Train's last Station isn't one it turns back at.
    expect(all['s.last.loop'] ?? 0).toBe(0);
  }, 60_000);
});
