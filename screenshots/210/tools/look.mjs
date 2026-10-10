// #210: a quick look at variants while building them: a few spots for each `?stations=` given, light (SCHEME=dark for
// dark), and one contact sheet per spot in tmp/look-<spot>.jpg. `node look.mjs today square,…`.
import { execFileSync } from 'node:child_process';
import { launch, open, here } from './lib.mjs';
const queries = process.argv.slice(2).map((q) => (q === 'today' ? '' : q));
const scheme = process.env.SCHEME ?? 'light';
const SPOTS = (process.env.SPOTS ?? 'cat13,pdg14,glo14,cat152,pdg16,bcn10').split(',');
const AT = { cat13: [[2.17, 41.387], 13], cat14: [[2.1695, 41.3868], 14], pdg14: [[2.1655, 41.3925], 14], glo14: [[2.1775, 41.4005], 14], ref14: [[2.1737, 41.3995], 14], cat152: [[2.1695, 41.3868], 15.2], pdg16: [[2.1648, 41.3922], 16], glo16: [[2.1868, 41.4025], 16], bcn10: [[2.1, 41.45], 10], bcn12: [[2.165, 41.392], 12], sants14: [[2.1404, 41.3793], 14], esp15: [[2.1488, 41.3752], 15] };
const browser = await launch();
for (const query of queries) {
  const { ctx, p, ours, jump } = await open(browser, { scheme, query, hash: 'map=13/41.3870/2.1700' });
  for (const spot of SPOTS) {
    await jump(...AT[spot], 1500);
    await p.screenshot({ path: `${here}tmp/look-${scheme}-${query.replaceAll(',', '+') || 'today'}-${spot}.png` });
  }
  console.log(`${query || 'today'}: ${ours().join(' | ') || 'no console errors or warnings of ours, no page errors'}`);
  await ctx.close();
}
await browser.close();
for (const spot of SPOTS) {
  const files = queries.flatMap((q) => ['-label', q || 'today', `${here}tmp/look-${scheme}-${q.replaceAll(',', '+') || 'today'}-${spot}.png`]);
  execFileSync('magick', ['montage', '-font', '/System/Library/Fonts/Supplemental/Arial Bold.ttf', '-pointsize', '18', ...files, '-tile', `${Math.min(4, queries.length)}x`, '-geometry', '390x844+4+4', `${here}tmp/look-${scheme}-${spot}.jpg`]);
}
