// Before/after shots for #468 + #719 on the page harness: main (wt-main) vs 468-44px (wt-468), same clock and live files.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const SP = '/private/tmp/claude-502/-Users-guillem-arias-Documents-gariasf-viapeninsula/dab94c61-d1b8-45be-8a43-ccce6b4e1609/scratchpad';
const { launch, openMap, ready } = await import(`${SP}/wt-468/src/page/page.ts`);
const { withSlots } = await import(`${SP}/wt-468/src/page/slots.ts`);
const { LIVE_URL } = await import(`${SP}/wt-468/src/bundle.ts`);
const OUT = path.join(import.meta.dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const SIDES = { before: `${SP}/wt-main/.cache/page/dist`, after: `${SP}/wt-468/.cache/page/dist` } as const;
const BCN = '#map=13/41.3874/2.1686';
const CLOCK = Date.now();
const cache = new Map<string, { body: Buffer; type: string }>();
const log: Record<string, unknown>[] = [];
type M = Awaited<ReturnType<typeof openMap>>;

const BOXES = () => {
  const box = (s: string) => {
    const e = [...document.querySelectorAll<HTMLElement>(s)].find((x) => x.getClientRects().length && !x.closest('[hidden]'));
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)];
  };
  const o: Record<string, unknown> = {};
  for (const [k, s] of Object.entries({ legend: '.legend', lang: '.lang', credits: '.credits summary', close: '.sheet .close', handle: '.sheet .handle', row: '.rows li > .row', tilt: '.fab.tilt', centre: '.fab:not(.tilt)', sheet: '.dock > .sheet' })) o[k] = box(s);
  o.active = document.activeElement?.className;
  o.fv = document.activeElement?.matches(':focus-visible');
  o.outline = document.activeElement ? getComputedStyle(document.activeElement).outlineColor : null;
  return o;
};

async function open(b: any, side: keyof typeof SIDES, device: 'phone' | 'laptop', scheme: 'light' | 'dark'): Promise<M> {
  const m = await openMap(b, { device, scheme, dist: SIDES[side], hash: BCN, clock: CLOCK });
  await m.page.addInitScript(() => { try { localStorage.setItem('language', 'en'); } catch {} });
  // The same live files on both sides: the first fetch of each is kept and served again.
  await m.page.route(`${LIVE_URL}/**`, async (r) => {
    const u = r.request().url();
    let hit = cache.get(u);
    if (!hit) { const res = await r.fetch(); hit = { body: await res.body(), type: res.headers()['content-type'] ?? 'application/json' }; if (res.ok()) cache.set(u, hit); }
    await r.fulfill({ body: hit.body, contentType: hit.type, headers: { 'access-control-allow-origin': '*' } });
  });
  await m.context.grantPermissions(['geolocation']);
  await m.context.setGeolocation({ latitude: 41.3792, longitude: 2.1404 });
  await m.go();
  await ready(m.page, 4000);
  return m;
}
const shot = async (m: M, name: string, extra: Record<string, unknown> = {}) => {
  await m.page.screenshot({ path: path.join(OUT, `${name}.png`) });
  log.push({ name, ...(await m.page.evaluate(BOXES)), ...extra });
  console.log('shot', name);
};
const kbFocus = async (m: M, sel: string) => {
  await m.page.mouse.move(2, 2);
  await m.page.locator(sel).first().focus();
  await m.page.keyboard.press('Shift+Tab');
  await m.page.keyboard.press('Tab');
  await m.page.waitForTimeout(300);
};

// Nearby (3), then a Train from it let go (1: corners, Tilt, Centre), then Tilt pressed and focused (4).
async function nearbyTrain(b: any, side: keyof typeof SIDES, device: 'phone' | 'laptop', scheme: 'light' | 'dark') {
  const tag = `${device === 'phone' ? '390x844' : '1280x800'}-${scheme}-${side}`;
  const m = await open(b, side, device, scheme);
  await m.page.locator('.tab').nth(1).click();
  await m.page.waitForSelector('.rows li > .row', { timeout: 30000 }).catch(() => {});
  await m.page.waitForTimeout(1500);
  await shot(m, `3-nearby-${tag}`);
  await m.page.locator('.rows li > .row').first().click().catch(() => {});
  await m.page.waitForTimeout(3000);
  const y = device === 'phone' ? 400 : 300, x = device === 'phone' ? 150 : 700;
  await m.page.mouse.move(x, y); await m.page.mouse.down();
  for (let i = 1; i <= 10; i++) await m.page.mouse.move(x + i * 12, y + i * 4);
  await m.page.mouse.up();
  await m.page.waitForTimeout(2500);
  await shot(m, `1-map-${tag}`);
  await m.page.locator('.fab.tilt').click();
  await m.page.waitForTimeout(2500);
  await kbFocus(m, '.fab.tilt');
  await shot(m, `4-tilt-focus-${tag}`, { pressed: await m.page.getAttribute('.fab.tilt', 'aria-pressed') });
  if (device === 'phone' && scheme === 'light') {
    await m.page.emulateMedia({ forcedColors: 'active' });
    await m.page.waitForTimeout(500);
    await shot(m, `4-tilt-focus-forced-${tag}`);
  }
  log.push({ name: `errors ${tag} nearby`, errors: [...new Set(m.errors)] });
  await m.close();
}

// A Station's board (2), a row hovered, then the close focused by keyboard.
async function board(b: any, side: keyof typeof SIDES, device: 'phone' | 'laptop', scheme: 'light' | 'dark') {
  const tag = `${device === 'phone' ? '390x844' : '1280x800'}-${scheme}-${side}`;
  const m = await open(b, side, device, scheme);
  await m.page.locator('.tab').first().click();
  await m.page.waitForSelector('.search-field');
  await m.page.fill('.search-field', 'sants');
  await m.page.waitForTimeout(1500);
  const rows = m.page.locator('button.result');
  const texts = await rows.allTextContents();
  const i = Math.max(0, texts.findIndex((t) => /Barcelona.?Sants/i.test(t)));
  await rows.nth(i).click();
  await m.page.waitForSelector('.rows li > .row', { timeout: 30000 }).catch(() => {});
  await m.page.waitForTimeout(2500);
  await shot(m, `2-board-${tag}`, { picked: texts[i] });
  await m.page.locator('.rows li > .row').nth(1).hover();
  await m.page.waitForTimeout(400);
  await shot(m, `2-board-hover-${tag}`);
  await kbFocus(m, '.sheet .close');
  await shot(m, `2-board-close-focus-${tag}`);
  log.push({ name: `errors ${tag} board`, errors: [...new Set(m.errors)] });
  await m.close();
}

const t0 = Date.now();
await withSlots(1, async () => {
  const b = await launch();
  try {
    for (const job of [nearbyTrain, board])
      for (const device of ['phone', 'laptop'] as const)
        for (const scheme of ['light', 'dark'] as const)
          for (const side of ['before', 'after'] as const)
            await job(b, side, device, scheme).catch((e) => log.push({ failed: `${job.name} ${device} ${scheme} ${side}`, e: String(e).slice(0, 300) }));
  } finally {
    await b.close();
  }
});
fs.writeFileSync(path.join(import.meta.dirname, 'results.json'), JSON.stringify(log, null, 1));
console.log('done in', Math.round((Date.now() - t0) / 1000), 's; load', os.loadavg().map((x) => x.toFixed(1)).join(' '));
