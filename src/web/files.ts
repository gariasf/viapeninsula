// How the map fetches the files it loads from LIVE_URL: the manifest, each day's track and Trips, the snapshot and the Alerts.

/**
 * How long a file of the map's load path may go with no bytes coming, in ms, before it fails (#595):
 * by its progress, not its length, as a track takes seconds on a slow link (450 KB, 9 s at 400 kbit/s).
 */
export const STALL = 20_000;

/**
 * Fetches a file of JSON. Where `stall` is given, it fails once that many ms go by with no bytes of it
 * coming, from the request on, so a file that keeps coming isn't cut and one that stalls fails as any
 * other does, for the map to look for again (#595). `signal` is the caller's own limit, a total one.
 */
export async function getJson<T>(url: string, { signal, stall }: { signal?: AbortSignal; stall?: number } = {}): Promise<T> {
  const cut = new AbortController();
  signal?.addEventListener('abort', () => cut.abort(signal.reason));
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Gives the file `stall` more from now: as the request is made, as its response comes, and as each part of its body does. */
  const wait = () => {
    clearTimeout(timer);
    if (stall) timer = setTimeout(() => cut.abort(new Error(`${url}: no bytes for ${stall / 1000} s`)), stall);
  };
  wait();
  try {
    const res = await fetch(url, { signal: cut.signal });
    wait();
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const coming = new TransformStream<Uint8Array, Uint8Array>({ transform: (part, out) => (wait(), out.enqueue(part)) });
    return (await new Response(res.body?.pipeThrough(coming)).json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
