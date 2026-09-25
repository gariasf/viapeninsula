// The fetcher's Worker: a Durable Object that wakes about every 20 s, fetches the live feeds that
// are due, and writes the snapshot to R2, where viewers read it through the CDN (ADR-0003). It's
// thin glue around the fetcher step.

import { DurableObject } from 'cloudflare:workers';
import { address, EVERY, START, step, type Fetched, type Responses, type Stored } from './step.ts';

/** Renfe's Cercanías live data, as JSON: Rodalies' is in it. */
const RENFE = {
  positions: 'https://gtfsrt.renfe.com/vehicle_positions.json',
  updates: 'https://gtfsrt.renfe.com/trip_updates.json',
};

/**
 * FGC's open data: Geotren, where its Trains are, with only what the step reads, and where to look
 * up its trip-updates file. Its GTFS-RT vehicle positions, when not empty, are Geotren's of minutes
 * before, so they're never fetched.
 */
const FGC_API = 'https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets';
const FGC = {
  positions: `${FGC_API}/posicionament-dels-trens/records?limit=100&select=id,geo_point_2d,estacionat_a,tipus_unitat,record_timestamp`,
  lookup: `${FGC_API}/trip-updates-gtfs_realtime/records?limit=1`,
};

interface Env {
  FETCHER: DurableObjectNamespace<Fetcher>;
  LIVE: R2Bucket;
}

export class Fetcher extends DurableObject<Env> {
  /** Starts the runs, unless they're under way. */
  async start() {
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now());
  }

  /** One run. Cloudflare evicts the object between runs, so all it keeps between them is in its storage. */
  async alarm() {
    // The next run is set first, so that a failed run never stops them.
    await this.ctx.storage.setAlarm(Date.now() + EVERY);
    const { state, due } = (await this.ctx.storage.get<Stored>('stored')) ?? START;
    const [rodalies, fgc] = await Promise.all([due.includes('rodalies') ? fetchRodalies() : undefined, due.includes('fgc') ? fetchFgc(state.fgc?.file) : undefined]);
    const run = step(state, { rodalies, fgc } satisfies Responses, Date.now());
    await this.ctx.storage.put('stored', { state: run.state, due: run.due } satisfies Stored);
    await this.env.LIVE.put('snapshot.json', JSON.stringify(run.snapshot), {
      httpMetadata: { contentType: 'application/json', cacheControl: 'public, max-age=15' },
    });
  }
}

export default {
  // Every minute, as the cron trigger has it.
  async scheduled(_controller, env) {
    await env.FETCHER.getByName('fetcher').start();
  },
} satisfies ExportedHandler<Env>;

async function fetchRodalies(): Promise<Responses['rodalies']> {
  const [positions, updates] = await Promise.all([get(RENFE.positions, text), get(RENFE.updates, text)]);
  return { positions, updates };
}

/** FGC's live data, with its trip-updates file from where the step last found it, or where it's looked up again. */
async function fetchFgc(file: string | undefined): Promise<Responses['fgc']> {
  const lookup = file ? undefined : await get(FGC.lookup, text);
  const found = lookup ? address(lookup) : file;
  const [positions, updates] = await Promise.all([get(FGC.positions, text), found ? get(found, bytes) : { error: "couldn't look up where it is" }]);
  return { positions, updates, lookup };
}

/**
 * One request, as a raw response for the step, with how many requests its API has left today where
 * it says. A request that hangs gives up after 10 s, well before the next run. The timer is cleared
 * as soon as it's answered, since a pending one keeps the run going.
 */
async function get<Body>(url: string, read: (res: Response) => Promise<Body>): Promise<Fetched<Body>> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new Error('no answer in 10 s')), 10_000);
  try {
    const res = await fetch(url, { signal: abort.signal });
    const remaining = res.headers.get('x-ratelimit-remaining');
    return { status: res.status, body: await read(res), remaining: remaining === null ? undefined : Number(remaining) };
  } catch (error) {
    return { error: String(error) };
  } finally {
    clearTimeout(timer);
  }
}

const text = (res: Response) => res.text();
const bytes = async (res: Response) => new Uint8Array(await res.arrayBuffer());
