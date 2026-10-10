// #210 review: hover and tap on what each variant draws. For each variant's layers in view at a spot, finds a point
// over one of its features (MapLibre's own hit-testing), moves the mouse there (a desktop, non-touch page) and reads the
// cursor, then clicks and reads the board's heading. `node rev-hover.mjs`.
import { launch, open } from './lib.mjs';
const CASES = [
  ['badge', 'badge', [[2.1655, 41.3925], 14], ['v-badges', 'v-signs']],
  ['sign', 'sign', [[2.1655, 41.3925], 14], ['v-signs']],
  ['snap', 'snap', [[2.1655, 41.3925], 14], ['v-bands-7']],
  ['snap16', 'snap', [[2.1648, 41.3922], 16], ['v-rails']],
  ['bar', 'bar', [[2.1655, 41.3925], 13], ['v-bands-6']],
  ['square', 'square', [[2.17, 41.387], 12], ['v-squares']],
  ['pick16', 'pick', [[2.1648, 41.3922], 16], ['v-rails']],
];
const browser = await launch();
const { p, ours, load, jump } = await open(browser, { hash: 'map=14/41.3925/2.1655' });
for (const [label, query, at, layers] of CASES) {
  await load(query, 'map=14/41.3925/2.1655');
  await jump(...at, 2500);
  for (const layer of layers) {
    const pt = await p.evaluate((layer) => {
      const m = window.__map;
      const { width, height } = m.getCanvas().getBoundingClientRect();
      // Away from the edges and the buttons: the middle of the screen, above the cards.
      for (let y = 120; y < height - 300; y += 3) for (let x = 40; x < width - 80; x += 3) {
        const [f] = m.queryRenderedFeatures([x, y], { layers: [layer] });
        if (f && !m.queryRenderedFeatures([x, y], { layers: ['train-pills', 'trains'] }).length) return { x, y, id: f.properties.id };
      }
      return undefined;
    }, layer);
    if (!pt) {
      console.log(`${label} ${layer}: none in view`);
      continue;
    }
    await p.mouse.move(pt.x, pt.y);
    await p.waitForTimeout(400);
    const cursor = await p.evaluate(() => window.__map.getCanvas().style.cursor);
    await p.mouse.click(pt.x, pt.y);
    await p.waitForTimeout(1500);
    const board = await p.evaluate(() => document.querySelector('header.nameboard h2')?.textContent?.trim() ?? '(no board)');
    console.log(`${label} ${layer} at ${pt.x},${pt.y} (${pt.id}): cursor '${cursor}', tap opens ${board}`);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(800);
  }
  const errs = ours().filter((l) => !/icon-offset|TimeoutError/.test(l));
  if (errs.length) console.log(errs.join('\n'));
}
await browser.close();
