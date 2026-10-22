// #828 measure: on the branch, how many "+n" counts a Station's name lies on, as the names are drawn over the pills and their
// counts (pick 2), at the look's four views and page-clock seconds, light, phone and laptop: a count's box (round, "+n" at
// SMALL_TEXT with its edge, at its pill's top right corner) that a drawn `station-names` or `station-badge-names` name's meets.
//   cd <SP>/wt-828 && node ../828/measure/countnames.mts → countnames.jsonl
import fs from 'node:fs';
import path from 'node:path';
import type { Browser } from 'playwright-core';
process.argv[2] = 'branch';
const { CAPTURE, MIRROR, scene, T0, tally, TREES } = await import('./shoot.mts');
const { build, launch, openMap, ready } = await import('../../wt-828/src/page/page.ts');
const { withSlots } = await import('../../wt-828/src/page/slots.ts');
const { boxOf, SMALL_TEXT } = await import('../../wt-828/src/web/pill.ts');

const HERE = path.dirname(new URL(import.meta.url).pathname);
const VIEWS = [
  { id: 'bcn-z12', lat: 41.389, lon: 2.1455, zoom: 12, at: 40 },
  { id: 'bcn-z13-pg', lat: 41.3893, lon: 2.1675, zoom: 13, at: 60 },
  { id: 'bcn-z13-sants', lat: 41.3792, lon: 2.1405, zoom: 13, at: 80 },
  { id: 'mad-z12-sol', lat: 40.4168, lon: -3.7038, zoom: 12, at: 110 },
];

async function run(browser: Browser, dist: string, device: 'phone' | 'laptop') {
  const m = await openMap(browser, { device, scheme: 'light', dist, out: MIRROR, at: CAPTURE, hash: `#map=12/41.389/2.1455` });
  await m.go();
  await ready(m.page, 0);
  for (const view of VIEWS) {
    if (view !== VIEWS[0]) await m.page.evaluate(({ lat, lon, zoom }) => window.map.jumpTo({ center: [lon, lat], zoom }), view);
    await m.page.waitForFunction((t) => Date.now() >= t, T0 + view.at * 1000, { timeout: 200_000, polling: 200 });
    const s = await scene(m.page);
    const counted = tally(s).drawn.filter((p) => p.more > 0);
    const boxes = counted.map((c) => {
      const [w, h] = boxOf('round', s.widths[`+${c.more}`]!, SMALL_TEXT);
      return [c.at[0] + c.countAt![0]! * SMALL_TEXT, c.at[1] + c.countAt![1]! * SMALL_TEXT, w + 1.5, h + 1.5];
    });
    const under = await m.page.evaluate((boxes) => boxes.map(([x, y, w, h]) => window.map.queryRenderedFeatures([[x! - w!, y! - h!], [x! + w!, y! + h!]], { layers: ['station-names', 'station-badge-names'] }).map((f) => String(f.properties.name ?? f.properties.id).replace(/\n/g, ' '))), boxes);
    const row = { view: view.id, device, late: s.clock - (T0 + view.at * 1000), counts: counted.length, underAName: under.filter((n) => n.length).length, examples: counted.flatMap((c, i) => (under[i]!.length ? [`${c.name}+${c.more} under ${under[i]![0]}`] : [])).slice(0, 8) };
    fs.appendFileSync(path.join(HERE, 'countnames.jsonl'), JSON.stringify(row) + '\n');
    console.log(`${view.id} ${device}: ${row.underAName} of ${row.counts} counts under a Station's name; ${row.examples.join(', ')}`);
  }
  console.log(`${device} errors: ${[...new Set(m.errors)].join(' | ') || 'none'}`);
  await m.close();
}

const dist = build(TREES.branch);
await withSlots(1, async () => {
  const browser = await launch();
  try {
    await Promise.all((['phone', 'laptop'] as const).map((device) => run(browser, dist, device)));
  } finally {
    await browser.close();
  }
});
