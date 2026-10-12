import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getJson, STALL } from './files.ts';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/**
 * A fetch that answers after `headers` ms, with a body the test gives bytes as it likes, and that fails with
 * the request's abort reason where its signal aborts, as the browser's does, before its headers or while
 * its body is still being read.
 */
function answering(headers = 0) {
  let body: ReadableStreamDefaultController<Uint8Array> | undefined;
  vi.stubGlobal(
    'fetch',
    (_url: string, { signal }: RequestInit = {}) =>
      new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(signal.reason);
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            body = controller;
            signal?.addEventListener('abort', () => controller.error(signal.reason));
          },
        });
        const answer = setTimeout(() => resolve(new Response(stream)), headers);
        signal?.addEventListener('abort', () => (clearTimeout(answer), reject(signal.reason)));
      }),
  );
  const text = new TextEncoder();
  return { send: (part: string) => body?.enqueue(text.encode(part)), end: () => body?.close(), reset: (error: Error) => body?.error(error) };
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

test("a response's headers are bytes: a body that starts 15 s after headers that took 15 s isn't cut", async () => {
  const server = answering(15_000);
  const file = outcome(getJson('https://live.test/trips.json', { stall: STALL }));
  await vi.advanceTimersByTimeAsync(15_000);
  // The request is 15 s old, and 15 s on it is 30 s, with the headers in at 15 s.
  await vi.advanceTimersByTimeAsync(15_000);
  expect(file).toEqual({});
  server.send('{"trips":[]}');
  server.end();
  await vi.advanceTimersByTimeAsync(0);
  expect(file).toEqual({ came: { trips: [] } });
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

test("a file asked behind others of its look isn't cut while their bytes come, and is once none of any have come for STALL (#721)", async () => {
  const look = { at: 0 };
  const ahead = answering();
  const first = outcome(getJson('https://live.test/days/trips-12.json', { stall: STALL, progress: look }));
  // Over one link the CDN sends a look's files in the order asked: the one behind has no bytes of its own while the first's come.
  answering(10 * STALL);
  const behind = outcome(getJson('https://live.test/days/trips-13.json', { stall: STALL, progress: look }));
  for (const part of ['{"trips":', '[1,', '2,']) {
    await vi.advanceTimersByTimeAsync(15_000);
    ahead.send(part);
  }
  // 45 s in, with none of its own bytes, and the first's last at 45 s.
  expect(behind).toEqual({});
  // Then no bytes of either for STALL: the link has stalled, and both are cut.
  await vi.advanceTimersByTimeAsync(STALL - 1);
  expect([first, behind]).toEqual([{}, {}]);
  await vi.advanceTimersByTimeAsync(1);
  expect([first.failed, behind.failed]).toEqual(['https://live.test/days/trips-12.json: no bytes for 20 s', 'https://live.test/days/trips-13.json: no bytes for 20 s']);
});

test("a file asked once its look's last bytes have come has STALL from its own request, as a day's Trips asked once its tracks have (#721)", async () => {
  const look = { at: 0 };
  const track = answering();
  outcome(getJson('https://live.test/days/track.json', { stall: STALL, progress: look }));
  await vi.advanceTimersByTimeAsync(5_000);
  track.send('{"stations":[]}');
  track.end();
  await vi.advanceTimersByTimeAsync(5_000);
  // Asked at 10 s, 5 s after the look's last bytes, and nothing comes.
  answering(10 * STALL);
  const trips = outcome(getJson('https://live.test/days/trips-13.json', { stall: STALL, progress: look }));
  await vi.advanceTimersByTimeAsync(STALL - 1);
  expect(trips).toEqual({});
  await vi.advanceTimersByTimeAsync(1);
  expect(trips.failed).toBe('https://live.test/days/trips-13.json: no bytes for 20 s');
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

test('a response that is not ok fails with its status, whatever its body says, and leaves no timer running', async () => {
  vi.stubGlobal('fetch', async () => new Response('{"trips":[]}', { status: 503 }));
  const file = outcome(getJson('https://live.test/trips.json', { stall: STALL }));
  await vi.advanceTimersByTimeAsync(0);
  expect(file.failed).toBe('https://live.test/trips.json: HTTP 503');
  expect(vi.getTimerCount()).toBe(0);
});

test('no timer is left running once a file has come, or its body has failed, or it has been cut', async () => {
  const came = answering();
  const first = outcome(getJson('https://live.test/track.json', { stall: STALL }));
  came.send('{"stations":[]}');
  came.end();
  await vi.advanceTimersByTimeAsync(0);
  expect(first).toEqual({ came: { stations: [] } });
  expect(vi.getTimerCount()).toBe(0);

  const reset = answering();
  const second = outcome(getJson('https://live.test/trips.json', { stall: STALL }));
  reset.send('{"trips":[');
  await vi.advanceTimersByTimeAsync(5_000);
  reset.reset(new Error('connection reset'));
  await vi.advanceTimersByTimeAsync(0);
  expect(second.failed).toBe('connection reset');
  expect(vi.getTimerCount()).toBe(0);

  answering();
  const third = outcome(getJson('https://live.test/trips.json', { stall: STALL }));
  await vi.advanceTimersByTimeAsync(STALL);
  expect(third.failed).toBe('https://live.test/trips.json: no bytes for 20 s');
  expect(vi.getTimerCount()).toBe(0);
});
