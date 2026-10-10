// #210 review: which symbols come, go or flip at each placement that changes, per layer, over WINDOW ms at a view,
// with the clock running (CPU as given by RATE, 4 by default). `VARIANT=snap VIEW=z10 node rev-flips.mjs`.
import { launch, open } from './lib.mjs';
const [SETTLE, WINDOW, RATE] = [5000, Number(process.env.WINDOW ?? 10000), Number(process.env.RATE ?? 4)];
const VIEWS = { z10: [[2.1, 41.45], 10], z13: [[2.17, 41.387], 13], z12: [[2.165, 41.392], 12], z14: [[2.1655, 41.3925], 14] };
const variant = process.env.VARIANT ?? 'snap';
const browser = await launch();
const { ctx, p, ours } = await open(browser, { query: variant === 'today' ? '' : variant, hash: 'map=13/41.3870/2.1700', scale: 3, mobile: true, running: true });
const cdp = await ctx.newCDPSession(p);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
await p.evaluate(([c, z]) => window.__map.jumpTo({ center: c, zoom: z }), VIEWS[process.env.VIEW ?? 'z10']);
await p.waitForTimeout(SETTLE);
const out = await p.evaluate(async (ms) => {
  const st = window.__map.style;
  const layerOf = () => {
    const of = new Map();
    for (const id of st._order) {
      const layer = st._layers[id];
      if (layer.type !== 'symbol') continue;
      const tm = st.tileManagers[layer.source];
      for (const key of tm.getRenderableIds(true)) {
        const b = tm.getTileByID(key).getBucket(layer);
        if (b) for (let i = 0; i < b.symbolInstances.length; i++) of.set(b.symbolInstances.get(i).crossTileID, id);
      }
    }
    return of;
  };
  const tally = {};
  const add = (layer, what) => ((tally[layer] ??= { new: 0, gone: 0, flipped: 0, commits: 0 })[what]++);
  let changes = 0;
  const update = st._updatePlacement.bind(st);
  st._updatePlacement = (...a) => {
    const before = st.placement;
    const dirty = update(...a);
    const now = st.placement;
    if (now !== before && now.lastPlacementChangeTime !== before?.lastPlacementChangeTime) {
      changes++;
      const of = layerOf();
      const seen = new Set();
      for (const [id, jp] of Object.entries(now.placements)) {
        const prev = before.opacities[id];
        const layer = of.get(+id) ?? '?';
        if (!prev) (jp.text || jp.icon) && (add(layer, 'new'), seen.add(layer));
        else if (prev.text.placed !== jp.text || prev.icon.placed !== jp.icon) add(layer, 'flipped'), seen.add(layer);
      }
      for (const [id, prev] of Object.entries(before.opacities)) {
        if (!now.placements[id] && (prev.text.placed || prev.icon.placed)) add(of.get(+id) ?? '?(gone)', 'gone'), seen.add(of.get(+id) ?? '?(gone)');
      }
      for (const layer of seen) tally[layer].commits++;
    }
    return dirty;
  };
  await new Promise((r) => setTimeout(r, ms));
  return { changes, tally };
}, WINDOW);
console.log(`${variant} ${process.env.VIEW ?? 'z10'}: ${out.changes} changed placements in ${WINDOW / 1000} s`);
for (const [layer, t] of Object.entries(out.tally).sort((a, b) => b[1].commits - a[1].commits)) console.log(`  ${layer}: in ${t.commits} of them; ${t.new} new, ${t.gone} gone, ${t.flipped} flipped`);
console.log(ours().join('\n') || '  no errors of ours');
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await browser.close();
