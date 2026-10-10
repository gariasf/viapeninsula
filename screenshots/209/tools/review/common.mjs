// Review of #209: what my scripts share. The dev map on 5209 with the build's saved live data, at the snapshot's
// time + 5 s, either fixed (Trains stand still, as the build's shots) or running on (Trains move).
import { chromium } from '/Users/guillem.arias/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
export const W = new URL('..', import.meta.url).pathname;
export const R = new URL('.', import.meta.url).pathname;
const snapshot = JSON.parse(readFileSync(`${W}live/snapshot.json`, 'utf8'));
export const T = snapshot.generated + 5000;
export const DAY = new Date(T).toISOString().slice(0, 10);
export const TRAIN = readFileSync(`${W}train.txt`, 'utf8').trim();
const LIVE = 'https://viapeninsula-live.gariasf.com/';
export const launch = () => chromium.launch({ channel: 'chrome' });
/** A page on the dev map: `query` for ?trains=, `hash` the view; `clock` 'fixed' or 'running'; any context options. */
export async function open(browser, { query = '', hash = 'map=13/41.3870/2.1700', clock = 'fixed', ...options } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-GB', ...options });
  await ctx.route(`${LIVE}**`, (r) => r.fulfill({ path: `${W}live/${r.request().url().replace(LIVE, '').split('?')[0]}`, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' } }));
  await ctx.addInitScript(([target, running]) => {
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
  }, [T, clock === 'running']);
  const page = await ctx.newPage();
  const logs = [];
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && logs.push(`console.${m.type()}: ${m.text()}`));
  let loads = 0;
  page.on('load', () => ++loads > 1 && logs.push(`page loaded again (${loads}): ${page.url()}`));
  await page.goto(`http://localhost:5209/${query ? `?trains=${query}` : ''}#${hash}`);
  await page.waitForFunction(() => typeof window.__map?.getSource === 'function' && window.__map.getSource('trains')?.serialize().data.features.length > 20, null, { timeout: 120000, polling: 250 });
  return { ctx, page, logs };
}
/** Console lines that are ours: positron's shield filters and the station-names qRF warning are known and harmless. */
export const ours = (logs) => logs.filter((l) => !/highway-shield|road_shield|wood-pattern|station-names\]\.layout\.text-offset/.test(l));
export async function settle(page, wait = 2500) {
  await page.waitForFunction(() => window.__map.areTilesLoaded(), null, { timeout: 30000, polling: 100 }).catch(() => {});
  await page.waitForTimeout(wait);
}
export const jump = async (page, center, zoom) => {
  await page.evaluate(([c, z]) => window.__map.jumpTo({ center: c, zoom: z }), [center, zoom]);
  await settle(page);
};
