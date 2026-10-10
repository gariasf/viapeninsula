// #210 review, two checks: (1) at z13 over Plaça de Catalunya, where Diagonal's and Provença's names go, today and
// under `sign`: each name's place, its dot on screen, and its offset from it; (2) the interchange's board under
// `pick`, opened by a tap on Passeig de Gràcia, in forced colours (#116), light and dark, shot to rev-shots/.
import { launch, open, here } from './lib.mjs';
const browser = await launch();
{
  const { p, load, jump } = await open(browser, { hash: 'map=13/41.3870/2.1700' });
  for (const [v, q] of [['today', ''], ['sign', 'sign'], ['pick', 'pick']]) {
    await load(q, 'map=13/41.3870/2.1700');
    await jump([2.17, 41.387], 13, 3000);
    const rows = await p.evaluate(() => {
      const m = window.__map;
      const names = m.getSource('station-names').serialize().data.features;
      const placed = new Set(m.queryRenderedFeatures({ layers: ['station-names'] }).map((f) => f.properties.name));
      return names
        .filter((f) => /^(Diagonal|Provença)$/.test(f.properties.name))
        .map((f) => {
          const at = m.project(f.geometry.coordinates);
          return `${f.properties.name}: dot at ${Math.round(at.x)},${Math.round(at.y)}, anchor ${f.properties.anchor13} offset ${JSON.stringify(f.properties.offset13)} em, ${placed.has(f.properties.name) ? 'shown' : 'not shown'}`;
        });
    });
    console.log(`${v}:\n  ${rows.join('\n  ')}`);
  }
  await p.context().close();
}
for (const scheme of ['light', 'dark']) {
  const { p, ours, jump } = await open(browser, { scheme, query: 'pick', hash: 'map=14/41.3925/2.1655', forced: true });
  await jump([2.1655, 41.3925], 14, 2500);
  const at = await p.evaluate(() => {
    const f = window.__map.getSource('v-interchanges').serialize().data.features.find((f) => f.properties.name === 'Passeig de Gràcia');
    return window.__map.project(f.geometry.coordinates);
  });
  await p.mouse.click(at.x, at.y);
  await p.waitForTimeout(3000);
  await p.screenshot({ path: `${here}rev-shots/forced-pick-${scheme}-tap.png` });
  // Keyboard focus on the board's close button, as a keyboard reaches it.
  await p.focus('header.nameboard button');
  await p.keyboard.press('Shift');
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${here}rev-shots/forced-pick-${scheme}-focus.png` });
  console.log(`forced ${scheme}: board ${await p.evaluate(() => document.querySelector('header.nameboard h2')?.textContent)}; ${ours().filter((l) => !/TimeoutError/.test(l)).join(' | ') || 'no errors'}`);
  await p.context().close();
}
await browser.close();
