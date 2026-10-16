// #572's shots and smoke through the page harness: node shots.ts <tree> <out dir> [spots,...] [--devices phone,laptop] [--schemes light,dark] [--no-build]
import fs from 'node:fs';
import path from 'node:path';
const [tree, out] = [path.resolve(process.argv[2]!), path.resolve(process.argv[3]!)];
const args = process.argv.slice(4);
const opt = (name: string, otherwise: string) => (args.includes(name) ? args[args.indexOf(name) + 1]! : otherwise);
const { build, launch, openMap, ready, DEVICES } = await import(`${tree}/src/page/page.ts`);
const { withSlots } = await import(`${tree}/src/page/slots.ts`);
const AT: Record<string, [[number, number], number]> = {
  z10: [[2.1, 41.45], 10], z12: [[2.165, 41.392], 12], z13: [[2.17, 41.387], 13], ref14: [[2.1737, 41.3995], 14],
  pdg14: [[2.1655, 41.3925], 14], pdg16: [[2.1648, 41.3922], 16], cat11: [[2.17, 41.39], 11], cat155: [[2.1695, 41.3868], 15.5],
};
const spots = (args[0] && !args[0].startsWith('--') ? args[0] : Object.keys(AT).join(',')).split(',');
fs.mkdirSync(out, { recursive: true });
const dist = args.includes('--no-build') ? path.join(tree, '.cache/page/dist') : build(tree);
const failed = await withSlots(1, async () => {
  const browser = await launch();
  let bad = false;
  try {
    for (const device of opt('--devices', 'phone,laptop').split(',')) {
      for (const scheme of opt('--schemes', 'light,dark').split(',')) {
        const m = await openMap(browser, { device, scheme, dist, hash: '#map=13/41.3870/2.1700' });
        await m.go();
        try { await ready(m.page, 8000); } catch (e) { console.log(`not ready: ${[...new Set(m.errors)].join('\n  ')}`); throw e; }
        const { width, height } = DEVICES[device].viewport;
        for (const spot of spots) {
          const tag = `${spot}-${scheme}-${width}x${height}`;
          if (spot === 'tap' || spot === 'hover') {
            // Passeig de Gràcia's badge at zoom 14: tapped, its board; hovered, the pointer.
            await m.page.evaluate(() => window.map.jumpTo({ center: [2.1655, 41.3925], zoom: 14 }));
            await m.page.waitForTimeout(2500);
            const at = await m.page.evaluate(() => {
              const f = window.map.queryRenderedFeatures({ layers: ['station-badges'] }).find((f) => f.properties.name === 'Passeig de Gràcia');
              if (!f) return undefined;
              const p = window.map.project((f.geometry as GeoJSON.Point).coordinates as [number, number]);
              const r = window.map.getCanvas().getBoundingClientRect();
              return { x: p.x + r.left, y: p.y + r.top };
            });
            if (!at) { console.log(`${tag}: no badge`); continue; }
            if (spot === 'tap') {
              // The Trains over the badge would take the tap first, as they do over a dot: hidden for this one.
              const trainLayers = ['trains', 'train-pills', 'train-pills-followed', 'train-dot-dashes'];
              await m.page.evaluate((ids) => ids.forEach((id) => window.map.getLayer(id) && window.map.setLayoutProperty(id, 'visibility', 'none')), trainLayers);
              await m.page.mouse.click(at.x, at.y);
              await m.page.evaluate((ids) => ids.forEach((id) => window.map.getLayer(id) && window.map.setLayoutProperty(id, 'visibility', 'visible')), trainLayers);
              await m.page.waitForTimeout(2500);
              const heading = await m.page.evaluate(() => [...document.querySelectorAll('h1, h2, h3')].map((h) => h.textContent).join(' / '));
              console.log(`${tag}: board "${heading}", link ${await m.page.evaluate(() => location.hash)}`);
            } else {
              await m.page.mouse.move(at.x, at.y);
              await m.page.waitForTimeout(400);
              console.log(`${tag}: cursor ${await m.page.evaluate(() => window.map.getCanvas().style.cursor)}`);
            }
            await m.page.screenshot({ path: path.join(out, `${tag}.png`) });
            await m.page.mouse.move(1, 1);
            await m.page.evaluate(() => document.querySelector<HTMLButtonElement>('.panel .close, button[aria-label*="Cerrar"]')?.click());
            continue;
          }
          const [center, zoom] = AT[spot]!;
          await m.page.evaluate(([c, z]) => window.map.jumpTo({ center: c as [number, number], zoom: z as number }), [center, zoom]);
          await m.page.waitForTimeout(3000);
          await m.page.screenshot({ path: path.join(out, `${tag}.png`) });
          const badges = await m.page.evaluate(() => window.map.queryRenderedFeatures({ layers: ['station-badges'] }).map((f) => f.properties.name));
          console.log(`${tag}: badges ${[...new Set(badges)].join(' | ')}`);
        }
        if (m.errors.length) console.log(`  errors ${device} ${scheme}:\n  ${[...new Set(m.errors)].join('\n  ')}`);
        bad ||= m.errors.some((e: string) => e.startsWith('pageerror'));
        await m.close();
      }
    }
  } finally {
    await browser.close();
  }
  return bad;
});
process.exit(failed ? 1 : 0);
