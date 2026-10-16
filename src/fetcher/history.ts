// The fetcher's history: each run's snapshot, kept for the daily job that works out each Call's Delay
// from them (#329, #806). A run holds its snapshot as a row in the Durable Object's storage, and the
// first run after each 5-minute slot puts that slot's, gzipped, as one object in a bucket of its own,
// a line for each run as snapshot.json held them, under a name the job knows, as it can't list a
// bucket (docs/research/punctuality.md, section 2). It goes after the snapshot's own write, and never
// fails a run.

/** What the fetcher uses of the Durable Object's storage. */
export interface Rows {
  put(key: string, value: string): Promise<void>;
  list(options: { prefix: string; end: string }): Promise<Map<string, string>>;
  delete(keys: string[]): Promise<number>;
}

/** What the fetcher uses of the history's bucket. */
export interface Bucket {
  put(key: string, value: ArrayBuffer): Promise<unknown>;
}

/** How long a slot is, in ms: each 5 minutes from 00:00 UTC. */
const SLOT = 300_000;

/**
 * How long a run waits for the history's bucket to answer, in ms: a run that also waited TIMEOUT for a fetch that hung
 * (step.ts) still ends before the next is due, so that a bucket that hangs doesn't hold the next snapshot back.
 */
const WAIT = 5_000;

/** Where a run's snapshot is held until its slot is put: under this, and the run's time in ms since 1970, whose 13 digits, until 2286, sort as the number does. */
const ROWS = 'history:';

/** Where a run's snapshot is held, by the run's time. */
const keyOf = (at: number) => `${ROWS}${at}`;

/** When a moment's slot starts, in ms since 1970. */
const startOf = (at: number) => at - (at % SLOT);

/** The slot of a run whose snapshot is held under a key. */
const slotOf = (key: string) => startOf(Number(key.slice(ROWS.length)));

/** A slot's object: `history/<UTC day>/<hhmm>.ndjson.gz`, by when it starts, in UTC, so that the night the clocks go back has no two 02:30s. */
function nameOf(slot: number) {
  const at = new Date(slot).toISOString();
  return `history/${at.slice(0, 10)}/${at.slice(11, 13)}${at.slice(14, 16)}.ndjson.gz`;
}

/** Text, gzipped, which Cloudflare's runtime and Node both do with a standard stream. */
const gzip = (text: string) => new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();

/** Puts an object in a bucket, or gives up after WAIT. A pending timer keeps the run going, so it's cleared once the bucket answers. */
async function putWithin(bucket: Bucket, name: string, body: ArrayBuffer) {
  let timer!: ReturnType<typeof setTimeout>;
  const silent = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`no answer in ${WAIT / 1000} s`)), WAIT)));
  try {
    await Promise.race([bucket.put(name, body), silent]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Holds a run's snapshot, and puts the slot before this run's, where its rows are held. A slot whose put fails is held for
 * the next runs to put, until a third slot starts. It never fails the run: what fails goes in the Worker's logs.
 */
export async function keepSnapshot(storage: Rows, bucket: Bucket, snapshot: string, now: number) {
  let name: string | undefined;
  try {
    // The rows of the slots before this run's, oldest first: none on most runs.
    const ended = [...(await storage.list({ prefix: ROWS, end: keyOf(startOf(now)) }))];
    const last = ended.at(-1);
    if (!last) return await storage.put(keyOf(now), snapshot);
    const slot = slotOf(last[0]);
    const older = ended.filter(([key]) => slotOf(key) < slot);
    // Beside this run's, one slot is held at most, so that a bucket that refuses writes can't grow the storage
    // for ever: the older go, before this run's is held, and the logs say how many runs' snapshots they had.
    // ponytail: the oldest goes with no last try, so a bucket that refuses writes for 5 to 10 minutes loses a slot;
    // hold more slots if outages grow longer.
    if (older.length) {
      await storage.delete(older.map(([key]) => key));
      console.log(JSON.stringify({ history: nameOf(slotOf(older[0]![0])), dropped: older.length }));
    }
    await storage.put(keyOf(now), snapshot);
    const rows = ended.slice(older.length);
    name = nameOf(slot);
    // ponytail: while the bucket refuses writes, each run gzips the held slot again, about 7 ms of CPU at midday;
    // hold its gzipped bytes instead if outages grow long.
    await putWithin(bucket, name, await gzip(rows.map(([, line]) => `${line}\n`).join('')));
    await storage.delete(rows.map(([key]) => key));
  } catch (error) {
    console.log(JSON.stringify({ history: name ?? null, error: String(error) }));
  }
}
