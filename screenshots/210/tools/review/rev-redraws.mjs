// #210 review: why the map redraws more under `snap` and `bar` at z10. The page and data as lib.mjs has them (390×844
// at a pixel ratio of 3, CPU 4× slower, the clock running on from the snapshot); over WINDOW ms after SETTLE ms, counts
// MapLibre's renders and what asked for each: symbol placement still running (it pauses after 2 ms a frame), placement
// fading (a symbol came or went in the last 300 ms), or neither (a source's tiles, the Trains' setData).
// `node rev-redraws.mjs`; VARIANTS=today,snap… VIEWS=z10,z13 ROUNDS=n.
import { launch, open } from './lib.mjs';
const [SETTLE, WINDOW, ROUNDS] = [5000, 10000, Number(process.env.ROUNDS ?? 1)];
const QUERIES = { today: '', snap: 'snap', bar: 'bar', pick: 'pick', sign: 'sign', badge: 'badge', few: 'few', square: 'square', capsule: 'capsule' };
const VIEWS = { z10: [[2.1, 41.45], 10], z13: [[2.17, 41.387], 13], z12: [[2.165, 41.392], 12], z14: [[2.1655, 41.3925], 14], z10h: [[2.1, 41.45], 10.7] };
const variants = (process.env.VARIANTS ?? 'today,snap,bar,pick').split(',');
const views = (process.env.VIEWS ?? 'z10,z13').split(',');
const browser = await launch();
const rows = [];
for (let round = 0; round < ROUNDS; round++) {
  for (const v of round % 2 ? [...variants].reverse() : variants) {
    const { ctx, p, ours } = await open(browser, { query: QUERIES[v] ?? v, hash: 'map=13/41.3870/2.1700', scale: 3, mobile: true, running: true });
    await p.evaluate(() => {
      const m = window.__map;
      const st = m.style;
      const d = (window.__d = { renders: 0, calls: 0, running: 0, fading: 0, commits: 0, changed: 0, ms: 0, setData: 0, tiles: {} });
      m.on('render', () => d.renders++);
      const update = st._updatePlacement.bind(st);
      st._updatePlacement = (...a) => {
        const t = performance.now();
        const before = st.placement;
        const dirty = update(...a);
        d.ms += performance.now() - t;
        d.calls++;
        if (!st.pauseablePlacement.isDone()) d.running++;
        else if (dirty) d.fading++;
        if (st.placement !== before) {
          d.commits++;
          if (st.placement.lastPlacementChangeTime !== before?.lastPlacementChangeTime) d.changed++;
        }
        return dirty;
      };
      const trains = m.getSource('trains');
      const set = trains.setData.bind(trains);
      trains.setData = (...a) => (d.setData++, set(...a));
      m.on('data', (e) => e.dataType === 'source' && e.tile && (d.tiles[e.sourceId] = (d.tiles[e.sourceId] ?? 0) + 1));
    });
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Performance.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    for (const view of views) {
      await p.evaluate(([c, z]) => window.__map.jumpTo({ center: c, zoom: z }), VIEWS[view]);
      await p.waitForTimeout(SETTLE);
      const task = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration').value;
      const before = await p.evaluate(() => JSON.parse(JSON.stringify(window.__d)));
      const [busy0, t0] = [await task(), Date.now()];
      await p.waitForTimeout(WINDOW);
      const [busy1, t1] = [await task(), Date.now()];
      const after = await p.evaluate(() => JSON.parse(JSON.stringify(window.__d)));
      const s = (t1 - t0) / 1000;
      const per = (k) => +((after[k] - before[k]) / s).toFixed(1);
      const symbols = await p.evaluate(() => {
        const m = window.__map;
        const ids = m.getStyle().layers.filter((l) => l.type === 'symbol' && /^(v-|station-names|train-)/.test(l.id)).map((l) => l.id);
        return Object.fromEntries(ids.map((id) => [id, m.queryRenderedFeatures({ layers: [id] }).length]).filter(([, n]) => n));
      });
      const tiles = Object.fromEntries(Object.keys(after.tiles).map((k) => [k, +(((after.tiles[k] ?? 0) - (before.tiles[k] ?? 0)) / s).toFixed(1)]).filter(([, n]) => n));
      const row = { v, view, round, renders: per('renders'), running: per('running'), fading: per('fading'), commits: per('commits'), changed: per('changed'), setData: per('setData'), placeMs: per('ms'), busy: Math.round(((busy1 - busy0) * 1000) / s) };
      rows.push(row);
      console.log(JSON.stringify(row), JSON.stringify(tiles), JSON.stringify(symbols));
    }
    console.log(ours().join('\n') || '  no errors of ours');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.detach();
    await ctx.close();
  }
}
await browser.close();
