// #780 sheet shots: node SP/780/shoot.ts <name> <device> <scheme> <dist> [query] [places,comma]
// One page per device × scheme, jumps through each place's zooms, one PNG each into SP/780/shots/<name>/, and
// the Trains drawn in view by Network (pills/dots, Live) into SP/780/shots/<name>/counts.jsonl.
import fs from 'node:fs';
import path from 'node:path';
import { launch, openMap, ready } from '../wt-780/src/page/page.ts';
import { withSlots } from '../wt-780/src/page/slots.ts';

const SP = path.dirname(new URL(import.meta.url).pathname);
export const PLACES: Record<string, [number, number]> = {
  atocha: [40.4065, -3.6895],
  chamartin: [40.4722, -3.6826],
  sants: [41.3792, 2.1404],
  valencia: [39.466, -0.377],
  sevilla: [37.3918, -5.9756],
};
const ZOOMS = [7, 9, 10, 12, 14];
const [name, device, scheme, dist, query = '', placesArg] = process.argv.slice(2) as [string, 'laptop' | 'phone', 'light' | 'dark', string, string?, string?];
const places = placesArg ? placesArg.split(',') : Object.keys(PLACES);
const dir = path.join(SP, 'shots', name);
fs.mkdirSync(dir, { recursive: true });

const code = await withSlots(1, async () => {
  const browser = await launch();
  try {
    const [lat0, lon0] = PLACES[places[0]!]!;
    const m = await openMap(browser, { device, scheme, dist, out: process.env.OUT, hash: `${query}#map=9/${lat0}/${lon0}` });
    await m.go();
    await ready(m.page, 6000);
    for (const place of places) {
      const [lat, lon] = PLACES[place]!;
      for (const zoom of ZOOMS) {
        await m.page.evaluate(
          ([lat, lon, zoom]) =>
            new Promise<void>((done) => {
              window.map.jumpTo({ center: [lon, lat], zoom });
              const t = setTimeout(done, 9000);
              window.map.once('idle', () => (clearTimeout(t), done()));
            }),
          [lat, lon, zoom],
        );
        await m.page.waitForTimeout(2500);
        await m.page.screenshot({ path: path.join(dir, `${place}-${device}-${scheme}-z${zoom}.png`) });
        const counts = await m.page.evaluate(() => {
          const out: Record<string, { pills: number; dots: number; live: number }> = {};
          for (const f of window.map.queryRenderedFeatures({ layers: ['trains', 'train-pills', 'train-pills-followed'] })) {
            const n = (out[f.properties.network] ??= { pills: 0, dots: 0, live: 0 });
            f.layer.id === 'trains' ? n.dots++ : n.pills++;
            if (f.properties.live) n.live++;
          }
          return out;
        });
        fs.appendFileSync(path.join(dir, 'counts.jsonl'), JSON.stringify({ place, device, scheme, zoom, at: new Date().toISOString(), counts }) + '\n');
      }
      console.log(place, 'done');
    }
    const errors = [...new Set(m.errors)];
    if (errors.length) console.log('errors:\n  ' + errors.join('\n  '));
    await m.close();
    return errors.some((e) => e.startsWith('pageerror')) ? 1 : 0;
  } finally {
    await browser.close();
  }
});
process.exit(code);
