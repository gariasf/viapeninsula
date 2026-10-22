// #213 look-measure: when, after the capture's clock, a Train is on the viaduct or by Garraf's mouths, to pick each spot's second.
//   cd <SP>/wt-213 && node ../213/measure/tools/probe.mts <seconds> <spot,...>
// A (main) on the laptop, light, at each spot side by side: every 3 s, the Trains drawn within 300×150 px of the view's middle.
import fs from 'node:fs';
import path from 'node:path';
import { captured, launch, openMap, ready } from '../../../wt-213/src/page/page.ts';
import { withSlots } from '../../../wt-213/src/page/slots.ts';

const MEASURE = path.resolve(import.meta.dirname, '..');
const [TREE, LIVE, CAPTURE] = [path.resolve(MEASURE, '../../wt-213'), path.join(MEASURE, 'live'), path.resolve(MEASURE, '../capture/0630.ndjson.gz')];
const HASH: Record<string, string> = { viaduct: '#map=14/40.74818/-3.74047/48/45', mouth: '#map=15/41.2538/1.9031/-20/45' };
const [seconds, spots] = [Number(process.argv[2]), process.argv[3]!.split(',')];
const dist = path.join(TREE, '.cache/page', `dist-${path.basename(TREE)}`);
const T0 = captured(CAPTURE).clock;

await withSlots(1, async () => {
  const browser = await launch();
  try {
    await Promise.all(spots.map(async (spot) => {
      const m = await openMap(browser, { device: 'laptop', dist, hash: HASH[spot], out: LIVE, at: CAPTURE });
      await m.go();
      await ready(m.page, 0);
      const seen: string[] = [];
      while ((await m.page.evaluate(() => Date.now())) < T0 + seconds * 1000) {
        const near = await m.page.evaluate(() => {
          const map = window.map;
          const { width, height } = map.getCanvas().getBoundingClientRect();
          return map.queryRenderedFeatures([[width / 2 - 300, height / 2 - 150], [width / 2 + 300, height / 2 + 150]], { layers: ['trains', 'train-pills'] }).map((f) => {
            const p = map.project((f.geometry as GeoJSON.Point).coordinates as [number, number]);
            return `${f.properties.id}@${Math.round(p.x)},${Math.round(p.y)}`;
          });
        });
        const s = Math.round(((await m.page.evaluate(() => Date.now())) - T0) / 1000);
        seen.push(`${s}s ${[...new Set(near)].join(' ')}`);
        await m.page.waitForTimeout(3000);
      }
      fs.writeFileSync(path.join(MEASURE, `probe-${spot}.txt`), seen.join('\n') + '\n');
      console.log(spot, seen.filter((l) => l.includes('@')).join('\n'));
      await m.close();
    }));
  } finally {
    await browser.close();
  }
});
