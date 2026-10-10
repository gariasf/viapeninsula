// Review of #209, before any fix: (1) the layer order each variant leaves; (2) zoomed out below the Trains'
// layers' minzoom, whether a variant's own layers still draw; (3) under prefers-reduced-motion: reduce,
// whether the target pulses and the trails are laid.
import { launch, open, ours, settle, jump, R, DAY, TRAIN } from './common.mjs';
const browser = await launch();
const t0 = Date.now();
const say = (...a) => console.log(`${Math.round((Date.now() - t0) / 1000)} s`, ...a);
// (1) and (2): pick on light and on dark (dark adds glow), and dash,target,trail on dark for the trails.
for (const [query, colorScheme] of [['pick', 'light'], ['pick,trail', 'dark'], ['', 'dark']]) {
  const { ctx, page, logs } = await open(browser, { query, colorScheme });
  const order = await page.evaluate(() => {
    const ids = window.__map.getStyle().layers.map((l) => l.id);
    return ids.filter((id) => /train|trail|dash|pulse|target|^stations$|^station-names$|^mark$|^line-names$/.test(id)).map((id) => `${ids.indexOf(id)}:${id}${window.__map.getLayer(id).minzoom ? `(min ${window.__map.getLayer(id).minzoom})` : ''}`);
  });
  say(query, colorScheme, 'layer order:', order.join(' '));
  // Zoomed out to 6, below the Trains' minzoom, and following a Train there.
  await page.evaluate(([day, id]) => (location.hash = `map=6/41.6/1.6&train=${day}/${id}`), [DAY, TRAIN]);
  await settle(page, 3000);
  await page.evaluate(() => window.__map.jumpTo({ zoom: 6 }));
  await settle(page, 2000);
  const drawn = await page.evaluate(() => {
    const map = window.__map;
    const count = (layers) => map.queryRenderedFeatures({ layers: layers.filter((l) => map.getLayer(l)) }).length;
    return { zoom: +map.getZoom().toFixed(2), following: location.hash.includes('train='), dots: count(['trains']), halos: count(['train-halos']), dotDashes: count(['train-dot-dashes']), target: count(['train-target', 'train-target-outer', 'train-pulse']), trails: count(['train-trails', 'train-trails-core']) };
  });
  say(query, colorScheme, 'at zoom 6:', JSON.stringify(drawn));
  await page.screenshot({ path: `${R}shots/probe-${query.replace(',', '-') || 'today'}-${colorScheme}-z6.png` });
  say(ours(logs).join('\n') || 'no console errors or warnings of ours, no page errors');
  await ctx.close();
}
// (3) Reduced motion, the clock running: the pulse's radius and opacity over a second, and the trails laid.
for (const reducedMotion of ['reduce', 'no-preference']) {
  const { ctx, page, logs } = await open(browser, { query: 'target,trail', colorScheme: 'dark', clock: 'running', reducedMotion, hash: `map=13/41.3750/2.1665&train=${DAY}/${TRAIN}` });
  await settle(page, 3000);
  const samples = await page.evaluate(async () => {
    const out = [];
    for (let i = 0; i < 6; i++) {
      out.push([window.__map.getPaintProperty('train-pulse', 'circle-radius'), +(window.__map.getPaintProperty('train-pulse', 'circle-stroke-opacity') ?? 0).toFixed(3), window.__map.getSource('trails')?.serialize().data.features.length]);
      await new Promise((r) => setTimeout(r, 230));
    }
    return { matches: matchMedia('(prefers-reduced-motion: reduce)').matches, out };
  });
  say(`reducedMotion ${reducedMotion}: matches ${samples.matches}; [pulse radius, pulse opacity, trail pieces]:`, JSON.stringify(samples.out));
  say(ours(logs).join('\n') || 'no console errors or warnings of ours, no page errors');
  await ctx.close();
}
await browser.close();
