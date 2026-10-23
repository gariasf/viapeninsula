// The map's smoke check, which any machine can run, unlike page.ts's launch(), bound to the Mac's GPU:
// that the built page loads with no uncaught error, counts its Trains in the legend, finds a Station
// in Search and opens its board, shows the Now, Favourites and Passport sheets, speaks English when
// asked, and opens About from the legend. It builds the tree and openMap() serves it at the site's own
// address, as `npm run page` does, so the live bucket's CORS lets it read the live files; the checks
// read the live bundle, so they say what it says at the moment they run, in Spanish, openMap()'s locale.
//   npm run smoke
// prints `ok` or `not ok` a check and exits 1 when one fails, or when a page raised an uncaught
// `pageerror`; a console error or a failed request is printed as a warning, as page.ts prints them.
// Chromium is $CHROMIUM's, else the one in playwright-core's cache (the 1223 page.ts pins), on the GPU
// through Metal on the Mac and on SwiftShader elsewhere, which a CI's Linux has to settle for: slower,
// but what this checks is that the page works, not how fast it draws. It runs in one browser slot, as
// every browser check here does (#729).
import { chromium, type Browser, type Page } from 'playwright-core';
import { build, openMap, ready, type MapPage } from './page.ts';
import { withSlots } from './slots.ts';

/** A headless Chromium anywhere: $CHROMIUM's, else the cache's, with the GPU where the Mac has one. */
function launch(): Promise<Browser> {
  const gpu = process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--enable-unsafe-swiftshader'];
  return chromium.launch({ executablePath: process.env.CHROMIUM || undefined, headless: true, args: gpu });
}

/** Fails the check with `what` unless `ok`. */
function say(ok: boolean, what: string) {
  if (!ok) throw new Error(what);
}

/** The text of `selector`, or ''. */
async function textOf(page: Page, selector: string): Promise<string> {
  return (await page.locator(selector).first().textContent().catch(() => null)) ?? '';
}

/** The legend's counts, which come once the Trips of the regions in view have. */
async function legendCounts(page: Page): Promise<string> {
  await page.waitForFunction(() => /\d+ en directo/.test(document.querySelector('button.legend')?.textContent ?? ''), null, { timeout: 120_000 });
  return textOf(page, 'button.legend');
}

const checks: [string, (page: Page) => Promise<void>][] = [
  [
    'loads and counts its Trains',
    async (page) => {
      const legend = await legendCounts(page);
      say(/\d+ en directo/.test(legend), `the legend has no Live count: "${legend.trim()}"`);
      say(/\d+ programad/.test(legend), `the legend has no Scheduled count: "${legend.trim()}"`);
    },
  ],
  [
    'speaks English when asked, and Spanish again',
    async (page) => {
      const choose = (code: string) =>
        page.evaluate((c) => {
          const select = document.querySelector<HTMLSelectElement>('.lang select');
          if (!select) throw new Error('the language switch has no <select>');
          select.value = c;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }, code);
      await choose('en');
      await page.waitForFunction(() => document.documentElement.lang === 'en');
      say((await page.getByRole('button', { name: 'Search', exact: true }).count()) === 1, 'the Search tab is not relabelled in English');
      say((await page.evaluate(() => localStorage.getItem('language'))) === 'en', 'the choice is not kept on the device');
      await page.waitForFunction(() => /\d+ live/.test(document.querySelector('button.legend')?.textContent ?? ''), null, { timeout: 30_000 });
      await choose('es');
      await page.waitForFunction(() => document.documentElement.lang === 'es');
      say((await page.getByRole('button', { name: 'Buscar', exact: true }).count()) === 1, 'the Search tab is not relabelled back in Spanish');
    },
  ],
  [
    'finds a Station in Search and opens its board',
    async (page) => {
      await page.getByRole('button', { name: 'Buscar', exact: true }).click();
      const field = page.locator('input.search-field');
      await field.waitFor({ timeout: 30_000 });
      await field.fill('Sants');
      const row = page.locator('button.result', { hasText: 'Barcelona-Sants' }).first();
      await row.waitFor({ timeout: 60_000 });
      await row.click();
      // The board waits for the region's Trips, which load where the map hasn't them yet (#266).
      await page.waitForSelector('.sheet header.nameboard h2.title', { timeout: 120_000 });
      say(/Sants/.test(await textOf(page, '.sheet header.nameboard h2.title')), `the board is another Station's: "${(await textOf(page, '.sheet header.nameboard h2.title')).trim()}"`);
      // Rows, or the word that none are left today; while the Trips are on their way the board says neither (#597).
      await page.waitForSelector('.sheet ol.rows li, .sheet p:has-text("Ninguna salida próxima")', { timeout: 120_000 });
    },
  ],
  [
    "shows each tab's sheet",
    async (page) => {
      await page.getByRole('button', { name: 'Ahora', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.sheet:not([hidden]) h2.title')?.textContent?.trim() === 'Ahora', null, { timeout: 30_000 });
      await page.getByRole('button', { name: 'Favoritos', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.sheet .empty-state')?.textContent?.includes('Aún no hay nada.') ?? false, null, { timeout: 30_000 });
      await page.getByRole('button', { name: 'Pasaporte', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.sheet .empty-state')?.textContent?.includes('Aún no hay ningún viaje.') ?? false, null, { timeout: 30_000 });
    },
  ],
  [
    'opens About from the legend',
    async (page) => {
      await page.locator('button.legend').click();
      await page.waitForSelector('dialog[open]', { timeout: 30_000 });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('dialog')?.open, null, { timeout: 10_000 });
    },
  ],
];

/** Runs every check on a page of its own, in one browser slot; exits 1 where one failed. */
async function main() {
  const dist = build(process.cwd());
  const browser = await launch();
  const context = await browser.newContext();
  const renderer = await (await context.newPage()).evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    return gl?.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) as string | undefined;
  });
  await context.close();
  console.log(`WebGL: ${renderer ?? 'none'}`);
  let failed = 0;
  const warnings: string[] = [];
  for (const [name, check] of checks) {
    const map: MapPage & { go(): Promise<void> } = await openMap(browser, { device: 'laptop', dist });
    try {
      await map.go();
      await ready(map.page, 1500);
      await check(map.page);
      const pageerrors = map.errors.filter((error) => error.startsWith('pageerror'));
      if (pageerrors.length) throw new Error(pageerrors.join(' | '));
      console.log(`ok - ${name}`);
    } catch (e) {
      failed++;
      console.error(`not ok - ${name}: ${(e as Error).message}`);
    } finally {
      warnings.push(...map.errors.filter((error) => !error.startsWith('pageerror')).map((error) => `${name}: ${error}`));
      await map.close();
    }
  }
  await browser.close();
  for (const warning of warnings) console.warn(`warning - ${warning}`);
  if (failed) process.exitCode = 1;
  console.log(`${checks.length - failed}/${checks.length} checks pass`);
}

await withSlots(1, main);
