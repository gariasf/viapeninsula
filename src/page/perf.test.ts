import { describe, expect, it } from 'vitest';
import budget from './budget.json' with { type: 'json' };
import { compare, heapAfterGC, median, metrics, secondDayAt, type Run } from './perf.ts';

/** Frames every 8 ms over [from, to), but for each gap given as [from the first frame at or after, ms]. */
const frames = (from: number, to: number, gaps: [number, number][] = []) => {
  const out: number[] = [];
  const todo = [...gaps];
  for (let t = from; t < to; ) {
    out.push(t);
    t += todo[0] && todo[0][0] <= t ? todo.shift()![1] : 8;
  }
  return out;
};
const run = (r: Partial<Run>): Run => ({ scenario: 'S2', device: 'desktop', tree: '.', run: 1, marks: [], frames: [], setData: [], renders: [], files: [], errors: [], ...r });
const mark = (name: string, t: number, task = 0) => ({ name, t, task });

describe('heapAfterGC', () => {
  it('reads the JS heap after a full GC, in MB (#779)', async () => {
    const sent: string[] = [];
    const send = async (method: string) => {
      sent.push(method);
      return { metrics: [{ name: 'TaskDuration', value: 3 }, { name: 'JSHeapUsedSize', value: 341_400_000 }] };
    };
    expect(await heapAfterGC({ send } as never)).toBe(341);
    expect(sent).toEqual(['HeapProfiler.collectGarbage', 'Performance.getMetrics']);
  });
});

describe('metrics', () => {
  it("reads a cold load's first Lines and Trains from the setData calls, from navigation's start, its gap after the Lines, its workers, and long distance's join (S6)", () => {
    const m = metrics(
      run({
        marks: [mark('nav', 100), mark('end', 30_100)],
        frames: frames(0, 30_100, [[1000, 300], [20_000, 900]]),
        setData: [[300, 'lines', 0], [700, 'lines', -1], [1200, 'trains', 0], [1500, 'trains', 40]],
        files: [{ file: 'days/track-long-distance-abc.json', end: 19_990 }],
        workerMs: 1200,
      }),
    );
    expect(m).toMatchObject({ firstLines: 700, firstTrains: 1500, gapAfterLines: 900, workerFirst15s: 1200, joinMaxGap: 900, joinFrozen: 900 });
  });

  it("takes a zoom's steps with no join apart from those a day's file came in, which count as joins for 5 s", () => {
    const m = metrics(
      run({
        scenario: 'S3',
        marks: [mark('zoomStart', 1000), mark('z11', 3000), mark('z10', 5000), mark('z9', 12_000), mark('end', 14_000)],
        frames: frames(0, 14_000, [[2000, 30], [5400, 200], [6000, 120], [11_000, 60], [13_000, 40]]),
        files: [{ file: 'days/2026-10-12-abc.json', end: 5100 }, { file: 'snapshot.json', end: 2000 }],
        heapMB: 400,
        heapPeakMB: 1600,
      }),
    );
    // The join's window, 5.1 to 10.1 s, freezes 200 + 120 ms; the 60 ms gap at 11 s is in the step from 5 s, which the window
    // overlaps, and the 40 ms one at 13 s in the wait before `end`, no step.
    expect(m).toMatchObject({ joinMaxGap: 200, joinFrozen: 320, stepMaxGap: 30, heapMB: 400, heapPeakMB: 1600 });
  });

  it("counts a gap in the window its frame ends in, so a gap across a mark isn't lost", () => {
    const m = metrics(run({ scenario: 'S8', marks: [mark('followStart', 1000, 2), mark('end', 3000, 2.5)], frames: frames(0, 3000, [[960, 100]]) }));
    // The frames from 1060 to 2996 ms, over 2 s.
    expect(m.followFps).toBe(121.5);
    expect(m.followMainMsPerS).toBe(250);
  });

  it("reads the rest's main thread and the redraws beyond the Trains' draws", () => {
    const m = metrics(
      run({
        scenario: 'S5bcn',
        marks: [mark('idleStart', 0, 10), mark('end', 10_000, 11.5)],
        renders: Array.from({ length: 250 }, (_, i) => i * 40),
        setData: Array.from({ length: 200 }, (_, i) => [i * 50, 'trains', 300] as [number, string, number]),
      }),
    );
    expect(m).toMatchObject({ restMainMsPerS: 150, restExtraRedrawsPerS: 5 });
  });

  it("finds the second day's join in its own files (S7)", () => {
    const m = metrics(run({ scenario: 'S7', clock: Date.parse('2026-10-12T23:00:00+02:00'), marks: [mark('joinWatch', 0), mark('end', 10_000)], frames: frames(0, 10_000, [[4000, 500]]), files: [{ file: 'days/2026-10-13-abc.json', end: 3990 }, { file: 'days/2026-10-12-abc.json', end: 3000 }] }));
    expect(m).toMatchObject({ joinMaxGap: 500, joinFrozen: 500 });
  });
});

describe('median', () => {
  it('takes the middle of an odd count and the mean of the middle two of an even', () => {
    expect([median([3, 1, 2]), median([4, 1, 3, 2]), median([])]).toEqual([2, 2.5, undefined]);
  });
});

describe('compare', () => {
  it("holds each scenario's medians to its rows' limits, at most or at least, and leaves a row the device has none for", () => {
    const rows = compare(budget, 'phone', { S8: { followMainMsPerS: 650, followFps: 37 }, S2: { workerFirst15s: 4000, firstLines: 1600 } });
    expect(rows.map(({ metric, scenario, value, limit, breach }) => [metric, scenario, value, limit, breach])).toEqual([
      ['firstLines', 'S2', 1600, 1500, true],
      ['followMainMsPerS', 'S8', 650, 700, false],
      ['followFps', 'S8', 37, 55, true],
    ]);
  });
});

describe('secondDayAt', () => {
  it("is 20 s before the earliest of the next day's regions comes within the hour", () => {
    const from = Date.parse('2026-10-13T04:30:00+02:00');
    const manifest = { regions: [{ id: 'a', days: [{ date: '2026-10-12', from: 0, to: 1, trips: 'x' }, { date: '2026-10-13', from, to: from + 1, trips: 'y' }] }, { id: 'b', days: [{ date: '2026-10-13', from: from + 60_000, to: from + 2, trips: 'z' }] }] };
    expect(secondDayAt(manifest as never, Date.parse('2026-10-12T18:00:00+02:00'))).toBe(from - 60 * 60_000 - 20_000);
  });
});
