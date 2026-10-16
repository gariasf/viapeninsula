// #780: every Line with Trains in the trains source, by Network: name, colour, outline, its pill's width at 10 px, and the paper.
import fs from 'node:fs';
import path from 'node:path';
import { launch, openMap, ready } from '../wt-780/src/page/page.ts';
import { withSlots } from '../wt-780/src/page/slots.ts';
const SP = path.dirname(new URL(import.meta.url).pathname);
const [dist, scheme = 'light'] = process.argv.slice(2) as [string, 'light' | 'dark'];
await withSlots(1, async () => {
  const browser = await launch();
  try {
    const out: unknown[] = [];
    for (const at of ['9/40.4065/-3.6895', '9/41.3792/2.1404', '9/39.466/-0.377', '9/37.3918/-5.9756']) {
      const m = await openMap(browser, { device: 'laptop', scheme, dist, hash: `#map=${at}` });
      await m.go();
      await ready(m.page, 8000);
      out.push(await m.page.evaluate(() => {
        const src = window.map.getSource('trains') as unknown as { _data: { geojson?: GeoJSON.FeatureCollection } & GeoJSON.FeatureCollection };
        const data = (src._data.geojson ?? src._data) as GeoJSON.FeatureCollection;
        const ctx = document.createElement('canvas').getContext('2d')!;
        ctx.font = 'bold 10px "Nunito Sans"';
        const bg = window.map.getStyle().layers.find((l) => l.type === 'background') as { paint?: Record<string, unknown> } | undefined;
        const lines: Record<string, unknown> = {};
        for (const f of data.features) {
          const p = f.properties!;
          lines[`${p.network}|${p.name}`] ??= { network: p.network, name: p.name, colour: p.colour, lettering: p.lettering, outline: p.outline, dark: p.dark, pillZoom: p.pillZoom, dotZoom: p.dotZoom, textW: ctx.measureText(p.name ?? '').width, n: 0, live: 0 };
          (lines[`${p.network}|${p.name}`] as { n: number }).n++;
          if (p.live) (lines[`${p.network}|${p.name}`] as { live: number }).live++;
        }
        return { paper: bg?.paint?.['background-color'], lines };
      }));
      await m.close();
    }
    fs.writeFileSync(path.join(SP, `stats-${scheme}.json`), JSON.stringify(out, null, 1));
  } finally {
    await browser.close();
  }
});
