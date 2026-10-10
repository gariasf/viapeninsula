// Review of #209: the legend focused by the keyboard, as the build shot it hovered, in each variant that changes
// its Scheduled marker, light and dark, into the build's shots/ as <variant>-<basemap>-legend-focus.png.
import { launch, open, ours, settle, W } from './common.mjs';
const browser = await launch();
for (const [label, query] of [['today', ''], ['dash', 'dash'], ['grey', 'dash,grey'], ['pick', 'pick']]) {
  for (const colorScheme of ['light', 'dark']) {
    const { ctx, page, logs } = await open(browser, { query, colorScheme });
    await settle(page, 2000);
    await page.mouse.move(195, 300);
    await page.locator('.legend').focus();
    await page.keyboard.press('Shift');
    await page.waitForTimeout(400);
    const visible = await page.evaluate(() => document.activeElement?.matches('.legend:focus-visible'));
    await page.screenshot({ path: `${W}shots/${label}-${colorScheme}-legend-focus.png`, clip: { x: 0, y: 0, width: 390, height: 70 } });
    console.log(label, colorScheme, `focus-visible ${visible};`, ours(logs).join(' || ') || 'no console errors or warnings of ours, no page errors, one load');
    await ctx.close();
  }
}
await browser.close();
