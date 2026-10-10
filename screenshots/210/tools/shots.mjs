// #210: the dev map (vite on 5210) at #208's four spots at phone size, and at interchanges either side of zoom 15,
// today and in each `?stations=` variant, light and dark, at a fixed time with one saved snapshot, so that every variant
// shows the same Trains. `node shots.mjs [label…]`, SCHEMES=light,dark to pick the basemaps. One browser, one page at a time.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { launch, open, here, day } from './lib.mjs';
const out = `${here}shots`;
// #208's four, and the interchanges: Verdaguer and Monumental at z14 (the maintainer's reference), Passeig de
// Gràcia on the bands at z14 and on the rails at z16, and Plaça de Catalunya on the rails at z15.5.
const FOUR = ['z13', 'z10', 'follow', 'board'];
const MORE = ['ref14', 'pdg14', 'pdg16', 'cat155'];
// label, query, its spots.
const VARIANTS = [
  ['today', '', [...FOUR, ...MORE, 'z12', 'tap']],
  ['square', 'square', [...FOUR, 'pdg14']],
  ['red', 'square,red', [...FOUR, 'pdg14']],
  ['board', 'board', [...FOUR, 'pdg14']],
  ['sign', 'sign', [...FOUR, ...MORE]],
  ['filled', 'badge,filled', [...FOUR, ...MORE]],
  ['badge', 'badge', [...FOUR, ...MORE, 'tap']],
  ['capsule', 'capsule', [...FOUR, ...MORE, 'tap']],
  ['bar', 'bar', [...FOUR, ...MORE]],
  ['snap', 'snap', [...FOUR, ...MORE]],
  ['few', 'few', [...FOUR, 'z12']],
  ['small', 'small', [...FOUR, 'z12']],
  ['pick', 'pick', [...FOUR, ...MORE, 'z12', 'tap']],
];
const AT = { cat9: [[2.0, 41.6], 9], z13: [[2.17, 41.387], 13], z10: [[2.1, 41.45], 10], z12: [[2.165, 41.392], 12], ref14: [[2.1737, 41.3995], 14], pdg14: [[2.1655, 41.3925], 14], pdg16: [[2.1648, 41.3922], 16], cat155: [[2.1695, 41.3868], 15.5] };
const only = process.argv.slice(2);
// SPOTS=cat9,… shoots only those spots, as a supplement: the top tier zoomed out over Catalonia's towns.
const spotsOnly = process.env.SPOTS?.split(',');
const schemes = (process.env.SCHEMES ?? 'light,dark').split(',');
const trainFile = `${here}train.txt`;
let trainId = existsSync(trainFile) ? readFileSync(trainFile, 'utf8').trim() : undefined;
const browser = await launch();
const t0 = Date.now();
for (const scheme of schemes) {
  // One page for each basemap, which loads each variant in turn and keeps the basemap's tiles cached.
  const { ctx, p, ours, settle, jump, load } = await open(browser, { scheme, hash: 'map=13/41.3870/2.1700' });
  for (const [label, query, spots] of VARIANTS.filter(([l]) => !only.length || only.includes(l))) {
    const name = `${label}-${scheme}`;
    await load(query, 'map=13/41.3870/2.1700');
    const shot = (spot, clip) => p.screenshot({ path: `${out}/${name}-${spot}.png`, ...(clip && { clip }) });
    const go = async (hash) => {
      await p.evaluate((h) => (location.hash = h), hash);
      await settle(3000);
    };
    // Closes the panel a follow, a board or a tap opened, and waits for the map's padding to ease back.
    const close = async () => {
      await p.keyboard.press('Escape');
      await p.waitForTimeout(1200);
    };
    for (const spot of spotsOnly ?? spots) {
      if (AT[spot]) {
        await jump(...AT[spot]);
        await shot(spot);
      } else if (spot === 'follow') {
        // The same Live Train in every variant: the first by ID within 1 km of Paral·lel.
        await jump([2.1665, 41.375], 13, 500);
        trainId ??= await p.evaluate(() => {
          const near = window.__map.getSource('trains').serialize().data.features.filter((f) => f.properties.live && Math.hypot(f.geometry.coordinates[0] - 2.1665, (f.geometry.coordinates[1] - 41.375) * 1.33) < 0.012);
          return near.map((f) => f.properties.id).sort()[0];
        });
        writeFileSync(trainFile, trainId);
        await go(`map=13/41.3750/2.1665&train=${trainId.includes('/') ? trainId : `${day}/${trainId}`}`);
        await shot('follow');
        await close();
      } else if (spot === 'board') {
        await go('map=15/41.3793/2.1404&station=adif:71801');
        await shot('board');
        await close();
      } else if (spot === 'tap') {
        // A tap on Passeig de Gràcia's Rodalies dot: its board, or under `badge` and `capsule` the interchange's.
        await go('map=14/41.3925/2.1655');
        const at = await p.evaluate(() => {
          const f = window.__map.getSource('stations').serialize().data.features.find((f) => f.properties.id === 'adif:71802');
          return f && window.__map.project(f.geometry.coordinates);
        });
        await p.mouse.click(at.x, at.y);
        await settle(3000);
        await shot('tap');
        await close();
      }
    }
    // The same data in every load: the legend's counts and the Closures drawn, which alerts.json brings.
    const same = await p.evaluate(() => `${document.querySelector('.legend')?.textContent?.trim()}, ${window.__map.getSource('closures')?.serialize().data.features.length} Closure pieces`);
    console.log(`${name} done at ${Math.round((Date.now() - t0) / 1000)} s, train ${trainId}, ${same}`);
    console.log(ours().join('\n') || '  no console errors or warnings of ours, no page errors');
  }
  await ctx.close();
}
await browser.close();
