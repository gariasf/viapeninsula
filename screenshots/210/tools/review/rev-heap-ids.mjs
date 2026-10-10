// #210 review: which places' markers rev-heap.mjs counts at z10 under each variant, by layer.
import { launch, open } from './lib.mjs';
const BOX = [[2.115, 41.43], [2.21, 41.36]];
const browser = await launch();
const { p, load, jump } = await open(browser, { hash: 'map=10/41.4500/2.1000' });
const sets = {};
for (const [v, q] of [['few', 'few'], ['pick', 'pick']]) {
  await load(q, 'map=10/41.4500/2.1000');
  await jump([2.1, 41.45], 10, 3000);
  sets[v] = await p.evaluate((box) => {
    const m = window.__map;
    const [a, b] = box.map((c) => m.project(c));
    const out = {};
    for (const id of ['stations', 'v-bands-3', 'v-bands-4']) {
      const layer = m.style._layers[id];
      if (!layer || layer.isHidden(m.getZoom())) continue;
      const prop = layer.type === 'circle' ? 'circle-opacity' : 'icon-opacity';
      out[id] = m.queryRenderedFeatures([[a.x, a.y], [b.x, b.y]], { layers: [id] }).filter((f) => layer.paint.get(prop).evaluate({ type: 1, properties: f.properties }, {}) > 0).map((f) => f.properties.id);
    }
    const names = new Map([...m.getSource('station-names').serialize().data.features].map((f) => [f.properties.id ?? '', f.properties.name]));
    return { out, fewer: window.__fewer.length };
  }, BOX);
}
const name = (id) => id;
const fewSet = new Set(Object.values(sets.few.out).flat());
const pickSet = new Set(Object.values(sets.pick.out).flat());
console.log('few layers', Object.fromEntries(Object.entries(sets.few.out).map(([k, v]) => [k, v.length])), 'fewer', sets.few.fewer);
console.log('pick layers', Object.fromEntries(Object.entries(sets.pick.out).map(([k, v]) => [k, v.length])));
console.log('in pick not few:', [...pickSet].filter((x) => !fewSet.has(x)).join(', '));
console.log('in few not pick:', [...fewSet].filter((x) => !pickSet.has(x)).join(', '));
await browser.close();
