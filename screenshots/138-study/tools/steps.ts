import { readFileSync, writeFileSync } from 'node:fs';
import { pointAt } from '<repo>/src/bundle.ts';
const t = JSON.parse(readFileSync('<repo>/.playwright-mcp/138/track-' + process.argv[2] + '.json', 'utf8'));
const shapes = new Map(t.shapes.map((s) => [s.id, s]));
const by = new Map();
for (const s of t.strokes) { const k = s.line + ' ' + s.shape; by.set(k, [...(by.get(k) ?? []), s]); }
const steps = [], ends = [];
for (const list of by.values()) {
  list.sort((a, b) => a.from - b.from);
  for (let i = 0; i < list.length; i++) {
    const [a, b] = [list[i - 1], list[i]];
    const shape = shapes.get(b.shape);
    if (a && Math.abs(a.to - b.from) <= 1 && a.side !== b.side) { const [lon, lat] = pointAt(shape, b.from); steps.push({ line: b.line, jump: Math.abs(b.side - a.side), was: a.side, is: b.side, lon, lat }); }
    // A stroke that ends where the shape goes on, but no stroke of this Line and shape starts there: the run broke.
    const next = list[i + 1];
    if (b.to < shape.dist.at(-1) - 1 && !(next && Math.abs(next.from - b.to) <= 1)) { const [lon, lat] = pointAt(shape, b.to); ends.push({ line: b.line, side: b.side, lon, lat, gap: next ? next.from - b.to : null }); }
  }
}
writeFileSync('<scratch>/steps-' + process.argv[2] + '.json', JSON.stringify({ steps, ends }));
const hist = (xs) => Object.fromEntries([...Map.groupBy(xs, (x) => x)].sort((a, b) => a[0] - b[0]).map(([k, v]) => [k, v.length]));
console.log(process.argv[2], 'steps by jump (line widths)', JSON.stringify(hist(steps.map((s) => s.jump))));
console.log('run ends mid-shape', ends.length, 'side≠0 at the end', ends.filter((e) => e.side).length);
const st = t.stations; const near = (lat, lon) => { let b, bd = 1e9; for (const s of st) { const d = Math.hypot((s.lat - lat) * 111, (s.lon - lon) * 83); if (d < bd) { bd = d; b = s; } } return b.name + ' ' + bd.toFixed(1) + 'km'; };
for (const s of steps.filter((s) => s.jump >= 2.5).sort((a, b) => b.jump - a.jump).slice(0, 20)) console.log(s.jump, s.line.split(':')[1], s.was + '→' + s.is, s.lat.toFixed(4), s.lon.toFixed(4), near(s.lat, s.lon));
