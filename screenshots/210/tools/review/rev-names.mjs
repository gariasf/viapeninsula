// #210 review: names shown at each spot under each variant, by MapLibre's own placement (not queryRenderedFeatures):
// each place's name (`station-names`) and each badge's (`v-badges`) whose text was placed and lies in view, names shown
// twice, and badges whose name gave way, with what took its room. Light basemap, 390×844 at a pixel ratio of 2, the
// clock fixed. `node rev-names.mjs`; VARIANTS=…, SPOTS=…; COLLISIONS=1 shoots each spot with MapLibre's collision boxes.
import { launch, open, here } from './lib.mjs';
const QUERIES = { today: '', square: 'square', board: 'board', sign: 'sign', badge: 'badge', filled: 'badge,filled', capsule: 'capsule', bar: 'bar', snap: 'snap', few: 'few', small: 'small', pick: 'pick' };
const AT = { z10: [[2.1, 41.45], 10], z12: [[2.165, 41.392], 12], z13: [[2.17, 41.387], 13], ref14: [[2.1737, 41.3995], 14], pdg14: [[2.1655, 41.3925], 14], pdg16: [[2.1648, 41.3922], 16], cat155: [[2.1695, 41.3868], 15.5] };
const variants = (process.env.VARIANTS ?? Object.keys(QUERIES).join(',')).split(',');
const spots = (process.env.SPOTS ?? 'z10,z12,z13,pdg14,ref14').split(',');
const browser = await launch();
const { p, ours, load, jump } = await open(browser, { hash: 'map=13/41.3870/2.1700' });
for (const v of variants) {
  await load(QUERIES[v] ?? v, 'map=13/41.3870/2.1700');
  const cells = [];
  for (const spot of spots) {
    await jump(...AT[spot], 3000);
    const got = await p.evaluate(() => {
      const m = window.__map;
      const st = m.style;
      const { width, height } = m.getCanvas().getBoundingClientRect();
      /** Each feature of a symbol layer in the tiles drawn, with whether MapLibre placed its text, and where it is on screen. */
      const placed = (id) => {
        const layer = st._layers[id];
        if (!layer || layer.isHidden(m.getZoom())) return [];
        const tm = st.tileManagers[layer.source];
        const out = [];
        const seen = new Set();
        for (const key of tm.getRenderableIds(true)) {
          const tile = tm.getTileByID(key);
          const b = tile.getBucket(layer);
          if (!b || b.layerIds[0] !== id) continue;
          const vt = tile.latestFeatureIndex.loadVTLayers()._geojsonTileLayer;
          for (let i = 0; i < b.symbolInstances.length; i++) {
            const s = b.symbolInstances.get(i);
            if (seen.has(s.crossTileID)) continue;
            seen.add(s.crossTileID);
            const jp = st.placement.placements[s.crossTileID];
            const f = vt.feature(s.featureIndex);
            const at = m.project(f.toGeoJSON(tile.tileID.canonical.x, tile.tileID.canonical.y, tile.tileID.canonical.z).geometry.coordinates);
            out.push({ name: f.properties.name, id: f.properties.id, text: !!jp?.text, x: at.x, y: at.y });
          }
        }
        return out;
      };
      const inView = (f) => f.x >= 0 && f.y >= 0 && f.x <= width && f.y <= height;
      const names = placed('station-names').filter((f) => f.text && inView(f));
      const badges = placed('v-badges').filter(inView);
      const opacity = m.getLayer('v-badges') ? m.getPaintProperty('v-badges', 'text-opacity') : null;
      const shown = [...names.map((f) => f.name.replace(/\n/g, ' ')), ...badges.filter((b) => b.text).map((b) => b.name)];
      const count = new Map();
      for (const n of shown) count.set(n, (count.get(n) ?? 0) + 1);
      const qrf = new Set(m.queryRenderedFeatures({ layers: ['station-names'] }).map((f) => f.properties.name)).size + badges.filter((b) => b.text).length;
      return { qrf, shown: shown.length, twice: [...count].filter(([, c]) => c > 1).map(([n]) => n), badgesOut: badges.filter((b) => !b.text).map((b) => b.name), badges: badges.length, hasOpacity: opacity !== null };
    });
    cells.push(`${spot}: ${got.shown} (qrf ${got.qrf})${got.twice.length ? ` (twice: ${got.twice.join(', ')})` : ''}${got.badges ? `, badges ${got.badges}${got.badgesOut.length ? `, names out: ${got.badgesOut.join(', ')}` : ''}` : ''}`);
    if (process.env.COLLISIONS) {
      await p.evaluate(() => (window.__map.showCollisionBoxes = true));
      await p.waitForTimeout(1500);
      await p.screenshot({ path: `${here}rev-shots/collisions-${v}-${spot}.png` });
      await p.evaluate(() => (window.__map.showCollisionBoxes = false));
    }
  }
  const same = await p.evaluate(() => `${document.querySelector('.legend')?.textContent?.trim().replace(/\s+/g, ' ')}, ${window.__map.getSource('closures')?.serialize().data.features.length} Closure pieces`);
  console.log(`${v}: ${cells.join(' | ')}  [${same}]`);
  const errs = ours().filter((l) => !/v-bands-\d\]\.layout\.icon-offset/.test(l));
  if (errs.length) console.log(errs.join('\n'));
}
await browser.close();
