// The fetcher's Worker: a Durable Object that wakes about every 20 s, fetches the live sources and
// the operators' alerts that are due, and writes the snapshot to R2, and alerts.json when it changes,
// where viewers read them through the CDN (ADR-0003). It's thin glue around the fetcher step and the
// alerts' (alerts.ts).

import { DurableObject } from 'cloudflare:workers';
import { ALERTS_START, fetchAlerts, readAlerts, type AlertsState } from './alerts.ts';
import { EVERY, fetchDue, START, step, TIMEOUT, type Fetched, type Stored } from './step.ts';

interface Env {
  FETCHER: DurableObjectNamespace<Fetcher>;
  LIVE: R2Bucket;
  /** A fine-grained GitHub token that can only start this repository's Actions, as a Worker secret. */
  GITHUB_DISPATCH_TOKEN?: string;
  /** The Worker secrets the live sources in src/networks.ts name, such as TRAM's and TMB's credentials for their APIs. */
  [secret: string]: unknown;
}

/**
 * Where the fetcher stores its state between runs. Since #242 it's kept by source, not by Network,
 * under a key of its own, so that a fetcher from before then would still find its own under `stored`.
 */
const STORED = 'sources';

/** Where it stores what it keeps of the operators' alerts between runs. */
const ALERTS = 'alerts';

/** The cron trigger that starts the daily build, as wrangler.jsonc has it. */
const DAILY = '30 0 * * *';

/** The daily build's workflow on GitHub. */
const WORKFLOW = 'https://api.github.com/repos/gariasf/viapeninsula/actions/workflows/daily.yml';

export class Fetcher extends DurableObject<Env> {
  /** Starts the runs, unless they're under way. */
  async start() {
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now());
  }

  /** One run. Cloudflare evicts the object between runs, so all it keeps between them is in its storage. */
  async alarm() {
    // The next run is set first, so that a failed run never stops them.
    await this.ctx.storage.setAlarm(Date.now() + EVERY);
    const stored = (await this.ctx.storage.get<Stored>(STORED)) ?? START;
    const kept = (await this.ctx.storage.get<AlertsState>(ALERTS)) ?? ALERTS_START;
    // TRAM's alerts go with the access token its adapter kept from the last run.
    const [responses, answers] = await Promise.all([fetchDue(stored, (name) => secret(this.env, name), get), fetchAlerts(kept, stored.state, get)]);
    const now = Date.now();
    const run = step(stored.state, responses, now);
    // Each try that finds a Network's Trains missing from a feed that works, up to the one that drops its
    // last reports, goes in the Worker's logs, which count how often Renfe's files drop Madrid's (#248).
    if (Object.keys(run.missed).length) console.log(JSON.stringify({ missing: run.missed }));
    await this.ctx.storage.put(STORED, { state: run.state, due: run.due } satisfies Stored);
    await this.env.LIVE.put('snapshot.json', JSON.stringify(run.snapshot), {
      httpMetadata: { contentType: 'application/json', cacheControl: 'public, max-age=15' },
    });
    const alerts = readAlerts(kept, answers, now);
    // Written before what's kept of them, so that a write that fails is made again on the next run.
    if (alerts.file) {
      await this.env.LIVE.put('alerts.json', JSON.stringify(alerts.file), {
        httpMetadata: { contentType: 'application/json', cacheControl: 'public, max-age=60' },
      });
    }
    await this.ctx.storage.put(ALERTS, alerts.state);
  }
}

export default {
  // Every minute, as one cron trigger has it, and once a day, as the other does.
  async scheduled(controller, env) {
    if (controller.cron === DAILY) await dispatchDaily(env);
    else await env.FETCHER.getByName('fetcher').start();
  },
} satisfies ExportedHandler<Env>;

/**
 * Starts the daily build in GitHub Actions. GitHub disables a public repository's scheduled
 * workflows after 60 days without activity, and a disabled workflow can't be dispatched, so it's
 * enabled first. A failure throws, so the Worker's logs show it.
 */
async function dispatchDaily({ GITHUB_DISPATCH_TOKEN: token }: Env) {
  if (!token) throw new Error("GITHUB_DISPATCH_TOKEN isn't set");
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'user-agent': 'viapeninsula-fetcher',
    'x-github-api-version': '2022-11-28',
  };
  for (const [path, init] of [['/enable', { method: 'PUT' }], ['/dispatches', { method: 'POST', body: JSON.stringify({ ref: 'main' }) }]] as const) {
    const res = await fetch(WORKFLOW + path, { ...init, headers });
    if (!res.ok) throw new Error(`GitHub didn't start the daily build: ${path} HTTP ${res.status} ${await res.text()}`);
  }
}

/** A Worker secret, by its name, where it's set. */
function secret(env: Env, name: string): string | undefined {
  const value = env[name];
  return typeof value === 'string' ? value : undefined;
}

/**
 * One request, as a raw response for a source's adapter, with how many requests its API has left today where
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
