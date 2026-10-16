// #780 hover/follow/focus shots: node SP/780/hover.ts <name> <scheme> <dist> [network]
// Laptop at Atocha z10: an LD pill hovered (pointer), clicked (followed: 12 px, glow on light), then Tab (keyboard focus), each a full shot and a 3× crop round the pill.
import fs from 'node:fs';
import path from 'node:path';
import { launch, openMap, ready } from '../wt-780/src/page/page.ts';
import { withSlots } from '../wt-780/src/page/slots.ts';

const SP = path.dirname(new URL(import.meta.url).pathname);
const [name, scheme, dist, network = 'ave-larga-distancia'] = process.argv.slice(2) as [string, 'light' | 'dark', string, string?];
const dir = path.join(SP, 'shots', name);
fs.mkdirSync(dir, { recursive: true });

const code = await withSlots(1, async () => {
  const browser = await launch();
  try {
    const m = await openMap(browser, { device: 'laptop', scheme, dist, out: process.env.OUT, hash: process.env.HASH ?? '#map=10/40.4065/-3.6895' });
    await m.go();
    await ready(m.page, 6000);
    await m.page.waitForTimeout(2500);
    const at = await m.page.evaluate((network) => {
      const { width, height } = window.map.getCanvas().getBoundingClientRect();
      // The Live pill of the Network furthest from any other Train, inside the view's middle, so a click follows it and nothing else.
      const all = window.map.queryRenderedFeatures({ layers: ['train-pills', 'trains'] }).map((f) => ({ f, p: window.map.project((f.geometry as GeoJSON.Point).coordinates as [number, number]) }));
      const clear = (a: (typeof all)[0]) => Math.min(...all.filter((b) => b.f.properties.id !== a.f.properties.id).map((b) => Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y)));
      const f = all.filter((a) => a.f.layer.id === 'train-pills' && a.f.properties.network === network && a.f.properties.live && a.p.x > 150 && a.p.x < width - 150 && a.p.y > 100 && a.p.y < height - 100).sort((a, b) => clear(b) - clear(a))[0];
      return f && { x: f.p.x, y: f.p.y, name: f.f.properties.name, id: f.f.properties.id, clear: clear(f) };
    }, network);
    if (!at) throw new Error(`no Live ${network} pill in view`);
    console.log('pill', at);
    const crop = async (state: string) => {
      const file = path.join(dir, `${state}-${scheme}.png`);
      await m.page.screenshot({ path: file });
      await m.page.screenshot({ path: path.join(dir, `${state}-${scheme}-crop.png`), clip: { x: Math.max(0, at.x - 100), y: Math.max(0, at.y - 60), width: 200, height: 120 } });
    };
    await crop('rest');
    await m.page.mouse.move(at.x, at.y);
    await m.page.waitForTimeout(800);
    console.log('cursor on hover:', await m.page.evaluate(() => window.map.getCanvas().style.cursor));
    await crop('hover');
    await m.page.mouse.click(at.x, at.y);
    await m.page.waitForTimeout(3000);
    // The followed Train's pill, where the map has it now.
    const now = await m.page.evaluate(() => {
      const f = window.map.queryRenderedFeatures({ layers: ['train-pills-followed'] })[0];
      return f && window.map.project((f.geometry as GeoJSON.Point).coordinates as [number, number]);
    });
    if (now) [at.x, at.y] = [now.x, now.y];
    console.log('followed pill at', now);
    await crop('followed');
    await m.page.keyboard.press('Tab');
    await m.page.waitForTimeout(500);
    console.log('focus:', await m.page.evaluate(() => document.activeElement?.outerHTML.slice(0, 160)));
    await m.page.screenshot({ path: path.join(dir, `focus-${scheme}.png`) });
    const errors = [...new Set(m.errors)];
    if (errors.length) console.log('errors:\n  ' + errors.join('\n  '));
    await m.close();
    return errors.some((e) => e.startsWith('pageerror')) ? 1 : 0;
  } finally {
    await browser.close();
  }
});
process.exit(code);
