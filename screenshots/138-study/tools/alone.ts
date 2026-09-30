import { readFileSync } from 'node:fs';
const t = JSON.parse(readFileSync('<repo>/.playwright-mcp/138/track-before.json', 'utf8'));
for (const v of ['main', 'branch']) {
  const m = await import('<scratch>/alone-' + v + '.ts');
  m.alone.metres = 0; m.alone.spots = [];
  m.sideBySide(t.lines, t.shapes);
  const by = new Map(); for (const [l] of m.alone.spots) by.set(l, (by.get(l) ?? 0) + 50);
  console.log(v, 'metres drawn off a track no other Line is beside:', Math.round(m.alone.metres / 2), '(runs counted once; halved for strokes+sides)', [...by].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([l, n]) => t.lines[l].name + ' ' + Math.round(n / 2)).join(', '));
}
