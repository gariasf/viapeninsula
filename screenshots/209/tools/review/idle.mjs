// Review of #209: does an animated variant make the map redraw more often (#93's idle cap)? The clock runs on, so
// Trains move. Per view, over WINDOW ms after SETTLE ms with nobody touching the map: how often main.ts draws its
// Trains (setData on the `trains` source, which the cap governs), how often MapLibre renders a frame, and the main
// thread's busy ms a second (CDP TaskDuration). CPU not slowed, a pixel ratio of 3 as #93, ROUNDS rounds in a
// different order each.
import { launch, open, settle, DAY, TRAIN } from './common.mjs';
const [SETTLE, WINDOW, ROUNDS] = [5000, 8000, Number(process.env.ROUNDS ?? 2)];
const SETUPS = [
  ['today', '', 'light'],
  ['target', 'target', 'light'],
  ['pick', 'pick', 'light'],
  ['today', '', 'dark'],
  ['trail', 'trail', 'dark'],
  ['glowtrail', 'glow,trail', 'dark'],
  ['pick', 'pick', 'dark'],
];
const VIEWS = [['z13', 'map=13/41.3870/2.1700'], ['z10', 'map=10/41.4500/2.1000'], ['follow', `map=13/41.3750/2.1665&train=${DAY}/${TRAIN}`]];
const browser = await launch();
const results = [];
const t0 = Date.now();
for (let round = 0; round < ROUNDS; round++) {
  const order = round % 2 ? [...SETUPS].reverse() : SETUPS;
  for (const [label, query, colorScheme] of order) {
    const { ctx, page, logs } = await open(browser, { query, colorScheme, clock: 'running', deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await page.evaluate(() => {
      window.__n = { renders: 0, draws: 0, trails: 0 };
      window.__map.on('render', () => window.__n.renders++);
      for (const [id, key] of [['trains', 'draws'], ['trails', 'trails']]) {
        const source = window.__map.getSource(id);
        if (!source) continue;
        const setData = source.setData.bind(source);
        source.setData = (data) => (window.__n[key]++, setData(data));
      }
    });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Performance.enable');
    const task = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration').value;
    for (const [view, hash] of VIEWS) {
      await page.evaluate((h) => (location.hash = h), hash);
      await settle(page, SETTLE);
      const [busy0, n0, s0] = [await task(), await page.evaluate(() => ({ ...window.__n })), performance.now()];
      await page.waitForTimeout(WINDOW);
      const [busy1, n1, s1] = [await task(), await page.evaluate(() => ({ ...window.__n })), performance.now()];
      const span = (s1 - s0) / 1000;
      const row = { label, colorScheme, view, round, draws: +((n1.draws - n0.draws) / span).toFixed(1), renders: +((n1.renders - n0.renders) / span).toFixed(1), trails: +((n1.trails - n0.trails) / span).toFixed(1), busy: Math.round(((busy1 - busy0) * 1000) / span) };
      results.push(row);
      console.log(`${Math.round((Date.now() - t0) / 1000)} s`, JSON.stringify(row));
      // Back out of following, as closing the panel would.
      if (view === 'follow') await page.evaluate(() => (location.hash = 'map=13/41.3870/2.1700'));
    }
    const errors = logs.filter((l) => /pageerror|loaded again/.test(l));
    if (errors.length) console.log('  ', errors.join(' | '));
    await cdp.detach();
    await ctx.close();
  }
}
await browser.close();
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
console.log('\n| Basemap | View | Variant | Draws/s | Renders/s | Trails set/s | Busy ms/s (rounds) |\n| --- | --- | --- | --- | --- | --- | --- |');
for (const [view] of VIEWS)
  for (const [label, , colorScheme] of SETUPS) {
    const rs = results.filter((r) => r.label === label && r.colorScheme === colorScheme && r.view === view);
    console.log(`| ${colorScheme} | ${view} | ${label} | ${rs.map((r) => r.draws).join(', ')} | ${rs.map((r) => r.renders).join(', ')} | ${rs.map((r) => r.trails).join(', ')} | ${rs.map((r) => r.busy).join(', ')} |`);
  }
