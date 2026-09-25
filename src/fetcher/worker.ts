// The fetcher's Worker: a Durable Object that wakes about every 20 s, fetches the live feeds that
// are due, and writes the snapshot to R2, where viewers read it through the CDN (ADR-0003). It's
// thin glue around the fetcher step.

import { DurableObject } from 'cloudflare:workers';
import { accessToken, address, EVERY, START, step, TIMEOUT, type Fetched, type Responses, type Stored } from './step.ts';

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

/** TRAM's open data, whose API numbers Trambaix 1 and Trambesòs 2, and issues access tokens for an hour. */
const TRAM_API = 'https://opendata.tram.cat';

interface Env {
  FETCHER: DurableObjectNamespace<Fetcher>;
  LIVE: R2Bucket;
  /** TRAM's credentials for its API, as Worker secrets. */
  TRAM_CLIENT_ID?: string;
  TRAM_CLIENT_SECRET?: string;
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
    const [rodalies, fgc, tram] = await Promise.all([
      due.includes('rodalies') ? fetchRodalies() : undefined,
      due.includes('fgc') ? fetchFgc(state.fgc?.file) : undefined,
      due.includes('tram') ? fetchTram(this.env, state.tram?.token) : undefined,
    ]);
    const run = step(state, { rodalies, fgc, tram } satisfies Responses, Date.now());
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

/** TRAM's live data for both its halves, with the access token the step keeps, or where it keeps none, a new one. */
async function fetchTram({ TRAM_CLIENT_ID: id, TRAM_CLIENT_SECRET: secret }: Env, kept: string | undefined): Promise<Responses['tram']> {
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: id ?? '', client_secret: secret ?? '' });
  const token = kept ? undefined : id && secret ? await get(`${TRAM_API}/connect/token`, text, { method: 'POST', body }) : { error: 'its credentials are not set' };
  const bearer = token ? accessToken(token) : kept;
  const half = async (networkId: number): Promise<NonNullable<Responses['tram']>['TBX']> => {
    if (!bearer) return { positions: { error: 'no access token' }, updates: { error: 'no access token' } };
    const init = { headers: { authorization: `Bearer ${bearer}` } };
    const [positions, updates] = await Promise.all([get(`${TRAM_API}/api/v1/activevehicles?networkId=${networkId}`, text, init), get(`${TRAM_API}/api/v1/gtfsrealtime?networkId=${networkId}`, bytes, init)]);
    return { positions, updates };
  };
  const [TBX, TBS] = await Promise.all([half(1), half(2)]);
  return { token, TBX, TBS };
}

/**
 * One request, as a raw response for the step, with how many requests its API has left today where
 * it says. A request that hangs gives up after TIMEOUT, well before the next run. The timer is
 * cleared as soon as it's answered, since a pending one keeps the run going.
 */
async function get<Body>(url: string, read: (res: Response) => Promise<Body>, init: RequestInit = {}): Promise<Fetched<Body>> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new Error(`no answer in ${TIMEOUT / 1000} s`)), TIMEOUT);
  try {
    const res = await fetch(url, { ...init, signal: abort.signal });
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
