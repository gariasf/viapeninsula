// #519's sign-off shots: run from the worktree, `node <this> <outDir> [tree]`.
import fs from 'node:fs';
import path from 'node:path';
import { build, DEVICES, launch, openMap, ready } from '../../wt-519/src/page/page.ts';
import { withSlots } from '../../wt-519/src/page/slots.ts';

const [out = 'shots', tree = '.'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const dist = build(path.resolve(tree));
const log: string[] = [];
await withSlots(1, async () => {
  const browser = await launch();
  try {
    for (const device of ['phone', 'laptop'] as const)
      for (const scheme of ['light', 'dark'] as const) {
        const tag = `${scheme}-${DEVICES[device].viewport.width}x${DEVICES[device].viewport.height}`;
        const m = await openMap(browser, { device, scheme, dist, hash: '#map=13.5/41.3874/2.1686' });
        await m.go();
        await ready(m.page, 12_000);
        const shot = (name: string, clip?: { x: number; y: number; width: number; height: number }) => m.page.screenshot({ path: path.join(out, `${name}-${tag}.png`), clip });
        await shot('pills');
        // A pill each, Scheduled and Live, by its screen place, R2N's first where it's there.
        const find = (live: boolean) =>
          m.page.evaluate((live) => {
            const fs = window.map.queryRenderedFeatures({ layers: ['train-pills'] }).filter((f) => f.properties.live === live);
            const f = fs.find((f) => f.properties.name === 'R2N') ?? fs.find((f) => f.properties.outline === 'pointed') ?? fs[Math.floor(fs.length / 2)];
            if (!f || f.geometry.type !== 'Point') return undefined;
            const { x, y } = window.map.project(f.geometry.coordinates as [number, number]);
            return { x, y, name: f.properties.name as string };
          }, live);
        const { width, height } = DEVICES[device].viewport;
        const around = ({ x, y }: { x: number; y: number }, r = 90) => ({ x: Math.max(0, Math.min(width - 2 * r, x - r)), y: Math.max(0, Math.min(height - 2 * r, y - r)), width: 2 * r, height: 2 * r });
        // The legend, hovered and focused, and as dots for the sign-off.
        const legend = m.page.locator('button.legend').first();
        const box = await legend.boundingBox();
        const legendClip = box ? { x: box.x - 4, y: box.y - 4, width: box.width + 8, height: box.height + 8 } : undefined;
        await legend.hover();
        await shot('legend-hover', legendClip);
        await m.page.mouse.move(width / 2, height - 5);
        await legend.focus();
        await m.page.keyboard.press('Shift');
        await shot('legend-focus', legendClip);
        const dots = await m.page.addStyleTag({ content: '.legend .marker.scheduled{width:18px;border-style:dotted}' });
        await shot('legend-dots-alternative', legendClip);
        await dots.evaluate((e) => e.remove());
        await legend.evaluate((e) => (e as HTMLElement).blur());
        for (const live of [false, true]) {
          const at = await find(live);
          if (!at) {
            log.push(`${tag}: no ${live ? 'Live' : 'Scheduled'} pill in view`);
            continue;
          }
          await shot(`pill-${live ? 'live' : 'scheduled'}-${at.name}`, around(at));
          await m.page.mouse.click(at.x, at.y);
          await m.page.waitForTimeout(2500);
          await shot(`followed-${live ? 'live' : 'scheduled'}-${at.name}`);
          const now = await m.page.evaluate(() => {
            const f = window.map.queryRenderedFeatures({ layers: ['train-target'] })[0];
            if (!f || f.geometry.type !== 'Point') return undefined;
            const { x, y } = window.map.project(f.geometry.coordinates as [number, number]);
            return { x, y };
          });
          if (now) await shot(`target-${live ? 'live' : 'scheduled'}-${at.name}`, around(now, 70));
          if (!live) {
            await m.page.emulateMedia({ forcedColors: 'active' });
            await shot(`followed-scheduled-forced-colours`);
            await m.page.emulateMedia({ forcedColors: 'none' });
          }
          await m.page.keyboard.press('Escape');
          await m.page.waitForTimeout(1000);
        }
        // A board, with its Scheduled rows: Passeig de Gràcia's.
        await m.page.evaluate(() => window.map.jumpTo({ center: [2.1649, 41.3918], zoom: 14 }));
        await m.page.waitForTimeout(2500);
        const station = await m.page.evaluate(() => {
          const fs = window.map.queryRenderedFeatures({ layers: ['stations'] });
          const c = window.map.project(window.map.getCenter());
          const best = fs.map((f) => window.map.project((f.geometry as GeoJSON.Point).coordinates as [number, number])).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
          return best && { x: best.x, y: best.y };
        });
        if (station) {
          await m.page.mouse.click(station.x, station.y);
          await m.page.waitForTimeout(2500);
          await shot('board');
          await m.page.keyboard.press('Escape');
        }
        // Zoomed out, the dots.
        await m.page.evaluate(() => window.map.jumpTo({ zoom: 11 }));
        await m.page.waitForTimeout(3000);
        await shot('dots-z11', { x: width / 2 - 150, y: height / 2 - 150, width: 300, height: 300 });
        log.push(`${tag}: ${[...new Set(m.errors)].join(' | ') || 'no errors'}`);
        await m.close();
      }
  } finally {
    await browser.close();
  }
});
console.log(log.join('\n'));
