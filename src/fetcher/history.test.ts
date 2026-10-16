import { gunzipSync } from 'node:zlib';
import { afterEach, expect, test, vi } from 'vitest';
import { keepSnapshot, type Bucket, type Rows } from './history.ts';
import { EVERY, TIMEOUT } from './step.ts';

/** The Durable Object's storage, as much of it as the fetcher uses: its rows, in the order of their keys. */
class Storage implements Rows {
  rows = new Map<string, string>();
  async put(key: string, value: string) {
    this.rows.set(key, value);
  }
  async list({ prefix, end }: { prefix: string; end: string }) {
    return new Map([...this.rows].filter(([key]) => key.startsWith(prefix) && key < end).sort(([a], [b]) => (a < b ? -1 : 1)));
  }
  async delete(keys: string[]) {
    return keys.filter((key) => this.rows.delete(key)).length;
  }
}

/** The history's bucket, which keeps every object it's given, once it has refused as many writes as it's told to, as R2 might while it's down. */
class FakeBucket implements Bucket {
  objects = new Map<string, ArrayBuffer>();
  refusals: number;
  constructor(refusals = 0) {
    this.refusals = refusals;
  }
  async put(key: string, value: ArrayBuffer) {
    if (this.refusals-- > 0) throw new Error('We encountered an internal error. Please try again.');
    this.objects.set(key, value);
  }
}

/** A run's snapshot, as the fetcher writes it to snapshot.json. */
const snapshotAt = (at: number) => JSON.stringify({ generated: at, feeds: {}, reports: [] });

/** One run after another, as the fetcher's alarm has them, each keeping its snapshot. */
async function runs(storage: Rows, bucket: Bucket, times: number[]) {
  for (const at of times) await keepSnapshot(storage, bucket, snapshotAt(at), at);
}

/** Every 20 s from a moment, as the fetcher runs, for a number of runs. */
const every20s = (from: string, count: number) => Array.from({ length: count }, (_, i) => Date.parse(from) + i * 20_000);

/** The snapshots held, as a run left them. */
const held = (storage: Storage) => [...storage.rows.values()];

/** An object's text, gunzipped. */
const unzipped = (object: ArrayBuffer | undefined) => gunzipSync(Buffer.from(object!)).toString();

/** The text of a slot's object: a line for each run's snapshot, as snapshot.json held it. */
const lines = (times: number[]) => times.map((at) => `${snapshotAt(at)}\n`).join('');

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test("holds each run's snapshot until its 5-minute slot ends, then puts the slot's as one gzipped object, a line for each run, named by the slot's day and start in UTC, and deletes them", async () => {
  const storage = new Storage();
  const bucket = new FakeBucket();
  // 23:55 to 23:59:45 UTC on 24 October is 01:55 to 01:59:45 in Madrid on the 25th.
  const slot = every20s('2026-10-24T23:55:05Z', 15);
  await runs(storage, bucket, slot);
  expect(bucket.objects.size).toBe(0);
  const next = Date.parse('2026-10-25T00:00:05Z');
  await runs(storage, bucket, [next]);
  expect([...bucket.objects.keys()]).toEqual(['history/2026-10-24/2355.ndjson.gz']);
  expect(unzipped(bucket.objects.get('history/2026-10-24/2355.ndjson.gz'))).toBe(lines(slot));
  expect(held(storage)).toEqual([snapshotAt(next)]);
});

test('holds a slot whose put failed for the next run, which puts it, and never fails the run', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const storage = new Storage();
  const bucket = new FakeBucket(1);
  const slot = every20s('2026-10-16T12:00:05Z', 15);
  await runs(storage, bucket, slot);
  const [refused, next] = every20s('2026-10-16T12:05:05Z', 2) as [number, number];
  await expect(keepSnapshot(storage, bucket, snapshotAt(refused), refused)).resolves.toBeUndefined();
  expect(bucket.objects.size).toBe(0);
  expect(log).toHaveBeenCalledWith(expect.stringContaining('history/2026-10-16/1200.ndjson.gz'));
  expect(held(storage)).toEqual([...slot, refused].map(snapshotAt));
  await runs(storage, bucket, [next]);
  expect(unzipped(bucket.objects.get('history/2026-10-16/1200.ndjson.gz'))).toBe(lines(slot));
  expect(held(storage)).toEqual([refused, next].map(snapshotAt));
});

test("never holds more than two slots' rows while the bucket refuses every write: a third slot drops the oldest, and the logs say so", async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const storage = new Storage();
  const bucket = new FakeBucket(Infinity);
  for (const at of every20s('2026-10-16T12:00:05Z', 60)) {
    await keepSnapshot(storage, bucket, snapshotAt(at), at);
    const times = held(storage).map((row) => (JSON.parse(row) as { generated: number }).generated);
    // This run's slot, and the one before it.
    expect(Math.min(...times)).toBeGreaterThanOrEqual(at - (at % 300_000) - 300_000);
  }
  expect(held(storage)).toEqual(every20s('2026-10-16T12:10:05Z', 30).map(snapshotAt));
  expect(log.mock.calls.map(([line]) => JSON.parse(line))).toContainEqual({ history: 'history/2026-10-16/1200.ndjson.gz', dropped: 15 });
});

test("gives up on a bucket that doesn't answer, so that a run that waited as long as it can for a fetch too still ends before the next is due, and holds the slot for it", async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const storage = new Storage();
  const slot = every20s('2026-10-16T12:00:05Z', 15);
  await runs(storage, new FakeBucket(), slot);
  let asked!: () => void;
  const putAsked = new Promise<void>((resolve) => (asked = resolve));
  const silent: Bucket = {
    put: () => {
      asked();
      return new Promise(() => {});
    },
  };
  const at = Date.parse('2026-10-16T12:05:05Z');
  const run = keepSnapshot(storage, silent, snapshotAt(at), at);
  await putAsked;
  await vi.advanceTimersByTimeAsync(EVERY - TIMEOUT);
  await run;
  expect(held(storage)).toEqual([...slot, at].map(snapshotAt));
  expect(log).toHaveBeenCalledWith(expect.stringContaining('history/2026-10-16/1200.ndjson.gz'));
});

test("never fails the run, though the Durable Object's storage fails too, and the logs say why", async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const broken = Object.assign(new Storage(), { put: () => Promise.reject(new Error('Durable Object storage operation exceeded timeout')) });
  const at = Date.parse('2026-10-16T12:05:05Z');
  await expect(keepSnapshot(broken, new FakeBucket(), snapshotAt(at), at)).resolves.toBeUndefined();
  expect(log).toHaveBeenCalledWith(expect.stringContaining('exceeded timeout'));
});
