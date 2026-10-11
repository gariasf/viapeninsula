import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { Bundle } from './bundle.ts';
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
  reach: { pill: 100, arrow: 150 },
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
    const d = differences(moment(125, 1950, { near: [{ key: 'B', metres: 50 }], reach: { pill: 40, arrow: 100 } }));
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
    const d = differences(moment(40, 20, { calls: short, near: [{ key: 'A', metres: 20 }, { key: 'B', metres: 130 }], reach: { pill: 130, arrow: 180 } }));
    expect(d).toMatchObject({ says: { at: 'arriving', key: 'B' }, at: 'otherCall', pill: 'otherCall', atNextBeforeArriving: false });
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

  it('says whether the drawn Train is at its next Station without standing there, the last of its way in', () => {
    expect(differences(moment(125, 1980, { near: [{ key: 'B', metres: 20 }] }))).toMatchObject({ atNext: true, reads: { n: 5, unit: 'seconds' } });
    expect(differences(moment(140, 2000, { standing: true, near: [{ key: 'B', metres: 0 }] }))).toMatchObject({ atNext: false });
    expect(differences(moment(80, 1000))).toMatchObject({ atNext: false });
  });

  it('gives how far the card’s time is from the drawn Train’s, positive where the Train is drawn ahead of its Delay', () => {
    // Card: B at 130 + 90 s late; drawn: 20 s behind its timetable at 100 s, so at B at 150 s.
    expect(differences(moment(80, 1000, { now: 100, at: 100_000, delay: 90 }))?.timeOff).toBeCloseTo(70);
  });

  it('flags a report pinned to a Station the Train is drawn far from', () => {
    expect(differences(moment(80, 1000, { pin: { dist: 2000, call: 1 } }))?.pinnedAway).toBe('short');
    expect(differences(moment(140, 2400, { pin: { dist: 0, call: 0 } }))?.pinnedAway).toBe('past');
    expect(differences(moment(80, 1900, { pin: { dist: 2000, call: 1 } }))?.pinnedAway).toBeUndefined();
  });
});

describe('the runner', () => {
  it("counts a jump only for a Train that is Live in both seconds, as jumps() does, so that the second a report first places a Scheduled Train is not one (#534)", () => {
    // 45 minutes of the rains of 7 October 2026, 16 Trips of Rodalies and Cercanías Madrid: kept as a Scheduled Train's distance too, the runner counts 18 and 26.
    const file = fileURLToPath(new URL('fixtures/replay-2026-10-07.json.gz', import.meta.url));
    const { bundle, received } = JSON.parse(gunzipSync(readFileSync(file)).toString()) as { bundle: Bundle; received: Received[] };
    // The runner takes each Network's live traits from src/networks.ts, as an older bundle's can differ.
    for (const network of bundle.networks) network.live = NETWORKS.find((n) => n.id === network.id)?.live ?? network.live;
    const dir = mkdtempSync(join(tmpdir(), 'card-vs-map-test-'));
    try {
      writeFileSync(join(dir, 'bundle.json'), JSON.stringify(bundle));
      copyFileSync(file, join(dir, 'replay.json.gz'));
      const run = execFileSync(process.execPath, [fileURLToPath(new URL('./cardVsMapRun.ts', import.meta.url)), dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const counted = Object.entries(JSON.parse(run).results[dir] as Record<string, { all: Record<string, number> }>).map(([network, { all }]) => [network, all['delay.jumps'] ?? 0]);
      expect(Object.fromEntries(counted)).toEqual(Object.fromEntries(Object.entries(jumps(bundle, received)).map(([network, j]) => [network, j.forward + j.back])));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
