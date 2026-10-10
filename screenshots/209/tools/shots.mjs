// #209: the dev map (vite on 5209) at #208's four spots at phone size, today and in each `?trains=` variant,
// light and dark, at a fixed time with one saved snapshot, so that every variant shows the same Trains.
// `node shots.mjs [label…]`, SCHEMES=light,dark to pick the basemaps. One browser, one page at a time.
import { chromium } from '/Users/guillem.arias/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
const here = new URL('.', import.meta.url).pathname;
const out = `${here}shots`;
mkdirSync(out, { recursive: true });
const snapshot = JSON.parse(readFileSync(`${here}live/snapshot.json`, 'utf8'));
const time = snapshot.generated + 5000;
const LIVE = 'https://viapeninsula-live.gariasf.com/';
// label, query, and the basemaps it changes anything on.
const VARIANTS = [
  ['today', '', 'light dark'],
  ['dash', 'dash', 'light dark'],
  ['grey', 'dash,grey', 'light dark'],
  ['small', 'small', 'light dark'],
  ['halo', 'halo', 'light dark'],
  ['letter', 'letter', 'light'],
  ['target', 'target', 'light dark'],
  ['under', 'under', 'light dark'],
  ['glow', 'glow', 'dark'],
  ['trail', 'trail', 'dark'],
  ['glowtrail', 'glow,trail', 'dark'],
  ['pick', 'pick', 'light dark'],
];
// The ones that change the cards, whose hover and focus are shot too.
const CARDS = ['today', 'dash', 'grey', 'pick'];
const only = process.argv.slice(2);
const schemes = (process.env.SCHEMES ?? 'light,dark').split(',');
const trainFile = `${here}train.txt`;
let trainId = existsSync(trainFile) ? readFileSync(trainFile, 'utf8').trim() : undefined;
const browser = await chromium.launch({ channel: 'chrome' });
const t0 = Date.now();
for (const [label, query, on] of VARIANTS.filter(([l]) => !only.length || only.includes(l))) {
  for (const scheme of schemes.filter((s) => on.includes(s))) {
    const name = `${label}-${scheme}`;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-GB', colorScheme: scheme });
    // The saved live data; a file not saved yet is fetched once, as the live site would, and kept.
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
      // One snapshot only, as in a map's first 20 s: the same one again would look stuck (#49).
      const later = globalThis.setTimeout;
      globalThis.setTimeout = (f, ms, ...a) => (ms === 20000 ? 0 : later(f, ms, ...a));
    }, time);
    const p = await ctx.newPage();
    const logs = [];
    p.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
    p.on('console', (m) => ['error', 'warning'].includes(m.type()) && logs.push(`console.${m.type()}: ${m.text()}`));
    p.on('response', (r) => r.status() >= 400 && logs.push(`  (HTTP ${r.status()}: ${r.url().slice(0, 120)})`));
    const search = query ? `?trains=${query}` : '';
    for (let tries = 0; ; tries++) {
      try {
        await p.goto(`http://localhost:5209/${search}#map=13/41.3870/2.1700`);
        await p.waitForFunction(() => typeof window.__map?.getSource === 'function' && window.__map.getSource('trains')?.serialize().data.features.length > 20, null, { timeout: 90000, polling: 250 });
        break;
      } catch (e) {
        if (tries) throw e;
        console.log(`  retrying ${name}: ${e.message.split('\n')[0]}`);
      }
    }
    const settle = async (wait = 2500) => {
      await p.waitForFunction(() => window.__map.areTilesLoaded(), null, { timeout: 30000, polling: 100 }).catch(() => {});
      await p.waitForTimeout(wait);
    };
    const jump = async (center, zoom) => {
      await p.evaluate(([center, zoom]) => window.__map.jumpTo({ center, zoom }), [center, zoom]);
      await settle();
    };
    const shot = (spot, clip) => p.screenshot({ path: `${out}/${name}-${spot}.png`, ...(clip && { clip }) });
    await jump([2.17, 41.387], 13);
    await shot('z13');
    const trails = await p.evaluate(() => window.__map.getSource('trails')?.serialize().data.features.length);
    if (trails !== undefined) console.log(`  ${trails} pieces of trail at z13`);
    // Where arrows lie on other Trains' pills (#156): Plaça de Catalunya, at full size.
    await shot('pile', { x: 130, y: 340, width: 165, height: 150 });
    await jump([2.1, 41.45], 10);
    await shot('z10');
    // The same Live Train in every variant: the first by ID within 1 km of Paral·lel.
    trainId ??= await p.evaluate(() => {
      const near = window.__map.getSource('trains').serialize().data.features.filter((f) => f.properties.live && Math.hypot(f.geometry.coordinates[0] - 2.1665, (f.geometry.coordinates[1] - 41.375) * 1.33) < 0.012);
      return near.map((f) => f.properties.id).sort()[0];
    });
    writeFileSync(trainFile, trainId);
    const day = new Date(time).toISOString().slice(0, 10);
    await p.evaluate(([id, day]) => (location.hash = `map=13/41.3750/2.1665&train=${id.includes('/') ? id : `${day}/${id}`}`), [trainId, day]);
    await settle(3000);
    await shot('follow');
    // The followed Train at full size, on its own.
    const at = await p.evaluate(() => {
      const f = window.__map.getSource('trains').serialize().data.features.find((f) => f.properties.followed);
      return f && window.__map.project(f.geometry.coordinates);
    });
    if (at) await shot('follow-100', { x: Math.max(0, Math.min(390 - 160, at.x - 80)), y: Math.max(0, at.y - 80), width: 160, height: 160 });
    await p.evaluate(() => (location.hash = 'map=15/41.3793/2.1404&station=adif:71801'));
    await settle(3000);
    await shot('board');
    if (CARDS.includes(label)) {
      // A board's row with a Scheduled Train, hovered by a mouse, and focused by the keyboard; and the legend hovered.
      const row = p.locator('.rows button.row:has(.pill.scheduled)').first();
      if (await row.count()) {
        const box = await row.boundingBox();
        await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await p.waitForTimeout(400);
        await shot('hover', { x: 0, y: Math.max(0, box.y - 90), width: 390, height: 200 });
        await p.mouse.move(195, 300);
        await row.focus();
        await p.keyboard.press('Shift');
        await p.waitForTimeout(400);
        await shot('focus', { x: 0, y: Math.max(0, box.y - 90), width: 390, height: 200 });
        await p.evaluate(() => document.activeElement?.blur());
      } else console.log('  no Scheduled row on the board');
      const legend = await p.locator('.legend').boundingBox();
      await p.mouse.move(legend.x + legend.width / 2, legend.y + legend.height / 2);
      await p.waitForTimeout(400);
      await shot('legend', { x: 0, y: 0, width: 390, height: 70 });
    }
    console.log(`${name} done at ${Math.round((Date.now() - t0) / 1000)} s, train ${trainId}`);
    console.log(logs.filter((l) => !/highway-shield|road_shield|wood-pattern/.test(l)).join('\n') || '  no console errors or warnings of ours, no page errors');
    await ctx.close();
  }
}
await browser.close();
