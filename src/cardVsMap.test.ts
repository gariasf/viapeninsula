import { describe, expect, it } from 'vitest';
import { differences, type Moment } from './cardVsMap.ts';

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

  it('has the card at the Station it stands at, and the header saying so', () => {
    const d = differences(moment(140, 2000, { standing: true, near: [{ key: 'B', metres: 0 }] }));
    expect(d).toMatchObject({ says: { at: 'standing', key: 'B' }, standingHeaderNext: false, at: undefined, pill: undefined, atNextBeforeArriving: false });
  });

  it('reads now by the minute while the clock has not come to the card’s time, and by the Delay once it has', () => {
    // 1,500 m short of B at 2:05 (125 s), B due at 2:10 (130 s) in the same minute: the minute alone reads 0.
    expect(differences(moment(125, 500))).toMatchObject({ nowFar: true, nowByMinute: true, nowByDelay: false, toGo: 5 });
    // The clock past B's time by the Delay (+30 s) and the drawn Train still far short.
    expect(differences(moment(100, 500, { at: 170_000, delay: 30 }))).toMatchObject({ nowFar: true, nowByMinute: false, nowByDelay: true });
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
