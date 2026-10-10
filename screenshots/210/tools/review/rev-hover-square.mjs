// #210 review: what a tap on the top tier's square at z12 opens, and why (`square`).
import { launch, open } from './lib.mjs';
const browser = await launch();
const { p, jump } = await open(browser, { query: 'square', hash: 'map=12/41.3870/2.1700' });
await jump([2.17, 41.387], 12, 2500);
const pt = { x: 157, y: 372 };
const near = await p.evaluate(({ x, y }) => {
  const m = window.__map;
  const q = (layers, r) => m.queryRenderedFeatures([[x - r, y - r], [x + r, y + r]], { layers }).map((f) => `${f.layer.id}:${f.properties.id ?? f.properties.name}`);
  return { at: q(['v-squares', 'stations', 'trains', 'train-pills'], 0), within10: q(['trains', 'train-pills', 'train-pills-followed', 'stations', 'v-squares'], 10) };
}, pt);
await p.mouse.click(pt.x, pt.y);
await p.waitForTimeout(2000);
const panel = await p.evaluate(() => document.querySelector('.sheet header')?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) ?? '(none)');
console.log(JSON.stringify(near), '\npanel:', panel);
await browser.close();
