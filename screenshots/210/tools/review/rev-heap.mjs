// #210 review: the heap at z10 over central Barcelona (the box #209's heap and the build's measure use), re-derived from
// what MapLibre draws rather than from a model of it: the Stations' markers alone on black, shot, give the pixels they
// cover; their features with an opacity above 0 give how many are drawn; and each Station pixel, queried against the
// Trains' dots and pills by MapLibre's own hit-testing, gives the Trains touching one. Light, 390×844 at a pixel ratio
// of 2, the clock fixed. `node rev-heap.mjs`; VARIANTS=today,few,small,pick.
import { launch, open } from './lib.mjs';
const QUERIES = { today: '', few: 'few', small: 'small', pick: 'pick', snap: 'snap', square: 'square', bar: 'bar' };
const variants = (process.env.VARIANTS ?? 'today,few,small,pick').split(',');
const BOX = [[2.115, 41.43], [2.21, 41.36]];
const STATION_LAYERS = /^(stations|v-bands-\d|v-squares|v-signs|v-badges|v-rails|v-capsule.*)$/;
const browser = await launch();
const { p, load, jump } = await open(browser, { hash: 'map=10/41.4500/2.1000' });
for (const v of variants) {
  await load(QUERIES[v] ?? v, 'map=10/41.4500/2.1000');
  await jump([2.1, 41.45], 10, 3000);
  // What's drawn: each Station marker feature with an opacity above 0, by MapLibre's own evaluation, in the box.
  const drawn = await p.evaluate(([box, re]) => {
    const m = window.__map;
    const [a, b] = box.map((c) => m.project(c));
    const ids = m.getStyle().layers.map((l) => l.id).filter((id) => new RegExp(re).test(id) && !m.style._layers[id].isHidden(m.getZoom()));
    const out = [];
    for (const id of ids) {
      const layer = m.style._layers[id];
      const prop = layer.type === 'circle' ? 'circle-opacity' : layer.type === 'symbol' ? 'icon-opacity' : 'line-opacity';
      for (const f of m.queryRenderedFeatures([[a.x, a.y], [b.x, b.y]], { layers: [id] })) {
        const o = layer.paint.get(prop).evaluate({ type: 1, properties: f.properties, id: f.id }, {});
        if (o > 0) out.push(`${id} ${f.properties.id}`);
      }
    }
    return { box: [a.x, a.y, b.x, b.y], ids, markers: out.length, places: new Set(out.map((s) => s.split(' ')[1])).size };
  }, [BOX, STATION_LAYERS.source]);
  // The markers alone on black.
  const keep = await p.evaluate((re) => {
    const m = window.__map;
    const hidden = [];
    for (const l of m.getStyle().layers) {
      if (l.type === 'background') m.setPaintProperty(l.id, 'background-color', '#000000');
      else if (!new RegExp(re).test(l.id) && m.getLayoutProperty(l.id, 'visibility') !== 'none') (m.setLayoutProperty(l.id, 'visibility', 'none'), hidden.push(l.id));
    }
    return hidden.length;
  }, STATION_LAYERS.source);
  await p.waitForTimeout(1500);
  const [x0, y0, x1, y1] = drawn.box;
  const shot = (await p.screenshot({ clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } })).toString('base64');
  // Decoded in the page, which has a PNG decoder.
  const png = await p.evaluate(async (b64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
    c.drawImage(bitmap, 0, 0);
    const { data } = c.getImageData(0, 0, bitmap.width, bitmap.height);
    const lit = [];
    for (let y = 0; y < bitmap.height; y++) for (let x = 0; x < bitmap.width; x++) {
      const i = 4 * (y * bitmap.width + x);
      if (data[i] + data[i + 1] + data[i + 2] > 90) lit.push([x, y]);
    }
    return { width: bitmap.width, height: bitmap.height, lit };
  }, shot);
  const lit = png.lit;
  const cover = lit.length / (png.width * png.height);
  // Put the map back, then ask which Trains' dots or pills each Station pixel lies under (in CSS px).
  await p.evaluate(() => location.reload());
  await p.waitForFunction(() => typeof window.__map?.getSource === 'function' && window.__map.getSource('trains')?.serialize().data.features.length > 20, null, { timeout: 120000 });
  await jump([2.1, 41.45], 10, 3000);
  const touch = await p.evaluate(([pts, scale, box]) => {
    const m = window.__map;
    const [x0, y0, x1, y1] = box;
    const inBox = (f) => {
      const q = m.project(f.geometry.coordinates);
      return q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1;
    };
    const trains = m.getSource('trains').serialize().data.features.filter(inBox);
    const touching = new Set();
    const seen = new Set();
    for (const [x, y] of pts) {
      const key = `${Math.floor(x / scale)} ${Math.floor(y / scale)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      for (const f of m.queryRenderedFeatures([x0 + x / scale, y0 + y / scale], { layers: ['trains', 'train-pills', 'train-pills-followed'] })) touching.add(f.properties.id);
    }
    const ids = new Set(trains.map((f) => f.properties.id));
    return { trains: ids.size, touching: [...touching].filter((id) => ids.has(id)).length };
  }, [lit, png.width / (x1 - x0), drawn.box]);
  console.log(`${v}: ${drawn.markers} markers drawn (${drawn.places} places), covering ${(100 * cover).toFixed(1)}% of the box; ${touch.touching} of ${touch.trains} Trains touch one  [layers: ${drawn.ids.join(', ')}; ${keep} hidden]`);
}
await browser.close();
