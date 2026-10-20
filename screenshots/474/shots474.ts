// Temporary sign-off shots for #474 (not committed). Usage: node src/page/shots474.ts <main tree>
import type { Page } from 'playwright-core';
import { build, launch, openMap, ready } from './page.ts';
import { withSlots } from './slots.ts';

const OUT = '/private/tmp/claude-502/-Users-guillem-arias-Documents-gariasf-viapeninsula/5acf15e8-d318-4e82-aacf-723b6bc6bb8e/scratchpad/474/shots';
const dist = build('.');
const mainDist = build(process.argv[2]!);
const HASH = '#map=11/41.39/2.17';
const t0 = Date.now();

await withSlots(1, async () => {
  console.log('slot after', ((Date.now() - t0) / 1000).toFixed(0), 's');
  const browser = await launch();
  const errors: string[] = [];
  try {
    const open = async (device: 'phone' | 'laptop', scheme: 'light' | 'dark', o: { lang?: string; dist?: string; clock?: number } = {}) => {
      const m = await openMap(browser, { device, scheme, dist: o.dist ?? dist, hash: HASH, clock: o.clock, abort: o.clock ? [/\/snapshot\.json/] : [] });
      await m.context.addInitScript((l) => localStorage.setItem('language', l), o.lang ?? 'en');
      await m.go();
      await ready(m.page, 3000);
      return m;
    };
    const away = (p: Page) => p.mouse.move(2, 300);
    const openNow = async (p: Page) => {
      await p.locator('.tab').nth(2).click();
      await p.waitForTimeout(5000);
      await away(p);
    };
    const full = async (p: Page, path: string, w: number, h: number) => {
      const over = await p.evaluate(() => {
        const s = document.querySelector('.sheet-body')!;
        return s.scrollHeight - s.clientHeight;
      });
      const style = await p.addStyleTag({ content: '.sheet{max-height:none!important;height:auto!important}.sheet-body{overflow:visible!important}' });
      await p.setViewportSize({ width: w, height: h + Math.max(0, over) + 60 });
      await p.waitForTimeout(1500);
      await p.screenshot({ path });
      await style.evaluate((e) => e.remove());
      await p.setViewportSize({ width: w, height: h });
      await p.waitForTimeout(800);
    };
    const sheetText = (p: Page) => p.locator('.sheet').innerText().then((s) => s.replace(/\n+/g, ' | ').slice(0, 1500));

    for (const device of ['phone', 'laptop'] as const)
      for (const scheme of ['light', 'dark'] as const) {
        const tag = `${device === 'phone' ? '390' : 'wide'}-${scheme}`;
        const [w, h] = device === 'phone' ? [390, 844] : [1280, 800];
        const shot = async (p: Page, name: string) => {
          await p.screenshot({ path: `${OUT}/${name}-${tag}.png` });
          console.log(tag, 'shot', name);
        };
        // Before: main's right edge, with the die.
        const before = await open(device, scheme, { dist: mainDist });
        await shot(before.page, 'edge-before-main');
        errors.push(...before.errors.map((e) => `${tag} main ${e}`));
        await before.close();

        const m = await open(device, scheme);
        const p = m.page;
        console.log(tag, 'fabs', await p.locator('.fabs button').count());
        await shot(p, 'edge-after');
        await openNow(p);
        if (scheme === 'light') console.log(tag, 'sheet', await sheetText(p));
        await shot(p, 'now-top');
        await full(p, `${OUT}/now-full-${tag}.png`, w, h);
        console.log(tag, 'shot now-full');

        // Hover and keyboard focus.
        const states = async (name: string, sel: string) => {
          const el = p.locator(sel).first();
          if (!(await el.count())) return console.log(tag, 'no', sel);
          await el.scrollIntoViewIfNeeded();
          await el.hover();
          await p.waitForTimeout(300);
          console.log(tag, name, 'hover bg', await el.evaluate((e) => `${getComputedStyle(e).backgroundColor} r=${getComputedStyle(e).borderRadius}`));
          await shot(p, `hover-${name}`);
          await away(p);
          await el.focus();
          await p.keyboard.press('Tab');
          await p.keyboard.press('Shift+Tab');
          await p.waitForTimeout(300);
          console.log(tag, name, 'focus-visible', await el.evaluate((e) => e.matches(':focus-visible')));
          await shot(p, `focus-${name}`);
          await p.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        };
        await states('die', '.die-row');
        await states('line-row', '.nets .result');
        await states('more', '.sheet .more');
        await states('notable-row', '.sheet .results button.result:not(.nets .result)');
        await p.evaluate(() => document.querySelector('.sheet-body')?.scrollTo(0, 0));

        // The rest opened: the first more (a Network's Lines) and the last (Alerts).
        const mores = p.locator('.sheet .more');
        const n = await mores.count();
        console.log(tag, 'mores', n, await mores.allInnerTexts());
        for (const [i, name] of [[0, 'more-lines'], [n - 1, 'more-alerts']] as const) {
          if (n === 0 || (n === 1 && name === 'more-alerts')) continue;
          const more = mores.nth(i);
          await more.scrollIntoViewIfNeeded();
          await more.click();
          await p.waitForTimeout(2000);
          await away(p);
          await more.scrollIntoViewIfNeeded();
          await shot(p, name);
        }
        await full(p, `${OUT}/more-full-${tag}.png`, w, h);
        console.log(tag, 'shot more-full');
        errors.push(...m.errors.map((e) => `${tag} ${e}`));
        await m.close();
      }

    // The 190 px cap on a short phone.
    {
      const m = await open('phone', 'light');
      await m.page.setViewportSize({ width: 375, height: 667 });
      await m.page.waitForTimeout(1000);
      await m.page.screenshot({ path: `${OUT}/edge-after-375x667-light.png` });
      await openNow(m.page);
      console.log('375 sheet h', await m.page.locator('.sheet').evaluate((e) => e.getBoundingClientRect().height));
      await m.page.screenshot({ path: `${OUT}/now-top-375x667-light.png` });
      errors.push(...m.errors);
      await m.close();
    }
    // Catalan and Spanish at 390.
    for (const lang of ['ca', 'es']) {
      const m = await open('phone', 'light', { lang });
      await openNow(m.page);
      await m.page.screenshot({ path: `${OUT}/now-top-390-light-${lang}.png` });
      await full(m.page, `${OUT}/now-full-390-light-${lang}.png`, 390, 844);
      errors.push(...m.errors);
      await m.close();
    }
    // Faked clock (harness clock + snapshot aborted, as perf.ts does): first Trains at 07:40, last at 22:30.
    for (const [at, name] of [['2026-10-20T07:40:00+02:00', '0740'], ['2026-10-20T22:30:00+02:00', '2230']]) {
      const m = await open('phone', 'light', { clock: Date.parse(at) });
      await openNow(m.page);
      console.log('clock', name, await sheetText(m.page));
      await full(m.page, `${OUT}/clock-${name}-full-390-light.png`, 390, 844);
      errors.push(...m.errors.map((e) => `clock ${e}`));
      await m.close();
    }
    console.log('errors', errors);
  } finally {
    await browser.close();
  }
});
