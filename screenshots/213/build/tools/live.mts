// #213 ship: the live check, one slot batch. The deployed site, its analytics beacon blocked so it isn't a visit, and its
// page's script given a `window.map` hook by a route, so that queryRenderedFeatures() reads the decks:
// - a laptop 1280×800, tilted at the viaduct: the decks files' statuses, the decks and mouths drawn, no pageerror;
// - a phone 390×844 at the same view: no decks file or chunk asked for.
//   cd <SP>/wt-213b && node ../213/ship/tools/live.mts
import fs from 'node:fs';
import path from 'node:path';
import { DEVICES, hookMap, launch, SITE } from '../../../wt-213b/src/page/page.ts';
import { withSlots } from '../../../wt-213b/src/page/slots.ts';

const SHIP = path.resolve(import.meta.dirname, '..');
const HASH = '#map=14/40.74818/-3.74047/48/45';
const rows: object[] = [];
await withSlots(1, async () => {
  const browser = await launch();
  try {
    for (const device of ['laptop', 'phone'] as const) {
      const { cpu: _, ...d } = DEVICES[device];
      const context = await browser.newContext({ ...d, colorScheme: 'light', locale: 'es-ES', timezoneId: 'Europe/Madrid' });
      await context.addInitScript(() => {
        (window as unknown as { __hookMap: unknown }).__hookMap = (M: new (...a: unknown[]) => object) =>
          class extends M {
            constructor(...a: unknown[]) {
              super(...a);
              (window as unknown as { map: unknown }).map = this;
            }
          };
      });
      await context.route(/cloudflareinsights\.com/, (r) => r.abort());
      await context.route(/\/assets\/index-[^/]*\.js$/, async (r) => {
        const res = await r.fetch();
        await r.fulfill({ status: res.status(), contentType: 'text/javascript', body: hookMap(await res.text()) });
      });
      const page = await context.newPage();
      const [errors, decks]: string[][] = [[], []];
      page.on('pageerror', (e) => errors.push(`pageerror ${String(e)}`));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('response', (r) => /decks|deckLayers/.test(r.url()) && decks.push(`${r.url().replace(/^.*\//, '')} ${r.status()}`));
      await page.goto(`${SITE}/${HASH}`, { waitUntil: 'commit', timeout: 60_000 });
      await page.waitForFunction(() => typeof window.map?.getSource === 'function' && window.map.getSource('trains'), null, { timeout: 60_000 });
      await page.waitForFunction(() => window.map.areTilesLoaded() && !window.map.isMoving() && window.map.loaded(), null, { timeout: 60_000, polling: 250 }).catch(() => errors.push('never settled'));
      await page.waitForTimeout(3000);
      const state = await page.evaluate(() => {
        const map = window.map;
        const ids = map.getStyle().layers.map((l) => l.id);
        const n = (re: RegExp) => map.queryRenderedFeatures({ layers: ids.filter((id) => re.test(id)) }).length;
        return { zoom: map.getZoom(), pitch: map.getPitch(), decksSource: !!map.getSource('decks'), decksDrawn: ids.some((id) => /decks/.test(id)) ? n(/decks/) : 0, mouthsDrawn: map.getLayer('mouths') ? n(/^mouths$/) : 0 };
      });
      await page.screenshot({ path: path.join(SHIP, 'shots', `live-viaduct-${device}-light.png`) });
      const row = { device, at: new Date().toISOString(), ...state, decksAsked: decks, errors: [...new Set(errors)] };
      rows.push(row);
      console.log(JSON.stringify(row));
      await context.close();
    }
  } finally {
    await browser.close();
  }
});
fs.writeFileSync(path.join(SHIP, 'live.json'), JSON.stringify(rows, null, 1));
