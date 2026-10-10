// #210: what every script here shares, from #209's harness: the dev map (vite on 5210) with the saved live data
// (live/, saved Saturday 10 Oct 2026 at 17:48 in Barcelona) and the clock fixed at the snapshot + 5 s, so that
// every variant shows the same Trains.
import { chromium } from '/Users/guillem.arias/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
export const here = new URL('.', import.meta.url).pathname;
export const snapshot = JSON.parse(readFileSync(`${here}live/snapshot.json`, 'utf8'));
export const time = snapshot.generated + 5000;
export const day = new Date(time).toISOString().slice(0, 10);
const LIVE = 'https://viapeninsula-live.gariasf.com/';
export const URL_BASE = 'http://localhost:5210/';
export const launch = () => chromium.launch({ channel: 'chrome' });

/**
 * A page on the dev map at `hash`, with `?stations=<query>`, in a context of its own: the saved live data (one not
 * saved yet is fetched once, as the live site would, and kept), the clock fixed (`running` lets it run on from
 * there), and one snapshot only, as a map's first 20 s, since the same one again would look stuck (#49). Logs
 * page errors and console errors and warnings into `logs`.
 */
export async function open(browser, { scheme = 'light', query = '', hash, width = 390, height = 844, scale = 2, running = false, forced = false, mobile = false }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, isMobile: mobile, locale: 'en-GB', colorScheme: scheme, ...(forced && { forcedColors: 'active' }) });
  await ctx.route(`${LIVE}**`, async (r) => {
    const path = `${here}live/${r.request().url().replace(LIVE, '').split('?')[0]}`;
    if (!existsSync(path)) {
      const res = await fetch(r.request().url(), { headers: { origin: 'https://viapeninsula.gariasf.com' } });
      if (!res.ok) return r.fulfill({ status: res.status, headers: { 'access-control-allow-origin': '*' } });
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, Buffer.from(await res.arrayBuffer()));
      console.log(`  saved ${path.replace(here, '')}`);
    }
    return r.fulfill({ path, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' } });
  });
  await ctx.addInitScript(
    ([target, running]) => {
      const D = Date;
      const from = performance.now();
      const now = () => (running ? target + (performance.now() - from) : target);
      globalThis.Date = class extends D {
        constructor(...a) {
          if (a.length) super(...a);
          else super(now());
        }
        static now() {
          return now();
        }
      };
      const later = globalThis.setTimeout;
      globalThis.setTimeout = (f, ms, ...a) => (ms === 20000 ? 0 : later(f, ms, ...a));
    },
    [time, running],
  );
  const p = await ctx.newPage();
  const logs = [];
  p.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  p.on('console', (m) => ['error', 'warning'].includes(m.type()) && logs.push(`console.${m.type()}: ${m.text()}`));
  p.on('response', (r) => r.status() >= 400 && logs.push(`  (HTTP ${r.status()}: ${r.url().slice(0, 120)})`));
  // Loads the map with another `?stations=`, in the same page, which keeps the browser's cache of the basemap's tiles.
  const load = async (query, hash) => {
    logs.length = 0;
    for (let tries = 0; ; tries++) {
      try {
        await p.goto('about:blank');
        await p.goto(`${URL_BASE}${query ? `?stations=${query}` : ''}#${hash}`);
        await p.waitForFunction(() => typeof window.__map?.getSource === 'function' && window.__map.getSource('trains')?.serialize().data.features.length > 20, null, { timeout: 120000, polling: 250 });
        break;
      } catch (e) {
        if (tries) throw e;
        console.log(`  retrying: ${e.message.split('\n')[0]}`);
      }
    }
  };
  await load(query, hash);
  const settle = async (wait = 2500) => {
    await p.waitForFunction(() => window.__map.areTilesLoaded(), null, { timeout: 30000, polling: 100 }).catch(() => {});
    await p.waitForTimeout(wait);
  };
  const jump = async (center, zoom, wait) => {
    await p.evaluate(([center, zoom]) => window.__map.jumpTo({ center, zoom }), [center, zoom]);
    await settle(wait);
  };
  /** The logs worth reading: not positron's own warnings, nor queryRenderedFeatures' harmless one on station-names' offsets. */
  const ours = () => logs.filter((l) => !/highway-shield|road_shield|wood-pattern|station-names\]\.layout\.text-offset/.test(l));
  return { ctx, p, logs, ours, settle, jump, load };
}
