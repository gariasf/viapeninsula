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
  it('has none for a Train mid-leg that nothing is near', () => {
    expect(differences(moment(80, 1000))).toMatchObject({ at: undefined, pill: undefined, arrow: undefined, nowFar: false, readsNow: false, pinnedAway: undefined, timeOff: 0 });
  });

  it('says nothing of a Train with no Station left to leave', () => {
    expect(differences(moment(300, 4000))).toBeUndefined();
  });

  it('has the card at the Station it left, and the pill covering the next one as it comes in', () => {
    const d = differences(moment(125, 1950, { near: [{ key: 'B', metres: 50 }] }));
    expect(d).toMatchObject({ atNextBeforeArriving: true, at: 'next', pill: 'next', arrow: 'next', graced: true });
  });

  it('names a Station passed without stopping as not a call', () => {
    expect(differences(moment(60, 700, { near: [{ key: 'X', metres: 20 }] }))).toMatchObject({ at: 'notCall', pill: 'notCall', graced: false });
  });

  it('has the card at the Station it stands at, and the header still saying next', () => {
    const d = differences(moment(140, 2000, { standing: true, near: [{ key: 'B', metres: 0 }] }));
    expect(d).toMatchObject({ standingHeaderNext: true, at: undefined, pill: undefined, atNextBeforeArriving: false });
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
