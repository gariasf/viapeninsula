// How the map fetches the files it loads from LIVE_URL: the manifest, each day's track and Trips, the snapshot and the Alerts.

/**
 * How long a file of the map's load path may go with no bytes coming, in ms, before it fails (#595):
 * by its progress, not its length, as a track takes seconds on a slow link (450 KB, 9 s at 400 kbit/s).
 */
export const STALL = 20_000;

/**
 * Fetches a file of JSON. Where `stall` is given, it fails once that many ms go by with no bytes of it
 * coming, from the request on, so a file that keeps coming isn't cut and one that stalls fails as any
 * other does, for the map to look for again (#595). `progress` is when the last bytes of any file of a
 * look came, by performance.now(), which each of the look's files sets and waits from too: over one link
 * the CDN sends a look's files in the order asked, and one asked behind others has none of its own while
 * theirs come (#721). `signal` is the caller's own limit, a total one.
 */
export async function getJson<T>(url: string, { signal, stall = 0, progress = { at: 0 } }: { signal?: AbortSignal; stall?: number; progress?: { at: number } } = {}): Promise<T> {
  const cut = new AbortController();
  signal?.addEventListener('abort', () => cut.abort(signal.reason));
  const asked = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Cuts the file once `stall` has gone by from the later of its request and the last bytes of its look's files, its own among them. */
  const watch = () => {
    const left = Math.max(asked, progress.at) + stall - performance.now();
    if (left > 0) timer = setTimeout(watch, left);
    else cut.abort(new Error(`${url}: no bytes for ${stall / 1000} s`));
  };
  /** Bytes of the file came, its response's headers or a part of its body. */
  const came = () => void (progress.at = performance.now());
  if (stall) watch();
  try {
    const res = await fetch(url, { signal: cut.signal });
    came();
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const coming = new TransformStream<Uint8Array, Uint8Array>({ transform: (part, out) => (came(), out.enqueue(part)) });
    return (await new Response(res.body?.pipeThrough(coming)).json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
