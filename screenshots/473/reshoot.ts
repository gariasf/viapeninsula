// #473 picks re-shoot: Search → R4/R16 fit (phone, wide), R16's strip at its fork (phone, wide × light, dark), R4's glow at z10.
//   node reshoot.ts <out dir>
import path from 'node:path';
import fs from 'node:fs';
import { build, launch, openMap, ready } from '../../wt-473/src/page/page.ts';
import { withSlots } from '../../wt-473/src/page/slots.ts';
const tree = path.resolve(import.meta.dirname, '../../wt-473');
const out = path.resolve(process.argv[2]!);
fs.mkdirSync(out, { recursive: true });
const dist = build(tree);
const ENDS: Record<string, [number, number][]> = { R4: [[1.533, 41.184], [1.824, 41.727]], R16: [[2.184, 41.384], [0.522, 40.81], [0.483, 40.598]] };
await withSlots(1, async () => {
  const browser = await launch();
  const open = async (device: 'phone' | 'laptop', scheme: 'light' | 'dark', hash: string) => {
    const m = await openMap(browser, { device, scheme, dist, hash });
    await m.go(); await ready(m.page, 9000);
    const warn: string[] = [];
    m.page.on('console', (c) => c.type() !== 'log' && warn.push(c.text().slice(0, 160)));
    return { ...m, warn };
  };
  try {
    for (const device of ['phone', 'laptop'] as const) for (const q of ['R4', 'R16']) {
      const m = await open(device, 'light', '');
      await m.page.locator('nav.tabs button').first().click(); await m.page.waitForTimeout(500);
      await m.page.locator('.search-field').pressSequentially(q, { delay: 80 }); await m.page.waitForTimeout(800);
      const row = m.page.locator('.results button.result').filter({ hasText: new RegExp(`^\\s*${q}\\b`) }).first();
      await (await row.count() ? row : m.page.locator('.results button.result').first()).click();
      await m.page.waitForTimeout(8000);
      const r = await m.page.evaluate((pts) => {
        const w = window as any; const s = document.querySelector('.sheet')!.getBoundingClientRect();
        return { z: w.map.getZoom().toFixed(2), padding: w.map.getPadding(), sheet: [Math.round(s.top), Math.round(s.right)], size: [innerWidth, innerHeight], pts: pts.map((p) => { const x = w.map.project(p); return [Math.round(x.x), Math.round(x.y)]; }) };
      }, ENDS[q]!);
      console.log('fit', device, q, JSON.stringify(r), m.warn.join(' | ') || 'no warnings', [...new Set(m.errors)].join(' | ') || 'no errors');
      await m.page.screenshot({ path: path.join(out, `search-${q.toLowerCase()}-${device === 'laptop' ? 'wide' : 'phone'}-light.png`) });
      await m.close();
    }
    for (const device of ['phone', 'laptop'] as const) for (const scheme of ['light', 'dark'] as const) {
      const m = await open(device, scheme, '#line=rodalies:R16');
      const fork = m.page.locator('.line-strip li').filter({ hasText: "L'Aldea" }).first();
      await fork.scrollIntoViewIfNeeded(); await m.page.waitForTimeout(600);
      const notes = await m.page.locator('.line-strip li.stop').evaluateAll((ls) => ls.map((l) => l.textContent?.trim()).filter((t) => /Aldea|Tortosa|Ulldecona/.test(t ?? '')));
      console.log('strip', device, scheme, JSON.stringify(notes), m.warn.join(' | ') || 'no warnings', [...new Set(m.errors)].join(' | ') || 'no errors');
      await m.page.screenshot({ path: path.join(out, `line-r16-fork-${device === 'laptop' ? 'wide' : 'phone'}-${scheme}.png`) });
      await m.close();
    }
    const m = await open('laptop', 'light', '#line=rodalies:R4');
    await m.page.evaluate(() => (window as any).map.jumpTo({ center: [1.93, 41.5], zoom: 10.2 }));
    await m.page.waitForFunction(() => (window as any).map.loaded() && (window as any).map.areTilesLoaded(), null, { timeout: 30_000 }).catch(() => {});
    await m.page.waitForTimeout(2500);
    await m.page.screenshot({ path: path.join(out, 'look-glow-z10-light.png') });
    console.log('glow', m.warn.join(' | ') || 'no warnings', [...new Set(m.errors)].join(' | ') || 'no errors');
    await m.close();
  } finally { await browser.close(); }
});
