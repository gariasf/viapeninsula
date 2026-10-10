// #209: what the variants cost an idle phone, as #93 measured it (perf-measure-harness): 390×844 at a pixel
// ratio of 3, the CPU slowed 4×, the saved snapshot with the clock running on from its time, and for each view
// the main thread's busy ms a second (TaskDuration), frames a second (rAF) and redraws a second (MapLibre's
// `render`), over WINDOW ms after SETTLE ms, ROUNDS rounds interleaved. `node perf.mjs`; ONLY=label,… to pick.
import { chromium } from '/Users/guillem.arias/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
const snapshot = JSON.parse(readFileSync(`${here}live/snapshot.json`, 'utf8'));
const start = snapshot.generated + 5000;
const LIVE = 'https://viapeninsula-live.gariasf.com/';
const [SETTLE, WINDOW, ROUNDS, RATE] = [5000, 10000, Number(process.env.ROUNDS ?? 3), Number(process.env.RATE ?? 4)];
// Where each run's rows go: perf.json at the documented 4×, perf-<rate>x.json otherwise.
const saved = `${here}perf${RATE === 4 ? '' : `-${RATE}x`}.json`;
const train = readFileSync(`${here}train.txt`, 'utf8').trim();
const day = new Date(start).toISOString().slice(0, 10);
const VIEWS = {
  z13: { center: [2.17, 41.387], zoom: 13 },
  z10: { center: [2.1, 41.45], zoom: 10 },
  follow: { hash: `map=13/41.3750/2.1665&train=${day}/${train}` },
};
// label, query, basemap, views.
const SETUPS = [
  ['today', '', 'light', ['z13', 'z10', 'follow']],
  ['dash', 'dash', 'light', ['z13', 'z10']],
  ['small', 'small', 'light', ['z10']],
  ['halo', 'halo', 'light', ['z10']],
  ['target', 'target', 'light', ['follow']],
  ['pick', 'pick', 'light', ['z13', 'z10', 'follow']],
  ['today', '', 'dark', ['z13', 'z10', 'follow']],
  ['glow', 'glow', 'dark', ['z13', 'z10']],
  ['trail', 'trail', 'dark', ['z13', 'z10', 'follow']],
  ['glowtrail', 'glow,trail', 'dark', ['z13', 'z10']],
  ['pick', 'pick', 'dark', ['z13', 'z10', 'follow']],
].filter(([label, , scheme]) => !process.env.ONLY || process.env.ONLY.split(',').includes(`${label}-${scheme}`));
const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
const t0 = Date.now();
for (let round = 0; round < ROUNDS; round++) {
  // In another order each round, so that where a setup falls in a round doesn't count for it: SHUFFLE=1.
  const order = process.env.SHUFFLE ? SETUPS.map((s, i) => [Math.sin(1000 * (round + 1) + i), s]).sort(([a], [b]) => a - b).map(([, s]) => s) : SETUPS;
  for (const [label, query, scheme, views] of order) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, locale: 'en-GB', colorScheme: scheme });
    await ctx.route(`${LIVE}**`, (r) => r.fulfill({ path: `${here}live/${r.request().url().replace(LIVE, '').split('?')[0]}`, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' } }));
    await ctx.addInitScript((target) => {
      // The clock runs on from the snapshot's time; performance.now() and rAF stay real.
      const D = Date;
      const from = performance.now();
      const now = () => target + (performance.now() - from);
      globalThis.Date = class extends D {
        constructor(...a) {
          if (a.length) super(...a);
          else super(now());
        }
        static now() {
          return now();
        }
      };
      // One snapshot only: the same one again would look stuck (#49).
      const later = globalThis.setTimeout;
      globalThis.setTimeout = (f, ms, ...a) => (ms === 20000 ? 0 : later(f, ms, ...a));
    }, start);
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(`http://localhost:5209/${query ? `?trains=${query}` : ''}#map=13/41.3870/2.1700`);
    await p.waitForFunction(() => typeof window.__map?.getSource === 'function' && window.__map.getSource('trains')?.serialize().data.features.length > 20, null, { timeout: 120000, polling: 250 });
    await p.evaluate(() => {
      window.__renders = 0;
      window.__map.on('render', () => window.__renders++);
    });
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Performance.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
    for (const view of views) {
      const { center, zoom, hash } = VIEWS[view];
      if (hash) await p.evaluate((h) => (location.hash = h), hash);
      else await p.evaluate(([c, z]) => window.__map.jumpTo({ center: c, zoom: z }), [center, zoom]);
      await p.waitForTimeout(SETTLE);
      const task = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration').value;
      const [busy0, renders0] = [await task(), await p.evaluate(() => window.__renders)];
      const frames = await p.evaluate(
        (ms) =>
          new Promise((done) => {
            const times = [];
            const end = performance.now() + ms;
            const tick = (t) => (times.push(t), t < end ? requestAnimationFrame(tick) : done(times));
            requestAnimationFrame(tick);
          }),
        WINDOW,
      );
      const [busy1, renders1] = [await task(), await p.evaluate(() => window.__renders)];
      const span = (frames.at(-1) - frames[0]) / 1000;
      const gaps = frames.slice(1).map((t, i) => t - frames[i]).sort((a, b) => a - b);
      const row = { label, scheme, view, round, busy: Math.round(((busy1 - busy0) * 1000) / span), fps: +((frames.length - 1) / span).toFixed(1), p95: Math.round(gaps[Math.floor(gaps.length * 0.95)] ?? 0), redraws: +((renders1 - renders0) / span).toFixed(1) };
      results.push(row);
      console.log(`${Math.round((Date.now() - t0) / 1000)} s  ${label}-${scheme} ${view} r${round}: ${row.busy} ms/s busy, ${row.fps} fps, p95 ${row.p95} ms, ${row.redraws} redraws/s${errors.length ? `  pageerrors: ${errors.join(' | ')}` : ''}`);
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.detach();
    await ctx.close();
    writeFileSync(saved, JSON.stringify(results, null, 1));
  }
}
await browser.close();
// Medians by setup and view.
const median = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const keys = [...new Set(results.map((r) => `${r.label}-${r.scheme} ${r.view}`))];
console.log('\n| Variant | View | Busy ms/s | fps | p95 ms | Redraws/s |\n| --- | --- | --- | --- | --- | --- |');
for (const key of keys) {
  const rows = results.filter((r) => `${r.label}-${r.scheme} ${r.view}` === key);
  console.log(`| ${key.split(' ')[0]} | ${key.split(' ')[1]} | ${median(rows.map((r) => r.busy))} | ${median(rows.map((r) => r.fps))} | ${median(rows.map((r) => r.p95))} | ${median(rows.map((r) => r.redraws))} |`);
}
