import { readFileSync } from 'node:fs';
const APART = (z) => z <= 7 ? 1.5 : z <= 14 ? 1.5 + (2.5 * (z - 7)) / 7 : Math.max(0, 4 * (15 - z));
const mpx = (z) => 40075016.686 * Math.cos(41.4 * Math.PI / 180) / (512 * 2 ** z);
for (const f of ['before', 'after']) {
  const t = JSON.parse(readFileSync('<repo>/.playwright-mcp/138/track-' + f + '.json', 'utf8'));
  const net = new Map(t.lines.map((l) => [l.id, l.network]));
  let total = 0; const by = new Map();
  for (const s of t.strokes) { const m = s.to - s.from; total += m; const k = Math.abs(s.side); by.set(k, (by.get(k) ?? 0) + m); }
  const share = (min) => (100 * [...by].filter(([k]) => k >= min).reduce((a, [, m]) => a + m, 0) / total).toFixed(1) + '%';
  const maxSide = Math.max(...by.keys());
  console.log(f, 'length drawn at |side| ≥1:', share(1), '≥2:', share(2), '≥3:', share(3), '≥4:', share(4), '| max side', maxSide, '→ off its track by', [10, 12, 14].map((z) => 'z' + z + ' ' + Math.round(maxSide * APART(z) * mpx(z)) + ' m').join(', '));
}
