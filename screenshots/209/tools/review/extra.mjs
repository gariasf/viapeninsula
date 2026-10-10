// Review of #209: what the build's shots leave out. A followed Scheduled Train (an R2N by El Prat, R2N 1.5:1 on
// white): its pill and target on the map and its card's status dot; and About's Reading the map, whose key has a
// Scheduled pill. Today, dash and pick, light and dark.
import { launch, open, ours, settle, R, DAY } from './common.mjs';
const out = `${R}shots`;
const SCHEDULED = 'rodalies:5181S25438R2N';
const browser = await launch();
for (const [label, query] of [['today', ''], ['dash', 'dash'], ['pick', 'pick']]) {
  for (const colorScheme of ['light', 'dark']) {
    const name = `${label}-${colorScheme}`;
    const { ctx, page, logs } = await open(browser, { query, colorScheme, hash: `map=14/41.3309/2.0893&train=${DAY}/${SCHEDULED}` });
    await settle(page, 3000);
    const at = await page.evaluate(() => {
      const f = window.__map.getSource('trains').serialize().data.features.find((f) => f.properties.followed);
      return f && { ...window.__map.project(f.geometry.coordinates), live: f.properties.live, line: f.properties.line };
    });
    if (at) await page.screenshot({ path: `${out}/${name}-sched-follow-100.png`, clip: { x: Math.max(0, Math.min(390 - 160, at.x - 80)), y: Math.max(0, at.y - 80), width: 160, height: 160 } });
    const status = page.locator('.status-line').first();
    if (await status.count()) {
      const b = await status.boundingBox();
      await page.screenshot({ path: `${out}/${name}-sched-card.png`, clip: { x: 0, y: Math.max(0, b.y - 60), width: 390, height: 100 } });
    }
    const dot = await page.evaluate(() => {
      const d = document.querySelector('.status-line .dot');
      return d ? `${d.className}: ${getComputedStyle(d).borderTopStyle}` : 'no dot';
    });
    // About, from the legend.
    await page.locator('.legend').click();
    await page.waitForTimeout(800);
    const keys = page.locator('.about .keys');
    if (await keys.count()) {
      const b = await keys.boundingBox();
      await page.screenshot({ path: `${out}/${name}-about-keys.png`, clip: { x: 0, y: Math.max(0, b.y - 10), width: 390, height: Math.min(200, b.height + 60) } });
    }
    console.log(name, JSON.stringify(at), dot, ours(logs).join(' || ') || 'no console errors or warnings of ours, no page errors, one load');
    await ctx.close();
  }
}
await browser.close();
