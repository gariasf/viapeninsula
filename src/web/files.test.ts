import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getJson, STALL } from './files.ts';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/**
 * A fetch that answers at once, with a body the test gives bytes as it likes, and that fails with the
 * request's abort reason where its signal aborts, as the browser's does a body it is still reading.
 */
function answering() {
  let body: ReadableStreamDefaultController<Uint8Array> | undefined;
  vi.stubGlobal('fetch', (_url: string, { signal }: RequestInit = {}) => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        body = controller;
        signal?.addEventListener('abort', () => controller.error(signal.reason));
      },
    });
    return Promise.resolve(new Response(stream));
  });
  const text = new TextEncoder();
  return { send: (part: string) => body?.enqueue(text.encode(part)), end: () => body?.close() };
}

/** What a request has come to so far: its file, the reason it failed, or nothing yet. */
function outcome(file: Promise<unknown>) {
  const state: { came?: unknown; failed?: string } = {};
  file.then(
    (came) => (state.came = came),
    (error: Error) => (state.failed = error.message),
  );
  return state;
}

test("a file that keeps coming isn't cut, however long it takes in all", async () => {
  const server = answering();
  const file = outcome(getJson('https://live.test/track.json', { stall: STALL }));
  // Six parts 15 s apart: 90 s in all, and never STALL with no bytes, as a 450 KB track at 400 kbit/s is slow but moving.
  for (const part of ['{"stations":', '[1,', '2,', '3,', '4]', '}']) {
    await vi.advanceTimersByTimeAsync(15_000);
    server.send(part);
  }
  server.end();
  await vi.advanceTimersByTimeAsync(0);
  expect(file).toEqual({ came: { stations: [1, 2, 3, 4] } });
});

test('a file with no bytes for STALL fails, the part of it that came counting for nothing', async () => {
  const server = answering();
  const file = outcome(getJson('https://live.test/trips.json', { stall: STALL }));
  server.send('{"trips":[1,');
  await vi.advanceTimersByTimeAsync(STALL - 1);
  expect(file).toEqual({});
  await vi.advanceTimersByTimeAsync(1);
  expect(file.failed).toBe('https://live.test/trips.json: no bytes for 20 s');
});

test('a request that is never answered fails as STALL goes by', async () => {
  vi.stubGlobal('fetch', (_url: string, { signal }: RequestInit = {}) => new Promise((_, reject) => signal?.addEventListener('abort', () => reject(signal.reason))));
  const file = outcome(getJson('https://live.test/manifest.json', { stall: STALL }));
  await vi.advanceTimersByTimeAsync(STALL - 1);
  expect(file).toEqual({});
  await vi.advanceTimersByTimeAsync(1);
  expect(file.failed).toBe('https://live.test/manifest.json: no bytes for 20 s');
});

test("a request given no stall waits as long as the browser does, as the page's first manifest, which its top-level await needs, does", async () => {
  const server = answering();
  const file = outcome(getJson('https://live.test/manifest.json'));
  await vi.advanceTimersByTimeAsync(10 * STALL);
  server.send('{"days":[]}');
  server.end();
  await vi.advanceTimersByTimeAsync(0);
  expect(file).toEqual({ came: { days: [] } });
});

test("a request's own signal ends it as it did, which the snapshot's and Alerts' ten seconds are", async () => {
  answering();
  const own = new AbortController();
  const file = outcome(getJson('https://live.test/snapshot.json', { signal: own.signal, stall: STALL }));
  await vi.advanceTimersByTimeAsync(10_000);
  own.abort(new Error('ten seconds'));
  await vi.advanceTimersByTimeAsync(0);
  expect(file.failed).toBe('ten seconds');
});
