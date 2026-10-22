// Offline check of shoot.mts's tally() on the review's dumped scenes (scenes.json): the main tree's covered() and the
// branch's piles() on the same pills, with the page's folds simulated by piles() itself, so every check must hold.
//   node <SP>/828/measure/tally.check.mts
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const HERE = path.dirname(new URL(import.meta.url).pathname);
process.argv[2] = 'branch';
const { tally } = await import('./shoot.mts');
const { piles } = await import('../../wt-828/src/web/spread.ts');
const { boxOf, nameBoxOf, pillText, FOLLOWED_TEXT, SMALL_TEXT } = await import('../../wt-828/src/web/pill.ts');
const scenes = JSON.parse(fs.readFileSync(path.join(HERE, '../review/scenes.json'), 'utf8'));
const halo = ([w, h]: number[]) => [w! + 1.5, h! + 1.5];
let n = 0;
for (const s of scenes.slice(0, 32)) {
  const widths = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`+${i + 1}`, s.countWidth * (String(i + 1).length + 1) / 2]));
  widths['+8'] = s.countWidth;
  const named = s.pills.map((p: any) => ({ id: p.id, at: p.at, box: halo(boxOf(p.outline, p.width, p.followed ? FOLLOWED_TEXT : pillText(p.pillZoom))), name: nameBoxOf(p.width, pillText(p.pillZoom)) }));
  const out: Map<string, string[]> = piles(named, s.pills.find((p: any) => p.followed)?.id, new Set(), halo(boxOf('round', s.countWidth, SMALL_TEXT)));
  const folded = new Set([...out.values()].flat());
  const pills = s.pills.map((p: any, i: number) => ({ ...p, live: true, covered: false, folded: folded.has(p.id), more: out.get(p.id)?.length ?? 0, countAt: [named[i].box[0] / SMALL_TEXT, -named[i].box[1] / SMALL_TEXT] }));
  const t = tally({ clock: 0, hash: '', popup: false, widths, pills } as any);
  assert.equal(t.counts.foldsAsRule, true);
  assert.equal(t.counts.blank, 0, `${s.view} ${s.device}: blank ${t.counts.blankNames}`);
  assert.equal(t.counts.folded, folded.size);
  n++;
  if (n % 8 === 1) console.log(s.device, s.view, t.counts.pills, 'drawn', t.counts.folded, 'folded', t.counts.counted.join(' '), 'under a count', t.counts.namesUnderCount, t.counts.underCount.slice(0, 2));
}
console.log(n, 'scenes ok');
