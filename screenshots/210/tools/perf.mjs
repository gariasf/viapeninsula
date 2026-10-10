// #210: what the variants cost an idle phone, as #93 and #209 measured it (perf-measure-harness): 390×844 at a pixel
// ratio of 3, the CPU slowed RATE× (4 by default), the saved snapshot with the clock running on from its time, and for
// each view the main thread's busy ms a second (TaskDuration), frames a second (rAF) and redraws a second (MapLibre's
// `render`), over WINDOW ms after SETTLE ms, ROUNDS rounds, in another order each round (SHUFFLE=1).
// `node perf.mjs`; ONLY=label-scheme,… to pick.
import { readFileSync, writeFileSync } from 'node:fs';
import { launch, open, here, day } from './lib.mjs';
const [SETTLE, WINDOW, ROUNDS, RATE] = [5000, 10000, Number(process.env.ROUNDS ?? 3), Number(process.env.RATE ?? 4)];
const saved = `${here}perf${RATE === 4 ? '' : `-${RATE}x`}.json`;
const train = readFileSync(`${here}train.txt`, 'utf8').trim();
const VIEWS = {
  z13: { center: [2.17, 41.387], zoom: 13 },
  z10: { center: [2.1, 41.45], zoom: 10 },
  follow: { hash: `map=13/41.3750/2.1665&train=${day}/${train}` },
};
// label, query, basemap, views.
const SETUPS = [
  ['today', '', 'light', ['z13', 'z10', 'follow']],
  ['badge', 'badge', 'light', ['z13', 'z10', 'follow']],
  ['capsule', 'capsule', 'light', ['z13', 'z10']],
  ['bar', 'bar', 'light', ['z13', 'z10']],
  ['pick', 'pick', 'light', ['z13', 'z10', 'follow']],
  ['today', '', 'dark', ['z13', 'z10']],
  ['pick', 'pick', 'dark', ['z13', 'z10']],
].filter(([label, , scheme]) => !process.env.ONLY || process.env.ONLY.split(',').includes(`${label}-${scheme}`));
const browser = await launch();
const results = [];
const t0 = Date.now();
for (let round = 0; round < ROUNDS; round++) {
  const order = process.env.SHUFFLE ? SETUPS.map((s, i) => [Math.sin(1000 * (round + 1) + i), s]).sort(([a], [b]) => a - b).map(([, s]) => s) : SETUPS;
  for (const [label, query, scheme, views] of order) {
    const { ctx, p, logs } = await open(browser, { scheme, query, hash: 'map=13/41.3870/2.1700', scale: 3, mobile: true, running: true });
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
      const errors = logs.filter((l) => l.startsWith('pageerror'));
      console.log(`${Math.round((Date.now() - t0) / 1000)} s  ${label}-${scheme} ${view} r${round}: ${row.busy} ms/s busy, ${row.fps} fps, p95 ${row.p95} ms, ${row.redraws} redraws/s${errors.length ? `  ${errors.join(' | ')}` : ''}`);
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.detach();
    await ctx.close();
    writeFileSync(saved, JSON.stringify(results, null, 1));
  }
}
await browser.close();
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
console.log(`\nCPU ${RATE}×, medians of ${ROUNDS} runs:\n\n| Basemap | View | Variant | Busy ms/s | fps | p95 ms | Redraws/s |\n| --- | --- | --- | --- | --- | --- | --- |`);
for (const key of [...new Set(results.map((r) => `${r.scheme}|${r.view}|${r.label}`))]) {
  const [scheme, view, label] = key.split('|');
  const some = results.filter((r) => `${r.scheme}|${r.view}|${r.label}` === key);
  const m = (k) => median(some.map((r) => r[k]));
  console.log(`| ${scheme} | ${view} | ${label} | ${Math.round(m('busy'))} | ${m('fps').toFixed(1)} | ${Math.round(m('p95'))} | ${m('redraws').toFixed(1)} |`);
}
