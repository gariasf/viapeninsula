// Temporary sign-off shots for #472 (not committed). Usage: node src/page/shots472.ts <phone|laptop> <light|dark> [dist]
import type { Page } from 'playwright-core';
import { build, launch, openMap, ready } from './page.ts';
import { withSlots } from './slots.ts';

const OUT = '/private/tmp/claude-502/-Users-guillem-arias-Documents-gariasf-viapeninsula/499c8006-7cc0-4c95-8d0d-26c0d511cfd2/scratchpad/472/shots';
const [device, scheme, prebuilt] = process.argv.slice(2) as ['phone' | 'laptop', 'light' | 'dark', string?];
const dist = prebuilt ?? build('.');
const tag = `${device === 'phone' ? '390' : 'wide'}-${scheme}`;
const log = (...a: unknown[]) => console.log(tag, ...a);

await withSlots(1, async () => {
  const browser = await launch();
  try {
    const m = await openMap(browser, { device, scheme, dist, hash: '#station=adif:71801' });
    await m.context.addInitScript(() => localStorage.setItem('language', 'en'));
    await m.go();
    await ready(m.page, 3000);
    const p = m.page;
    const shot = async (name: string) => {
      await p.screenshot({ path: `${OUT}/${name}-${tag}.png` });
      log('shot', name);
    };
    const away = () => p.mouse.move(2, 300);
    const states = async (prefix: string, sel: string) => {
      const star = p.locator(sel);
      await star.waitFor({ timeout: 60_000 });
      await p.waitForTimeout(1500);
      await away();
      log(prefix, 'label', await star.getAttribute('aria-label'), await star.getAttribute('title'), await star.evaluate((e) => [e.getBoundingClientRect().width, e.getBoundingClientRect().height, e.hasAttribute('aria-pressed')]));
      await shot(`${prefix}-unkept`);
      await star.hover();
      await p.waitForTimeout(300);
      log(prefix, 'hover bg', await star.evaluate((e) => getComputedStyle(e).backgroundColor + ' r=' + getComputedStyle(e).borderRadius));
      await shot(`${prefix}-unkept-hover`);
      await star.click();
      await away();
      await p.waitForTimeout(500);
      await shot(`${prefix}-kept`);
      await star.hover();
      await p.waitForTimeout(300);
      await shot(`${prefix}-kept-hover`);
      await away();
      // Keyboard focus: from the close button beside it, back with Shift+Tab.
      await star.focus();
      await p.keyboard.press('Tab');
      await p.keyboard.press('Shift+Tab');
      log(prefix, 'focus-visible', await star.evaluate((e) => e.matches(':focus-visible')));
      await p.waitForTimeout(300);
      await shot(`${prefix}-kept-focus`);
    };
    await states('board', '.nameboard .star');
    // A second Station and two Lines, kept by their stars.
    for (const [hash, sel] of [['#station=adif:79400', '.nameboard .star'], ['#line=rodalies:R1', '.line-head .star']]) {
      await p.evaluate((h) => (location.hash = h), hash);
      const star = p.locator(sel);
      await star.waitFor({ timeout: 60_000 });
      await p.waitForTimeout(1000);
      await star.click();
    }
    await p.evaluate(() => (location.hash = '#line=rodalies:R4'));
    await states('line', '.line-head .star');
    const kept = await p.evaluate(() => localStorage.getItem('favourites:1'));
    log('kept', kept);
    const sheet = async (wait: number) => {
      await p.evaluate(() => (location.hash = '#map=12/41.3874/2.1686'));
      await p.waitForTimeout(800);
      await p.locator('.tab').nth(2).click();
      await p.waitForTimeout(wait);
      await away();
      log('sheet', (await p.locator('.sheet').innerText()).replace(/\n+/g, ' | ').slice(0, 400));
    };
    await sheet(5000);
    await shot('favourites');
    if (device === 'phone' && scheme === 'light') {
      const h = await p.evaluate(() => {
        const s = document.querySelector('.sheet-body')!;
        return s.scrollHeight - s.clientHeight;
      });
      log('sheet overflow px', h);
      const style = await p.addStyleTag({ content: '.sheet{max-height:none!important;height:auto!important}.sheet-body{overflow:visible!important}' });
      await p.setViewportSize({ width: 390, height: 844 + Math.max(0, h) + 60 });
      await p.waitForTimeout(1500);
      await shot('favourites-full');
      await style.evaluate((e) => e.remove());
      await p.setViewportSize({ width: 390, height: 844 });
      await p.waitForTimeout(800);
    }
    // Gone: a kept Station and Line no region has.
    const reopen = async (list: string | null, wait: number, hash = '#map=12/41.3874/2.1686') => {
      await p.evaluate(([l, h]) => {
        if (l === null) localStorage.removeItem('favourites:1');
        else localStorage.setItem('favourites:1', l);
        location.hash = h!;
      }, [list, hash] as const);
      await p.reload({ waitUntil: 'commit' });
      await ready(p, 1500);
      await p.locator('.tab').nth(2).click();
      await p.waitForTimeout(wait);
      await away();
      log('sheet', (await p.locator('.sheet').innerText()).replace(/\n+/g, ' | ').slice(0, 400));
    };
    const keptList = JSON.parse(kept ?? '[]');
    await reopen(JSON.stringify([keptList[0], { kind: 'station', id: 'adif:00000', station: 'adif:00000', name: 'Nowhere Central' }, keptList.find((f: { kind: string }) => f.kind === 'line'), { kind: 'line', id: 'rodalies:R99', name: 'R99' }]), 6000);
    await shot('gone');
    // Loading: a Madrid Station kept, the map at Barcelona.
    await reopen(JSON.stringify([{ kind: 'station', id: 'adif:18000', station: 'adif:18000', name: 'Madrid-Atocha Cercanías' }, keptList[0]]), 150);
    await shot('loading');
    await p.waitForTimeout(8000);
    log('after wait', (await p.locator('.sheet').innerText()).replace(/\n+/g, ' | ').slice(0, 300));
    await shot('loading-after');
    await reopen(null, 1500);
    await shot('empty');
    log('errors', m.errors);
    await m.close();
  } finally {
    await browser.close();
  }
});
