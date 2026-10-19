// #463 build: the branch's page on its own dry-run bundle, the sheet's views at zooms 7–10.
import path from 'node:path';
import { build, launch, openMap, ready, DEVICES } from '../../wt-463/src/page/page.ts';
import { withSlots } from '../../wt-463/src/page/slots.ts';

const here = path.dirname(new URL(import.meta.url).pathname);
const tree = path.join(here, '../../wt-463');
const VIEWS = { bcn: [41.39, 2.164], mad: [40.4066, -3.6892] } as const;
const dist = build(tree);
await withSlots(1, async () => {
  const browser = await launch();
  try {
    for (const device of ['phone', 'laptop'] as const)
      for (const scheme of ['light', 'dark'] as const) {
        const m = await openMap(browser, { device, scheme, dist, out: path.join(tree, 'out'), hash: `#map=8/${VIEWS.bcn[0]}/${VIEWS.bcn[1]}` });
        m.page.on('console', (msg) => msg.type() === 'error' && console.log('console', device, scheme, msg.text()));
        await m.go();
        await ready(m.page, 6000);
        for (const [place, [lat, lon]] of Object.entries(VIEWS))
          for (const zoom of [7, 8, 9, 10]) {
            const covered = await m.page.evaluate(([lat, lon, zoom]) => new Promise<number>((r) => {
              const count = () => window.map.queryRenderedFeatures().filter((f) => f.source === 'lines' && f.properties?.covered).length;
              window.map.jumpTo({ center: [lon, lat], zoom });
              window.map.once('idle', () => r(count()));
              setTimeout(() => r(count()), 15000);
            }), [lat, lon, zoom] as const);
            await m.page.waitForTimeout(2500);
            const { width, height } = DEVICES[device].viewport;
            console.log(place, zoom, device, scheme, 'covered features drawn', covered);
            await m.page.screenshot({ path: path.join(here, 'shots', `${place}-z${zoom}-${width}x${height}-${scheme}.png`) });
          }
        if (m.errors.length) console.log('pageerror', device, scheme, [...new Set(m.errors)].join('\n  '));
        await m.close();
      }
  } finally {
    await browser.close();
  }
});
