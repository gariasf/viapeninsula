// Review of #209: every variant shot again at the build's spots, with the branch as committed, into review/shots/,
// to compare with the build's shots/, reading each load for page errors, console errors and reloads. Besides the
// build's spots: El Prat's board, where an R2N Train is Scheduled (R2N is 1.5:1 on white), and under forced
// colours the board, El Prat's and the legend, light and dark. `node reshoot.mjs [label…]`, FORCED=only|no.
import { launch, open, ours, settle, jump, R, DAY, TRAIN } from './common.mjs';
const out = `${R}shots`;
const VARIANTS = [
  ['today', '', 'light dark'],
  ['dash', 'dash', 'light dark'],
  ['grey', 'dash,grey', 'light dark'],
  ['small', 'small', 'light dark'],
  ['halo', 'halo', 'light dark'],
  ['letter', 'letter', 'light'],
  ['target', 'target', 'light dark'],
  ['under', 'under', 'light dark'],
  ['glow', 'glow', 'dark'],
  ['trail', 'trail', 'dark'],
  ['glowtrail', 'glow,trail', 'dark'],
  ['pick', 'pick', 'light dark'],
];
const CARDS = ['today', 'dash', 'grey', 'pick'];
const only = process.argv.slice(2);
const browser = await launch();
const t0 = Date.now();
const say = (...a) => console.log(`${Math.round((Date.now() - t0) / 1000)} s`, ...a);
const PRAT = 'map=15/41.3309/2.0893&station=adif:71707';
/** A board's first row with a Scheduled pill of `name` (any if none given), cropped as the build crops its rows. */
async function row(page, name, file) {
  const r = page.locator(`.rows button.row:has(.pill.scheduled${name ? `:text("${name}")` : ''})`).first();
  if (!(await r.count())) return undefined;
  const box = await r.boundingBox();
  const clip = { x: 0, y: Math.max(0, box.y - 90), width: 390, height: 200 };
  if (file) await page.screenshot({ path: `${out}/${file}.png`, clip });
  return { r, box, clip };
}
if (process.env.FORCED !== 'only') {
  for (const [label, query, on] of VARIANTS.filter(([l]) => !only.length || only.includes(l))) {
    for (const colorScheme of ['light', 'dark'].filter((s) => on.includes(s))) {
      const name = `${label}-${colorScheme}`;
      const { ctx, page, logs } = await open(browser, { query, colorScheme });
      const shot = (spot, clip) => page.screenshot({ path: `${out}/${name}-${spot}.png`, ...(clip && { clip }) });
      await jump(page, [2.17, 41.387], 13);
      await shot('z13');
      await shot('pile', { x: 130, y: 340, width: 165, height: 150 });
      await jump(page, [2.1, 41.45], 10);
      await shot('z10');
      await page.evaluate(([id, day]) => (location.hash = `map=13/41.3750/2.1665&train=${day}/${id}`), [TRAIN, DAY]);
      await settle(page, 3000);
      await shot('follow');
      const at = await page.evaluate(() => {
        const f = window.__map.getSource('trains').serialize().data.features.find((f) => f.properties.followed);
        return f && window.__map.project(f.geometry.coordinates);
      });
      if (at) await shot('follow-100', { x: Math.max(0, Math.min(390 - 160, at.x - 80)), y: Math.max(0, at.y - 80), width: 160, height: 160 });
      else say(name, 'NO FOLLOWED TRAIN');
      await page.evaluate(() => (location.hash = 'map=15/41.3793/2.1404&station=adif:71801'));
      await settle(page, 3000);
      await shot('board');
      if (CARDS.includes(label)) {
        const found = await row(page);
        if (found) {
          await page.mouse.move(found.box.x + found.box.width / 2, found.box.y + found.box.height / 2);
          await page.waitForTimeout(400);
          await shot('hover', found.clip);
          await page.mouse.move(195, 300);
          await found.r.focus();
          await page.keyboard.press('Shift');
          await page.waitForTimeout(400);
          await shot('focus', found.clip);
          await page.evaluate(() => document.activeElement?.blur());
        } else say(name, 'no Scheduled row at Sants');
        const legend = await page.locator('.legend').boundingBox();
        await page.mouse.move(legend.x + legend.width / 2, legend.y + legend.height / 2);
        await page.waitForTimeout(400);
        await shot('legend', { x: 0, y: 0, width: 390, height: 70 });
        await page.mouse.move(195, 300);
        // The cards' dashes as the browser draws them.
        const styles = await page.evaluate(() => {
          const of = (sel) => {
            const e = document.querySelector(sel);
            if (!e) return 'none';
            const s = getComputedStyle(e);
            return `${s.borderTopStyle} ${s.borderTopColor} | bg ${s.backgroundImage.slice(0, 60)}`;
          };
          return { pill: of('.rows .pill.scheduled'), marker: of('.legend .marker.scheduled') };
        });
        say(name, 'cards:', JSON.stringify(styles));
        // El Prat: an R2N Train Scheduled, R2N 1.5:1 on white; its row, then hovered.
        await page.evaluate((h) => (location.hash = h), PRAT);
        await settle(page, 3000);
        await shot('prat');
        const r2n = await row(page, 'R2N', `${name}-prat-row`);
        if (r2n) {
          await page.mouse.move(r2n.box.x + r2n.box.width / 2, r2n.box.y + r2n.box.height / 2);
          await page.waitForTimeout(400);
          await shot('prat-hover', r2n.clip);
          await page.mouse.move(195, 300);
        } else say(name, 'no Scheduled R2N row at El Prat');
      }
      say(name, 'done;', ours(logs).join(' || ') || 'no console errors or warnings of ours, no page errors, one load');
      await ctx.close();
    }
  }
}
// Forced colours (#116), light and dark: Sants' board, El Prat's, and the legend.
if (process.env.FORCED !== 'no') {
  for (const [label, query] of [['today', ''], ['dash', 'dash'], ['grey', 'dash,grey'], ['pick', 'pick']].filter(([l]) => !only.length || only.includes(l))) {
    for (const colorScheme of ['light', 'dark']) {
      const name = `${label}-forced-${colorScheme}`;
      const { ctx, page, logs } = await open(browser, { query, colorScheme, forcedColors: 'active', hash: 'map=15/41.3793/2.1404&station=adif:71801' });
      await settle(page, 3000);
      await page.screenshot({ path: `${out}/${name}-board.png` });
      await page.screenshot({ path: `${out}/${name}-legend.png`, clip: { x: 0, y: 0, width: 390, height: 70 } });
      await page.evaluate((h) => (location.hash = h), PRAT);
      await settle(page, 3000);
      await page.screenshot({ path: `${out}/${name}-prat.png` });
      await row(page, 'R2N', `${name}-prat-row`);
      say(name, 'done;', ours(logs).join(' || ') || 'no console errors or warnings of ours, no page errors, one load');
      await ctx.close();
    }
  }
}
await browser.close();
