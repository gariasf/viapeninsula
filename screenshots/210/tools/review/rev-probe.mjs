// #210 review: a closer look at the symbols that go at a changed placement under `snap` at z10: which layer's index
// holds them, and whether the layer was placed at that zoom. `node rev-probe.mjs`.
import { launch, open } from './lib.mjs';
const browser = await launch();
const { ctx, p } = await open(browser, { query: process.env.Q ?? 'snap', hash: 'map=13/41.3870/2.1700', scale: 3, mobile: true, running: true });
const cdp = await ctx.newCDPSession(p);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await p.evaluate(() => window.__map.jumpTo({ center: [2.1, 41.45], zoom: 10 }));
await p.waitForTimeout(5000);
const out = await p.evaluate(
  () =>
    new Promise((done) => {
      const st = window.__map.style;
      const owner = (id) => Object.entries(st.crossTileSymbolIndex.layerIndexes).filter(([, ix]) => Object.values(ix.usedCrossTileIDs).some((z) => z[id])).map(([l]) => l);
      const update = st._updatePlacement.bind(st);
      const logs = [];
      st._updatePlacement = (...a) => {
        const before = st.placement;
        const dirty = update(...a);
        const now = st.placement;
        if (now !== before && now.lastPlacementChangeTime !== before?.lastPlacementChangeTime && logs.length < 3) {
          const gone = Object.entries(before.opacities).filter(([id, prev]) => !now.placements[id] && (prev.text.placed || prev.icon.placed)).map(([id]) => +id);
          const byOwner = {};
          for (const id of gone) for (const l of owner(id).length ? owner(id) : ['none']) byOwner[l] = (byOwner[l] ?? 0) + 1;
          const zoom = now.collisionIndex.transform.zoom;
          const prevZoom = before.collisionIndex.transform.zoom;
          const placedIn = (pl) => {
            const layers = {};
            for (const id of Object.keys(pl.placements)) for (const l of owner(+id)) layers[l] = (layers[l] ?? 0) + 1;
            return layers;
          };
          logs.push({ zoom, prevZoom, gone: gone.length, byOwner, placedNow: placedIn(now), placedBefore: placedIn(before), mapZoom: window.__map.getZoom() });
          if (logs.length === 3) done(logs);
        }
        return dirty;
      };
      setTimeout(() => done(logs), 15000);
    }),
);
console.log(JSON.stringify(out, null, 1));
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await browser.close();
