// The fetcher's Worker: a Durable Object that wakes about every 20 s, fetches the live feeds that
// are due, and writes the snapshot to R2, where viewers read it through the CDN (ADR-0003). It's
// thin glue around the fetcher step.

import { DurableObject } from 'cloudflare:workers';
import { EVERY, START, step, type Fetched, type Responses, type Stored } from './step.ts';

/** Renfe's Cercanías live data, as JSON: Rodalies' is in it. */
const RENFE = {
  positions: 'https://gtfsrt.renfe.com/vehicle_positions.json',
  updates: 'https://gtfsrt.renfe.com/trip_updates.json',
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
    const responses: Responses = {};
    if (due.includes('rodalies')) {
      const [positions, updates] = await Promise.all([get(RENFE.positions), get(RENFE.updates)]);
      responses.rodalies = { positions, updates };
    }
    const run = step(state, responses, Date.now());
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

/**
 * One request, as a raw response for the step. A request that hangs gives up after 10 s, well before
 * the next run. The timer is cleared as soon as it's answered, since a pending one keeps the run going.
 */
async function get(url: string): Promise<Fetched> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new Error('no answer in 10 s')), 10_000);
  try {
    const res = await fetch(url, { signal: abort.signal });
    return { status: res.status, body: await res.text() };
  } catch (error) {
    return { error: String(error) };
  } finally {
    clearTimeout(timer);
  }
}
