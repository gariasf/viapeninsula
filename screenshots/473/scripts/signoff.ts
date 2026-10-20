// #473 sign-off set through the page harness: one browser, a context per page, live data (no faked clock).
//   node signoff.ts <out dir> [topic...]   topics: lines hover banner looks search
import path from 'node:path';
import fs from 'node:fs';
import { build, launch, openMap, ready, SITE } from '../../wt-473/src/page/page.ts';
import { withSlots } from '../../wt-473/src/page/slots.ts';
import type { Page } from 'playwright-core';

const tree = path.resolve(import.meta.dirname, '../../wt-473');
const out = path.resolve(process.argv[2]!);
const topics = process.argv.slice(3);
const want = (t: string) => !topics.length || topics.includes(t);
fs.mkdirSync(out, { recursive: true });
const log: Record<string, unknown>[] = [];
const LINES = { r4: 'rodalies:R4', r16: 'rodalies:R16', r2s: 'rodalies:R2S', c6: 'cercanias-asturias:C6' } as const;
const devices = [['phone', 'phone'], ['wide', 'laptop']] as const;
const schemes = ['light', 'dark'] as const;

const dist = build(tree);
const info = (page: Page) =>
  page.evaluate(() => {
    const s = document.querySelector('.sheet') as HTMLElement | null;
    return {
      url: location.href.replace(location.origin, ''),
      header: s?.querySelector('header')?.textContent,
      chips: [...(s?.querySelectorAll('.state-chips > *') ?? [])].map((c) => c.textContent),
      banner: (document.querySelector('.banner') as HTMLElement | null)?.textContent ?? '',
      trains: s?.querySelectorAll('.line-strip li.train').length,
      zoom: window.map.getZoom().toFixed(2),
    };
  });

// A snapshot in which Cercanías Asturias' feed has failed for 10 minutes and none of its Trains is reported.
const asturiasDown = (numbers: boolean) => async (page: Page) =>
  page.route('**/snapshot.json*', async (route) => {
    const res = await route.fetch();
    const s = await res.json();
    s.feeds['cercanias-asturias'] = { ...s.feeds['cercanias-asturias'], lastSuccess: s.generated - 600_000, lastAttempt: s.generated, status: 'HTTP 503' };
    s.reports = s.reports.filter((r: { trip?: string; number?: string }) => !r.trip?.startsWith('cercanias-asturias:') && (numbers || !r.number));
    await route.fulfill({ response: res, json: s });
  });

await withSlots(1, async () => {
  const browser = await launch();
  const shot = async (name: string, device: 'phone' | 'laptop', scheme: 'light' | 'dark', hash: string, act: (p: Page, snap: (n: string, el?: string) => Promise<void>) => Promise<void>, o: { query?: string; setup?: (p: Page) => Promise<void> } = {}) => {
    const m = await openMap(browser, { device, scheme, dist, hash });
    if (o.setup) await o.setup(m.page);
    if (o.query) await m.page.goto(`${SITE}/${o.query}${hash}`, { waitUntil: 'commit', timeout: 60_000 });
    else await m.go();
    await ready(m.page, 9000);
    const snap = async (n: string, el?: string) => {
      const file = path.join(out, `${name}${n ? '-' + n : ''}.png`);
      if (el) await m.page.locator(el).first().screenshot({ path: file });
      else await m.page.screenshot({ path: file });
      log.push({ file: path.basename(file), ...(await info(m.page)) });
    };
    try { await act(m.page, snap); } catch (e) { log.push({ file: name, fail: String(e) }); }
    log.push({ page: name, errors: [...new Set(m.errors)] });
    console.log(name, m.errors.length ? [...new Set(m.errors)].join(' | ') : 'clean');
    await m.close();
  };
  try {
    if (want('lines'))
      for (const [d, dev] of devices) for (const s of schemes) for (const [k, id] of Object.entries(LINES))
        await shot(`line-${k}-${d}-${s}`, dev, s, `#line=${id}`, async (p, snap) => {
          await snap('');
          const spur = p.locator('.line-strip li.spur').first();
          if (await spur.count()) { await spur.scrollIntoViewIfNeeded(); await p.waitForTimeout(500); await snap('spur'); }
          const chips = p.locator('.state-chips .chip-button');
          for (let i = 0; i < (await chips.count()); i++) { await chips.nth(i).click(); await p.waitForTimeout(800); }
          if (await chips.count()) { await p.locator('.sheet-body').first().evaluate((b) => b.scrollTo(0, 0)); await p.waitForTimeout(800); await snap('panels'); }
        });
    if (want('cancelled'))
      for (const [d, dev] of devices) for (const sc of schemes) for (const id of ['rodalies:R1', 'cercanias-asturias:C4'])
        await shot(`cancel-${id.split(':')[1]!.toLowerCase()}-${d}-${sc}`, dev, sc, `#line=${id}`, async (p, snap) => {
          const chips = p.locator('.state-chips .chip-button');
          for (let i = 0; i < (await chips.count()); i++) { await chips.nth(i).click(); await p.waitForTimeout(800); }
          await p.locator('.sheet-body').first().evaluate((b) => b.scrollTo(0, 0)); await p.waitForTimeout(800); await snap('panels');
        });
    if (want('fit'))
      for (const [d, dev] of devices) for (const [id, pts] of Object.entries({ 'rodalies:R4': [[1.533, 41.184], [1.824, 41.727]], 'rodalies:R16': [[2.184, 41.384], [0.522, 40.81], [0.483, 40.598]], 'rodalies:R2S': [[2.184, 41.384], [0.555, 41.235]], 'cercanias-asturias:C6': [[-5.857, 43.366], [-5.367, 43.347]] }))
        await shot(`fit-${d}`, dev, 'light', `#line=${id}`, async (p) => {
          console.log(d, id, JSON.stringify(await p.evaluate((pts) => {
            const top = document.querySelector('.sheet')!.getBoundingClientRect();
            return { z: window.map.getZoom().toFixed(2), sheetTop: Math.round(d0(top)), w: innerWidth, pts: pts.map((q) => { const x = window.map.project(q as [number, number]); return [Math.round(x.x), Math.round(x.y)]; }) };
            function d0(r: DOMRect) { return innerWidth > 700 ? r.right : r.top; }
          }, pts)));
        });
    if (want('hover'))
      for (const [d, dev] of devices) for (const s of schemes)
        await shot(`hover-r4-${d}-${s}`, dev, s, `#line=${LINES.r4}`, async (p, snap) => {
          const row = p.locator('.line-strip .train-row').nth(1);
          await row.scrollIntoViewIfNeeded();
          await row.hover(); await p.waitForTimeout(400); await snap('hover', '.sheet');
          await p.mouse.move(2, 2);
          await row.evaluate((b) => (b as HTMLElement).focus({ focusVisible: true } as FocusOptions)); await p.waitForTimeout(400); await snap('focus', '.sheet');
        });
    if (want('banner'))
      for (const [d, dev] of devices) for (const s of schemes)
        for (const numbers of [true, false])
          await shot(`banner-c6${numbers ? '-feed' : '-all'}-${d}-${s}`, dev, s, `#line=${LINES.c6}`, async (_p, snap) => snap(''), { setup: asturiasDown(numbers) });
    if (want('looks'))
      for (const s of schemes) for (const look of ['glow', 'raise'] as const)
        await shot(`look-${look}-${s}`, 'laptop', s, `#line=${LINES.r4}`, async (p, snap) => {
          const views: [string, [number, number], number][] = [['z7', [1.85, 41.55], 7.2], ['z10', [1.93, 41.5], 10.2], ['z14', [1.9145, 41.4795], 14.2], ['stretch-sants-z14', [2.148, 41.382], 14.2], ['stretch-montcada-z14', [2.183, 41.487], 14.2], ['stretch-z12', [2.16, 41.39], 12.2]];
          for (const [n, center, zoom] of views) {
            await p.evaluate(([c, z]) => window.map.jumpTo({ center: c as [number, number], zoom: z as number }), [center, zoom]);
            await p.waitForFunction(() => window.map.loaded() && window.map.areTilesLoaded(), null, { timeout: 30_000 }).catch(() => {});
            await p.waitForTimeout(2500);
            await snap(n);
          }
        }, { query: look === 'raise' ? '?look=raise' : '' });
    if (want('dbg'))
      for (const [d, dev] of devices.slice(0, 1))
      await shot(`dbg-${d}`, dev, 'light', '', async (p, snap) => {
        await p.evaluate(() => { (window as any).__mv = []; for (const e of ['movestart', 'moveend']) window.map.on(e, (ev: any) => (window as any).__mv.push([e, Math.round(performance.now()), window.map.getZoom().toFixed(2), !!ev.originalEvent])); });
        await p.locator('nav.tabs button, .tabs button, button:has-text("Buscar")').first().click(); await p.waitForTimeout(500);
        await p.locator('.search-field').fill('R16'); await p.waitForTimeout(800);
        console.log('t0', await p.evaluate(() => Math.round(performance.now())), await p.locator('.results button.result').first().textContent());
        p.on('console', (m) => m.type() !== 'log' && console.log('console', m.type(), m.text().slice(0, 200)));
        console.log('before', JSON.stringify(await p.evaluate(() => { const r = document.querySelector('.sheet')!.getBoundingClientRect(); return [r.top, r.height, innerHeight]; })));
        await p.locator('.results button.result').first().click(); await p.waitForTimeout(6000);
        console.log('after', JSON.stringify(await p.evaluate(() => { const r = document.querySelector('.sheet')!.getBoundingClientRect(); return [r.top, r.height, innerHeight, document.activeElement?.className]; })));
        console.log(JSON.stringify(await p.evaluate(() => (window as any).__mv)));
        await snap('');
      });
    if (want('search'))
      for (const [d, dev] of devices)
      await shot(`search-r16-${d}-light`, dev, 'light', '', async (p, snap) => {
        await p.locator('nav.tabs button').first().click(); await p.waitForTimeout(500);
        await p.locator('.search-field').pressSequentially('R16', { delay: 80 }); await p.waitForTimeout(800);
        await snap('1-results');
        await p.locator('.results button.result').first().click(); await p.waitForTimeout(8000);
        await snap('2-screen');
      });
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(out, 'log.json'), JSON.stringify(log, null, 1));
  }
});
