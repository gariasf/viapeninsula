// #209: the cards under forced colours (#116), today and with `dash`, as their Scheduled pills and markers change.
import { chromium } from '/Users/guillem.arias/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
const snapshot = JSON.parse(readFileSync(`${here}live/snapshot.json`, 'utf8'));
const time = snapshot.generated + 5000;
const LIVE = 'https://viapeninsula-live.gariasf.com/';
const browser = await chromium.launch({ channel: 'chrome' });
for (const [label, query] of [['today', ''], ['dash', 'dash'], ['grey', 'dash,grey']]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-GB', forcedColors: 'active' });
  await ctx.route(`${LIVE}**`, (r) => r.fulfill({ path: `${here}live/${r.request().url().replace(LIVE, '').split('?')[0]}`, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' } }));
  await ctx.addInitScript((target) => {
    const D = Date;
    globalThis.Date = class extends D {
      constructor(...a) {
        if (a.length) super(...a);
        else super(target);
      }
      static now() {
        return target;
      }
    };
    const later = globalThis.setTimeout;
    globalThis.setTimeout = (f, ms, ...a) => (ms === 20000 ? 0 : later(f, ms, ...a));
  }, time);
  const p = await ctx.newPage();
  const logs = [];
  p.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  await p.goto(`http://localhost:5209/${query ? `?trains=${query}` : ''}#map=15/41.3793/2.1404&station=adif:71801`);
  await p.waitForFunction(() => typeof window.__map?.getSource === 'function' && window.__map.getSource('trains')?.serialize().data.features.length > 20, null, { timeout: 90000, polling: 250 });
  await p.waitForTimeout(3000);
  await p.screenshot({ path: `${here}shots/${label}-forced-board.png` });
  console.log(label, logs.join(' | ') || 'no page errors');
  await ctx.close();
}
await browser.close();
